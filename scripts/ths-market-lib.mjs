// 同花顺 · 市场：纯解析与计算（无网络）。缺值一律 null，不补 0；带日期的源必须对上目标交易日。
import { isTradingDay, prevTradingDay } from './market-mood-lib.mjs'

/** 估值分区阈值：PE(TTM) 历史分位 ≥ 80% 危险、≤ 20% 机会，其余合理。 */
export const DANGER = 80
export const CHANCE = 20

// 九个估值对象：七个中证/上证指数取中证指数官网；深证成指、创业板指非中证编制，改用东财「市场估值」的板块整体 PE。
export const INDICES = [
  { code: '000001', name: '上证指数', source: 'csi', valName: '上证指数' },
  { code: '000016', name: '上证50', source: 'csi', valName: '上证50' },
  { code: '000300', name: '沪深300', source: 'csi', valName: '沪深300' },
  { code: '000905', name: '中证500', source: 'csi', valName: '中证500' },
  { code: '000852', name: '中证1000', source: 'csi', valName: null },
  { code: '000688', name: '科创50', source: 'csi', valName: null },
  { code: '000922', name: '中证红利', source: 'csi', valName: '中证红利' },
  { code: '399001', name: '深市主板（整体）', source: 'board', valName: null },
  { code: '399006', name: '创业板（整体）', source: 'board', valName: null },
]
/** 风格对比：分子 / 分母，比值上升 = 分子相对更强。 */
export const STYLE_PAIRS = [
  { id: 'size', label: '大盘 vs 小盘', num: { code: '000300', name: '沪深300' }, den: { code: '000852', name: '中证1000' } },
  { id: 'size2000', label: '大盘 vs 微盘', num: { code: '000300', name: '沪深300' }, den: { code: '932000', name: '中证2000' } },
  { id: 'growth', label: '成长 vs 价值', num: { code: '000918', name: '300成长' }, den: { code: '000919', name: '300价值' } },
]

export const validDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s
export const num = (x) => (typeof x !== 'number' && typeof x !== 'string') || String(x).trim() === '' || String(x).trim() === '-' || !Number.isFinite(Number(x)) ? null : Number(x)
const round = (x, d = 2) => (x === null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d)
const ymd = (s) => (typeof s === 'string' && /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : typeof s === 'string' ? s.slice(0, 10) : null)
export const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10)
const addYears = (date, n) => `${Number(date.slice(0, 4)) + n}${date.slice(4)}`
export function monthsBack(date, n) {
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7)) - 1 - n
  const d = new Date(Date.UTC(y, m, 1))
  return d.toISOString().slice(0, 7)
}
export function monthList(date, n = 12) {
  return Array.from({ length: n }, (_, i) => monthsBack(date, n - 1 - i))
}

// ---------- URL ----------
export const CSI = 'https://www.csindex.com.cn/csindex-home'
export const csiPerfUrl = (code, start, end) => `${CSI}/perf/index-perf?indexCode=${code}&startDate=${start.replaceAll('-', '')}&endDate=${end.replaceAll('-', '')}`
export const csiValUrl = `${CSI}/data-service/indexValuation`
export const EM = 'https://datacenter-web.eastmoney.com/api/data/v1/get'
export const emUrl = (params) => `${EM}?${new URLSearchParams({ columns: 'ALL', source: 'WEB', client: 'WEB', ...params })}`
export const fundUrl = (page, size) => `https://fund.eastmoney.com/data/FundNewIssue.aspx?t=xcln&sort=jzrgq,desc&y=&page=${page},${size}&isbuy=0`

/**
 * 东财数据中心分页取全：fetchPage(page) 返回接口原始 body。只有第 1 页可以「无数据」（code 9201，确实没有记录）；
 * 第 2 页起再无数据说明翻页途中数据变化或接口抖动，抛错（整批放弃，保留上一份文件）。取完后行数必须等于报表给出的 count。
 */
export async function emPaginate(fetchPage, label, maxPages = 40) {
  const out = []
  let count = null, pages = null
  for (let page = 1; page <= maxPages; page++) {
    const body = await fetchPage(page)
    if (body?.code === 9201 || (body?.success === false && /数据/.test(body?.message ?? ''))) {
      if (page === 1) return out
      throw new Error(`东财 ${label} 第 ${page} 页无数据（已取 ${out.length}/${count}）`)
    }
    if (!body?.success || !Array.isArray(body?.result?.data)) throw new Error(`东财 ${label} 返回异常：${body?.message}`)
    count ??= body.result.count
    pages ??= body.result.pages
    out.push(...body.result.data)
    if (page >= pages) {
      if (!Number.isInteger(count) || out.length !== count) throw new Error(`东财 ${label} 行数不完整（${out.length}/${count}）`)
      return out
    }
  }
  throw new Error(`东财 ${label} 页数超过上限`)
}

// ---------- 估值 ----------
/** 中证官网 index-perf：peg 字段 = 滚动市盈率（官网前端文案「PETTM:滚动市盈率」）。过滤周末与节假日重复行。 */
export function parseCsiPerf(body, target) {
  const rows = body?.data
  if (String(body?.code) !== '200' || !Array.isArray(rows) || !rows.length) throw new Error('中证指数行情为空')
  const out = []
  for (const r of rows) {
    const date = ymd(r?.tradeDate)
    if (!validDate(date) || date > target) continue
    const wd = new Date(`${date}T00:00:00Z`).getUTCDay()
    if (wd === 0 || wd === 6 || !isTradingDay(date)) continue
    const close = num(r.close), pe = num(r.peg)
    const prev = out.at(-1)
    if (prev && (prev.date >= date || (prev.close === close && prev.vol === num(r.tradingVol)))) continue // 乱序或节假日复制行
    out.push({ date, close, pe: pe !== null && pe > 0 ? pe : null, vol: num(r.tradingVol) })
  }
  if (!out.length || out.at(-1).date !== target || out.at(-1).close === null) throw new Error(`中证指数行情未更新到 ${target}`)
  return out.map(({ vol, ...r }) => r)
}

/** 估值快照里必须出现的指数名（INDICES 中配置了 valName 的全部指数）。 */
export const VAL_NAMES = INDICES.filter(i => i.valName).map(i => i.valName)
/**
 * 中证官网 indexValuation：当日快照，含静态 PE、滚动 PE(peg)、PB、股息率。tradeDate 必须是目标日，
 * 且 expected 里的指数都要有当日行——缺任何一个视为未发全（抛错，整批放弃），不能用缺项快照覆盖 PB / 股息率和 PB 历史。
 */
export function parseCsiValuation(body, target, expected = VAL_NAMES) {
  const d = body?.data
  if (String(body?.code) !== '200' || ymd(d?.tradeDate) !== target || !Array.isArray(d.indexValuations)) throw new Error(`中证估值快照日期不是 ${target}`)
  const map = {}
  for (const r of d.indexValuations) {
    if (ymd(r?.tradeDate) !== target || typeof r.indexName !== 'string') continue
    map[r.indexName] = { peTtm: num(r.peg), pb: num(r.pb), dp: num(r.dp) }
  }
  const missing = expected.filter(n => !map[n])
  if (missing.length) throw new Error(`中证估值快照缺少 ${missing.join('、')}`)
  return map
}

/** PB 历史逐日累积：只记有限值；同一天已有的值不被缺失值覆盖。返回新对象。 */
export function mergePbDay(history, date, snap, indices = INDICES) {
  const day = { ...(history[date] ?? {}) }
  for (const i of indices) {
    const pb = i.valName ? snap[i.valName]?.pb ?? null : null
    if (pb !== null && Number.isFinite(pb)) day[i.code] = pb
  }
  return { ...history, [date]: day }
}

/** 东财 RPT_VALUEMARKET：板块整体 PE(TTM)，自 2017-01 起。 */
export function parseBoardPe(rows, target) {
  const seen = new Set()
  const out = rows.map(r => ({ date: ymd(r?.TRADE_DATE), pe: num(r?.PE_TTM_AVG) }))
    .filter(r => validDate(r.date) && r.date <= target && !seen.has(r.date) && seen.add(r.date))
    .map(r => ({ date: r.date, pe: r.pe !== null && r.pe > 0 ? r.pe : null }))
    .sort((a, b) => a.date.localeCompare(b.date))
  if (!out.length || out.at(-1).date !== target || out.at(-1).pe === null) throw new Error(`板块估值未更新到 ${target}`)
  return out
}

/**
 * 历史分位：窗口内（含当日）PE ≤ 当前值的交易日占比。窗口起点之后 45 天内才有数据视为覆盖不足，返回 null。
 */
export function percentile(series, years) {
  const last = series.at(-1)
  if (!last || last.value === null) return null
  const start = addYears(last.date, -years)
  const first = series.find(p => p.value !== null)
  if (!first || first.date > addDays(start, 45)) return null
  const win = series.filter(p => p.date > start && p.value !== null)
  if (win.length < 20) return null
  return round((win.filter(p => p.value <= last.value).length / win.length) * 100, 1)
}
export const zoneOf = (p) => (p === null ? null : p >= DANGER ? '危险' : p <= CHANCE ? '机会' : '合理')

/** 周采样（每周最后一个交易日），给前端画 10 年曲线，避免文件过大。 */
export function weekly(series) {
  const out = []
  let key = null
  for (const p of series) {
    const t = Date.parse(`${p.date}T00:00:00Z`)
    const k = Math.floor((t / 864e5 + 3) / 7) // 以周一为界
    if (k === key) out[out.length - 1] = p
    else { out.push(p); key = k }
  }
  return out
}

export function valuationRow(meta, series, snapshot) {
  const s = series.map(p => ({ date: p.date, value: p.pe }))
  const last = series.at(-1)
  const p5 = percentile(s, 5), p10 = percentile(s, 10)
  const basis = p10 !== null ? 10 : p5 !== null ? 5 : null
  const since = series.find(p => p.pe !== null)?.date ?? null
  return {
    code: meta.code, name: meta.name, source: meta.source,
    pe: round(last.pe), pb: round(snapshot?.pb ?? null), dp: round(snapshot?.dp ?? null),
    peP5: p5, peP10: p10, zoneBasis: basis, zone: zoneOf(basis === 10 ? p10 : p5), since,
    history: weekly(series.filter(p => p.date > addYears(last.date, -10) && (since === null || p.date >= since))).map(p => [p.date, round(p.pe)]),
  }
}

// ---------- 资金供需 ----------
/** 限售解禁：目标日之后 30 个自然日，按周（周一起）汇总。LIFT_MARKET_CAP 单位万元，按最新价估算。 */
export function liftWeeks(rows, target) {
  const end = addDays(target, 30)
  const weeks = new Map()
  for (const r of rows) {
    const date = ymd(r?.FREE_DATE), cap = num(r?.LIFT_MARKET_CAP)
    if (!validDate(date) || date <= target || date > end) continue
    const wd = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7
    const start = addDays(date, -wd)
    const from = addDays(target, 1), wEnd = addDays(start, 6)
    const w = weeks.get(start) ?? { start: start < from ? from : start, end: wEnd > end ? end : wEnd, amount: 0, priced: 0, stocks: new Set(), unpriced: 0 }
    if (cap === null) w.unpriced += 1
    else { w.amount += cap / 1e4; w.priced += 1 }
    if (r.SECURITY_CODE) w.stocks.add(r.SECURITY_CODE)
    weeks.set(start, w)
  }
  // 一周内全部批次都没有市值 → 金额 null（不是 0）；部分缺失由 unpriced 计数标出
  const list = [...weeks.values()].sort((a, b) => a.start.localeCompare(b.start)).map(w => ({ start: w.start, end: w.end, amount: w.priced ? round(w.amount) : null, stocks: w.stocks.size, unpriced: w.unpriced }))
  const priced = list.filter(w => w.amount !== null)
  // 没有任何解禁批次时合计为真实的 0；有批次但都无市值时为 null
  return { from: addDays(target, 1), to: end, weeks: list, total: list.length && !priced.length ? null : round(priced.reduce((a, w) => a + w.amount, 0)) }
}

/** 股东增减持：按公告月汇总，亿元。金额 = 变动股数(万股) × 成交均价；均价缺失用该行收盘价估算并计数。 */
export function holderMonths(rows, target, n = 12) {
  const months = monthList(target, n)
  const acc = Object.fromEntries(months.map(m => [m, { month: m, increase: 0, decrease: 0, incPriced: 0, incUnpriced: 0, decPriced: 0, decUnpriced: 0, records: 0, estimated: 0, unpriced: 0 }]))
  for (const r of rows) {
    const date = ymd(r?.NOTICE_DATE)
    if (!validDate(date) || date > target) continue
    const m = acc[date.slice(0, 7)]
    if (!m) continue
    const qty = num(r.CHANGE_NUM), avg = num(r.TRADE_AVERAGE_PRICE), close = num(r.CLOSE_PRICE)
    const dir = r.DIRECTION === '增持' ? 1 : r.DIRECTION === '减持' ? -1 : 0
    if (!dir || qty === null) continue
    m.records += 1
    const price = avg ?? close
    if (price === null) { m.unpriced += 1; if (dir > 0) m.incUnpriced += 1; else m.decUnpriced += 1; continue }
    if (avg === null) m.estimated += 1
    const amt = Math.abs(qty) * price / 1e4
    if (dir > 0) { m.increase += amt; m.incPriced += 1 } else { m.decrease += amt; m.decPriced += 1 }
  }
  // 某方向有记录但全部无价 → 该方向金额 null（不是 0），净额随之 null；没有记录才是真实的 0
  return months.map(m => {
    const x = acc[m]
    const inc = x.incUnpriced && !x.incPriced ? null : round(x.increase)
    const dec = x.decUnpriced && !x.decPriced ? null : round(x.decrease)
    return { month: m, increase: inc, decrease: dec, net: inc === null || dec === null ? null : round(x.increase - x.decrease), records: x.records, estimated: x.estimated, unpriced: x.unpriced }
  })
}

/** 股权与可转债融资：IPO 按上市日、增发按新增股份上市日、可转债按起息日，月度亿元。 */
export function financingMonths({ ipo, seo, cb }, target, n = 12) {
  const months = monthList(target, n)
  const acc = Object.fromEntries(months.map(m => [m, { month: m, ipo: 0, ipoCount: 0, ipoUnpriced: 0, seo: 0, seoCount: 0, seoUnpriced: 0, cb: 0, cbCount: 0, cbUnpriced: 0 }]))
  const add = (date, key, v) => {
    if (!validDate(date) || date > target) return
    const m = acc[date.slice(0, 7)]
    if (!m) return
    if (v === null) { m[`${key}Unpriced`] += 1; return } // 金额缺失只计数，不当 0
    m[key] += v; m[`${key}Count`] += 1
  }
  for (const r of ipo) {
    const raise = num(r?.TOTAL_RAISE_FUNDS)
    const price = num(r?.ISSUE_PRICE), qty = num(r?.ISSUE_NUM)
    add(ymd(r?.LISTING_DATE), 'ipo', raise ?? (price !== null && qty !== null ? price * qty / 1e4 : null)) // ISSUE_NUM 万股
  }
  for (const r of seo) { const v = num(r?.TOTAL_RAISE_FUNDS); add(ymd(r?.ISSUE_LISTING_DATE), 'seo', v === null ? null : v / 1e8) }
  for (const r of cb) add(ymd(r?.VALUE_DATE), 'cb', num(r?.ACTUAL_ISSUE_SCALE))
  // xxxCount = 有金额的笔数，xxxUnpriced = 金额缺失的笔数；有记录但全部缺金额 → null
  const amt = (x, k) => (x[`${k}Unpriced`] && !x[`${k}Count`] ? null : round(x[k]))
  return months.map(m => { const x = acc[m]; return { ...x, ipo: amt(x, 'ipo'), seo: amt(x, 'seo'), cb: amt(x, 'cb') } })
}

/** 天天基金新成立基金：datas 数组。A/C 等份额类别同列重复的募集份额，按（公司、去类别名、成立日）去重。 */
export function parseFundIssue(text) {
  const m = /datas:(\[[\s\S]*?\]\])\s*,\s*record/.exec(String(text))
  if (!m) { if (/datas:\[\]/.test(String(text))) return []; throw new Error('新发基金格式异常') }
  let src = m[1]
  while (src.includes(',,')) src = src.replaceAll(',,', ',null,') // JS 稀疏数组空位
  const rows = JSON.parse(src)
  return rows.map(r => ({ code: r[0], name: r[1], company: r[2], type: r[4], shares: num(r[5]), setup: validDate(r[6]) ? r[6] : null }))
}
/**
 * 新发基金翻页的覆盖下界：列表按认购截止日倒序，翻到最后一页（不足一页）或整页都早于 from − 90 天才算覆盖完整（返回 null）；
 * 否则返回最后一页里最晚的成立日——该日所在月份及更早的数据可能没翻到。
 */
export function fundCoverage(pages, from, pageSize) {
  const last = pages.at(-1) ?? []
  if (last.length < pageSize || last.every(r => !r.setup || r.setup < addDays(from, -90))) return null
  return last.map(r => r.setup).filter(validDate).sort().at(-1) ?? from
}
/** coveredFrom：fundCoverage 的结果；该日所在月份及更早月份标 complete=false，份额为 null（不是 0）。份额缺失的基金计入 unknown。 */
export function fundMonths(rows, target, n = 12, coveredFrom = null) {
  const months = monthList(target, n)
  const acc = Object.fromEntries(months.map(m => [m, { month: m, shares: 0, funds: 0, equityShares: 0, unknown: 0 }]))
  const seen = new Set()
  for (const r of rows) {
    if (!validDate(r.setup) || r.setup > target || !acc[r.setup.slice(0, 7)]) continue
    const key = `${r.company}|${String(r.name).replace(/(发起式)?[A-Z]$/, '')}|${r.setup}`
    if (seen.has(key)) continue
    seen.add(key)
    const x = acc[r.setup.slice(0, 7)]
    if (r.shares === null) { x.unknown += 1; continue }
    x.shares += r.shares; x.funds += 1
    if (/股票|偏股|指数型-股票/.test(String(r.type))) x.equityShares += r.shares
  }
  const cut = coveredFrom ? coveredFrom.slice(0, 7) : null
  return months.map(m => {
    const x = acc[m]
    const complete = !(cut && m <= cut)
    const none = !complete || (x.unknown > 0 && x.funds === 0)
    return { month: m, shares: none ? null : round(x.shares), funds: x.funds, equityShares: none ? null : round(x.equityShares), unknown: x.unknown, complete }
  })
}

// ---------- 利率 ----------
/** 东财 RPTA_WEB_TREASURYYIELD：EMM00166466 中国 10 年、EMM00588704 中国 2 年（%）。 */
export function parseTreasury(rows, target) {
  const seen = new Set()
  return rows.map(r => ({ date: ymd(r?.SOLAR_DATE), y10: num(r?.EMM00166466), y2: num(r?.EMM00588704) }))
    .filter(r => validDate(r.date) && r.date <= target && r.y10 !== null && !seen.has(r.date) && seen.add(r.date))
    .sort((a, b) => a.date.localeCompare(b.date))
}
/** 东财 RPT_IMP_INTRESTRATEN：上海银行间同业拆放利率（MARKET_CODE 001），INDICATOR_ID 001=隔夜，101=1 周。 */
export function parseShibor(rows, target) {
  const by = new Map()
  for (const r of rows) {
    const date = ymd(r?.REPORT_DATE), v = num(r?.IR_RATE)
    if (!validDate(date) || date > target || v === null) continue
    const x = by.get(date) ?? { date, on: null, w1: null }
    if (r.INDICATOR_ID === '001') x.on = v
    if (r.INDICATOR_ID === '101') x.w1 = v
    by.set(date, x)
  }
  return [...by.values()].sort((a, b) => a.date.localeCompare(b.date))
}

// ---------- 风格 ----------
/** 往前数 k 个交易日（按交易日历，不看数据有没有那天）。 */
export function tradingDaysBack(date, k) {
  let d = date
  for (let i = 0; i < k; i++) d = prevTradingDay(d)
  return d
}
/**
 * 比值序列（分子收盘 / 分母收盘，起点归一为 100），与 20/60 日相对强弱（%）。只用双方同日都有收盘的交易日。
 * 相对强弱按确切交易日：比较日 = 最新日往前第 k 个交易日；那天任一方缺收盘则为 null，不拿更早的观测顶替。
 */
export function stylePair(pair, numRows, denRows, keep = 250) {
  const den = new Map(denRows.map(r => [r.date, r.close]))
  const joined = numRows.filter(r => r.close !== null && den.get(r.date) != null).map(r => ({ date: r.date, ratio: r.close / den.get(r.date) }))
  if (joined.length < 61) return null
  const byDate = new Map(joined.map(r => [r.date, r.ratio]))
  const rel = (k) => { const b = byDate.get(tradingDaysBack(joined.at(-1).date, k)); return b === undefined ? null : round((joined.at(-1).ratio / b - 1) * 100) }
  const tail = joined.slice(-keep)
  const base = tail[0].ratio
  return { id: pair.id, label: pair.label, num: pair.num.name, den: pair.den.name, rel20: rel(20), rel60: rel(60), series: tail.map(r => [r.date, round(r.ratio / base * 100, 2)]) }
}

// ---------- 外盘联动 ----------
/** 外盘异动阈值：|涨跌幅| ≥ 2 倍此前 60 个交易日涨跌幅的样本标准差；样本不足 40 天（σ 缺失）时改用 |涨跌幅| ≥ 3%。 */
export const OVERSEAS_TH = { pct: 3, sigma: 2, window: 60, minObs: 40 }
/** 纽交所全天休市日（NYSE 官网 Holidays & Trading Hours）。表外年份直接报错，提醒更新。 */
export const NYSE_HOLIDAYS = new Set([
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
])
const NYSE_YEARS = new Set([...NYSE_HOLIDAYS].map(d => d.slice(0, 4)))
/** 北京日期 bjDate 之前最近一个美股交易日（美东日期）：美股 D 日收盘在北京 D+1 日清晨，所以严格早于 bjDate。 */
export function usSessionBefore(bjDate) {
  let d = addDays(bjDate, -1)
  for (let i = 0; i < 10; i++, d = addDays(d, -1)) {
    if (!NYSE_YEARS.has(d.slice(0, 4))) throw new Error(`美股休市表未覆盖 ${d.slice(0, 4)} 年`)
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay()
    if (wd !== 0 && wd !== 6 && !NYSE_HOLIDAYS.has(d)) return d
  }
  throw new Error('找不到上一美股交易日')
}
/** 东财 push2his 日 K：f51 日期、f53 收盘、f59 涨跌幅（%）。 */
export const overseasKlineUrl = (secid, lmt = 70) => `https://push2his.eastmoney.com/api/qt/stock/kline/get?${new URLSearchParams({ secid, fields1: 'f1,f2,f3', fields2: 'f51,f53,f59', klt: '101', fqt: '1', end: '20500101', lmt: String(lmt) })}`
/** 解析日 K：'-' / 空串 = 缺失（null）；日期必须合法且严格递增，否则丢弃该行。没有 klines 数组返回 null。 */
export function parseOverseasKline(body) {
  const k = body?.data?.klines
  if (!Array.isArray(k)) return null
  const rows = []
  for (const line of k) {
    const [date, close, pct] = String(line).split(',')
    if (!validDate(date) || (rows.length && rows.at(-1).date >= date)) continue
    rows.push({ date, close: num(close), pct: num(pct) })
  }
  return { name: typeof body.data.name === 'string' ? body.data.name : null, rows }
}
const sampleSd = (xs) => { const m = xs.reduce((a, x) => a + x, 0) / xs.length; return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)) }
/** 指定日（必须恰好有这一天的 K 线，不拿相邻日顶替）的收盘与涨跌幅；σ = 该日之前最近 window 个涨跌幅的样本标准差。 */
export function sessionStats(rows, date, th = OVERSEAS_TH) {
  const i = (rows ?? []).findIndex(r => r.date === date)
  if (i < 0 || rows[i].pct === null) return null
  const past = rows.slice(0, i).map(r => r.pct).filter(x => x !== null).slice(-th.window)
  const sigma = past.length >= th.minObs ? sampleSd(past) : null
  const pct = rows[i].pct
  return { date, close: rows[i].close, pct, sigma: round(sigma), z: sigma ? round(pct / sigma) : null }
}
export const isAnomaly = (s, th = OVERSEAS_TH) => s !== null && (s.z !== null ? Math.abs(s.z) >= th.sigma : Math.abs(s.pct) >= th.pct)
/** 东财时间戳（秒）对应的北京日期与时分。 */
export function bjTime(ts) {
  if (!Number.isFinite(ts) || ts <= 0) return null
  const s = new Date(ts * 1000 + 8 * 3600e3).toISOString()
  return { date: s.slice(0, 10), hm: s.slice(11, 16) }
}
const bjClock = (now) => { const bj = new Date(now.getTime() + 8 * 3600e3); return { today: bj.toISOString().slice(0, 10), min: bj.getUTCHours() * 60 + bj.getUTCMinutes() } }
/** 板块快照（东财 ulist，不带日期）只在交易日北京 15:10 之后、且目标日就是北京今天时可用。 */
export function boardSnapshotAllowed(now, asOf) {
  const { today, min } = bjClock(now)
  return today === asOf && isTradingDay(today) && min >= 15 * 60 + 10
}
/** 港股 16:10 收市（含收市竞价），北京 16:15 之后当天 K 线才算收盘价；更早的日期不受限。 */
export function hkCloseAllowed(now, asOf) {
  const { today, min } = bjClock(now)
  return asOf < today || (asOf === today && min >= 16 * 60 + 15)
}
/**
 * 东财 ulist 板块行情：f12 代码、f14 名称、f3 涨跌幅、f62 主力净流入（元 → 亿元）、f124 行情时间（秒）。
 * 只收行情时间落在北京 today 的行；名称与映射表不符的行丢弃并记入 mismatched。
 */
export function parseBoardQuotes(body, today, names) {
  const diff = body?.data?.diff
  if (!Array.isArray(diff)) throw new Error('板块行情为空')
  const map = {}, mismatched = []
  let time = null
  for (const r of diff) {
    const code = r?.f12
    if (typeof code !== 'string' || !(code in names)) continue
    if (r.f14 !== names[code]) { mismatched.push(`${code} ${names[code]}≠${r.f14}`); continue }
    const t = bjTime(Number(r.f124))
    if (!t || t.date !== today) continue
    const flow = num(r.f62)
    map[code] = { pct: num(r.f3), flow: flow === null ? null : round(flow / 1e8) }
    if (!time || t.hm > time) time = t.hm
  }
  return { map, mismatched, time }
}
/**
 * 组装外盘联动：klines = { secid: parseOverseasKline 结果 }，boards = parseBoardQuotes 的 map（不可用时 null）。
 * 美股取 usSession 那一天、港股取 asOf 那一天（hkOk=false 时港股全为 null）。
 */
export function buildOverseas({ map, klines, boards, asOf, usSession, hkOk, th = OVERSEAS_TH }) {
  const board = (code) => ({ code, name: map.boards[code], pct: boards?.[code]?.pct ?? null, flow: boards?.[code]?.flow ?? null })
  const stat = (secid, date) => (date && klines[secid] ? sessionStats(klines[secid].rows, date, th) : null)
  const indices = map.indices.map(i => { const s = stat(i.secid, usSession); return { symbol: i.symbol, name: i.name, close: s?.close ?? null, pct: s?.pct ?? null } })
  const items = map.stocks.map(s => {
    const st = stat(s.secid, s.market === 'US' ? usSession : hkOk ? asOf : null)
    return { symbol: s.symbol, name: s.name, market: s.market, date: st?.date ?? null, close: st?.close ?? null, pct: st?.pct ?? null, sigma: st?.sigma ?? null, z: st?.z ?? null, anomaly: isAnomaly(st, th), reason: s.reason, boards: s.boards.map(board) }
  })
  return { indices, items, summary: coMove(items) }
}
/** 同向：异动个股的每个关联板块，A 股当日涨跌幅与外盘涨跌幅符号相同（任一为 0 或缺失不计入观测）。 */
export function coMove(items) {
  let obs = 0, same = 0
  for (const it of items) {
    if (!it.anomaly || !it.pct) continue
    for (const b of it.boards) {
      if (!b.pct) continue
      obs += 1
      if (Math.sign(b.pct) === Math.sign(it.pct)) same += 1
    }
  }
  return { anomalies: items.filter(i => i.anomaly).length, obs, same }
}
/** 逐日累积异动记录（只在板块快照可用时写入当天），同日重跑覆盖。 */
export function mergeOverseasHistory(history, asOf, items) {
  const day = items.filter(i => i.anomaly && i.pct).map(i => ({ symbol: i.symbol, pct: i.pct, boards: i.boards.filter(b => b.pct !== null).map(b => [b.code, b.pct]) }))
  return { ...history, [asOf]: day }
}
/** 累计统计：每个代码的异动天数、关联板块观测数与同向数（与 coMove 同口径）；映射表里已删除的代码不展示。 */
export function overseasHistoryStats(history, map) {
  const dates = Object.keys(history).filter(validDate).sort()
  const acc = new Map()
  for (const d of dates) for (const e of history[d] ?? []) {
    const x = acc.get(e.symbol) ?? { events: 0, obs: 0, same: 0 }
    x.events += 1
    for (const [, p] of e.boards) if (p) { x.obs += 1; if (Math.sign(p) === Math.sign(e.pct)) x.same += 1 }
    acc.set(e.symbol, x)
  }
  const names = new Map(map.stocks.map(s => [s.symbol, s.name]))
  const rows = [...acc.entries()].filter(([s]) => names.has(s)).map(([symbol, x]) => ({ symbol, name: names.get(symbol), ...x })).sort((a, b) => b.events - a.events || a.symbol.localeCompare(b.symbol))
  return { since: dates[0] ?? null, days: dates.length, rows }
}
