// 个股页纯计算：价格采用前复权，成交额为元，成交量为手，换手率为百分数。
import { calendarCovers, isTradingDay, prevTradingDay } from './market-mood-lib.mjs'

export const num = x => (typeof x !== 'number' && typeof x !== 'string') || String(x).trim() === '' || !Number.isFinite(Number(x)) ? null : Number(x)
export function validDate(d) {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d
}
export function snapshotAllowed(date, now = new Date()) {
  if (!validDate(date) || !calendarCovers(date) || !isTradingDay(date)) return false
  const bj = new Date(now.getTime() + 8 * 3600_000)
  return bj.toISOString().slice(0, 10) === date && bj.getUTCHours() * 60 + bj.getUTCMinutes() >= 910
}
export function parseKline(line) {
  if (typeof line !== 'string') throw new Error('K 线不是字符串')
  const f = line.split(',')
  if (!validDate(f[0])) throw new Error('K 线日期无效')
  return { date: f[0], open: num(f[1]), close: num(f[2]), high: num(f[3]), low: num(f[4]), volume: num(f[5]), amount: num(f[6]), pct: num(f[8]), turnover: num(f[10]) }
}
export function parseKlines(body, code, date) {
  if (!validDate(date) || body?.data?.code !== code || !Array.isArray(body.data.klines) || !body.data.klines.length) throw new Error(`${code} K 线缺失或代码不符`)
  const rows = body.data.klines.map(parseKline)
  if (rows.some((r, i) => r.date > date || (i && r.date <= rows[i - 1].date))) throw new Error(`${code} K 线未来、重复或乱序`)
  if (rows.some(r => [r.open, r.close, r.high, r.low].some(v => v !== null && v < 0) || (r.high !== null && r.low !== null && r.high < r.low))) throw new Error(`${code} K 线价格异常`)
  return rows
}
const pct = (a, b) => a !== null && b > 0 ? 100 * (a - b) / b : null
const all = (rows, key) => rows.every(r => r[key] !== null && Number.isFinite(r[key]))
export function intervalStats(rows, windows = [5, 20, 60, 120, 250]) {
  return windows.map(days => {
    const empty = { days, from: null, to: rows.at(-1)?.date ?? null, change: null, drawdown: null, amplitude: null, avgTurnover: null, amount: null }
    if (rows.length <= days) return empty
    const base = rows[rows.length - days - 1], sample = rows.slice(-days), path = [base, ...sample]
    let peak = 0, drawdown = 0
    if (all(path, 'close') && path.every(r => r.close > 0)) for (const r of path) { peak = Math.max(peak, r.close); drawdown = Math.max(drawdown, 100 * (1 - r.close / peak)) }
    else drawdown = null
    return { days, from: sample[0].date, to: sample.at(-1).date, change: pct(sample.at(-1).close, base.close), drawdown,
      amplitude: all(sample, 'high') && all(sample, 'low') && base.close > 0 ? 100 * (Math.max(...sample.map(r => r.high)) - Math.min(...sample.map(r => r.low))) / base.close : null,
      avgTurnover: all(sample, 'turnover') ? sample.reduce((s, r) => s + r.turnover, 0) / days : null,
      amount: all(sample, 'amount') ? sample.reduce((s, r) => s + r.amount, 0) : null }
  })
}
export function monthlyReturns(rows, date) {
  const months = new Map()
  for (const r of rows) if (r.date <= date) months.set(r.date.slice(0, 7), r)
  const cutoff = new Date(`${date.slice(0, 7)}-01T00:00:00Z`)
  cutoff.setUTCMonth(cutoff.getUTCMonth() - 23)
  return [...months.entries()].filter(([month]) => month >= cutoff.toISOString().slice(0, 7)).slice(-24).map(([month, r]) => {
    const d = new Date(`${month}-01T00:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() - 1)
    const prev = months.get(d.toISOString().slice(0, 7))
    const next = new Date(`${month}-01T00:00:00Z`)
    next.setUTCMonth(next.getUTCMonth() + 1)
    const monthEnd = prevTradingDay(next.toISOString().slice(0, 10))
    return { date: r.date, value: prev ? pct(r.close, prev.close) : null, partial: month === date.slice(0, 7) && date < monthEnd }
  })
}

// 三角分布 CDF（模式值在边界也有效）；按桶边界积分，避免一字板/窄振幅的质量消失。
function triangular(x, low, high, mode) {
  if (x < low) return 0
  if (x >= high) return 1
  if (mode === low) return 1 - ((high - x) / (high - low)) ** 2
  if (mode === high) return ((x - low) / (high - low)) ** 2
  return x <= mode ? (x - low) ** 2 / ((high - low) * (mode - low)) : 1 - (high - x) ** 2 / ((high - low) * (high - mode))
}
export function cyq(input, count = 50) {
  const rows = input.slice(-120)
  if (count < 2 || !rows.length || rows.some(r => ![r.low, r.high, r.close, r.turnover, r.amount, r.volume].every(Number.isFinite) || r.low > r.high || r.turnover < 0 || r.volume <= 0 || r.amount < 0)) return null
  const low = Math.min(...rows.map(r => r.low)), high = Math.max(...rows.map(r => r.high))
  const step = high === low ? Math.max(low * 0.001, 0.01) : (high - low) / (count - 1)
  const buckets = Array.from({ length: count }, (_, i) => ({ price: low + step * i, weight: 0 }))
  let seedWeight = 1, clampedDays = 0
  rows.forEach((r, day) => {
    // 东财手数 × 100 才是股数。前复权与未复权均价可能有差异，限定在当日复权高低价内，并披露限制天数。
    const average = r.amount / (r.volume * 100)
    const mode = Math.max(r.low, Math.min(r.high, average))
    if (average < r.low || average > r.high) clampedDays++
    const t = Math.min(1, r.turnover / 100)
    if (day) seedWeight *= 1 - t
    const added = buckets.map(b => triangular(b.price + step / 2, r.low, r.high, mode) - triangular(b.price - step / 2, r.low, r.high, mode))
    const mass = added.reduce((s, v) => s + v, 0)
    buckets.forEach((b, i) => { b.weight = day ? b.weight * (1 - t) + t * added[i] / mass : added[i] / mass })
  })
  const weightedPrice = q => { let sum = 0; for (const b of buckets) { sum += b.weight; if (sum + 1e-12 >= q) return b.price } return buckets.at(-1).price }
  const range = q => { const lo = weightedPrice((1 - q) / 2), hi = weightedPrice((1 + q) / 2); return { low: lo, high: hi, concentration: hi + lo > 0 ? (hi - lo) / (hi + lo) : null } }
  return { days: rows.length, from: rows[0].date, to: rows.at(-1).date, buckets, average: buckets.reduce((s, b) => s + b.price * b.weight, 0),
    profit: 100 * buckets.filter(b => b.price < rows.at(-1).close).reduce((s, b) => s + b.weight, 0), range90: range(0.9), range70: range(0.7), seedWeight, clampedDays }
}
export function quantile(values, p) {
  const xs = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!xs.length) return null
  const at = Math.max(0, Math.min(1, p)) * (xs.length - 1), lo = Math.floor(at), hi = Math.ceil(at)
  return xs[lo] + (xs[hi] - xs[lo]) * (at - lo)
}
export function valuationBand(rows, key) {
  const points = rows.map(r => ({ date: r.date, value: r[key] > 0 ? r[key] : null }))
  const values = points.map(r => r.value).filter(v => v !== null)
  const current = rows.at(-1)?.[key] ?? null
  const status = key === 'pe' && current !== null && current < 0 ? 'loss' : current > 0 ? 'ok' : 'missing'
  return { status, current: status === 'ok' ? current : null, date: rows.at(-1)?.date ?? null, from: rows[0]?.date ?? null, samples: values.length, points,
    percentile: status === 'ok' && values.length ? 100 * (values.filter(v => v < current).length + values.filter(v => v === current).length / 2) / values.length : null,
    levels: [0, 0.25, 0.5, 0.75, 1].map(p => quantile(values, p)) }
}
export function parseValuation(rows, code, date) {
  const seen = new Set()
  return rows.map(r => {
    const d = typeof r.TRADE_DATE === 'string' ? r.TRADE_DATE.slice(0, 10) : ''
    if (r.SECURITY_CODE !== code || !validDate(d) || d > date || seen.has(d)) throw new Error(`${code} 估值代码或日期异常`)
    seen.add(d)
    return { date: d, pe: num(r.PE_TTM), pb: num(r.PB_MRQ) }
  }).sort((a, b) => a.date.localeCompare(b.date))
}
export function mergeUniverse(current, previous, date, cap = 600) {
  if (!validDate(date) || !calendarCovers(date) || !isTradingDay(date)) throw new Error('股票池日期无效')
  const unique = new Map()
  for (const r of current) {
    if (!/^\d{6}$/.test(r.code) || !r.name?.trim()) throw new Error('股票池证券字段异常')
    const old = unique.get(r.code)
    unique.set(r.code, { ...old, ...r, industry: r.industry || old?.industry || '', lists: [...new Set([...(old?.lists ?? []), ...r.lists])], lastSeen: date })
  }
  if (unique.size > cap) throw new Error('当日股票池超过总上限，拒绝截断当日名单')
  let cutoff = date
  for (let i = 0; i < 10; i++) cutoff = prevTradingDay(cutoff)
  const days = Object.fromEntries(Object.entries(previous.days ?? {}).filter(([d, rows]) => validDate(d) && d >= cutoff && d < date && Array.isArray(rows)))
  days[date] = [...unique.values()]
  for (const d of Object.keys(days).sort().reverse()) for (const r of days[d]) {
    if (!unique.has(r.code) && unique.size < cap && /^\d{6}$/.test(r.code) && r.name?.trim()) unique.set(r.code, { ...r, lists: [], lastSeen: d })
  }
  return { days, stocks: [...unique.values()] }
}
export function parseTop(rows, expected = 100) {
  if (!Array.isArray(rows) || rows.length < expected || new Set(rows.map(r => r.symbol)).size !== rows.length) throw new Error('成交额榜不完整或重复')
  if (rows.some((r, i) => !/^(sh|sz|bj)\d{6}$/.test(r.symbol) || !r.name?.trim() || !(num(r.amount) > 0) || (i && num(r.amount) > num(rows[i - 1].amount)))) throw new Error('成交额榜字段或排序异常')
  return rows.slice(0, expected).map((r, i) => ({ code: r.symbol.slice(2), name: r.name.trim(), industry: '', pct: num(r.changepercent), lists: ['amount'], rank: i + 1 }))
}
export function parseLhb(rows, date) {
  if (!rows.length) throw new Error(`${date} 龙虎榜尚未发布`)
  return rows.map(r => {
    if (r.TRADE_DATE?.slice(0, 10) !== date || !/^\d{6}$/.test(r.SECURITY_CODE) || !r.SECURITY_NAME_ABBR?.trim()) throw new Error('龙虎榜日期或字段异常')
    return { code: r.SECURITY_CODE, name: r.SECURITY_NAME_ABBR.trim(), industry: '', pct: num(r.CHANGE_RATE), lists: ['lhb'] }
  })
}
