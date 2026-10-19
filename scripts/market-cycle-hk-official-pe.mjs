// Official monthly-report PE history. This module makes no assertion that the
// provider's earnings basis is TTM; callers must not label its output as TTM.
const DAY = 864e5
const MARKETS = new Set(['hsi', 'hstech'])
const XLSX = market => `https://www.hsi.com.hk/content/dam/wpb/hsil/index_operation/historical_pe/en_hk/${market}/${market}.xlsx`
const PDF = /^https:\/\/www\.hsi\.com\.hk\/content\/dam\/wpb\/hsil\/en_hk\/monthly_roundup\/content\/\d{8}T\d{6}\.pdf$/
const isDate = date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date
const monthIndex = date => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1
const monthLabel = index => `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`
const monthEnd = month => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10)

function validateDate(date, today) {
  if (!isDate(date)) throw new Error(`官方PE日期无效：${date}`)
  if (date > today) throw new Error(`官方PE日期在未来：${date}`)
  // Reports sometimes label the calendar month end and sometimes the last
  // trading date. Keep that published date; never invent a trading calendar.
  if ((Date.parse(monthEnd(date.slice(0, 7))) - Date.parse(date)) / DAY > 6) throw new Error(`官方PE日期不在月末最后7天：${date}`)
}

function validatePe(pe) {
  if (typeof pe !== 'number' || !Number.isFinite(pe)) throw new Error('官方PE不是有限数值')
}

/**
 * Merge audited official PDF history with this market's latest official XLSX
 * rows; return a five-year monthly empirical midrank percentile. No imputation
 * or removal of loss months is allowed. A negative PE invalidates the window.
 */
export function officialMonthlyPePercentile(archive, market, currentRows, today) {
  if (!MARKETS.has(market)) throw new Error(`不支持的官方PE市场：${market}`)
  if (!isDate(today)) throw new Error('当前日期无效')
  if (archive?.schemaVersion !== 1 || !Array.isArray(archive.rows) || !archive.rows.length) throw new Error('官方PE历史schema或rows无效')
  if (!Array.isArray(currentRows)) throw new Error('官方PE最新行无效')
  const rows = new Map()
  for (const row of archive.rows) {
    validateDate(row?.date, today)
    if (row.month !== row.date.slice(0, 7)) throw new Error('官方PE月份与日期不一致')
    if (rows.has(row.month)) throw new Error(`官方PE历史重复月份：${row.month}`)
    if (!PDF.test(row.source) && row.source !== XLSX(market)) throw new Error(`官方PE来源不在白名单：${row.source}`)
    validatePe(row[market])
    rows.set(row.month, { date: row.date, pe: row[market], source: row.source })
  }
  const currentMonths = new Set()
  for (const row of currentRows) {
    validateDate(row?.date, today)
    validatePe(row.pe)
    const month = row.date.slice(0, 7)
    if (currentMonths.has(month)) throw new Error(`官方PE最新行重复月份：${month}`)
    currentMonths.add(month)
    const prior = rows.get(month)
    if (prior && Math.abs(prior.pe - row.pe) > 1e-8) throw new Error(`官方PE历史与XLSX重叠月份冲突：${month} ${prior.pe}/${row.pe}`)
    // Preserve the archive's stable per-report citation when corroborated, but
    // use the date actually published by the current XLSX for the observation.
    rows.set(month, { date: row.date, pe: row.pe, source: prior?.source ?? XLSX(market) })
  }
  const ordered = [...rows.values()].sort((a, b) => a.date.localeCompare(b.date))
  const latest = ordered.at(-1)
  const end = monthIndex(latest.date), start = end - 60
  if (monthIndex(ordered[0].date) > start) throw new Error('官方PE历史跨度不足5年')
  const window = ordered.filter(row => monthIndex(row.date) >= start)
  const missingMonths = []
  for (let index = start; index <= end; index++) if (!rows.has(monthLabel(index))) missingMonths.push(monthLabel(index))
  const expectedMonths = end - start + 1
  if (window.some(row => row.pe <= 0)) throw new Error(`官方PE窗口含非正PE月份，不能排序或删除亏损月份：${window.filter(row => row.pe <= 0).map(row => row.date.slice(0, 7)).join('、')}`)
  if (window.length < 60) throw new Error(`官方PE有效月度样本不足60个：${window.length}`)
  if (window.length / expectedMonths < 0.95) throw new Error(`官方PE月份覆盖不足95%：${window.length}/${expectedMonths}`)
  const below = window.filter(row => row.pe < latest.pe).length
  const equal = window.filter(row => row.pe === latest.pe).length
  return {
    value: (below + equal / 2) / window.length * 100,
    observationDate: latest.date,
    currentPe: latest.pe,
    windowStart: monthEnd(monthLabel(start)),
    samples: window.length,
    expectedMonths,
    missingMonths,
    source: latest.source,
    sources: [...new Set(window.map(row => row.source))],
  }
}
