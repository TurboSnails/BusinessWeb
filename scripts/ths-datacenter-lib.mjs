// 同花顺「数据中心」页签（/ths-mood/datacenter）的纯计算。功能对照同花顺 App 宫格「特色数据」里的列表类入口：
// 打新日历与次新股、限售解禁、重要股东增减持、股权质押与商誉、股票回购。数据全部来自东方财富数据中心公开报表
// （datacenter-web.eastmoney.com/api/data/v1/get），价格表现用东方财富日 K（push2his，带日期）：
//   RPTA_APP_IPOAPPLY          新股申购与上市（APPLY_DATE 申购日、ISSUE_PRICE 发行价、AFTER_ISSUE_PE 发行市盈率、
//                              INDUSTRY_PE_NEW 行业市盈率、ONLINE_ISSUE_LWR 网上中签率（%）、LISTING_DATE 上市日、BALLOT_NUM_DATE 中签号公布日）
//   RPT_LIFT_STAGE             限售解禁明细（FREE_DATE 解禁日、CURRENT_FREE_SHARES 解禁股数（万股）、ABLE_FREE_SHARES 实际可流通（万股）、
//                              FREE_RATIO 占流通股比（小数）、FREE_SHARES_TYPE 限售类型）
//   RPT_SHARE_HOLDER_INCREASE  股东增减持（NOTICE_DATE 公告日、HOLDER_NAME、DIRECTION 增持/减持、CHANGE_NUM 变动股数（万股）、
//                              AFTER_CHANGE_RATE 变动占总股本比（%）、START_DATE/END_DATE 变动期间、TRADE_AVERAGE_PRICE 均价、CLOSE_PRICE 截止日收盘价）
//   RPT_CSDC_LIST              中登公司每周股权质押统计（TRADE_DATE 统计日、PLEDGE_RATIO 质押比例（%）、PLEDGE_DEAL_NUM 质押笔数、
//                              REPURCHASE_BALANCE 质押股数（万股）、PLEDGE_MARKET_CAP 质押市值（万元））
//   RPT_GOODWILL_STOCKDETAILS  个股商誉（REPORT_DATE 报告期、GOODWILL 商誉（元）、SUMSHEQUITY 净资产（元）、SUMSHEQUITY_RATIO 商誉/净资产（小数））
//   RPTA_WEB_GETHGLIST_NEW     股票回购（UPD 最新公告日、DIM_DATE 预案公告日、REPURPROGRESS 进度代码、REPURAMOUNTLOWER/LIMIT 计划金额下限/上限（元）、
//                              REPURAMOUNT 已回购金额（元）、REPURNUM 已回购股数、REPURPRICECAP 价格上限）
// 只列客观数值与阈值说明，不做主观评级，不构成投资建议。
import { isTradingDay, prevTradingDay } from './market-mood-lib.mjs'

/** null / 空串 / '-' / 非数字一律视为缺失（null），不能当 0 */
export const num = (x) => (x === null || x === undefined || typeof x === 'boolean' || String(x).trim() === '' || String(x).trim() === '-' || !Number.isFinite(Number(x)) ? null : Number(x))
export const round = (x, n = 2) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10 ** n) / 10 ** n)
/** 报表日期 → YYYY-MM-DD；缺失为 null */
export const dateOf = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null)
export const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10)
const str = (x) => (typeof x === 'string' ? x.trim() : '')
const median = (xs) => { const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2 }
const mean = (xs) => { const v = xs.filter((x) => Number.isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null }

export const WINDOW = 30 // 「近 30 日」「未来 30 日」均按自然日
export const SUBNEW_DAYS = 365 // 次新股：上市不满一年
export const PLEDGE_LINES = [50, 30] // 质押比例阈值（%）
export const GOODWILL_LINES = [100, 50, 30] // 商誉占净资产阈值（%）

/** 数据日期：交易日 15:30 后取当天，否则取上一个交易日 */
export const targetDay = (today, minutes) => (isTradingDay(today) && minutes >= 15 * 60 + 30 ? today : prevTradingDay(today))

/** 东方财富 secid：沪市 1.，深市和北交所 0. */
export const secidOf = (secucode, code) => {
  const m = String(secucode ?? '').split('.')[1]
  const c = String(code ?? String(secucode ?? '').split('.')[0])
  return `${m === 'SH' || (!m && /^(6|9)/.test(c)) ? 1 : 0}.${c}`
}
export const boardName = (code) => {
  const c = String(code)
  if (/^(4|8|92)/.test(c)) return '北交所'
  if (/^688|^689/.test(c)) return '科创板'
  if (/^6/.test(c)) return '沪主板'
  if (/^30/.test(c)) return '创业板'
  return '深主板'
}

/** 分页取数的完整性：拿到的行数必须等于报表给出的总数 */
export function checkComplete(rows, count, label) {
  if (!Array.isArray(rows) || !Number.isInteger(count) || rows.length !== count) throw new Error(`${label} 行数不完整（${rows?.length ?? 0}/${count}）`)
  return rows
}

/** push2his 日 K（fields2=f51,f53：日期、收盘）→ [{date, close}]，只保留 ≤ asOf 的、按日期升序 */
export function parseKline(body, asOf) {
  const ks = body?.data?.klines
  if (!Array.isArray(ks)) return null
  const out = []
  for (const k of ks) {
    const [date, c] = String(k).split(',')
    const close = num(c)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || close === null || close <= 0) continue
    if (date <= asOf) out.push({ date, close })
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1))
}
/** 当天收盘价：最后一根 K 线必须是 asOf，否则（停牌、未上市）为 null，不用更早的日子 */
export const closeOn = (bars, asOf) => (bars?.length && bars.at(-1).date === asOf ? bars.at(-1).close : null)
const pctOf = (a, b) => (a === null || b === null || !(b > 0) ? null : round((a / b - 1) * 100, 2))

/* ---------------- 新股与次新 ---------------- */

/** 申购日历：申购日在 [asOf-30, ∞)，含已公布、尚未申购的 */
export function buildCalendar(rows, asOf) {
  const from = addDays(asOf, -WINDOW)
  return rows
    .map((r) => ({
      code: str(r.SECURITY_CODE), name: str(r.SECURITY_NAME_ABBR) || str(r.SECURITY_NAME), board: boardName(r.SECURITY_CODE),
      applyCode: str(r.APPLY_CODE) || null, applyDate: dateOf(r.APPLY_DATE), ballotDate: dateOf(r.BALLOT_NUM_DATE), listDate: dateOf(r.LISTING_DATE),
      issuePrice: num(r.ISSUE_PRICE), issuePe: num(r.AFTER_ISSUE_PE), industryPe: num(r.INDUSTRY_PE_NEW),
      lotRate: num(r.ONLINE_ISSUE_LWR), // 网上中签率（%）
    }))
    .filter((r) => /^\d{6}$/.test(r.code) && r.applyDate && r.applyDate >= from)
    .map((r) => ({ ...r, peDiff: r.issuePe !== null && r.industryPe !== null && r.industryPe > 0 ? round((r.issuePe / r.industryPe - 1) * 100, 1) : null, status: r.listDate && r.listDate <= asOf ? '已上市' : r.applyDate > asOf ? '待申购' : '待上市' }))
    .sort((a, b) => (a.applyDate === b.applyDate ? a.code.localeCompare(b.code) : a.applyDate < b.applyDate ? 1 : -1))
}

/**
 * 次新股表现：上市日在 (asOf-365, asOf] 的新股。bars 为后复权日 K（后复权以上市首日为基准，首日收盘即原始价，
 * 之后分红送转都折算进去），所以「累计涨幅 = 最新后复权收盘 ÷ 发行价 − 1」含分红送转。首日涨幅 = 首日收盘 ÷ 发行价 − 1。
 * 破发 = 累计涨幅 < 0（复权后收盘低于发行价）。asOf 当天停牌或 K 线缺失的，表现字段留空、不计入统计。
 */
export function buildSubNew(rows, barsByCode, asOf) {
  const from = addDays(asOf, -SUBNEW_DAYS)
  const list = []
  for (const r of rows) {
    const code = str(r.SECURITY_CODE), listDate = dateOf(r.LISTING_DATE)
    if (!/^\d{6}$/.test(code) || !listDate || listDate <= from || listDate > asOf) continue
    const issuePrice = num(r.ISSUE_PRICE)
    const bars = barsByCode.get(code) ?? null
    const first = bars?.length && bars[0].date === listDate ? bars[0].close : null
    const last = closeOn(bars, asOf)
    const cum = pctOf(last, issuePrice)
    const days = bars?.length && bars[0].date === listDate ? bars.length : null
    list.push({ code, name: str(r.SECURITY_NAME_ABBR) || str(r.SECURITY_NAME), board: boardName(code), listDate, issuePrice, issuePe: num(r.AFTER_ISSUE_PE), firstPct: pctOf(first, issuePrice), cumPct: cum, sinceFirstPct: pctOf(last, first), days, broke: cum === null ? null : cum < 0 })
  }
  list.sort((a, b) => (a.listDate === b.listDate ? a.code.localeCompare(b.code) : a.listDate < b.listDate ? 1 : -1))
  const valid = list.filter((r) => r.cumPct !== null)
  const brokeCount = valid.filter((r) => r.broke).length
  return {
    from: addDays(from, 1), to: asOf, count: list.length, valid: valid.length, brokeCount,
    brokeRate: valid.length ? round((brokeCount / valid.length) * 100, 1) : null,
    medianCum: round(median(valid.map((r) => r.cumPct)), 2), medianFirst: round(median(list.map((r) => r.firstPct)), 2),
    rows: list,
  }
}

/* ---------------- 限售解禁 ---------------- */

export function parseLift(rows) {
  return rows
    .filter((r) => String(r.SECURITY_TYPE_CODE ?? '058001001') === '058001001')
    .map((r) => ({
      code: str(r.SECURITY_CODE), name: str(r.SECURITY_NAME_ABBR), date: dateOf(r.FREE_DATE), type: str(r.FREE_SHARES_TYPE) || '—',
      shares: num(r.CURRENT_FREE_SHARES), able: num(r.ABLE_FREE_SHARES), // 万股
      ratio: num(r.FREE_RATIO) === null ? null : round(num(r.FREE_RATIO) * 100, 2), // 占流通股比（%，东财口径：解禁股数 ÷ 东财记录的流通股数，解禁前流通股很少时可超过 100%）
      totalRatio: num(r.TOTAL_RATIO) === null ? null : round(num(r.TOTAL_RATIO) * 100, 2), // 占总股本比（%）
    }))
    .filter((r) => /^\d{6}$/.test(r.code) && r.date)
}

const nextTradingDay = (d) => { let x = addDays(d, 1); while (!isTradingDay(x)) x = addDays(x, 1); return x }
/**
 * 解禁日后表现：T = 解禁日当天或之后第一个交易日（按交易日历）；基准 = prevTradingDay(T) 收盘（前复权）。
 * d1 = T 收盘相对基准，d5 = T 起第 5 个交易日收盘相对基准。日期全部按交易日历精确对应：
 * 基准日、T 日或第 5 日那根 K 线缺失（停牌、数据缺口）时对应字段为 null，不用相邻的其他日子顶替。
 */
export function liftPerf(bars, date) {
  const tDate = isTradingDay(date) ? date : nextTradingDay(date)
  if (!bars?.length) return { d1: null, d5: null, tDate: null }
  const at = new Map(bars.map((b) => [b.date, b.close]))
  let d5Date = tDate
  for (let k = 1; k < 5; k++) d5Date = nextTradingDay(d5Date)
  const base = at.get(prevTradingDay(tDate)) ?? null
  return { tDate, d1: pctOf(at.get(tDate) ?? null, base), d5: pctOf(at.get(d5Date) ?? null, base) }
}

/** 解禁市值（元）= 解禁股数 × asOf 收盘价（东财报表里的市值按「最新价」算、不带日期，这里按数据日期重算） */
export function buildLift(upRows, pastRows, barsByCode, asOf) {
  const upFrom = addDays(asOf, 1), upTo = addDays(asOf, WINDOW), pastFrom = addDays(asOf, -WINDOW + 1)
  const withCap = (r) => { const close = closeOn(barsByCode.get(r.code), asOf); return { ...r, close, cap: close !== null && r.shares !== null ? Math.round(r.shares * 1e4 * close) : null } }
  const upcoming = parseLift(upRows).filter((r) => r.date >= upFrom && r.date <= upTo).map(withCap).sort((a, b) => (a.date === b.date ? (b.cap ?? -1) - (a.cap ?? -1) : a.date < b.date ? -1 : 1))
  const byDate = new Map()
  for (const r of upcoming) { const d = byDate.get(r.date) ?? { date: r.date, count: 0, cap: 0, capMissing: 0 }; d.count++; if (r.cap === null) d.capMissing++; else d.cap += r.cap; byDate.set(r.date, d) }
  const past = parseLift(pastRows).filter((r) => r.date >= pastFrom && r.date <= asOf).map((r) => ({ ...withCap(r), ...liftPerf(barsByCode.get(r.code), r.date) }))
    .sort((a, b) => (a.date === b.date ? (b.cap ?? -1) - (a.cap ?? -1) : a.date < b.date ? 1 : -1))
  const d1s = past.map((r) => r.d1).filter((x) => x !== null), d5s = past.map((r) => r.d5).filter((x) => x !== null)
  const capKnown = upcoming.filter((r) => r.cap !== null)
  return {
    upcoming: { from: upFrom, to: upTo, count: upcoming.length, cap: capKnown.length ? capKnown.reduce((s, r) => s + r.cap, 0) : null, capMissing: upcoming.length - capKnown.length, byDate: [...byDate.values()], rows: upcoming },
    past: {
      from: pastFrom, to: asOf, count: past.length,
      d1: { n: d1s.length, mean: round(mean(d1s), 2), median: round(median(d1s), 2), up: d1s.filter((x) => x > 0).length },
      d5: { n: d5s.length, mean: round(mean(d5s), 2), median: round(median(d5s), 2), up: d5s.filter((x) => x > 0).length },
      rows: past,
    },
  }
}

/* ---------------- 重要股东增减持 ---------------- */

/** 增减持明细；金额 = 变动股数 × 公告披露的成交均价；均价未披露（如 ETF 被动调仓、协议转让等）时金额为 null，不用收盘价估算 */
export function parseHolders(rows, asOf) {
  const from = addDays(asOf, -WINDOW + 1)
  return rows
    .map((r) => {
      const dir = str(r.DIRECTION)
      const shares = num(r.CHANGE_NUM) === null ? null : Math.abs(num(r.CHANGE_NUM)) // 万股
      const avg = num(r.TRADE_AVERAGE_PRICE)
      const sign = dir === '减持' ? -1 : 1
      return {
        code: str(r.SECURITY_CODE), name: str(r.SECURITY_NAME_ABBR), holder: str(r.HOLDER_NAME), dir, notice: dateOf(r.NOTICE_DATE),
        shares, ratio: round(num(r.AFTER_CHANGE_RATE), 4), start: dateOf(r.START_DATE), end: dateOf(r.END_DATE), avgPrice: avg,
        amount: shares !== null && avg !== null ? Math.round(shares * 1e4 * avg) * sign : null, way: str(r.MARKET) || null,
      }
    })
    .filter((r) => /^\d{6}$/.test(r.code) && (r.dir === '增持' || r.dir === '减持') && r.notice && r.notice >= from && r.notice <= asOf)
    .sort((a, b) => (a.notice === b.notice ? Math.abs(b.amount ?? 0) - Math.abs(a.amount ?? 0) : a.notice < b.notice ? 1 : -1))
}

/** 按个股汇总近 30 日净额（增持为正、减持为负）：只加有均价的记录；一条都没有均价的个股不进排行。netRatio = 各条变动占总股本比的代数和 */
export function holderRank(list, top = 20) {
  const m = new Map()
  for (const r of list) {
    const s = m.get(r.code) ?? { code: r.code, name: r.name, inc: 0, dec: 0, net: 0, netRatio: null, count: 0, known: 0, holders: new Set() }
    s.count++; s.holders.add(r.holder)
    // 占比全部缺失时保持 null，不显示成 0
    if (r.ratio !== null) s.netRatio = (s.netRatio ?? 0) + (r.dir === '减持' ? -r.ratio : r.ratio)
    if (r.amount !== null) { s.known++; s.net += r.amount; if (r.amount > 0) s.inc += r.amount; else s.dec += r.amount }
    m.set(r.code, s)
  }
  const all = [...m.values()].filter((s) => s.known > 0).map(({ holders, ...s }) => ({ ...s, netRatio: round(s.netRatio, 4), holders: holders.size, missing: s.count - s.known }))
  return {
    inc: all.filter((s) => s.net > 0).sort((a, b) => b.net - a.net).slice(0, top),
    dec: all.filter((s) => s.net < 0).sort((a, b) => a.net - b.net).slice(0, top),
  }
}

export function buildHolders(rows, asOf) {
  const list = parseHolders(rows, asOf)
  // 该方向没有记录 → 0（真实的 0）；有记录但一条都没有金额 → null（缺失，不当 0）
  const sum = (dir) => {
    const xs = list.filter((r) => r.dir === dir)
    const known = xs.filter((r) => r.amount !== null)
    return xs.length && !known.length ? null : known.reduce((s, r) => s + r.amount, 0)
  }
  return {
    from: addDays(asOf, -WINDOW + 1), to: asOf, count: list.length,
    incCount: list.filter((r) => r.dir === '增持').length, decCount: list.filter((r) => r.dir === '减持').length,
    incAmount: sum('增持'), decAmount: sum('减持'), missing: list.filter((r) => r.amount === null).length,
    incMissing: list.filter((r) => r.dir === '增持' && r.amount === null).length, decMissing: list.filter((r) => r.dir === '减持' && r.amount === null).length,
    rows: list, rank: holderRank(list),
  }
}

/* ---------------- 股权质押与商誉 ---------------- */

export function buildPledge(rows, date, counts, total) {
  return {
    date, total, counts, // counts: {50: n, 30: n}
    rows: rows.map((r) => {
      if (dateOf(r.TRADE_DATE) !== date) throw new Error(`质押统计日期不符（${r.TRADE_DATE}）`)
      return { code: str(r.SECURITY_CODE), name: str(r.SECURITY_NAME_ABBR), industry: str(r.INDUSTRY) || null, ratio: num(r.PLEDGE_RATIO), deals: num(r.PLEDGE_DEAL_NUM), shares: num(r.REPURCHASE_BALANCE), cap: num(r.PLEDGE_MARKET_CAP) === null ? null : Math.round(num(r.PLEDGE_MARKET_CAP) * 1e4), y1: round(num(r.Y1_CLOSE_ADJCHRATE), 2) }
    }).filter((r) => /^\d{6}$/.test(r.code) && r.ratio !== null),
  }
}

/** 最近一个「法定披露截止日已过」的报告期：一季报 4/30、半年报 8/31、三季报 10/31、年报 次年 4/30（年报与一季报同截止，取一季报） */
export function latestPeriod(asOf) {
  const y = Number(asOf.slice(0, 4))
  const cands = [[`${y}-09-30`, `${y}-10-31`], [`${y}-06-30`, `${y}-08-31`], [`${y}-03-31`, `${y}-04-30`], [`${y - 1}-09-30`, `${y - 1}-10-31`]]
  return cands.find(([, deadline]) => asOf > deadline)[0]
}

export function buildGoodwill(rows, period, counts, total, negative) {
  return {
    period, total, negative, counts, // counts: {100: n, 50: n, 30: n}（净资产为正的公司）
    rows: rows.map((r) => {
      if (dateOf(r.REPORT_DATE) !== period) throw new Error(`商誉报告期不符（${r.REPORT_DATE}）`)
      const ratio = num(r.SUMSHEQUITY_RATIO)
      return { code: str(r.SECURITY_CODE), name: str(r.SECURITY_NAME_ABBR), industry: str(r.INDUSTRY_CFT) || null, goodwill: num(r.GOODWILL), equity: num(r.SUMSHEQUITY), ratio: ratio === null ? null : round(ratio * 100, 2), notice: dateOf(r.NOTICE_DATE) }
    }).filter((r) => /^\d{6}$/.test(r.code) && r.ratio !== null && r.equity !== null && r.equity > 0),
  }
}

/* ---------------- 回购 ---------------- */

// 东方财富回购页（data.eastmoney.com/gphg）前端的进度代码表；007 页面上不显示文字，这里标「未标注」
export const REPUR_STATUS = { '001': '董事会预案', '002': '股东大会通过', '003': '股东大会否决', '004': '实施中', '005': '停止实施', '006': '完成实施' }

/** 最新公告日在近 30 日内的回购；进度 = 已回购金额 ÷ 计划金额下限（及上限） */
export function buildBuyback(rows, asOf) {
  const from = addDays(asOf, -WINDOW + 1)
  const list = rows
    .map((r) => {
      const low = num(r.REPURAMOUNTLOWER), high = num(r.REPURAMOUNTLIMIT), amount = num(r.REPURAMOUNT)
      const code = str(r.DIM_SCODE), status = str(r.REPURPROGRESS)
      return {
        code, name: str(r.SECURITYSHORTNAME), status, statusLabel: REPUR_STATUS[status] ?? '未标注',
        notice: dateOf(r.UPD), planDate: dateOf(r.DIM_DATE), start: dateOf(r.REPURSTARTDATE),
        low, high, priceCap: num(r.REPURPRICECAP), amount, shares: num(r.REPURNUM), avgPrice: num(r.HGJG_VAG),
        progressLow: amount !== null && low > 0 ? round((amount / low) * 100, 1) : null,
        progressHigh: amount !== null && high > 0 ? round((amount / high) * 100, 1) : null,
      }
    })
    .filter((r) => /^\d{6}$/.test(r.code) && r.notice && r.notice >= from && r.notice <= asOf)
    .sort((a, b) => (a.notice === b.notice ? (b.high ?? -1) - (a.high ?? -1) : a.notice < b.notice ? 1 : -1))
  const counts = {}
  for (const r of list) counts[r.statusLabel] = (counts[r.statusLabel] ?? 0) + 1
  const newPlans = list.filter((r) => r.status === '001' && r.planDate && r.planDate >= from)
  // 计划金额：只加披露了的；一份都没披露 → null；部分缺失用 newPlanLowMissing / newPlanHighMissing 标出份数，不把缺失当 0
  const planSum = (k) => { const v = newPlans.map((r) => r[k]).filter((x) => x !== null); return newPlans.length && !v.length ? null : v.reduce((s, x) => s + x, 0) }
  return {
    from, to: asOf, count: list.length, counts,
    newPlans: newPlans.length, newPlanLow: planSum('low'), newPlanHigh: planSum('high'),
    newPlanLowMissing: newPlans.filter((r) => r.low === null).length, newPlanHighMissing: newPlans.filter((r) => r.high === null).length,
    rows: list,
  }
}

/**
 * 是否用本次结果替换已发布的文件：已发布的数据日期更晚（AS_OF 历史重跑）不替换；
 * 同一天时本次日 K 失败更多（表现 / 市值会变成 null）就不替换，保留更完整的那份。旧文件没有 quality 时允许替换。
 */
export function shouldReplace(prev, next) {
  if (!prev?.asOf) return true
  if (prev.asOf !== next.asOf) return prev.asOf < next.asOf
  const a = prev.quality, b = next.quality
  if (!a || !b) return true
  return !(b.klineMiss > a.klineMiss)
}

/** 历史：每个数据日期一条摘要，同日覆盖 */
export function mergeHistory(history, day, keep = 250) {
  const m = new Map((history ?? []).filter((d) => d?.date).map((d) => [d.date, d]))
  m.set(day.date, day)
  return [...m.values()].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-keep)
}

/* ---------------- 研报评级 ---------------- */
// 来源：东方财富研报列表接口 reportapi.eastmoney.com/report/list（data.eastmoney.com/report 页面用的同一个接口）。
// qType=0 个股研报、qType=1 行业研报；beginTime/endTime 按发布日（publishDate，只有日期，时间恒为 00:00）筛选；
// pageSize 上限 100（传更大也只回 100）；返回 {hits 总数, TotalPage, data}。实测字段：
//   infoCode 报告编号（个股研报页 data.eastmoney.com/report/info/{infoCode}.html）、stockCode/stockName、orgSName 机构简称、
//   emRatingName 东方财富统一后的评级（买入/增持/中性…）、sRatingName 机构原文评级、lastEmRatingName 该机构上次评级、
//   ratingChange 评级变动代码（东方财富前端 stock.js 的 getRatingChangeStr：0 调高、1 调低、2 首次、3 维持、4 无；空串 = 未标注）、
//   indvAimPriceT / indvAimPriceL 目标价上限 / 下限（多数为空串）、indvInduName 个股所属行业、industryName 行业研报的行业。

/** 评级变动代码 → 文字（东方财富的「调高/调低」这里写作「上调/下调」）；未标注为 null */
export const RATING_CHANGE = { 0: '上调', 1: '下调', 2: '首次', 3: '维持', 4: '无' }
export const ratingChangeOf = (x) => (x === '' || x === null || x === undefined ? null : RATING_CHANGE[String(x)] ?? null)
export const REPORT_KEEP_DAYS = 90 // 原始日文件保留天数
export const REPORT_REFRESH_DAYS = 7 // 每次运行重取最近几天（研报会补录到前几天）
export const REPORT_COMPLETE_MINUTES = 18 * 60 // 北京时间 18:00 前当天的研报列表视为不完整
const STOCK_COLS = ['id', 'code', 'name', 'org', 'rating', 'sRating', 'change', 'last', 'aimHigh', 'aimLow', 'ind', 'title']
const INDUSTRY_COLS = ['id', 'ind', 'org', 'rating', 'change', 'title']
export const reportUrl = (id) => (/^[A-Z]{2}\d{6,}$/.test(id ?? '') ? `https://data.eastmoney.com/report/info/${id}.html` : null)

/** 接口一行 → 紧凑数组（存原始日文件用）；缺报告编号或日期的行返回 null */
export function compactReport(r, kind) {
  const date = dateOf(r?.publishDate)
  const id = str(r?.infoCode)
  if (!date || !id) return null
  const change = r.ratingChange === '' || r.ratingChange === null || r.ratingChange === undefined ? null : num(r.ratingChange)
  const row = kind === 'stock'
    ? [id, str(r.stockCode), str(r.stockName), str(r.orgSName) || str(r.orgName), str(r.emRatingName) || null, str(r.sRatingName) || null, change, str(r.lastEmRatingName) || null, num(r.indvAimPriceT), num(r.indvAimPriceL), str(r.indvInduName) || null, str(r.title)]
    : [id, str(r.industryName) || null, str(r.orgSName) || str(r.orgName), str(r.emRatingName) || null, change, str(r.title)]
  return { date, row }
}
const fromRow = (cols, row) => Object.fromEntries(cols.map((c, i) => [c, row[i] ?? null]))

/**
 * 分页结果校验：拿到的行数 = hits、报告编号不重复、发布日都在查询区间内，否则抛错（整段不用）。
 * 返回按发布日分组的 Map(date → 紧凑行数组)，区间内每一天都有一项（没有研报的日子是空数组，是真实的 0）。
 */
export function groupReports(rows, hits, from, to, kind) {
  if (!Array.isArray(rows) || !Number.isInteger(hits) || rows.length !== hits) throw new Error(`${kind} 研报行数不完整（${rows?.length ?? 0}/${hits}）`)
  const ids = new Set()
  const out = new Map()
  for (let d = from; d <= to; d = addDays(d, 1)) out.set(d, [])
  for (const r of rows) {
    const c = compactReport(r, kind)
    if (!c) throw new Error(`${kind} 研报缺编号或日期`)
    if (c.date < from || c.date > to) throw new Error(`${kind} 研报发布日 ${c.date} 不在 ${from}~${to}`)
    if (ids.has(c.row[0])) throw new Error(`${kind} 研报编号重复 ${c.row[0]}`)
    ids.add(c.row[0])
    out.get(c.date).push(c.row)
  }
  return out
}

/** 原始日文件内容（紧凑）：{date, fetchedAt, stock:{cols, rows}, industry:{cols, rows}} */
export const reportDayFile = (date, stockRows, industryRows, fetchedAt) => ({ date, fetchedAt, stock: { cols: STOCK_COLS, rows: stockRows }, industry: { cols: INDUSTRY_COLS, rows: industryRows } })
export const okDayFile = (f) => Boolean(f) && dateOf(f.date) === f.date && Array.isArray(f.stock?.rows) && Array.isArray(f.industry?.rows)

/** 本次要取的发布日区间：最近 7 天总是重取；30 日窗口（多留一天，统计日可能是昨天）里缺日文件的，从最早缺的那天起一起取 */
export function reportFetchRange(have, today) {
  let from = addDays(today, -(REPORT_REFRESH_DAYS - 1))
  for (let d = addDays(today, -WINDOW); d < from; d = addDays(d, 1)) if (!have.has(d)) { from = d; break }
  return { from, to: today }
}

/**
 * 统计日 = 最近一个「已完整」的研报发布日：今天北京时间 18:00 前当天列表还在陆续增加，不算；
 * 往前找第一个有个股研报的自然日（周末也可能有研报）。dayFiles: Map(date → 日文件)。找不到返回 null。
 */
export function pickReportDay(dayFiles, today, minutes) {
  const dates = [...dayFiles.keys()].filter((d) => d <= today).sort().reverse()
  for (const d of dates) {
    if (d === today && minutes < REPORT_COMPLETE_MINUTES) continue
    if (dayFiles.get(d)?.stock?.rows?.length) return d
  }
  return null
}

/** 需要收盘价的个股（有目标价的）：统计日研报 + 近 7 日上调 / 首次 */
export function aimCodes(section) {
  const s = new Set()
  for (const r of [...section.rows, ...section.upgrades, ...section.initiations]) if ((r.aimHigh !== null || r.aimLow !== null) && /^\d{6}$/.test(r.code)) s.add(r.code)
  return [...s]
}

/** 目标价相对收盘的空间（%）：目标价 ÷ 收盘 − 1；目标价或收盘缺失为 null */
export const upside = (aim, close) => (aim === null || close === null || !(aim > 0) || !(close > 0) ? null : round((aim / close - 1) * 100, 1))

/** 填入收盘价与目标价空间。closes: Map(code → closeDate 当天收盘 | null)，只用这一天的收盘（停牌为 null，不用更早的） */
export function withUpside(section, closes, closeDate) {
  const fill = (r) => {
    if (r.aimHigh === null && r.aimLow === null) return r
    const close = closes.get(r.code) ?? null
    return { ...r, close, upLow: upside(r.aimLow, close), upHigh: upside(r.aimHigh, close) }
  }
  return { ...section, closeDate, rows: section.rows.map(fill), upgrades: section.upgrades.map(fill), initiations: section.initiations.map(fill) }
}

/**
 * 研报评级汇总。dayFiles: Map(date → 日文件)；day 为统计日；today 用来标出「今天已收录、尚未计入」的条数。
 * - rows：统计日全部个股研报（只给标题和链接，不转载正文）
 * - upgrades / initiations：近 7 日（含统计日）评级上调、首次覆盖
 * - covered：近 30 日被覆盖最多的个股（研报篇数、不同机构数）
 * - industries：行业研报按行业计数（近 7 日、近 30 日）
 * 窗口均为以统计日结尾的自然日；窗口内缺日文件时 missingDays 列出，计数只按已有的天算。
 */
export function buildReports(dayFiles, day, today) {
  const w7 = addDays(day, -(REPORT_REFRESH_DAYS - 1)), w30 = addDays(day, -(WINDOW - 1))
  const stockOf = (d) => { const f = dayFiles.get(d); return (f?.stock?.rows ?? []).map((row) => ({ date: d, ...fromRow(f.stock.cols ?? STOCK_COLS, row) })) }
  const indOf = (d) => { const f = dayFiles.get(d); return (f?.industry?.rows ?? []).map((row) => ({ date: d, ...fromRow(f.industry.cols ?? INDUSTRY_COLS, row) })) }
  const shape = (r) => ({
    id: r.id, date: r.date, code: r.code, name: r.name, org: r.org, rating: r.rating, sRating: r.sRating, change: ratingChangeOf(r.change), last: r.last,
    aimLow: num(r.aimLow), aimHigh: num(r.aimHigh), close: null, upLow: null, upHigh: null, ind: r.ind, title: r.title, url: reportUrl(r.id),
  })
  const days30 = [], missingDays = []
  for (let d = w30; d <= day; d = addDays(d, 1)) { if (okDayFile(dayFiles.get(d))) days30.push(d); else missingDays.push(d) }
  const stock30 = days30.flatMap(stockOf).filter((r) => /^\d{6}$/.test(r.code))
  const stock7 = stock30.filter((r) => r.date >= w7)
  const ind30 = days30.flatMap(indOf)
  const rows = stockOf(day).filter((r) => /^\d{6}$/.test(r.code)).map(shape).sort((a, b) => (a.code === b.code ? a.org.localeCompare(b.org) : a.code.localeCompare(b.code)))
  const counts = { 上调: 0, 下调: 0, 首次: 0, 维持: 0, 无: 0, 未标注: 0 }
  for (const r of rows) counts[r.change ?? '未标注']++
  const byDateDesc = (a, b) => (a.date === b.date ? a.code.localeCompare(b.code) : a.date < b.date ? 1 : -1)
  const upgrades = stock7.filter((r) => ratingChangeOf(r.change) === '上调').map(shape).sort(byDateDesc)
  const initiations = stock7.filter((r) => ratingChangeOf(r.change) === '首次').map(shape).sort(byDateDesc)
  // 近 30 日覆盖最多的个股
  const cov = new Map()
  for (const r of stock30) {
    const c = cov.get(r.code) ?? { code: r.code, name: r.name, ind: r.ind, count: 0, orgs: new Set(), latest: r.date, first: 0, up: 0 }
    c.count++
    if (r.org) c.orgs.add(r.org)
    if (r.date >= c.latest) { c.latest = r.date; c.name = r.name || c.name; c.ind = r.ind ?? c.ind }
    const ch = ratingChangeOf(r.change)
    if (ch === '首次') c.first++
    if (ch === '上调') c.up++
    cov.set(r.code, c)
  }
  const covered = [...cov.values()].map(({ orgs, ...c }) => ({ ...c, orgs: orgs.size }))
    .sort((a, b) => b.count - a.count || b.orgs - a.orgs || a.code.localeCompare(b.code)).slice(0, 30)
  // 行业研报按行业（东方财富行业分类，行业研报自带的 industryName）
  const ind = new Map()
  for (const r of ind30) {
    const name = r.ind || '未标注行业'
    const x = ind.get(name) ?? { name, n7: 0, n30: 0 }
    x.n30++
    if (r.date >= w7) x.n7++
    ind.set(name, x)
  }
  const industries = [...ind.values()].sort((a, b) => b.n30 - a.n30 || b.n7 - a.n7 || a.name.localeCompare(b.name))
  const daily = days30.map((d) => ({ date: d, stock: dayFiles.get(d).stock.rows.length, industry: dayFiles.get(d).industry.rows.length }))
  const t = dayFiles.get(today)
  return {
    day, w7, w30, missingDays,
    // 今天已收录但不计入统计（18:00 前列表还在增加）
    pending: today > day && okDayFile(t) ? { date: today, stock: t.stock.rows.length, industry: t.industry.rows.length } : null,
    dayStock: rows.length, dayIndustry: okDayFile(dayFiles.get(day)) ? dayFiles.get(day).industry.rows.length : 0, counts,
    stock7: stock7.length, stock30: stock30.length, industry7: ind30.filter((r) => r.date >= w7).length, industry30: ind30.length,
    closeDate: null, rows, upgrades, initiations, covered, industries, daily,
  }
}

/** 超过保留天数的日文件名（YYYY-MM-DD.json） */
export const staleReportFiles = (names, today, keep = REPORT_KEEP_DAYS) => names.filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n) && n.slice(0, 10) < addDays(today, -keep))
