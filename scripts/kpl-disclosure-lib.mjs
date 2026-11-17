// 开盘啦「财报避雷」页签（/market-mood/disclosure）的纯计算。功能对照开盘啦 App 的业绩披露、避雷、股东人数、大宗交易、机构调研。
// 数据全部来自东方财富数据中心（datacenter-web）公开报表，报表名和字段均已实测（2026-11-17）：
//   RPT_PUBLIC_BS_APPOIN      预约披露时间（APPOINT_PUBLISH_DATE 预约/变更后日期，IS_PUBLISH 是否已披露）
//   RPT_PUBLIC_OP_NEWPREDICT  业绩预告（每条预告按指标拆成多行：004 归母净利润、005 扣非净利润、006 营业收入…）
//   RPT_FCI_PERFORMANCEE      业绩快报（JLRTBZCL = 归母净利润同比 %）
//   RPT_LICO_FN_CPD           定期报告业绩（SJLTZ 归母净利润同比 %、YSTZ 营收同比 %、BPS 每股净资产、DEDUCT_BASIC_EPS 扣非每股收益）
//   RPT_WEB_RESPREDICT        机构一致预测（YEARn / YEAR_MARKn='E' / EPSn，RATING_ORG_NUM 机构家数）
//   RPT_VALUEANALYSIS_DET     每日全市场估值（TRADE_DATE、名称、收盘价、总市值、总股本）——用于 ST 名单、面值、市值规则
//   RPT_HOLDERNUMLATEST / RPT_HOLDERNUM_DET  股东户数（最新一期 / 历次，PRE_END_DATE 指向上一期）
//   RPT_DATA_BLOCKTRADE       大宗交易明细（SECURITY_TYPE='EQA' 为 A 股，PREMIUM_RATIO 溢价率 %）
//   RPT_ORG_SURVEYNEW         机构调研（每家接待机构一行；NUM=1 的那行代表一次调研，SUM 为该次接待机构总数）
// 只做盘后统计和按公开规则的机械判断，不做主观判断，不构成投资建议。
import { isTradingDay, prevTradingDay } from './market-mood-lib.mjs'

/** null / 空串 / '-' / 非数字一律视为缺失（null），不能当 0 */
export const num = (x) => (x === null || x === undefined || String(x).trim() === '' || String(x).trim() === '-' || !Number.isFinite(Number(x)) ? null : Number(x))
export const round = (x, n = 2) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10 ** n) / 10 ** n)
export const day = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null)
const str = (v) => (typeof v === 'string' ? v.trim() : '')
const isCode = (c) => /^\d{6}$/.test(String(c ?? ''))

/** 分页取数的完整性：拿到的行数必须等于报表给出的总数 */
export function checkComplete(rows, count, label) {
  if (!Array.isArray(rows) || !Number.isInteger(count) || rows.length !== count) throw new Error(`${label}行数不完整（${rows?.length ?? 0}/${count}）`)
  return rows
}

/**
 * 东财数据中心分页取全：fetchPage(page) 返回接口原始 body。
 * 只有第 1 页可以「返回数据为空」（code 9201，表示确实没有数据）；第 2 页起再返回为空说明数据在翻页途中变化或接口抖动，
 * 直接抛错（由调用方放弃本节 / 本次发布），不能拿已取到的半张表或空表当结果。取完后行数必须等于报表给出的总数。
 */
export async function paginate(fetchPage, label, maxPages = 200) {
  const rows = []
  let count = null, pages = null
  for (let page = 1; ; page++) {
    const body = await fetchPage(page)
    if (body?.code === 9201 || (body?.success === false && /为空/.test(body?.message ?? ''))) {
      if (page === 1) return []
      throw new Error(`${label} 第 ${page} 页返回为空（已取 ${rows.length}/${count}）`)
    }
    if (!body?.success || !Array.isArray(body?.result?.data)) throw new Error(`${label} 返回异常：${body?.message ?? '无结果'}`)
    count ??= body.result.count
    pages ??= body.result.pages
    rows.push(...body.result.data)
    if (page >= pages) break
    if (page >= maxPages) throw new Error(`${label} 页数过多`)
  }
  return checkComplete(rows, count, label)
}

/** 板块：main 沪深主板 / gem 创业板 / star 科创板 / bj 北交所 */
export function boardOf(code) {
  const c = String(code)
  if (/^(4|8|92)/.test(c)) return 'bj'
  if (/^68/.test(c)) return 'star'
  if (/^3/.test(c)) return 'gem'
  return 'main'
}
export const isSTName = (name) => /ST/i.test(String(name ?? ''))
export const isStarST = (name) => /\*ST/i.test(String(name ?? ''))
/** 退市整理期简称以「退」结尾 */
export const isDelisting = (name) => /退$/.test(String(name ?? '').trim())

/* ---------------- 交易日工具 ---------------- */
export function nextTradingDay(date) {
  let t = Date.parse(`${date}T00:00:00Z`)
  for (;;) { t += 864e5; const d = new Date(t).toISOString().slice(0, 10); if (isTradingDay(d)) return d }
}
/** 截至 date（含）最近 n 个交易日，升序 */
export function lastTradingDays(date, n) {
  const out = []
  let d = isTradingDay(date) ? date : prevTradingDay(date)
  while (out.length < n) { out.unshift(d); d = prevTradingDay(d) }
  return out
}
/** date 之后（不含）n 个交易日，升序 */
export function nextTradingDays(date, n) {
  const out = []
  let d = date
  while (out.length < n) { d = nextTradingDay(d); out.push(d) }
  return out
}
export const addDays = (date, k) => new Date(Date.parse(`${date}T00:00:00Z`) + k * 864e5).toISOString().slice(0, 10)

/* ---------------- 规则阈值（沪深交易所《股票上市规则》2024 年 4 月修订版，现行版本延续） ---------------- */
export const FACE_LIMIT = 1 // 面值退市：连续 20 个交易日每日收盘价均低于 1 元
export const TRIGGER_DAYS = 20
/** 市值退市：主板连续 20 个交易日每日收盘总市值均低于 5 亿元；创业板、科创板 3 亿元 */
export const capLimit = (board) => (board === 'main' ? 5e8 : board === 'gem' || board === 'star' ? 3e8 : null)
/** 财务类：主板 营收低于 3 亿元且利润为负；创业板、科创板 营收低于 1 亿元且利润为负 */
export const revLimit = (board) => (board === 'main' ? 3e8 : board === 'gem' || board === 'star' ? 1e8 : null)

/* ---------------- 每日估值快照（ST、面值、市值） ---------------- */
/** RPT_VALUEANALYSIS_DET 一天的全市场行 → 紧凑快照；日期必须一致，行数太少视为未发全 */
export function parseSnapshot(rows, date, minCount = 4000) {
  if (!Array.isArray(rows) || rows.length < minCount) throw new Error(`${date} 估值快照行数不足（${rows?.length ?? 0}）`)
  const stocks = []
  for (const r of rows) {
    if (day(r?.TRADE_DATE) !== date) throw new Error(`估值快照日期不符（${r?.TRADE_DATE}）`)
    if (!isCode(r.SECURITY_CODE)) continue
    stocks.push({ code: String(r.SECURITY_CODE), name: str(r.SECURITY_NAME_ABBR), close: num(r.CLOSE_PRICE), cap: num(r.TOTAL_MARKET_CAP), shares: num(r.TOTAL_SHARES) })
  }
  return stocks
}

/** 存档用：只留下 ST、收盘价 < 1.5 元、总市值 < 10 亿元的个股（覆盖全部阈值），外加 ST 代码表与全市场家数 */
export function compactDay(date, stocks) {
  const low = stocks.filter((s) => isSTName(s.name) || (s.close !== null && s.close < 1.5) || (s.cap !== null && s.cap < 1e9))
  return { date, count: stocks.length, st: stocks.filter((s) => isSTName(s.name)).map((s) => s.code).sort(), low: low.map((s) => [s.code, s.name, s.close, s.cap]) }
}

/** ST 名单与相对上一交易日的新增 / 移除（上一交易日存档缺失时 added/removed 为 null） */
export function stDiff(today, prev) {
  const name = new Map(today.low.map(([c, n]) => [c, n]))
  const prevName = new Map((prev?.low ?? []).map(([c, n]) => [c, n]))
  const list = today.st.map((code) => ({ code, name: name.get(code) ?? '', star: isStarST(name.get(code)) }))
  if (!prev) return { count: list.length, star: list.filter((s) => s.star).length, list, prevDate: null, added: null, removed: null }
  const was = new Set(prev.st), now = new Set(today.st)
  const added = today.st.filter((c) => !was.has(c)).map((code) => ({ code, name: name.get(code) ?? '', prevName: prevName.get(code) ?? null }))
  const removed = prev.st.filter((c) => !now.has(c)).map((code) => ({ code, name: name.get(code) ?? null, prevName: prevName.get(code) ?? '' }))
  return { count: list.length, star: list.filter((s) => s.star).length, list, prevDate: prev.date, added, removed }
}

/**
 * 面值 / 市值规则的连续天数：从最新一天往前数，每天都满足条件才累计。
 * days 为升序的存档（必须是连续交易日，中间缺一天就停在缺口处），capped=true 表示数到了存档起点（实际可能更长）。
 * 存档里没有某只股票 = 当天不满足（存档阈值比规则宽），停牌日按交易所口径不计入交易日，但本数据源无法区分停牌，照常计入。
 */
export function streaks(days, test) {
  const latest = days.at(-1)
  if (!latest) return []
  const maps = days.map((d) => new Map(d.low.map((r) => [r[0], r])))
  const out = []
  for (const r of latest.low) {
    const [code, name] = r
    let n = 0
    for (let i = maps.length - 1; i >= 0; i--) { const x = maps[i].get(code); if (x && test(x, code)) n++; else break }
    if (n > 0) out.push({ code, name, close: r[2], cap: r[3], days: n, capped: n === days.length })
  }
  return out
}
export const faceTest = (r) => r[2] !== null && r[2] < FACE_LIMIT
export const capTest = (r, code) => { const lim = capLimit(boardOf(code)); return lim !== null && r[3] !== null && r[3] < lim }

/** 存档必须是连续交易日：从最新一天往前，遇到缺口就截断 */
export function contiguous(days) {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date))
  const out = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (out.length && prevTradingDay(out[0].date) !== sorted[i].date) break
    out.unshift(sorted[i])
  }
  return out
}

export function buildRiskTrading(days) {
  const run = contiguous(days)
  const latest = run.at(-1)
  const stName = new Set(latest?.st ?? [])
  const tag = (x) => ({ ...x, board: boardOf(x.code), st: stName.has(x.code), delisting: isDelisting(x.name) })
  const face = streaks(run, faceTest).filter((x) => boardOf(x.code) !== 'bj').map(tag).sort((a, b) => b.days - a.days || a.close - b.close)
  const cap = streaks(run, capTest).filter((x) => boardOf(x.code) !== 'bj').map((x) => ({ ...tag(x), limit: capLimit(boardOf(x.code)) })).sort((a, b) => b.days - a.days || a.cap - b.cap)
  return { date: latest?.date ?? null, span: run.length, face, cap }
}

/* ---------------- 财务类（年报口径 + 三季报观察） ---------------- */
/** RPT_LICO_FN_CPD 行 → 财务行；只保留沪深京 A 股，同一股票取最新公告 */
export function parseFinance(rows, period) {
  const by = new Map()
  for (const r of rows) {
    if (day(r?.REPORTDATE) !== period || !isCode(r.SECURITY_CODE) || String(r.SECURITY_TYPE_CODE) !== '058001001' || String(r.TRADE_MARKET_CODE) === '069001004001') continue
    const x = {
      code: String(r.SECURITY_CODE), name: str(r.SECURITY_NAME_ABBR), notice: day(r.NOTICE_DATE),
      profit: num(r.PARENT_NETPROFIT), deductEps: num(r.DEDUCT_BASIC_EPS), revenue: num(r.TOTAL_OPERATE_INCOME), bps: num(r.BPS),
    }
    const old = by.get(x.code)
    if (!old || String(x.notice) > String(old.notice)) by.set(x.code, x)
  }
  return [...by.values()]
}
/**
 * 机械判断：
 *  lossLowRev：（归母净利润 < 0 或 扣非每股收益 < 0）且 营业收入 < 板块阈值（主板 3 亿、创业板/科创板 1 亿）。
 *    规则原文为「利润总额、净利润、扣非净利润孰低者为负」且「营业收入（扣除与主营无关收入后）低于阈值」，公开报表没有利润总额和营收扣除额，这里是近似。
 *  negEquity：每股净资产 < 0（即期末归母净资产为负）。北交所规则不同，不纳入。
 */
export function financeFlags(list, stSet) {
  const lossLowRev = [], negEquity = []
  for (const x of list) {
    const board = boardOf(x.code)
    if (board === 'bj') continue
    const base = { code: x.code, name: x.name, board, st: stSet.has(x.code), profit: x.profit, deductEps: x.deductEps, revenue: x.revenue, bps: x.bps }
    const loss = (x.profit !== null && x.profit < 0) || (x.deductEps !== null && x.deductEps < 0)
    const lim = revLimit(board)
    if (loss && x.revenue !== null && lim !== null && x.revenue < lim) lossLowRev.push({ ...base, limit: lim })
    if (x.bps !== null && x.bps < 0) negEquity.push(base)
  }
  lossLowRev.sort((a, b) => a.revenue - b.revenue)
  negEquity.sort((a, b) => a.bps - b.bps)
  return { lossLowRev, negEquity }
}

/* ---------------- 业绩披露 ---------------- */
const periodLabel = (p) => {
  const y = p.slice(0, 4), md = p.slice(5)
  return `${y}年${{ '03-31': '一季报', '06-30': '中报', '09-30': '三季报', '12-31': '年报' }[md] ?? md}`
}
export { periodLabel }
const isAShareType = (r) => String(r.SECURITY_TYPE_CODE) === '058001001' && String(r.TRADE_MARKET_CODE) !== '069001004001' && isCode(r.SECURITY_CODE)

/** 业绩预告：按（股票、报告期、公告日）合并，取归母净利润（004）那一行；没有净利润行时取扣非（005），再没有就取营收（006） */
export function parseForecasts(rows) {
  const groups = new Map()
  for (const r of rows) {
    if (!isAShareType(r)) continue
    const k = `${r.SECURITY_CODE}|${day(r.REPORT_DATE)}|${day(r.NOTICE_DATE)}`
    ;(groups.get(k) ?? groups.set(k, []).get(k)).push(r)
  }
  const out = []
  for (const g of groups.values()) {
    const r = ['004', '005', '006'].map((c) => g.find((x) => String(x.PREDICT_FINANCE_CODE) === c)).find(Boolean)
    if (!r) continue
    const lo = num(r.PREDICT_AMT_LOWER), hi = num(r.PREDICT_AMT_UPPER)
    const ylo = num(r.ADD_AMP_LOWER), yhi = num(r.ADD_AMP_UPPER)
    out.push({
      code: String(r.SECURITY_CODE), name: str(r.SECURITY_NAME_ABBR), kind: 'forecast', period: day(r.REPORT_DATE), notice: day(r.NOTICE_DATE),
      metric: str(r.PREDICT_FINANCE), type: str(r.PREDICT_TYPE) || null,
      profit: lo !== null && hi !== null ? (lo + hi) / 2 : (hi ?? lo), profitLow: lo, profitHigh: hi,
      yoy: ylo !== null && yhi !== null ? round((ylo + yhi) / 2) : round(yhi ?? ylo), yoyLow: round(ylo), yoyHigh: round(yhi),
      revenue: null, revenueYoy: null, eps: null, isProfit: String(r.PREDICT_FINANCE_CODE) === '004',
    })
  }
  return out
}
export function parseExpress(rows) {
  return rows.filter(isAShareType).map((r) => ({
    code: String(r.SECURITY_CODE), name: str(r.SECURITY_NAME_ABBR), kind: 'express', period: day(r.REPORT_DATE), notice: day(r.NOTICE_DATE),
    metric: '归属于上市公司股东的净利润', type: null, profit: num(r.PARENT_NETPROFIT), profitLow: null, profitHigh: null,
    yoy: round(num(r.JLRTBZCL)), yoyLow: null, yoyHigh: null, revenue: num(r.TOTAL_OPERATE_INCOME), revenueYoy: round(num(r.YSTZ)), eps: num(r.BASIC_EPS), isProfit: true,
  }))
}
export function parseReports(rows) {
  return rows.filter(isAShareType).map((r) => ({
    code: String(r.SECURITY_CODE), name: str(r.SECURITY_NAME_ABBR), kind: 'report', period: day(r.REPORTDATE), notice: day(r.NOTICE_DATE),
    metric: '归属于上市公司股东的净利润', type: null, profit: num(r.PARENT_NETPROFIT), profitLow: null, profitHigh: null,
    yoy: round(num(r.SJLTZ)), yoyLow: null, yoyHigh: null, revenue: num(r.TOTAL_OPERATE_INCOME), revenueYoy: round(num(r.YSTZ)), eps: num(r.BASIC_EPS), isProfit: true,
  }))
}

/** 机构一致预测：code → { year → eps }（只取 YEAR_MARK='E' 的预测年度）与机构家数 */
export function parseConsensus(rows) {
  const out = new Map()
  for (const r of rows) {
    if (!isCode(r?.SECURITY_CODE)) continue
    const eps = {}
    for (let i = 1; i <= 4; i++) if (String(r[`YEAR_MARK${i}`]) === 'E' && num(r[`YEAR${i}`]) !== null && num(r[`EPS${i}`]) !== null) eps[String(r[`YEAR${i}`])] = num(r[`EPS${i}`])
    out.set(String(r.SECURITY_CODE), { eps, orgs: num(r.RATING_ORG_NUM) })
  }
  return out
}
export const BEAT = 10 // 与一致预期偏差超过 ±10% 记为「高于 / 低于一致预期」
/**
 * 超预期：只对年度（12-31）的归母净利润口径比较。快报 / 年报用基本每股收益；预告用净利润区间中值 ÷ 总股本（当日估值快照）。
 * 一致预期 = 该年度机构预测 EPS 均值（东财 RPT_WEB_RESPREDICT），少于 3 家机构不比较。
 */
export function compareConsensus(item, cons, shares) {
  if (!item.period?.endsWith('-12-31') || !item.isProfit || !cons) return null
  const c = cons.eps[item.period.slice(0, 4)]
  if (c === undefined || c === null || c === 0 || cons.orgs === null || cons.orgs < 3) return null
  const actual = item.eps ?? (item.profit !== null && shares ? item.profit / shares : null)
  if (actual === null) return null
  const diff = round(((actual - c) / Math.abs(c)) * 100, 1)
  return { eps: round(c, 3), actual: round(actual, 3), orgs: cons.orgs, diff, label: diff > BEAT ? 'beat' : diff < -BEAT ? 'miss' : 'inline' }
}

/** K 线 "日期,收盘" → [{date, close}] */
export const parseKline = (body) => (Array.isArray(body?.data?.klines) ? body.data.klines.map((k) => { const [date, c] = String(k).split(','); return { date, close: num(c) } }).filter((k) => day(k.date) && k.close !== null) : [])

/**
 * 公告后表现：公告日（NOTICE_DATE）当天若是交易日，即为第 1 个反应日，否则顺延到下一交易日；
 * 基准 = 第 1 个反应日的前一交易日收盘。第 k 日涨跌 = 第 k 个反应日收盘 ÷ 基准 − 1（前复权）。尚未走到第 k 日为 null。
 */
export function perfAfter(notice, kline, asOf) {
  if (!notice) return null
  const t1 = isTradingDay(notice) ? notice : nextTradingDay(notice)
  if (t1 > asOf) return { start: t1, base: null, d1: null, d3: null, d5: null }
  const base = prevTradingDay(t1)
  // 按确切交易日取价：第 k 日 = 基准日之后第 k 个交易日；那天没有收盘（停牌或存档缺失）就是 null，不能顺延用下一条记录
  const close = new Map(kline.map((k) => [k.date, k.close]))
  const b = close.get(base)
  const days = nextTradingDays(base, 5)
  const at = (k) => {
    const d = days[k - 1], c = close.get(d)
    return d > asOf || b === undefined || b === null || b <= 0 || c === undefined || c === null ? null : round((c / b - 1) * 100, 2)
  }
  return { start: t1, base, d1: at(1), d3: at(3), d5: at(5) }
}

/** 除权除息日（RPT_SHAREBONUS_DET 的 EX_DIVIDEND_DATE，含送转与现金分红）：code → 落在 [from, to] 内的日期 */
export function exDividendDates(rows, from, to) {
  const out = new Map()
  for (const r of rows) {
    const d = day(r?.EX_DIVIDEND_DATE)
    if (!isCode(r?.SECURITY_CODE) || !d || d < from || d > to) continue
    const list = out.get(String(r.SECURITY_CODE)) ?? out.set(String(r.SECURITY_CODE), []).get(String(r.SECURITY_CODE))
    if (!list.includes(d)) list.push(d)
  }
  return out
}
/** 东财 push2his 的 secid：沪市 A 股（6 开头）1.，深市与北交所（含 92 开头）0. */
export const secidOf = (code) => `${/^6/.test(String(code)) ? 1 : 0}.${code}`
/** push2his 前复权日 K（fields2=f51,f53）→ [{date, close}]；必须是请求的那只股票 */
export function parseAdjKline(body, code) {
  if (String(body?.data?.code ?? '') !== String(code)) throw new Error(`${code} 前复权 K 线为空`)
  return parseKline(body)
}

/** 预约披露：未来交易日日历 + 最近一期披露进度 */
export function buildCalendar(rows, asOf, n = 10) {
  const days = nextTradingDays(asOf, n)
  const from = days[0], to = days.at(-1)
  const by = new Map(days.map((d) => [d, []]))
  for (const r of rows) {
    if (!isAShareType(r)) continue
    const d = day(r.APPOINT_PUBLISH_DATE)
    // 已披露只认实际披露日不晚于 asOf 的（指定 asOf 为过去某天时，之后才披露的仍算当时未披露）
    const actual = day(r.ACTUAL_PUBLISH_DATE)
    if (!d || d < from || d > to || (String(r.IS_PUBLISH) === '1' && (!actual || actual <= asOf))) continue
    const list = by.get(d) ?? by.set(d, []).get(d) // 非交易日（周末）预约也单独列出
    list.push({ code: String(r.SECURITY_CODE), name: str(r.SECURITY_NAME_ABBR), period: day(r.REPORT_DATE), label: str(r.REPORT_TYPE_NAME), change: str(r.APPOINT_CHANGE) || null })
  }
  const list = [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, stocks]) => ({ date, count: stocks.length, stocks }))
  return { from, to, total: list.reduce((s, d) => s + d.count, 0), days: list }
}
export function buildProgress(rows, period) {
  const a = rows.filter((r) => isAShareType(r) && day(r.REPORT_DATE) === period)
  if (!a.length) return null
  return { period, label: periodLabel(period), total: a.length, published: a.filter((r) => String(r.IS_PUBLISH) === '1').length }
}

/* ---------------- 股东户数 ---------------- */
/**
 * latest：RPT_HOLDERNUMLATEST（每股最新一期）；dec：RPT_HOLDERNUM_DET 中户数减少的历次记录（HOLDER_NUM_RATIO < 0）。
 * 连降期数：从最新一期起沿 PRE_END_DATE 往前追，每一期都在「减少」记录里才累计；追到存档起点则 capped。
 * 累计降幅 = 最新户数 ÷ 连降开始前那一期户数 − 1。
 */
export const MAX_STREAK = 20
/** 上一期户数不足 200 户多为上市前（非上市股份公司股东不超过 200 人），与上市后户数不可比，不进增减幅榜 */
const comparable = (x) => x.prevHolders !== null && x.prevHolders >= 200
export function buildHolders(latestRows, decRows, asOf, { minEnd, since, recentDays = 10, top = 30 } = {}) {
  const dec = new Map()
  for (const r of decRows) if (isCode(r.SECURITY_CODE) && day(r.END_DATE)) dec.set(`${r.SECURITY_CODE}|${day(r.END_DATE)}`, r)
  const rows = []
  for (const r of latestRows) {
    if (!isCode(r.SECURITY_CODE) || (r.SECURITY_TYPE_CODE && String(r.SECURITY_TYPE_CODE) !== '058001001')) continue
    const end = day(r.END_DATE)
    if (!end || (minEnd && end < minEnd)) continue
    const ratio = num(r.HOLDER_NUM_RATIO)
    let streak = 0, cur = r, startHolders = null, capped = false
    if (ratio !== null && ratio < 0) {
      for (;;) {
        streak++
        startHolders = num(cur.PRE_HOLDER_NUM)
        const pe = day(cur.PRE_END_DATE)
        const prev = pe && dec.get(`${r.SECURITY_CODE}|${pe}`)
        if (!prev) { capped = !!since && !!pe && pe < since; break }
        cur = prev
        if (streak >= MAX_STREAK) { capped = true; break }
      }
    }
    const holders = num(r.HOLDER_NUM)
    const prevHolders = num(r.PRE_HOLDER_NUM)
    rows.push({
      code: String(r.SECURITY_CODE), name: str(r.SECURITY_NAME_ABBR), end, prevEnd: day(r.PRE_END_DATE), notice: day(r.HOLD_NOTICE_DATE),
      holders, prevHolders, change: round(ratio), streak, capped,
      cum: streak && holders !== null && startHolders ? round((holders / startHolders - 1) * 100) : null,
      avgCap: num(r.AVG_MARKET_CAP), close: num(r.CLOSE_PRICE),
    })
  }
  const recentFrom = addDays(asOf, -recentDays)
  return {
    total: rows.length,
    falling: rows.filter((x) => x.streak >= 3).sort((a, b) => b.streak - a.streak || a.cum - b.cum).slice(0, 60),
    drop: rows.filter((x) => x.change !== null && x.change < 0 && comparable(x)).sort((a, b) => a.change - b.change).slice(0, top),
    rise: rows.filter((x) => x.change !== null && x.change > 0 && comparable(x)).sort((a, b) => b.change - a.change).slice(0, top),
    recent: rows.filter((x) => x.notice && x.notice >= recentFrom && x.notice <= asOf).sort((a, b) => b.notice.localeCompare(a.notice) || (a.change ?? 0) - (b.change ?? 0)).slice(0, 60),
    fallingCount: rows.filter((x) => x.streak >= 3).length,
    since: since ?? null,
  }
}

/**
 * 股东户数按 asOf 截断：「最新一期」表里公告日晚于 asOf 的个股，换成历次表（older）中公告日不晚于 asOf 的最近一期；
 * 历次表也没有就不列入（asOf 当时还没有可用记录）。
 */
export function boundHolders(latestRows, olderRows, asOf) {
  const prior = new Map()
  for (const r of olderRows) {
    const end = day(r?.END_DATE), notice = day(r?.HOLD_NOTICE_DATE)
    if (!isCode(r?.SECURITY_CODE) || !end || !notice || notice > asOf) continue
    const old = prior.get(String(r.SECURITY_CODE))
    if (!old || end > day(old.END_DATE)) prior.set(String(r.SECURITY_CODE), r)
  }
  return latestRows.flatMap((r) => {
    const notice = day(r?.HOLD_NOTICE_DATE)
    if (!notice || notice <= asOf) return [r]
    const p = prior.get(String(r.SECURITY_CODE))
    return p ? [p] : []
  })
}

/* ---------------- 大宗交易 ---------------- */
export const isInst = (name) => String(name ?? '').trim() === '机构专用'
export function parseBlock(rows) {
  return rows.filter((r) => String(r.SECURITY_TYPE) === 'EQA' && isCode(r.SECURITY_CODE)).map((r) => ({
    date: day(r.TRADE_DATE), code: String(r.SECURITY_CODE), name: str(r.SECURITY_NAME_ABBR),
    price: num(r.DEAL_PRICE), close: num(r.CLOSE_PRICE), premium: round(num(r.PREMIUM_RATIO)), volume: num(r.DEAL_VOLUME), amount: num(r.DEAL_AMT),
    pct: round(num(r.CHANGE_RATE)), buyer: str(r.BUYER_NAME), seller: str(r.SELLER_NAME), freeRatio: round(num(r.FREE_SHARES_RATIO), 3),
  }))
}
const sum = (xs) => { const v = xs.filter((x) => x !== null && Number.isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) : null }
/** 加权溢价率：Σ(溢价率 × 成交额) ÷ Σ成交额 */
const wPremium = (xs) => { const v = xs.filter((x) => x.premium !== null && x.amount !== null); const a = sum(v.map((x) => x.amount)); return a ? round(sum(v.map((x) => x.premium * x.amount)) / a) : null }
export function buildBlock(trades, date, windowDates) {
  const today = trades.filter((t) => t.date === date).sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))
  const win = trades.filter((t) => windowDates.includes(t.date))
  const byStock = new Map()
  for (const t of win) (byStock.get(t.code) ?? byStock.set(t.code, []).get(t.code)).push(t)
  const stocks = [...byStock.values()].map((xs) => {
    const inst = xs.filter((x) => isInst(x.buyer))
    return { code: xs[0].code, name: xs.at(-1).name, count: xs.length, days: new Set(xs.map((x) => x.date)).size, amount: sum(xs.map((x) => x.amount)), premium: wPremium(xs), instBuy: sum(inst.map((x) => x.amount)), instBuyCount: inst.length, last: xs.map((x) => x.date).sort().at(-1) }
  })
  return {
    date, count: today.length, stocks: new Set(today.map((t) => t.code)).size, amount: sum(today.map((t) => t.amount)),
    premiumCount: today.filter((t) => t.premium !== null && t.premium > 0).length, discountCount: today.filter((t) => t.premium !== null && t.premium < 0).length,
    instBuy: { count: today.filter((t) => isInst(t.buyer)).length, amount: sum(today.filter((t) => isInst(t.buyer)).map((t) => t.amount)) },
    items: today,
    window: {
      from: windowDates[0] ?? null, to: windowDates.at(-1) ?? null, days: windowDates.length, count: win.length, amount: sum(win.map((t) => t.amount)),
      top: [...stocks].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)).slice(0, 30),
      inst: stocks.filter((s) => s.instBuyCount > 0).sort((a, b) => (b.instBuy ?? 0) - (a.instBuy ?? 0)).slice(0, 30),
    },
  }
}

/* ---------------- 机构调研 ---------------- */
/** NUM=1 的行 → 一次调研；按（股票、公告日、调研开始日）去重 */
export function parseSurveys(rows) {
  const seen = new Map()
  for (const r of rows) {
    if (!isCode(r.SECURITY_CODE) || !day(r.NOTICE_DATE)) continue
    const k = `${r.SECURITY_CODE}|${day(r.NOTICE_DATE)}|${day(r.RECEIVE_START_DATE)}`
    if (seen.has(k)) continue
    seen.set(k, { code: String(r.SECURITY_CODE), name: str(r.SECURITY_NAME_ABBR), notice: day(r.NOTICE_DATE), start: day(r.RECEIVE_START_DATE), orgs: num(r.SUM), ways: str(r.RECEIVE_WAY_EXPLAIN) })
  }
  return [...seen.values()]
}
export function buildSurvey(events, asOf, windows = { short: 5, long: 20 }) {
  const longDates = lastTradingDays(asOf, windows.long), shortDates = longDates.slice(-windows.short)
  // 公告日可能是周末：按「不晚于 asOf 且不早于窗口首个交易日」的自然日区间统计
  const rank = (from) => {
    const by = new Map()
    for (const e of events) {
      if (e.notice < from || e.notice > asOf) continue
      const x = by.get(e.code) ?? by.set(e.code, { code: e.code, name: e.name, events: 0, orgs: 0, orgsMissing: 0, last: e.notice }).get(e.code)
      x.events++
      if (e.orgs !== null) x.orgs += e.orgs
      else x.orgsMissing++
      if (e.notice > x.last) x.last = e.notice
    }
    // 接待机构数 = 有家数的调研合计；全部缺失为 null，部分缺失时 orgsMissing 记缺失的调研次数（页面显示为「≥ 合计」）
    return [...by.values()].map((x) => ({ ...x, orgs: x.orgsMissing === x.events ? null : x.orgs })).sort((a, b) => (b.orgs ?? 0) - (a.orgs ?? 0) || b.events - a.events).slice(0, 40)
  }
  const inLong = events.filter((e) => e.notice >= longDates[0] && e.notice <= asOf)
  return {
    short: { days: windows.short, from: shortDates[0], to: asOf, rank: rank(shortDates[0]) },
    long: { days: windows.long, from: longDates[0], to: asOf, rank: rank(longDates[0]), events: inLong.length, stocks: new Set(inLong.map((e) => e.code)).size },
    latest: events.filter((e) => e.notice === asOf).sort((a, b) => (b.orgs ?? 0) - (a.orgs ?? 0)).slice(0, 30),
  }
}

/** 写文件前比较：去掉 generatedAt 后内容相同就不写 */
export const sameContent = (a, b) => { if (!a || !b) return false; const { generatedAt: _x, ...x } = a; const { generatedAt: _y, ...y } = b; return JSON.stringify(x) === JSON.stringify(y) }

/**
 * 发布前的完整性判断：某节失败（failed 为节名）且上一份文件是更早日期、该节有内容时放弃发布，保留上一份文件——
 * 不能用缺节的新文件覆盖完整的旧文件。上一份文件本来就缺这一节（或没有上一份）时可以发布，该节显示暂缺。
 */
export function publishDecision(failed, prevOut, asOf) {
  if (!failed.length) return { ok: true, reason: null }
  const lost = prevOut && prevOut.asOf !== asOf ? failed.filter((k) => prevOut[k] !== null && prevOut[k] !== undefined) : []
  return lost.length ? { ok: false, reason: `${lost.join('、')} 失败，上一份文件（${prevOut.asOf}）这些节完整` } : { ok: true, reason: null }
}
