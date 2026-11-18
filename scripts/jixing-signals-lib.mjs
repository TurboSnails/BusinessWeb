// 今天几星 · 牛熊信号板：纯解析与计算（无网络）。每个信号的判定规则为本站自定，写在 RULES 里并原样展示在页面上。
// 缺值一律 null，不补 0；分位统一为 (低于个数 + 0.5 × 相等个数) / n，只用当日及以前的数据。
import { num, validDate } from './ths-market-lib.mjs'
import { addYears, pctRankSorted, weeklyRows, ymd } from './jixing-star-lib.mjs'

const round = (x, d = 2) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d)
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10)

/** 偏股型新发基金口径：天天基金类型名。QDII（指数型-海外股票）与灵活配置不计入。 */
export const EQUITY_FUND_TYPES = ['股票型', '混合型-偏股', '指数型-股票']
export const IPO_WINDOW = 60 // 新股统计窗口：近 60 个交易日
export const IPO_MIN = 10 // 窗口内上市数少于此值时破发率不判信号

/** 本站自定的信号规则（页面原样展示）。 */
export const RULES = {
  buffett: '总市值 / GDP < 80% 记「低估」，> 100% 记「高估」，其余「正常」（绝对阈值，分位仅供参考）。',
  erp: '近 10 年分位 ≥ 80% 记「低估」（股票相对债券更便宜），≤ 20% 记「高估」，其余「正常」。',
  pb: '近 10 年分位 ≤ 20% 记「低估」，≥ 80% 记「高估」，其余「正常」。',
  marginRatio: '融资余额占流通市值的近 10 年分位 ≥ 80% 记「偏牛」（杠杆资金活跃），≤ 20% 记「偏熊」，其余「中性」。',
  amount: '近 1 年（约 250 个交易日）分位 ≥ 80% 记「偏牛」，≤ 20% 记「偏熊」，其余「中性」。',
  ipoCount: `近 ${IPO_WINDOW} 个交易日新股上市数的近 10 年分位 ≥ 80% 记「偏牛」（发行密集），≤ 20% 记「偏熊」，其余「中性」。`,
  ipoBroken: `近 ${IPO_WINDOW} 个交易日破发率 ≥ 20% 记「偏熊」，≤ 5% 记「偏牛」，其余「中性」；上市数少于 ${IPO_MIN} 家不判。`,
  funds: '最近一个完整月偏股型新发基金募集份额，在有数据的全部月份中分位 ≥ 80% 记「偏牛」，≤ 20% 记「偏熊」，其余「中性」。',
  accounts: '最近一个已公布月份的上交所新增投资者数，在有数据的全部月份中分位 ≥ 80% 记「偏牛」，≤ 20% 记「偏熊」，其余「中性」。',
  trM2: '中证全指全收益（H00985）月末点位 ÷ 当月已公布的 M2 余额，再按序列首月归一。近 10 年分位 ≤ 20% 记「低估」（股市相对货币偏便宜），≥ 80% 记「高估」，其余「正常」。',
}

/**
 * 全收益月末收盘 × M2 月末余额 → 比值序列（首点归一为 1）。
 * trMonthly: [{date:YYYY-MM-DD, close}] 取每月最后一个交易日；
 * m2Monthly: [{month:YYYY-MM, m2}]（亿元）。
 * 对齐规则：每个 M2 月用该月（或之前最近）全收益月末点位。
 */
export function trM2Series(trMonthly, m2Monthly) {
  const trByMonth = new Map()
  for (const p of trMonthly ?? []) {
    if (!validDate(p.date) || !(p.close > 0)) continue
    const m = p.date.slice(0, 7)
    const prev = trByMonth.get(m)
    if (!prev || p.date > prev.date) trByMonth.set(m, { date: p.date, close: p.close })
  }
  const rows = []
  for (const m of m2Monthly ?? []) {
    if (!m?.month || !(m.m2 > 0)) continue
    let tr = trByMonth.get(m.month)
    if (!tr) {
      // 找不晚于该月末的最近全收益月
      const keys = [...trByMonth.keys()].filter(k => k <= m.month).sort()
      tr = keys.length ? trByMonth.get(keys.at(-1)) : null
    }
    if (!tr) continue
    rows.push({ date: `${m.month}-01`, month: m.month, tr: tr.close, m2: m.m2, raw: tr.close / m.m2 })
  }
  rows.sort((a, b) => a.date.localeCompare(b.date))
  const base = rows[0]?.raw
  if (!base) return []
  return rows.map(r => ({ date: r.date, v: round(r.raw / base, 4), tr: r.tr, m2: r.m2, month: r.month }))
}

/** 分位 → 信号。cheapHigh：分位越高越便宜（股债性价比）。 */
export const valuationSignal = (p, cheapHigh = false) => (p === null ? null : (cheapHigh ? p >= 80 : p <= 20) ? '低估' : (cheapHigh ? p <= 20 : p >= 80) ? '高估' : '正常')
export const moodSignal = (p) => (p === null ? null : p >= 80 ? '偏牛' : p <= 20 ? '偏熊' : '中性')
export const buffettSignal = (r) => (r === null ? null : r < 80 ? '低估' : r > 100 ? '高估' : '正常')
export const brokenSignal = (rate, n) => (rate === null || n < IPO_MIN ? null : rate >= 20 ? '偏熊' : rate <= 5 ? '偏牛' : '中性')

/**
 * 截至最后一个点的窗口分位：series 升序 [{date, v}]；窗口 (最后日 − years, 最后日]，years = null 表示全部历史。
 * 返回 { pct, start, n }；样本少于 minN 返回 pct null。
 */
export function windowPct(series, years, minN = 20) {
  const pts = series.filter(p => p.v !== null && Number.isFinite(p.v))
  const last = pts.at(-1)
  if (!last) return { pct: null, start: null, n: 0 }
  const from = years === null ? null : addYears(last.date, -years)
  const win = pts.filter(p => from === null || p.date > from)
  const sorted = win.map(p => p.v).sort((a, b) => a - b)
  return { pct: win.length >= minN ? round(pctRankSorted(sorted, last.v), 1) : null, start: win[0].date, n: win.length }
}

/** 截断到 asOf 及以前。 */
export const upTo = (series, asOf) => series.filter(p => p.date <= asOf)

// ---------- 巴菲特指标 ----------
/** 东财 RPT_ECONOMY_GDP（累计值，亿元）→ 每个季度的滚动 4 季度名义 GDP 及可用日期（季末次月 20 日，近似国家统计局发布时间）。 */
export function rollingGdp(rows) {
  const cum = new Map()
  for (const r of rows) {
    const d = ymd(r?.REPORT_DATE), v = num(r?.DOMESTICL_PRODUCT_BASE)
    if (!validDate(d) || v === null || v <= 0) continue
    const m = Number(d.slice(5, 7))
    if (![3, 6, 9, 12].includes(m)) continue
    cum.set(`${d.slice(0, 4)}-${m}`, v)
  }
  const out = []
  for (const [key, v] of cum) {
    const [y, m] = key.split('-').map(Number)
    const annualPrev = cum.get(`${y - 1}-12`), samePrev = cum.get(`${y - 1}-${m}`)
    const g = m === 12 ? v : annualPrev !== undefined && samePrev !== undefined ? v + annualPrev - samePrev : null
    if (g === null) continue
    const qEnd = `${y}-${String(m).padStart(2, '0')}`
    const avail = m === 12 ? `${y + 1}-01-20` : `${y}-${String(m + 1).padStart(2, '0')}-20`
    out.push({ quarter: qEnd, gdp: g, avail })
  }
  return out.sort((a, b) => a.quarter.localeCompare(b.quarter))
}

/**
 * 东财 RPT_VALUEMARKET：000300 行 = 沪深两市合计（沪主板 + 科创板 + 深主板 + 创业板），899050 行 = 北交所；单位万元。
 * 北交所 2021-11-15 开市，此前不存在（不是缺值）；开市后当日缺北交所行则该日总市值为 null。
 */
export function totalMcap(rows) {
  const by = new Map()
  for (const r of rows) {
    const d = ymd(r?.TRADE_DATE), v = num(r?.TOTAL_MARKET_CAP)
    if (!validDate(d) || v === null || v <= 0) continue
    const x = by.get(d) ?? {}
    x[r.TRADE_MARKET_CODE] = v
    by.set(d, x)
  }
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, x]) => {
    const bse = date < '2021-11-15' ? 0 : x['899050'] ?? null
    const total = x['000300'] === undefined || bse === null ? null : (x['000300'] + bse) / 1e4 // 亿元
    return { date, mcap: total }
  })
}

/** 逐日巴菲特指标（%）：当日总市值 / 当日已发布的最新滚动 4 季度 GDP。 */
export function buffettSeries(mcap, gdp) {
  return mcap.map(({ date, mcap: m }) => {
    const g = [...gdp].reverse().find(q => q.avail <= date) ?? null
    return { date, v: m === null || !g ? null : round((m / g.gdp) * 100, 2), mcap: m, gdp: g?.gdp ?? null, quarter: g?.quarter ?? null }
  })
}

// ---------- 融资余额 ----------
/** 东财 RPTA_RZRQ_LSHJ：RZYE 元 → 亿元；RZYEZB = 融资余额占流通市值 %。 */
export function marginSeries(rows) {
  const seen = new Set()
  return rows.map(r => ({ date: ymd(r?.DIM_DATE), balance: num(r?.RZYE), ratio: num(r?.RZYEZB) }))
    .filter(r => validDate(r.date) && !seen.has(r.date) && seen.add(r.date))
    .map(r => ({ date: r.date, balance: r.balance === null ? null : round(r.balance / 1e8, 2), ratio: r.ratio === null ? null : round(r.ratio, 4) }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ---------- 新股 ----------
/** 东财 RPTA_APP_IPOAPPLY：上市日、发行价、上市首日收盘。破发 = 首日收盘 < 发行价；首日收盘缺失不计入破发率分母。 */
export function parseIpo(rows) {
  const seen = new Set()
  return rows.map(r => ({ code: String(r?.SECURITY_CODE ?? ''), date: ymd(r?.LISTING_DATE), issue: num(r?.ISSUE_PRICE), close: num(r?.CLOSE_PRICE) }))
    .filter(r => r.code && validDate(r.date) && !seen.has(r.code) && seen.add(r.code))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * 每个交易日的「近 k 个交易日」新股统计：days 为升序交易日列表。返回 [{date, count, priced, broken, rate}]。
 * 上市日不在交易日列表里的记录（数据异常）不计。前 k − 1 天窗口不满，返回 null 行值。
 */
export function ipoRolling(ipos, days, k = IPO_WINDOW) {
  const idx = new Map(days.map((d, i) => [d, i]))
  const cnt = new Array(days.length).fill(0), pri = new Array(days.length).fill(0), brk = new Array(days.length).fill(0)
  for (const r of ipos) {
    const i = idx.get(r.date)
    if (i === undefined) continue
    cnt[i]++
    if (r.issue !== null && r.close !== null && r.issue > 0) { pri[i]++; if (r.close < r.issue) brk[i]++ }
  }
  const out = []
  let c = 0, p = 0, b = 0
  for (let i = 0; i < days.length; i++) {
    c += cnt[i]; p += pri[i]; b += brk[i]
    if (i >= k) { c -= cnt[i - k]; p -= pri[i - k]; b -= brk[i - k] }
    out.push(i < k - 1 ? { date: days[i], count: null, priced: null, broken: null, rate: null, from: null }
      : { date: days[i], count: c, priced: p, broken: b, rate: p ? round((b / p) * 100, 1) : null, from: days[i - k + 1] })
  }
  return out
}

// ---------- 新发基金 ----------
const fundKey = (r) => `${r.company}|${String(r.name).replace(/(发起式)?[A-Z]$/, '')}|${r.setup}`
/**
 * 新成立基金（parseFundIssue 行）按成立月份汇总偏股型募集份额（亿份）。A/C 份额类别去重同 ths-market。
 * 份额缺失的偏股基金计入 unknown；该月偏股份额全部缺失时为 null。
 */
export function fundMonthly(rows) {
  const acc = new Map(), seen = new Set()
  for (const r of rows) {
    if (!validDate(r.setup) || seen.has(fundKey(r))) continue
    seen.add(fundKey(r))
    const m = r.setup.slice(0, 7)
    const x = acc.get(m) ?? { month: m, equity: 0, equityFunds: 0, unknown: 0, funds: 0 }
    x.funds++
    if (EQUITY_FUND_TYPES.includes(String(r.type))) { if (r.shares === null) x.unknown++; else { x.equity += r.shares; x.equityFunds++ } }
    acc.set(m, x)
  }
  return [...acc.values()].sort((a, b) => a.month.localeCompare(b.month)).map(x => ({ ...x, equity: x.equityFunds === 0 && x.unknown > 0 ? null : round(x.equity, 2) }))
}

/**
 * 合并缓存与本次翻页：refreshFrom（YYYY-MM）及以后的月份用本次结果替换，更早月份沿用缓存。
 * coveredFrom = 本次翻页能证明覆盖到的最早月份；早于它而缓存里也没有的月份不出现。
 */
export function mergeFundMonths(cache, fresh, refreshFrom) {
  const keep = cache.filter(m => m.month < refreshFrom)
  const add = fresh.filter(m => m.month >= refreshFrom)
  return [...keep, ...add].sort((a, b) => a.month.localeCompare(b.month))
}

/**
 * 新成立基金列表的实际覆盖起点：列表只能翻到约 2022 年底，最早几个月只有零星记录。
 * 取「此后每个月都有 ≥ minFunds 只新基金（任何类型）」的最早月份，再跳过这个可能不完整的首月。
 */
export function fundStart(months, minFunds = 20) {
  let start = null
  for (let i = months.length - 1; i >= 0; i--) { if ((months[i].funds ?? 0) >= minFunds) start = months[i].month; else break }
  if (start === null) return null
  const i = months.findIndex(m => m.month === start)
  return months[i + 1]?.month ?? null
}

// ---------- 新增开户 ----------
/**
 * 上交所 COMMON_SSE_TZZ_M_ALL_ACCT_C（某年 MDATE=YYYY12 或当年最新）：TERM = YYYY.MM，TOTAL = 当月新增投资者（万户）。
 * MDATE 之后的月份接口填 0.00，这是「未公布」不是 0，丢弃。
 */
export function parseSseAccounts(body) {
  const rows = body?.pageHelp?.data
  if (!Array.isArray(rows)) throw new Error('上交所新增投资者格式异常')
  const out = []
  for (const r of rows) {
    const t = /^(\d{4})\.(\d{2})$/.exec(String(r?.TERM ?? ''))
    const md = /^(\d{4})(\d{2})$/.exec(String(r?.MDATE ?? ''))
    const v = num(r?.TOTAL)
    if (!t || !md || v === null) continue
    if (`${t[1]}${t[2]}` > `${md[1]}${md[2]}`) continue
    out.push({ month: `${t[1]}-${t[2]}`, v })
  }
  return out
}

// ---------- 组装 ----------
/** 日度序列 → 迷你图点（超过 1 年的按周采样，减小文件）。 */
export function miniHistory(series, years = 10, digits = 2) {
  const last = series.at(-1)
  if (!last) return []
  const from = addYears(last.date, -years)
  const win = series.filter(p => p.date > from)
  const pts = win.length > 300 ? weeklyRows(win) : win
  return pts.map(p => [p.date, round(p.v, digits)])
}

/** 信号计数（null = 不判，计入 none）。 */
export function summarize(indicators) {
  const c = { 低估: 0, 正常: 0, 高估: 0, 偏牛: 0, 中性: 0, 偏熊: 0, none: 0 }
  for (const i of indicators) { if (i.signal && i.signal in c) c[i.signal]++; else c.none++ }
  return c
}

export { addDays, round }
