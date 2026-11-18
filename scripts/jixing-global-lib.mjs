// 今天几星 · 港股全球：纯函数（解析、分位、估值状态、合并）。网络与落盘在 jixing-global.mjs。
// 口径：估值状态由本站自定——估值分位 < 30% 低估、> 70% 高估、其余正常；分位 = (低于当前值的样本数 + 0.5 × 等于当前值的样本数) / 样本数。
// 港股用恒生指数公司（Hang Seng Indexes）官方日报 CSV 与 Monthly Roundup 月报，全球用 multpl.com 与 History of Market（CC BY 4.0），
// 黄金用新浪 COMEX 黄金日线、美国财政部实际收益率曲线、美国劳工统计局 CPI-U。缺值一律 null，不插值。

export const validDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s
export const num = (x) => {
  if (x === null || x === undefined) return null
  const s = String(x).replace(/,/g, '').trim()
  if (s === '' || s === '-' || s === '--') return null
  const v = Number(s)
  return Number.isFinite(v) ? v : null
}
const pad = (n) => String(n).padStart(2, '0')
const round = (v, d = 2) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d)
export const addYears = (date, n) => `${Number(date.slice(0, 4)) + n}${date.slice(4)}`
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MON3 = MONTHS.map(m => m.slice(0, 3))

/** 估值状态阈值（%）与各分区窗口。 */
export const THRESHOLDS = { low: 30, high: 70 }
export const WINDOWS = { hk: 5, global: 10, gold: 10 }
/** 样本少于这个数就不给分位与状态（月度 3 年、周度 2 年）。 */
export const MIN_SAMPLES = { 月: 36, 周: 104 }
/** 窗口内亏损样本占比上限（超过则不判定估值状态）。 */
export const MAX_LOSS_SHARE = 0.1

// ---------------------------------------------------------------------------
// 港股：指数清单。daily = 恒生官方日报 CSV 系列代码（只有这几只日报带 PE 和股息率）；roundup = Monthly Roundup 中的英文名。
// basis：估值状态看哪个分位。宽基 / 行业看 PE 分位；高股息指数看股息率分位（股息率越高越便宜，估值分位 = 100 − 股息率分位）。
// ---------------------------------------------------------------------------
export const HK_ROWS = [
  { key: 'hsi', name: '恒生指数', daily: 'hsi', csvName: 'Hang Seng Index 恒生指數', roundup: 'Hang Seng Index', basis: 'pe' },
  { key: 'hscei', name: '恒生中国企业指数', daily: 'hscei', csvName: 'Hang Seng China Enterprises Index 恒生中國企業指數', roundup: 'Hang Seng China Enterprises Index', basis: 'pe' },
  { key: 'hstech', name: '恒生科技指数', roundup: 'Hang Seng TECH Index', basis: 'pe' },
  { key: 'hshdyi', name: '恒生高股息率指数', daily: 'hshdyi', csvName: 'Hang Seng High Dividend Yield Index 恒生高股息率指數', roundup: 'Hang Seng High Dividend Yield Index', basis: 'dy' },
  { key: 'hsschky', name: '恒生港股通高股息率指数', roundup: 'Hang Seng SCHK High Dividend Yield Index', basis: 'dy' },
  { key: 'hshci', name: '恒生医疗保健指数', roundup: 'Hang Seng Healthcare Index', basis: 'pe' },
  { key: 'hsiii', name: '恒生互联网科技业指数', roundup: 'Hang Seng Internet & Information Technology Index', basis: 'pe' },
  { key: 'csi930914', name: '中证港股通高股息投资指数', csi: '930914', basis: 'pe' },
]

// ---------- 恒生官方日报 ----------
export const HSI_API = 'https://www.hsi.com.hk/api/wsit-hsi-ddoc-ea-public-website-proxy/v1'
export const hsiDirUrl = (series) => `${HSI_API}/product-data/pub/series/metadata/v2?data=dailyReport&seriesCode=${series}`
const csvResource = (series, date) => `/public-website/webapp/contents/en/indexes/report/${series}/idx_${Number(date.slice(8))}${MON3[Number(date.slice(5, 7)) - 1]}${date.slice(2, 4)}.csv`
export const hsiCsvUrl = (series, date) => `${HSI_API}/content/gcs/download?resource=${encodeURIComponent(csvResource(series, date))}`

/** 日报目录 → 可下载 idx CSV 的日期（新到旧）。路径必须与日期一致，不接受未来日期。 */
export function parseHsiDir(body, series, today) {
  const rows = Array.isArray(body) ? body : body?.data
  if (!Array.isArray(rows)) throw new Error(`恒生日报目录（${series}）响应无效`)
  const s = rows.filter(r => r?.seriesCode === series)
  if (s.length !== 1) throw new Error(`恒生日报目录（${series}）系列身份无效`)
  const idx = (s[0].reportList ?? []).filter(r => r?.reportType === 'idx')
  if (idx.length !== 1 || !Array.isArray(idx[0].reportDate)) throw new Error(`恒生日报目录（${series}）缺少 idx 报表`)
  const out = []
  for (const r of idx[0].reportDate) {
    if (!validDate(r?.date) || r.date > today) continue
    if (r.url !== csvResource(series, r.date)) continue
    out.push(r.date)
  }
  return [...new Set(out)].sort().reverse()
}

function tabFields(line) {
  const fields = []; let value = '', quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i++ } else quoted = !quoted
    } else if (c === '\t' && !quoted) { fields.push(value); value = '' } else value += c
  }
  fields.push(value)
  return fields
}

/** 日报 CSV（UTF-16LE + BOM，制表符分隔）→ 指定指数行的收盘、PE、股息率。交易日必须等于 date。 */
export function parseHsiCsv(buffer, date, csvName) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xfe) throw new Error('恒生日报不是 UTF-16LE CSV')
  const lines = buffer.subarray(2).toString('utf16le').split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 3) throw new Error('恒生日报缺少表头或数据')
  const header = tabFields(lines[1])
  const col = (label) => {
    const i = header.indexOf(label)
    if (i < 0 || header.lastIndexOf(label) !== i) throw new Error(`恒生日报缺少唯一列：${label}`)
    return i
  }
  const [cDate, cName, cClose, cDy, cPe] = ['Trade Date', 'Index', 'Index Close', 'Dividend Yield (%)', 'PE Ratio (times)'].map(col)
  const rows = lines.slice(2).map(tabFields).filter(r => r[cName] === csvName)
  if (rows.length !== 1) throw new Error(`恒生日报缺少唯一「${csvName}」行`)
  const r = rows[0]
  if (r[cDate] !== date.replaceAll('-', '')) throw new Error(`恒生日报交易日 ${r[cDate]} 与 ${date} 不符`)
  const close = num(r[cClose]), pe = num(r[cPe]), dy = num(r[cDy])
  if (close === null || close <= 0) throw new Error('恒生日报收盘价缺失')
  return { date, close, pe: pe === 0 ? null : pe, dy: dy !== null && dy > 0 ? dy : null }
}

// ---------- 恒生 Monthly Roundup ----------
export const ROUNDUP_BASE = 'https://www.hsi.com.hk/content/dam/wpb/hsil/en_hk/monthly_roundup/content/'
export const ROUNDUP_URL = /^https:\/\/www\.hsi\.com\.hk\/content\/dam\/wpb\/hsil\/en_hk\/monthly_roundup\/content\/(\d{4})(\d{2})(\d{2})T(\d{6})\.pdf$/
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const ROW = (name) => new RegExp(`^${esc(name).replace(/ +/g, '\\s+')}\\s+(-?[\\d.,]+%)\\s+(-?[\\d.,]+%)\\s+(-?[\\d.,]+%)\\s+(-?[\\d.,]+%)\\s+(-?\\d[\\d,]*\\.\\d+|-)\\s+(-?[\\d.]+%|-)\\s*$`)

/**
 * 月报各页文本 → { date, month, url, values: { key: { pe, dy } } }。
 * date 取报告「As at」日期（月末最后 7 天内）；某指数行缺失（如当时尚未发布）记 null，不推算。
 */
export function parseRoundupTable(pages, url, rows = HK_ROWS) {
  const m = ROUNDUP_URL.exec(String(url))
  if (!m) throw new Error('月报 URL 不在恒生官网白名单')
  if (!Array.isArray(pages) || !pages.length || pages.some(p => typeof p !== 'string')) throw new Error('月报文本无效')
  const text = pages.join('\n')
  if (!/PE Ratio\s*\(Times\)/.test(text) || !/Hang Seng Index and its related indexes/.test(text)) throw new Error('不是含 PE Ratio (Times) 列的月报主报告')
  const asAt = [...text.matchAll(/\bAs at (\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December)\b/g)]
  if (!asAt.length) throw new Error('月报缺少 As at 日期')
  if (asAt.some(a => a[1] !== asAt[0][1] || a[2] !== asAt[0][2])) throw new Error('月报 As at 日期不一致')
  const pubYear = Number(m[1]), pubMonth = Number(m[2])
  const day = Number(asAt[0][1]), month = MONTHS.indexOf(asAt[0][2]) + 1
  const year = month < pubMonth ? pubYear : month === 12 && pubMonth === 1 ? pubYear - 1 : NaN
  const date = `${year}-${pad(month)}-${pad(day)}`
  if (!validDate(date)) throw new Error(`月报日期与发布时间不符：${date}`)
  const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
  if ((Date.parse(monthEnd) - Date.parse(date)) / 864e5 > 6) throw new Error(`月报日期不在月末最后 7 天：${date}`)
  const lines = text.split(/\r?\n/).map(l => l.trim())
  const values = {}
  for (const r of rows) {
    if (!r.roundup) continue
    const hit = lines.filter(l => ROW(r.roundup).test(l))
    if (hit.length > 1) throw new Error(`月报「${r.roundup}」行重复`)
    if (!hit.length) { values[r.key] = null; continue }
    const g = ROW(r.roundup).exec(hit[0])
    const pe = g[5] === '-' ? null : num(g[5])
    const dy = g[6] === '-' ? null : num(g[6].replace('%', ''))
    values[r.key] = { pe: pe === 0 ? null : pe, dy: dy !== null && dy > 0 ? dy : null }
  }
  return { date, month: date.slice(0, 7), url, values }
}

/** 某发布月（YYYY-MM）的月报候选 URL：当月 1–7 日、不晚于今天；先试常见的 T000000。 */
export function roundupCandidates(pubMonth, today) {
  const times = ['000000', '160000', '170000', '150000', '113000', '163000']
  const days = []
  for (let d = 1; d <= 7; d++) { const date = `${pubMonth}-${pad(d)}`; if (date <= today) days.push(date.replaceAll('-', '')) }
  return times.flatMap(t => days.map(d => `${ROUNDUP_BASE}${d}T${t}.pdf`))
}

/** 下一份应当发布的月报月份：已有最新报告月的下一个月（报告在其次月月初发布）；还没到发布月返回 null。 */
export function nextRoundupMonth(latestMonth, today) {
  const idx = (ym) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1
  const lab = (i) => `${Math.floor(i / 12)}-${pad(i % 12 + 1)}`
  const want = idx(latestMonth) + 1 // 报告月
  const pub = want + 1 // 发布月
  return pub <= idx(today.slice(0, 7)) ? { reportMonth: lab(want), pubMonth: lab(pub) } : null
}

// ---------- 中证指数（港股通指数） ----------
export const CSI = 'https://www.csindex.com.cn/csindex-home'
export const csiPerfUrl = (code, start, end) => `${CSI}/perf/index-perf?indexCode=${code}&startDate=${start.replaceAll('-', '')}&endDate=${end.replaceAll('-', '')}`
/** 中证指数行情 → [{ date, pe }]（peg = 滚动市盈率，缺失记 null）。 */
export function parseCsiPerfPe(body) {
  const rows = body?.data
  if (String(body?.code) !== '200' || !Array.isArray(rows) || !rows.length) throw new Error('中证指数行情为空')
  const out = []
  for (const r of rows) {
    const s = String(r?.tradeDate ?? '')
    const date = /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : null
    if (!validDate(date)) continue
    const pe = num(r.peg)
    if (out.length && out.at(-1).date >= date) continue
    out.push({ date, pe: pe !== null && pe > 0 ? pe : null })
  }
  return out
}

// ---------------------------------------------------------------------------
// 分位与估值状态
// ---------------------------------------------------------------------------
/** 统一分位：(低于 + 0.5 × 等于) / n × 100。 */
export function percentile(values, current) {
  const v = values.filter(x => Number.isFinite(x))
  if (!v.length || !Number.isFinite(current)) return null
  const below = v.filter(x => x < current).length, equal = v.filter(x => x === current).length
  return (below + 0.5 * equal) / v.length * 100
}
/**
 * PE 分位：按盈利收益率 E/P = 1/PE 排序（全部盈利时与 PE 分位完全一致；亏损月份 PE 为负，视为比任何盈利月份都贵，不删除）。
 * 返回「PE 低于当前」意义下的分位。
 */
export function pePercentile(values, current) {
  const v = values.filter(x => Number.isFinite(x) && x !== 0)
  if (!v.length || !Number.isFinite(current) || current === 0) return null
  const ey = (pe) => 1 / pe, c = ey(current)
  const below = v.filter(x => ey(x) > c).length, equal = v.filter(x => ey(x) === c).length
  return (below + 0.5 * equal) / v.length * 100
}
export const stateOf = (valPct) => (valPct === null ? null : valPct < THRESHOLDS.low ? '低估' : valPct > THRESHOLDS.high ? '高估' : '正常')

/** 每个自然月取最后一个点（月末值）；points 需按日期升序。 */
export function monthEnds(points) {
  const out = []
  for (const p of points) {
    if (out.length && out.at(-1).date.slice(0, 7) === p.date.slice(0, 7)) out[out.length - 1] = p
    else out.push(p)
  }
  return out
}
/** 每个 ISO 周取最后一个点。 */
export function weekEnds(points) {
  const wk = (d) => { const t = Date.parse(`${d}T00:00:00Z`); const day = (new Date(t).getUTCDay() + 6) % 7; return new Date(t - day * 864e5).toISOString().slice(0, 10) }
  const out = []
  for (const p of points) {
    if (out.length && wk(out.at(-1).date) === wk(p.date)) out[out.length - 1] = p
    else out.push(p)
  }
  return out
}

/** 经验分位值（用于图上的 30% / 70% 参考线）：最近秩。 */
export function quantileValue(values, q) {
  const s = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (s.length < 2) return null
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]
}

/**
 * 一只指数的估值统计。samples：已按频率采样、升序、最后一个是最新值的 [{date, pe, dy}]。
 * years：窗口年数；freq：'月' | '周'。只用窗口内（起点之后）的样本；PE 为 null 的样本不进 PE 分位，股息率同理。
 */
export function valuationStats(samples, { years, freq, basis, spliceDate = null }) {
  const latest = samples.at(-1)
  if (!latest) return null
  const start = addYears(latest.date, -years)
  const win = samples.filter(p => p.date > start)
  const pes = win.map(p => p.pe).filter(v => v !== null && Number.isFinite(v))
  const dys = win.map(p => p.dy).filter(v => v !== null && Number.isFinite(v))
  const min = MIN_SAMPLES[freq] ?? 36
  const pePct = latest.pe !== null && pes.length >= min ? round(pePercentile(pes, latest.pe), 1) : null
  const dyPct = latest.dy !== null && dys.length >= min ? round(percentile(dys, latest.dy), 1) : null
  const valPct = basis === 'dy' ? (dyPct === null ? null : round(100 - dyPct, 1)) : pePct
  // 窗口内亏损（PE 为负）样本占比超过 MAX_LOSS_SHARE 时，PE 分位跨越了盈利断层、不可比：照常给出分位，但不判定估值状态
  const loss = pes.filter(v => v < 0).length
  const distorted = basis === 'pe' && pes.length > 0 && loss / pes.length > MAX_LOSS_SHARE
  // 序列拼接：最新值来自拼接日之后的序列、窗口里又有拼接日及以前的另一序列，前后口径可能不同——只列分位，不判定
  const spliced = !!spliceDate && latest.date > spliceDate && win.some(p => p.date <= spliceDate)
  const sv = basis === 'dy' ? dys : pes
  const first = win.find(p => (basis === 'dy' ? p.dy : p.pe) !== null)
  // PE 参考线在盈利收益率 E/P 上取分位再换回 PE（亏损月份不至于把参考线拉成负数）；对应 E/P ≤ 0 时不画
  const epRef = (q) => { const e = quantileValue(pes.map(v => 1 / v), q); return e !== null && e > 0 ? round(1 / e, 2) : null }
  const lo = basis === 'dy' ? quantileValue(dys, 0.7) : epRef(0.7), hi = basis === 'dy' ? quantileValue(dys, 0.3) : epRef(0.3)
  return {
    pePct, dyPct, valPct, state: distorted || spliced ? null : stateOf(valPct),
    window: { years, freq, start: first?.date ?? null, end: latest.date, n: sv.length, peN: pes.length, dyN: dys.length, enough: sv.length >= min, loss, distorted, spliced, spliceDate: spliced ? spliceDate : null },
    // 参考线：估值分位 30% / 70% 对应的指标值（高股息按股息率：股息率 70% 分位 = 估值分位 30%）
    refs: { low: lo, high: hi },
  }
}

// ---------------------------------------------------------------------------
// 港股：合并月报月末值、日报日度值与中证行情
// ---------------------------------------------------------------------------
/**
 * monthly: [{ month, date, url, values }]（月报存档）；daily: { [series]: [[date, close, pe, dy]] }；csi: { [code]: [{date, pe}] }
 * 返回每只指数的采样序列 [{date, pe, dy, src}]：历史月末值优先用月报；月报没有的月份用日报该月最后一个交易日；最新值用日报最新一天。
 */
export function hkSamples(row, monthly, daily, csi) {
  const pts = new Map()
  if (row.roundup) for (const m of monthly) {
    const v = m.values?.[row.key]
    if (v && (v.pe !== null || v.dy !== null)) pts.set(m.month, { date: m.date, pe: v.pe, dy: v.dy, src: 'roundup' })
  }
  let dayPts = []
  if (row.daily) dayPts = (daily[row.daily] ?? []).map(([date, , pe, dy]) => ({ date, pe, dy, src: 'daily' }))
  if (row.csi) dayPts = (csi[row.csi] ?? []).map(({ date, pe }) => ({ date, pe, dy: null, src: 'csi' }))
  dayPts = dayPts.filter(p => p.pe !== null || p.dy !== null).sort((a, b) => a.date.localeCompare(b.date))
  for (const p of monthEnds(dayPts)) {
    const m = p.date.slice(0, 7), prev = pts.get(m)
    // 月报是官方月末值；日报只补月报缺的月份，以及比月报更新的当月最新值
    if (!prev || p.date > prev.date) pts.set(m, p)
  }
  return [...pts.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function buildHkRow(row, samples) {
  const latest = samples.at(-1) ?? null
  const stats = latest ? valuationStats(samples, { years: WINDOWS.hk, freq: '月', basis: row.basis }) : null
  const src = latest?.src
  return {
    key: row.key, name: row.name, basis: row.basis,
    date: latest?.date ?? null,
    freq: src === 'roundup' ? '月' : '日',
    source: row.csi ? '中证指数官网（滚动市盈率）' : src === 'roundup' ? '恒生指数公司 Monthly Roundup（月末）' : '恒生指数公司每日指数报表',
    peKind: row.csi ? 'PE（TTM）' : 'PE（恒生公布）',
    pe: latest?.pe ?? null, dy: latest?.dy ?? null, pb: null,
    pePct: stats?.pePct ?? null, dyPct: stats?.dyPct ?? null, valPct: stats?.valPct ?? null, state: stats?.state ?? null,
    window: stats?.window ?? null, refs: stats?.refs ?? null,
    history: samples.filter(p => stats?.window && p.date > addYears(latest.date, -WINDOWS.hk)).map(p => [p.date, row.basis === 'dy' ? p.dy : p.pe]),
  }
}

// ---------------------------------------------------------------------------
// 全球：multpl.com 月度表、History of Market Forward PE
// ---------------------------------------------------------------------------
export const MULTPL = {
  pe: 'https://www.multpl.com/s-p-500-pe-ratio/table/by-month',
  cape: 'https://www.multpl.com/shiller-pe/table/by-month',
  dy: 'https://www.multpl.com/s-p-500-dividend-yield/table/by-month',
}
export const HOM = {
  spx: 'https://historyofmarket.com/api/sp500/forward-pe.json',
  ndx: 'https://historyofmarket.com/api/ndx/forward-pe.json',
}

/** multpl 表格 → 升序 [{date, value, est}]；† 为 multpl 标注的估算值（盈利尚未完整公布）。 */
export function parseMultplTable(html, today = '9999-12-31') {
  const t = String(html)
  const i = t.indexOf('<table id="datatable"')
  if (i < 0) throw new Error('multpl 页面缺少数据表')
  const body = t.slice(i, t.indexOf('</table>', i))
  const out = []
  for (const m of body.matchAll(/<tr[^>]*>\s*<td>([A-Z][a-z]{2}) (\d{1,2}), (\d{4})<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g)) {
    const mi = MON3.indexOf(m[1])
    if (mi < 0) continue
    const date = `${m[3]}-${pad(mi + 1)}-${pad(Number(m[2]))}`
    const cell = m[4]
    const value = num(cell.replace(/<[^>]+>/g, ' ').replace(/&#x2002;|†|%/g, ' ').trim())
    if (!validDate(date) || value === null || date > today) continue // multpl 会把当月估算值标在月底（未来日期），不收
    out.push({ date, value, est: /Estimate|†/.test(cell) })
  }
  if (out.length < 100) throw new Error(`multpl 数据行过少（${out.length}）`)
  out.sort((a, b) => a.date.localeCompare(b.date))
  for (let k = 1; k < out.length; k++) if (out[k].date === out[k - 1].date) throw new Error(`multpl 日期重复 ${out[k].date}`)
  return out
}

/**
 * History of Market forward-pe.json → 升序周度 [{date, value, own}]。
 * forward 为终端 12 个月一致预期（周度）；其最后一个日期之后用 forwardOwn（HoM 按 ETF 持仓自算的 FY1/FY2 混合预期，日度，按周取最后一天），own = true。
 */
export function parseHomForward(body) {
  const fw = Array.isArray(body?.forward) ? body.forward : null
  if (!fw || fw.length < 100) throw new Error('History of Market forward 序列缺失')
  const pts = fw.filter(p => validDate(p?.date) && num(p?.value) !== null && p.value > 0).map(p => ({ date: p.date, value: p.value, own: false }))
  pts.sort((a, b) => a.date.localeCompare(b.date))
  const lastTerm = pts.at(-1)?.date
  const own = (Array.isArray(body.forwardOwn) ? body.forwardOwn : []).filter(p => validDate(p?.date) && num(p?.value) !== null && p.value > 0 && p.date > lastTerm)
    .map(p => ({ date: p.date, value: p.value, own: true })).sort((a, b) => a.date.localeCompare(b.date))
  return { points: weekEnds([...pts, ...own]), spliceDate: own.length ? lastTerm : null, updated: validDate(body.updated) ? body.updated : null }
}

/** 全球表行：samples 升序（最后一个是最新值）。 */
export function buildGlobalRow(def, samples, extra = {}) {
  const latest = samples.at(-1) ?? null
  const stats = latest ? valuationStats(samples, { years: WINDOWS.global, freq: def.freq, basis: 'pe', spliceDate: extra.spliceDate ?? null }) : null
  return {
    key: def.key, name: def.name, basis: 'pe', date: latest?.date ?? null, freq: def.freq,
    source: def.source, peKind: def.peKind,
    pe: latest?.pe ?? null, dy: latest?.dy ?? null, pb: null,
    pePct: stats?.pePct ?? null, dyPct: stats?.dyPct ?? null, valPct: stats?.valPct ?? null, state: stats?.state ?? null,
    window: stats?.window ?? null, refs: stats?.refs ?? null,
    history: latest ? samples.filter(p => p.date > addYears(latest.date, -WINDOWS.global)).map(p => [p.date, p.pe]) : [],
    ...extra,
  }
}

// ---------------------------------------------------------------------------
// 黄金
// ---------------------------------------------------------------------------
export const SINA_GC = 'https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20_GC=/GlobalFuturesService.getGlobalFuturesDailyKLine?symbol=GC&source=web'
export const treasuryRealUrl = (year) => `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=daily_treasury_real_yield_curve&field_tdr_date_value=${year}&page&_format=csv`
export const BLS_API = 'https://api.bls.gov/publicAPI/v1/timeseries/data/'
export const BLS_SERIES = 'CUUR0000SA0'

/** 新浪 COMEX 黄金连续合约日线 → 升序 [{date, close}]。 */
export function parseSinaGc(text) {
  const s = String(text)
  const i = s.indexOf('(['), j = s.lastIndexOf('])')
  if (i < 0 || j < 0) throw new Error('新浪黄金日线格式异常')
  const arr = JSON.parse(s.slice(i + 1, j + 1))
  const out = []
  for (const r of arr) {
    const close = num(r?.close)
    if (!validDate(r?.date) || close === null || close <= 0) continue
    if (out.length && out.at(-1).date >= r.date) continue
    out.push({ date: r.date, close })
  }
  if (out.length < 200) throw new Error('新浪黄金日线过短')
  return out
}

/**
 * COMEX 日线的「已收盘」判定：交易日 D 的日盘在美东 17:00（北京 D+1 早上 5–6 点）结束。
 * 北京时间 nowIso 之前已完整收盘的最后一个交易日 = 早于「北京日期 − (北京时间 < 07:00 ? 1 : 0)」的日期。
 */
export function lastClosedGcDate(nowIso) {
  const bj = new Date(Date.parse(nowIso) + 8 * 3600e3)
  const day = bj.toISOString().slice(0, 10), hour = bj.getUTCHours()
  const cut = hour < 7 ? new Date(Date.parse(`${day}T00:00:00Z`) - 864e5).toISOString().slice(0, 10) : day
  return cut // 只接受 date < cut 的 K 线
}

/** 财政部实际收益率曲线 CSV → 升序 [{date, y10}]（10 YR 列，%）。 */
export function parseTreasuryReal(text) {
  const lines = String(text).trim().split(/\r?\n/)
  const head = lines[0]?.split(',').map(h => h.replace(/"/g, '').trim()) ?? []
  const c = head.indexOf('10 YR')
  if (head[0] !== 'Date' || c < 0) throw new Error('财政部实际收益率 CSV 表头异常')
  const out = []
  for (const l of lines.slice(1)) {
    const f = l.split(',')
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(f[0]?.trim() ?? '')
    if (!m) continue
    const date = `${m[3]}-${m[1]}-${m[2]}`, y = num(f[c])
    if (validDate(date) && y !== null) out.push({ date, y10: y })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/** BLS v1 响应 → { 'YYYY-MM': cpi }；'-' 为缺失月份（如 2025-10 政府停摆未发布），不填。 */
export function parseBlsCpi(body) {
  if (body?.status !== 'REQUEST_SUCCEEDED') throw new Error(`BLS 返回 ${body?.status ?? '无状态'}`)
  const data = body?.Results?.series?.find(s => s?.seriesID === BLS_SERIES)?.data
  if (!Array.isArray(data)) throw new Error('BLS 缺少 CPI 序列')
  const out = {}
  for (const r of data) {
    if (!/^M(0[1-9]|1[0-2])$/.test(r?.period ?? '') || !/^\d{4}$/.test(r?.year ?? '')) continue
    const v = num(r.value)
    if (v !== null && v > 0) out[`${r.year}-${r.period.slice(1)}`] = v
  }
  return out
}

/** 某月可用的 CPI：该月没有发布值时用此前最近一个月的值（并返回实际取用的月份）。 */
export function cpiFor(cpi, month) {
  const keys = Object.keys(cpi).filter(k => k <= month).sort()
  const k = keys.at(-1)
  return k ? { month: k, value: cpi[k] } : null
}

/**
 * 黄金估值（本站自定）：实际金价 = 名义月末金价 × 最新 CPI / 当月 CPI；
 * 黄金估值分位 = 最新实际金价在近 10 年「月末实际金价 + 最新值」中的分位；< 30% 低估、> 70% 高估。
 * 10 年期实际利率（TIPS）只作参照，单独给出近 10 年月末分位，不进入估值分位。
 */
export function buildGold(gc, real, cpi, { years = WINDOWS.gold } = {}) {
  if (!gc.length) return null
  const latest = gc.at(-1)
  const cpiKeys = Object.keys(cpi).sort()
  const base = cpiKeys.length ? { month: cpiKeys.at(-1), value: cpi[cpiKeys.at(-1)] } : null
  const start = addYears(latest.date, -years)
  const months = monthEnds(gc).filter(p => p.date > start)
  const series = months.map(p => {
    const c = base ? cpiFor(cpi, p.date.slice(0, 7)) : null
    return { date: p.date, nominal: p.close, real: c ? round(p.close * base.value / c.value, 1) : null, cpiMonth: c?.month ?? null }
  })
  const reals = series.map(p => p.real).filter(v => v !== null)
  const cur = series.at(-1)?.real ?? null
  const min = MIN_SAMPLES['月']
  const pct = cur !== null && reals.length >= min ? round(percentile(reals, cur), 1) : null
  const ry = real.length ? real.at(-1) : null
  const ryMonths = monthEnds(real.map(p => ({ date: p.date, value: p.y10 }))).filter(p => ry && p.date > addYears(ry.date, -years))
  const ryPct = ry && ryMonths.length >= min ? round(percentile(ryMonths.map(p => p.value), ry.y10), 1) : null
  const cpiFill = series.filter(p => p.cpiMonth && p.cpiMonth !== p.date.slice(0, 7)).map(p => p.date.slice(0, 7))
  return {
    date: latest.date, price: latest.close,
    realPrice: cur, cpiBase: base, pct, state: stateOf(pct),
    window: { years, freq: '月', start: series.find(p => p.real !== null)?.date ?? null, end: latest.date, n: reals.length, enough: reals.length >= min },
    refs: { low: quantileValue(reals, 0.3), high: quantileValue(reals, 0.7) },
    realYield: ry ? { date: ry.date, value: ry.y10, pct: ryPct, n: ryMonths.length } : null,
    cpiCarried: cpiFill,
    history: series.map(p => [p.date, p.real, p.nominal]),
    yieldHistory: ryMonths.map(p => [p.date, p.value]),
  }
}

// ---------------------------------------------------------------------------
// 写盘判定
// ---------------------------------------------------------------------------
/** 文件的数据日（各行与黄金日期的最大值）。 */
export function asOfOf(out) {
  const ds = [...(out?.hk?.rows ?? []), ...(out?.global?.rows ?? [])].map(r => r.date).filter(validDate)
  if (validDate(out?.gold?.date)) ds.push(out.gold.date)
  return ds.sort().at(-1) ?? null
}
/** 完整度：有数值的行数 + 黄金。 */
export const completeness = (out) => [...(out?.hk?.rows ?? []), ...(out?.global?.rows ?? [])].filter(r => r.pe !== null || r.dy !== null).length + (out?.gold?.price ? 1 : 0)

/**
 * 是否写盘：新数据日更早不写（历史重跑不覆盖更新的文件）；同一数据日新文件更不完整不写；
 * 内容（除 generatedAt）完全相同不写。
 */
export function shouldWrite(prev, next) {
  if (!next || completeness(next) === 0) return { write: false, reason: '没有任何可用数据' }
  if (!prev) return { write: true, reason: '首次生成' }
  const a = asOfOf(prev), b = asOfOf(next)
  if (a && b && b < a) return { write: false, reason: `已有文件数据日 ${a} 更新` }
  const strip = (o) => JSON.stringify({ ...o, generatedAt: null })
  if (strip(prev) === strip(next)) return { write: false, reason: '内容未变' }
  if (a === b && completeness(next) < completeness(prev)) return { write: false, reason: `同一数据日新结果更不完整（${completeness(next)} < ${completeness(prev)}）` }
  return { write: true, reason: '有新数据' }
}

/** 本次某行没取到时沿用上一份文件中的同 key 行（保留其原日期），并标注 carried。 */
export function carryRows(fresh, prevRows) {
  const prev = new Map((prevRows ?? []).map(r => [r.key, r]))
  return fresh.map(r => {
    const p = prev.get(r.key)
    if ((r.pe === null && r.dy === null) && p && (p.pe !== null || p.dy !== null)) return { ...p, carried: true }
    if (p && validDate(p.date) && validDate(r.date) && p.date > r.date && (p.pe !== null || p.dy !== null)) return { ...p, carried: true }
    return { ...r, carried: false }
  })
}
