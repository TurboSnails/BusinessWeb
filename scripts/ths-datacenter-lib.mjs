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

/** 解禁日后表现：T = 解禁日当天或之后第一个交易日；基准 = T 前一个交易日收盘（前复权）。d1 = T 收盘涨跌，d5 = T 起第 5 个交易日收盘相对基准 */
export function liftPerf(bars, date) {
  if (!bars?.length) return { d1: null, d5: null, tDate: null }
  const i = bars.findIndex((b) => b.date >= date)
  if (i <= 0) return { d1: null, d5: null, tDate: i === 0 ? bars[0].date : null }
  const base = bars[i - 1].close
  return { tDate: bars[i].date, d1: pctOf(bars[i].close, base), d5: bars[i + 4] ? pctOf(bars[i + 4].close, base) : null }
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
    const s = m.get(r.code) ?? { code: r.code, name: r.name, inc: 0, dec: 0, net: 0, netRatio: 0, count: 0, known: 0, holders: new Set() }
    s.count++; s.holders.add(r.holder)
    if (r.ratio !== null) s.netRatio += r.dir === '减持' ? -r.ratio : r.ratio
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
  const sum = (dir) => list.filter((r) => r.dir === dir && r.amount !== null).reduce((s, r) => s + r.amount, 0)
  return {
    from: addDays(asOf, -WINDOW + 1), to: asOf, count: list.length,
    incCount: list.filter((r) => r.dir === '增持').length, decCount: list.filter((r) => r.dir === '减持').length,
    incAmount: sum('增持'), decAmount: sum('减持'), missing: list.filter((r) => r.amount === null).length,
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
  return {
    from, to: asOf, count: list.length, counts,
    newPlans: newPlans.length, newPlanLow: newPlans.reduce((s, r) => s + (r.low ?? 0), 0), newPlanHigh: newPlans.reduce((s, r) => s + (r.high ?? 0), 0),
    rows: list,
  }
}

/** 历史：每个数据日期一条摘要，同日覆盖 */
export function mergeHistory(history, day, keep = 250) {
  const m = new Map((history ?? []).filter((d) => d?.date).map((d) => [d.date, d]))
  m.set(day.date, day)
  return [...m.values()].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-keep)
}
