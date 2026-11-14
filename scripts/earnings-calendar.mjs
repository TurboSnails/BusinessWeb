// 「财报前瞻」数据：public/data/earnings-calendar.json（页面 /earnings 懒加载）。
// 只收公司库里的公司（companyCore.resolveMarket 合并手工研究页 + public/data/{m}.json，与 UI 同一口径），
// 窗口：今天前 14 天（已公布）到今天后 42 天（待公布）。只记事实：日期、时段、一致预期、历史超预期幅度与实际结果，
// 每个数字带来源与日期；取不到的字段写 null，页面显示“缺失”，不推算、不补造。
//
// 来源（每个源独立、带超时；失败时沿用上次文件里该源的条目和原日期，见 carryForward）：
//   yahoo        美股（标普500 / 纳指100 / ADR）与港股：财报日、盘前/盘后、是否预估日期、EPS 与营收一致预期、
//                近几季 EPS 实际 vs 预期、季度营收。经 scripts/earnings-calendar-yf.py（yfinance）采集。
//   hkex         港交所披露易「董事会会议通告」综合表（英文版，只列今天及以后的会议日；业绩通常于会议当日或次日公布）。
//   cnAppoint    东方财富数据中心 RPT_PUBLIC_BS_APPOIN：沪深交易所定期报告预约披露时间（含变更与实际披露日）。
//   cnForecast   东方财富 RPT_PUBLIC_OP_NEWPREDICT：业绩预告。
//   cnExpress    东方财富 RPT_FCI_PERFORMANCEE：业绩快报。
//   cnReport     东方财富 RPT_LICO_FN_CPD：已披露定期报告的每股收益、营收与同比。
//   cnConsensus  东方财富 RPT_WEB_RESPREDICT：机构盈利预测（只有年度 EPS；季报没有一致预期，页面写明）。
// 不使用 Nasdaq 财报日历：nasdaq.com 使用条款禁止以自动或人工方式抓取并再分发其内容，api.nasdaq.com 的 robots.txt 全站 Disallow。
//
// 用法：node scripts/earnings-calendar.mjs [--today YYYY-MM-DD] [--yf-json 已有的 yfinance 输出] [--skip-yahoo]
//   EARNINGS_YF_CMD 可覆盖 yfinance 采集命令（默认 uv run --python 3.12 --with yfinance==1.8.0 python scripts/earnings-calendar-yf.py）。
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { join, resolve, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { writeJsonIfChanged } from './lib/json-io.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const OUT_FILE = join(ROOT, 'public/data/earnings-calendar.json')
const YF_SCRIPT = join(ROOT, 'scripts/earnings-calendar-yf.py')
const MARKETS = ['us', 'ndx', 'adr', 'hk', 'cn']
export const PAST_DAYS = 14
export const AHEAD_DAYS = 42
export const NOTICE_DAYS = 45
const REQUEST_TIMEOUT_MS = 20_000
const YF_TIMEOUT_MS = 40 * 60_000
const THROTTLE_MS = 350
const UA = 'Mozilla/5.0 (compatible; personal-research-notebook)'

export const URLS = {
  yahoo: 'https://finance.yahoo.com/calendar/earnings',
  hkex: 'https://www3.hkexnews.hk/reports/bmn/ebmn.htm',
  eastmoney: 'https://datacenter-web.eastmoney.com/api/data/v1/get',
}
export const SOURCE_LABEL = {
  yahoo: 'Yahoo Finance（yfinance）',
  hkex: '港交所披露易·董事会会议通告',
  cnAppoint: '东方财富·定期报告预约披露',
  cnForecast: '东方财富·业绩预告',
  cnExpress: '东方财富·业绩快报',
  cnReport: '东方财富·业绩报表',
  cnConsensus: '东方财富·机构盈利预测',
}

// ───────── 小工具 ─────────
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000
export const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)
const dayDiff = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS)
const isNum = v => typeof v === 'number' && Number.isFinite(v)
const num = v => (v === null || v === undefined || v === '' ? null : isNum(Number(v)) ? Number(v) : null)
const round = (v, d) => (isNum(v) ? Number(v.toFixed(d)) : null)
const eps = v => round(v, 4)
const pct = v => round(v, 2)
const errText = e => (e instanceof Error ? e.message : String(e)).slice(0, 200)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const day10 = s => (typeof s === 'string' && DAY_RE.test(s.slice(0, 10)) ? s.slice(0, 10) : null)
/** 某时刻在某时区的日期与分钟数 */
export function zoned(isoOrSeconds, timeZone) {
  const t = typeof isoOrSeconds === 'number' ? isoOrSeconds * 1000 : Date.parse(isoOrSeconds)
  if (!Number.isFinite(t)) return null
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t)).map(p => [p.type, p.value]))
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) }
}
export const beijingToday = (now = new Date()) => zoned(now.toISOString(), 'Asia/Shanghai').day

/** 公司库代码 → Yahoo 代码：BRK.B → BRK-B；港股 00700 → 0700.HK */
export function yahooSymbol(market, code) {
  if (market === 'hk') return /^\d{1,5}$/.test(code) ? `${String(Number(code)).padStart(4, '0')}.HK` : null
  if (market === 'cn') return null
  return code.replace(/\./g, '-')
}

// ───────── Yahoo（yfinance 输出）规范化 ─────────
/** Yahoo 财报事件名 "Q3 2027 Earnings Announcement" → FY2027Q3（Yahoo 用公司财年） */
export function periodFromEvent(event) {
  const m = /\bQ([1-4])\s+(\d{4})\b/.exec(String(event ?? ''))
  return m ? `FY${m[2]}Q${m[1]}` : null
}

/** 美股时段：只认 Yahoo Timing 的 BMO / AMC；TAS / TNS（时间未提供）记为未知，不按默认时间推断 */
export function usTime(timing) {
  if (timing === 'BMO') return 'bmo'
  if (timing === 'AMC') return 'amc'
  return 'unknown'
}

/** 港股时段：只在日期已确认时按香港时间推（<9:30 盘前，≥16:00 盘后，12:00–13:00 午间休市） */
export function hkTime(seconds, confirmed) {
  if (!confirmed || !isNum(seconds)) return 'unknown'
  const z = zoned(seconds, 'Asia/Hong_Kong')
  if (!z) return 'unknown'
  if (z.minutes < 9 * 60 + 30) return 'bmo'
  if (z.minutes >= 16 * 60) return 'amc'
  if (z.minutes >= 12 * 60 && z.minutes < 13 * 60) return 'midday'
  return 'unknown'
}

const historyRows = rows => (Array.isArray(rows) ? rows : [])
  .map(r => ({ date: day10(r?.date), epsActual: eps(num(r?.epsActual)), epsEstimate: eps(num(r?.epsEstimate)), surprisePct: pct(num(r?.surprisePct)) }))
  .filter(r => r.date)

/** 某次财报之前最近 4 季已公布的 EPS 实际 vs 预期（新→旧） */
export function surpriseHistory(rows, beforeDay, n = 4) {
  return historyRows(rows).filter(r => r.date < addDays(beforeDay, -3) && r.epsActual !== null).sort((a, b) => b.date.localeCompare(a.date)).slice(0, n)
}

/** 公布日 ±3 天内的那一行（Yahoo 历史日期偶有一天偏差） */
export function historyAt(rows, day) {
  return historyRows(rows).find(r => Math.abs(dayDiff(r.date, day)) <= 3) ?? null
}

/** 季度营收：报告日前 120 天内结束的最近一季，以及约一年前同季（±20 天）→ 实际营收与同比 */
export function revenueAt(quarters, reportDay) {
  const qs = (Array.isArray(quarters) ? quarters : []).map(q => ({ end: day10(q?.periodEnd), value: num(q?.value) })).filter(q => q.end && q.value !== null)
  const cur = qs.filter(q => q.end < reportDay && dayDiff(reportDay, q.end) <= 120).sort((a, b) => b.end.localeCompare(a.end))[0]
  if (!cur) return null
  const prev = qs.find(q => Math.abs(dayDiff(cur.end, q.end) - 365) <= 20)
  return { periodEnd: cur.end, revenue: Math.round(cur.value), revenueYoY: prev && prev.value > 0 ? pct((cur.value / prev.value - 1) * 100) : null }
}

const consensusOf = (t, asOf) => {
  const e = t?.eps0q, r = t?.rev0q
  const epsAvg = eps(num(e?.avg)), rev = num(r?.avg)
  if (epsAvg === null && rev === null) return null
  return {
    eps: epsAvg, revenue: rev === null ? null : Math.round(rev),
    analysts: num(e?.analysts), revenueAnalysts: num(r?.analysts),
    currency: e?.currency || r?.currency || null, asOf, source: 'yahoo',
  }
}
const lastYearOf = t => {
  const e = eps(num(t?.eps0q?.yearAgo)), r = num(t?.rev0q?.yearAgo)
  return e === null && r === null ? null : { eps: e, revenue: r === null ? null : Math.round(r) }
}

/**
 * Yahoo 一家公司的一次财报 → 条目里 Yahoo 负责的字段。
 * @param t      yfinance 单只股票的输出（info / eps0q / rev0q / history / quarterlyRevenue）
 * @param date   这次财报的日期（交易所当地日期）
 * @param today  北京日期
 */
export function yahooFields(t, { date, today, asOf, calendarRow }) {
  const reported = date <= today
  const hist = t?.history
  const out = { history: surpriseHistory(hist, date) }
  if (!reported) {
    // 0q 是 Yahoo 的“当前季度”：只有当它对应这次财报（Yahoo 下一个财报日与条目日期相差 ≤3 天）才算这次的一致预期
    const next = historyRows(hist).filter(r => r.epsActual === null && r.date >= addDays(today, -3)).sort((a, b) => a.date.localeCompare(b.date))[0]?.date
      ?? (isNum(t?.info?.earningsTimestamp) ? zoned(t.info.earningsTimestamp, 'UTC').day : null)
    if (!next || Math.abs(dayDiff(next, date)) <= 3) {
      out.consensus = consensusOf(t, asOf)
      out.lastYear = lastYearOf(t)
    }
    if (!out.consensus && calendarRow && isNum(calendarRow.epsEstimate)) out.consensus = { eps: eps(calendarRow.epsEstimate), revenue: null, analysts: null, revenueAnalysts: null, currency: null, asOf, source: 'yahoo' }
    return out
  }
  const at = historyAt(hist, date)
  const epsActual = at?.epsActual ?? eps(num(calendarRow?.epsActual))
  const rev = revenueAt(t?.quarterlyRevenue, addDays(date, 1))
  if (epsActual !== null || rev) {
    out.result = {
      epsActual, epsEstimate: at?.epsEstimate ?? eps(num(calendarRow?.epsEstimate)),
      surprisePct: epsActual !== null ? (at?.surprisePct ?? pct(num(calendarRow?.surprisePct))) : null,
      revenueActual: rev?.revenue ?? null, revenueYoY: rev?.revenueYoY ?? null, revenuePeriodEnd: rev?.periodEnd ?? null,
      currency: t?.eps0q?.currency || t?.info?.financialCurrency || null, asOf, source: 'yahoo',
    }
  }
  return out
}

/** Yahoo 财报日历行 → 美股条目的日期部分 */
export function usDateFromRow(row) {
  const z = row?.start ? zoned(row.start, 'America/New_York') : null
  if (!z) return null
  return { date: z.day, time: usTime(row.timing), period: periodFromEvent(row.event) }
}

/** isEarningsDateEstimate：false → 已确认；true → 预估；缺失 → 未知 */
export const confirmedOf = info => (info?.isEarningsDateEstimate === false ? true : info?.isEarningsDateEstimate === true ? false : null)

// ───────── 港交所董事会会议通告 ─────────
const HK_PURPOSE = [
  [/SPECIAL DIV|^DIVIDEND$/i, null],
  [/3RD QUARTER|THIRD QUARTER/i, '第三季度业绩'],
  [/1ST QUARTER|FIRST QUARTER/i, '第一季度业绩'],
  [/QUARTER/i, '季度业绩'],
  [/^INT|INTERIM/i, '中期业绩'],
  [/FIN|FINAL|ANNUAL/i, '全年业绩'],
  [/RES/i, '业绩'],
]
/** "6-MTH-ENDED30/09/26" → { months: 6, periodEnd: '2026-09-30' } */
export function parseHkPeriod(text) {
  const s = String(text ?? '').toUpperCase()
  const end = /ENDED\s*(\d{2})\/(\d{2})\/(\d{2,4})/.exec(s)
  const months = /(\d{1,2})-MTH/.exec(s)
  const year = end ? (end[3].length === 2 ? `20${end[3]}` : end[3]) : null
  return { months: months ? Number(months[1]) : /YR|YEAR/.test(s) ? 12 : null, periodEnd: end ? `${year}-${end[2]}-${end[1]}` : null }
}
export function hkPeriodLabel(purpose, periodText) {
  const { months, periodEnd } = parseHkPeriod(periodText)
  let label = HK_PURPOSE.find(([re]) => re.test(String(purpose ?? '')))?.[1]
  if (label === null) return null // 只是派息会议，不是业绩
  if (label === undefined) return null
  if (label === '业绩' || label === '季度业绩') label = months === 6 ? '中期业绩' : months === 12 ? '全年业绩' : months === 9 ? '前三季度业绩' : months === 3 ? '季度业绩' : label
  return { label, periodEnd, months }
}

/** 披露易董事会会议通告 HTML → [{ date, code(5 位), shortName, purpose, period }] */
export function parseHkexBoardMeetings(html) {
  const out = []
  for (const row of String(html ?? '').matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)(?=<td|$)/gi)].map(c => c[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim())
    if (cells.length < 6) continue
    const d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(cells[0])
    const code = cells[3].replace(/\s+/g, '')
    if (!d || !/^\d{1,5}$/.test(code)) continue
    out.push({ date: `${d[3]}-${d[2]}-${d[1]}`, code: code.padStart(5, '0'), shortName: cells[2], purpose: cells[4], period: cells[5] })
  }
  return out
}

// ───────── 沪深定期报告 ─────────
/** 沪深定期报告的法定披露窗口：一季报 4 月、半年报 7–8 月、三季报 10 月、年报次年 1–4 月 */
export function cnPeriods(year) {
  return [
    { reportDate: `${year - 1}-12-31`, period: `FY${year - 1}`, label: `${year - 1} 年年报`, start: `${year}-01-01`, end: `${year}-04-30` },
    { reportDate: `${year}-03-31`, period: `FY${year}Q1`, label: `${year} 年一季报`, start: `${year}-04-01`, end: `${year}-04-30` },
    { reportDate: `${year}-06-30`, period: `FY${year}H1`, label: `${year} 年半年报`, start: `${year}-07-01`, end: `${year}-08-31` },
    { reportDate: `${year}-09-30`, period: `FY${year}Q3`, label: `${year} 年三季报`, start: `${year}-10-01`, end: `${year}-10-31` },
  ]
}
/** 与 [start, end] 有交集的报告期 */
export const cnPeriodsForWindow = (start, end) => [Number(start.slice(0, 4)), Number(end.slice(0, 4))]
  .filter((y, i, a) => a.indexOf(y) === i).flatMap(cnPeriods).filter(p => p.start <= end && p.end >= start)
/** 今天之后（或正在进行）的下一个披露窗口 */
export const nextCnWindow = today => [Number(today.slice(0, 4)), Number(today.slice(0, 4)) + 1].flatMap(cnPeriods).find(p => p.end >= today)
const periodOfReportDate = rd => cnPeriods(Number(rd.slice(0, 4)) + (rd.endsWith('12-31') ? 1 : 0)).find(p => p.reportDate === rd) ?? null

/** 预约披露一行 → 日期：已披露用实际日；否则用最新预约（变更日优先） */
export function cnAppointDate(r) {
  const actual = day10(r?.ACTUAL_PUBLISH_DATE)
  const changes = [r?.FIRST_CHANGE_DATE, r?.SECOND_CHANGE_DATE, r?.THIRD_CHANGE_DATE].map(day10).filter(Boolean)
  const scheduled = changes.at(-1) ?? day10(r?.APPOINT_PUBLISH_DATE) ?? day10(r?.FIRST_APPOINT_DATE)
  return { date: actual ?? scheduled, actual, firstAppoint: day10(r?.FIRST_APPOINT_DATE), changes: changes.length }
}

const PREDICT_PRIORITY = ['004', '005', '002', '003', '006'] // 归母净利润 > 扣非 > 净利润 > EPS > 营收
/** 业绩预告：同一公司同一报告期只留一行（按指标优先级） */
export function pickForecasts(rows) {
  const best = new Map()
  for (const r of rows ?? []) {
    const key = `${r.SECURITY_CODE}|${day10(r.REPORT_DATE)}`
    const rank = PREDICT_PRIORITY.indexOf(String(r.PREDICT_FINANCE_CODE))
    const old = best.get(key)
    const oldRank = old ? PREDICT_PRIORITY.indexOf(String(old.PREDICT_FINANCE_CODE)) : 99
    const r1 = rank < 0 ? 98 : rank
    if (!old || r1 < oldRank || (r1 === oldRank && String(r.NOTICE_DATE) > String(old.NOTICE_DATE))) best.set(key, r)
  }
  return [...best.values()]
}
const periodFromReportDate = rd => {
  const p = rd ? periodOfReportDate(rd) : null
  return p?.period ?? (rd ? `报告期 ${rd}` : null)
}
export function forecastNotice(r) {
  const rd = day10(r.REPORT_DATE)
  return {
    kind: 'forecast', noticeDate: day10(r.NOTICE_DATE), period: periodFromReportDate(rd), reportDate: rd,
    metric: r.PREDICT_FINANCE ?? null, type: r.PREDICT_TYPE ?? null,
    lower: num(r.PREDICT_AMT_LOWER), upper: num(r.PREDICT_AMT_UPPER), changeLower: pct(num(r.ADD_AMP_LOWER)), changeUpper: pct(num(r.ADD_AMP_UPPER)),
    lastYear: num(r.PREYEAR_SAME_PERIOD), content: String(r.PREDICT_CONTENT ?? '').slice(0, 160) || null, source: 'cnForecast',
  }
}
export function expressNotice(r) {
  const rd = day10(r.REPORT_DATE)
  return {
    kind: 'express', noticeDate: day10(r.NOTICE_DATE), period: periodFromReportDate(rd), reportDate: rd,
    eps: eps(num(r.BASIC_EPS)), revenue: num(r.TOTAL_OPERATE_INCOME), revenueYoY: pct(num(r.YSTZ)),
    netProfit: num(r.PARENT_NETPROFIT), netProfitYoY: pct(num(r.JLRTBZCL)), source: 'cnExpress',
  }
}
/** 业绩报表一行 → 已公布结果（A 股季报没有一致预期，超预期幅度为 null） */
export const cnReportResult = (r, asOf) => r ? {
  epsActual: eps(num(r.BASIC_EPS)), epsEstimate: null, surprisePct: null,
  revenueActual: num(r.TOTAL_OPERATE_INCOME), revenueYoY: pct(num(r.YSTZ)), netProfitYoY: pct(num(r.SJLTZ)),
  revenuePeriodEnd: day10(r.REPORTDATE), currency: 'CNY', asOf, source: 'cnReport',
} : null
/** 机构盈利预测（年度 EPS）：只在年报条目上用；YEARn 与财年一致且标记为 E（预测） */
export function cnConsensus(r, fiscalYear, asOf) {
  if (!r) return null
  for (let i = 1; i <= 4; i++) {
    if (Number(r[`YEAR${i}`]) === fiscalYear && r[`YEAR_MARK${i}`] === 'E' && isNum(num(r[`EPS${i}`]))) {
      return { eps: eps(num(r[`EPS${i}`])), revenue: null, analysts: num(r.RATING_ORG_NUM), revenueAnalysts: null, currency: 'CNY', asOf, source: 'cnConsensus', note: '机构年度 EPS 预测均值；analysts 为给出评级的机构数' }
    }
  }
  return null
}

// ───────── 站内研究摘要（这次要验证什么）─────────
const VERIFY_RE = /财报|业绩|季报|年报|中报|半年报|Q[1-4]|指引|三季|一季|订单|毛利率|营收|收入|利润|EPS|FCF|现金流/i
const ACTION_RE = /下单|买入|加仓|建仓|减仓|止盈|卖出|仓位|介入|分批/
const TEMPLATE_RE = /^评分\s*=|^\[?MISSING/
const SCEN_RE = /Bear \/ Base \/ Bull/
const nums = t => (String(t ?? '').match(/[\d,]+(?:\.\d+)?/g) || []).map(x => Number(x.replace(/,/g, ''))).filter(n => Number.isFinite(n))
const clip = (s, n = 120) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t }

/**
 * 公司研究页 → 页面要用的最小研究摘要；与 CompanyDetail 同一组字段：
 * rating、林奇分类（lynch.json 的 t / r）、三情景（scenarios 或指标「Bear / Base / Bull」）+ 价格锚点（marketRefresh 或指标「价格锚点/收盘价」）、
 * 后续验证（next + calendar，优先与财报相关的条目）与风险首条。
 */
export function researchSummary(c, lynch) {
  if (!c) return null
  const metrics = (c.metrics ?? []).filter(([l]) => !String(l).startsWith('上轮'))
  const metric = re => metrics.find(([l]) => re.test(l))?.[1]
  const priceText = metric(/价格锚点|收盘价|现价/)
  const refresh = c.marketRefresh && c.marketRefresh.tradability !== 'unverified' && isNum(c.marketRefresh.price) ? c.marketRefresh : null
  const price = refresh ? refresh.price : priceText ? nums(priceText)[0] ?? null : null
  const priceDate = refresh?.priceDate ?? (String(priceText ?? '').match(/20\d{2}-\d{2}-\d{2}/)?.[0] ?? null)
  let band = null
  const named = n => c.scenarios?.find(s => n.test(s.name))?.price
  const fromScen = [named(/悲观|熊|Bear/i), named(/基准|中性|Base/i), named(/乐观|牛|Bull/i)].map(p => (p ? nums(p)[0] : undefined))
  const scenText = metric(SCEN_RE)
  const fromMetric = scenText && !/市值/.test(scenText) ? nums(scenText) : []
  const triple = fromScen.every(isNum) ? fromScen : fromMetric.length === 3 ? fromMetric : null
  if (triple && triple[0] <= triple[1] && triple[1] <= triple[2]) band = { bear: triple[0], base: triple[1], bull: triple[2], price: isNum(price) ? price : null, priceDate, currency: refresh?.currency ?? null }
  // 只留“要验证的事实”：去掉操作口令（买入 / 加仓 / 下单…）与评分口径说明；有财报相关条目时只列这些
  const pool = [...(c.calendar ?? []), ...(c.next ?? [])].map(t => clip(t)).filter(t => t && !ACTION_RE.test(t) && !TEMPLATE_RE.test(t))
  const related = pool.filter(t => VERIFY_RE.test(t))
  const verify = (related.length ? related : pool).filter((t, i, a) => a.indexOf(t) === i).slice(0, related.length ? 3 : 2)
  const ly = lynch ?? null
  const asOf = String(c.asOf ?? '').match(/20\d{2}-\d{2}-\d{2}/)?.[0] ?? null
  return {
    rating: c.rating || null,
    lynch: ly?.t ?? null, lynchAttention: ly?.r ?? null,
    scenarios: band, verify, risk: c.risk?.[0] ? clip(c.risk[0]) : null,
    auto: !!c.auto, asOf,
  }
}

// ───────── 条目组装 ─────────
const keyOf = (market, code) => `${market}:${code}`

/** 窗口内 + 稳定排序（日期 → 市场 → 代码） */
export function sortItems(items) {
  const order = { us: 0, ndx: 1, adr: 2, hk: 3, cn: 4 }
  return [...items].sort((a, b) => a.date.localeCompare(b.date) || order[a.market] - order[b.market] || a.code.localeCompare(b.code))
}

/**
 * 某个源这次失败：沿用上一份文件里来自该源、仍在窗口内的条目（原样保留，带原来的 asOf），并去掉与新条目重复的。
 * @returns 合并后的条目
 */
export function carryForward(items, prevItems, failedSources, window) {
  const have = new Set(items.map(i => keyOf(i.market, i.code) + '|' + i.date))
  const haveKey = new Set(items.map(i => keyOf(i.market, i.code)))
  const kept = (prevItems ?? []).filter(p => failedSources.has(p.dateSource) && p.date >= window.start && p.date <= window.end && !have.has(keyOf(p.market, p.code) + '|' + p.date) && !haveKey.has(keyOf(p.market, p.code)))
  return [...items, ...kept.map(p => ({ ...p, carried: true }))]
}

/** Yahoo 这次没取到某家的估算/历史：沿用上次同一条目（同一公司、同一日期）的这些字段 */
export function fillFromPrevious(item, prev) {
  if (!prev || prev.date !== item.date) return item
  const out = { ...item }
  for (const k of ['consensus', 'lastYear', 'history', 'result']) {
    const empty = out[k] == null || (Array.isArray(out[k]) && out[k].length === 0)
    if (empty && prev[k] != null && !(Array.isArray(prev[k]) && prev[k].length === 0)) out[k] = prev[k]
  }
  return out
}

// ───────── 网络 ─────────
async function getText(url, { headers = {} } = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url.slice(0, 80)}`)
  return res.text()
}

/** 东方财富数据中心分页拉取（每页 500 行，最多 maxPages 页，页间节流） */
export async function eastmoneyAll({ reportName, filter, sortColumns, sortTypes = -1, columns = 'ALL', maxPages = 30, fetchText = getText }) {
  const rows = []
  for (let page = 1; page <= maxPages; page++) {
    const q = new URLSearchParams({ reportName, columns, pageSize: '500', pageNumber: String(page), source: 'WEB', client: 'WEB' })
    if (filter) q.set('filter', filter)
    if (sortColumns) { q.set('sortColumns', sortColumns); q.set('sortTypes', String(sortTypes)) }
    const body = JSON.parse(await fetchText(`${URLS.eastmoney}?${q}`, { headers: { Referer: 'https://data.eastmoney.com/' } }))
    if (body?.code === 9201) break // 返回数据为空
    if (!body?.success) throw new Error(`东方财富 ${reportName}：${body?.message ?? '无 success'}`)
    rows.push(...(body.result?.data ?? []))
    if (page >= (body.result?.pages ?? 1)) break
    await sleep(THROTTLE_MS)
  }
  return rows
}
const inList = codes => `(SECURITY_CODE in (${codes.map(c => `"${c}"`).join(',')}))`
async function eastmoneyByCodes(opts, codes) {
  const out = []
  for (let i = 0; i < codes.length; i += 80) {
    out.push(...await eastmoneyAll({ ...opts, filter: `${opts.filter ?? ''}${inList(codes.slice(i, i + 80))}` }))
    await sleep(THROTTLE_MS)
  }
  return out
}

function runYahoo(request) {
  return new Promise((resolvePromise, reject) => {
    const cmd = (process.env.EARNINGS_YF_CMD || `uv run --python 3.12 --with yfinance==1.8.0 python ${YF_SCRIPT}`).split(/\s+/)
    mkdtemp(join(tmpdir(), 'earnings-yf-')).then(async dir => {
      const file = join(dir, 'request.json')
      await writeFile(file, JSON.stringify(request))
      const child = spawn(cmd[0], [...cmd.slice(1), file], { stdio: ['ignore', 'pipe', 'pipe'] })
      let out = '', errTail = ''
      const timer = setTimeout(() => child.kill('SIGKILL'), YF_TIMEOUT_MS)
      child.stdout.on('data', d => { out += d })
      child.stderr.on('data', d => { errTail = (errTail + d).slice(-2000) })
      child.on('error', e => { clearTimeout(timer); rm(dir, { recursive: true, force: true }); reject(e) })
      child.on('close', code => {
        clearTimeout(timer)
        rm(dir, { recursive: true, force: true })
        if (code !== 0) return reject(new Error(`yfinance 采集退出码 ${code}：${errTail.split('\n').filter(Boolean).at(-1) ?? ''}`))
        try { resolvePromise(JSON.parse(out)) } catch (e) { reject(new Error(`yfinance 输出不是 JSON：${errText(e)}`)) }
      })
    }, reject)
  })
}

// ───────── 公司库（与 UI 同一合并口径）─────────
async function loadLibrary() {
  const { build } = await import('esbuild')
  const entry = `
    import { resolveMarket } from './companyCore'
    export async function collect(markets, readJson) {
      const out = []
      for (const m of markets) { const r = await resolveMarket(m); for (const c of r.merge(readJson(m))) out.push(c) }
      return out
    }`
  const res = await build({
    stdin: { contents: entry, resolveDir: join(ROOT, 'src/data'), loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent',
    define: { 'import.meta.env': '{"BASE_URL":"/"}' },
  })
  const dir = await mkdtemp(join(tmpdir(), 'earnings-lib-'))
  try {
    const file = join(dir, 'bundle.mjs')
    await writeFile(file, res.outputFiles[0].text)
    const { collect } = await import(pathToFileURL(file).href)
    const jsonOf = {}
    for (const m of MARKETS) { try { jsonOf[m] = JSON.parse(await readFile(join(ROOT, 'public/data', `${m}.json`), 'utf8')) } catch { jsonOf[m] = [] } }
    const list = await collect(MARKETS, m => jsonOf[m])
    const map = new Map()
    for (const c of list) if (c?.code && MARKETS.includes(c.market) && !map.has(keyOf(c.market, c.code))) map.set(keyOf(c.market, c.code), c)
    let lynch = {}
    try { lynch = JSON.parse(await readFile(join(ROOT, 'public/data/lynch.json'), 'utf8')) } catch { /* 没有林奇数据就不写 */ }
    return { map, lynch }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
const lynchOf = (lynch, c) => (c.market === 'ndx' ? lynch[`ndx:${c.code}`] ?? lynch[`us:${c.code}`] ?? lynch[`adr:${c.code}`] : lynch[keyOf(c.market, c.code)])

// ───────── 主流程 ─────────
function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--today') out.today = argv[++i]
    else if (argv[i] === '--yf-json') out.yfJson = argv[++i]
    else if (argv[i] === '--skip-yahoo') out.skipYahoo = true
    else if (argv[i] === '--out') out.out = argv[++i]
    else if (argv[i] === '--refresh-research') out.refreshResearch = true
  }
  return out
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  const today = args.today && DAY_RE.test(args.today) ? args.today : beijingToday()
  const window = { start: addDays(today, -PAST_DAYS), end: addDays(today, AHEAD_DAYS) }
  const outFile = args.out ? resolve(args.out) : OUT_FILE
  const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  let prev = null
  try { prev = JSON.parse(await readFile(outFile, 'utf8')) } catch { /* 首次生成 */ }
  const prevItems = Array.isArray(prev?.items) ? prev.items : []
  const prevByKey = new Map(prevItems.map(p => [keyOf(p.market, p.code), p]))
  const sources = {}
  const ok = (id, extra = {}) => { sources[id] = { ok: true, fetchedAt: nowIso, error: null, ...extra } }
  const fail = (id, e) => {
    sources[id] = { ok: false, fetchedAt: prev?.sources?.[id]?.fetchedAt ?? null, error: errText(e) }
    console.warn(`[earnings] ${SOURCE_LABEL[id]} 失败：${errText(e)}`)
  }

  const { map: library, lynch } = await loadLibrary()
  const research = c => researchSummary(c, lynchOf(lynch, c))
  if (args.refreshResearch) {
    // 只按当前公司库重算站内研究摘要（研究页更新后用），不访问任何外部数据源
    if (!prev) throw new Error('没有已有的 earnings-calendar.json')
    const again = x => { const c = library.get(keyOf(x.market, x.code)); return c ? { ...x, research: research(c) } : x }
    const out = { ...prev, items: prevItems.map(again), cnNotices: (prev.cnNotices ?? []).map(again) }
    console.log(`[earnings] 已重算研究摘要：${writeJsonIfChanged(outFile, out) ? '已写入' : '内容未变'}`)
    return out
  }
  const base = c => ({ market: c.market, code: c.code, name: c.name })
  const items = []

  // ── 美股 + 港股：Yahoo ──
  const usLib = [...library.values()].filter(c => ['us', 'ndx', 'adr'].includes(c.market))
  const hkLib = [...library.values()].filter(c => c.market === 'hk')
  const bySymbol = new Map([...usLib, ...hkLib].map(c => [yahooSymbol(c.market, c.code), c]))
  let yf = null
  if (args.yfJson) yf = JSON.parse(await readFile(resolve(args.yfJson), 'utf8'))
  else if (!args.skipYahoo) {
    try {
      const deep = prevItems.filter(p => p.dateSource === 'yahoo' || p.market === 'hk').filter(p => p.date >= window.start && p.date <= window.end).map(p => yahooSymbol(p.market, p.code)).filter(Boolean)
      yf = await runYahoo({ start: window.start, end: window.end, us: usLib.map(c => yahooSymbol(c.market, c.code)), hk: hkLib.map(c => yahooSymbol(c.market, c.code)), deep: [...new Set(deep)] })
    } catch (e) { fail('yahoo', e) }
  }
  const yahooAsOf = yf?.fetchedAt ? zoned(yf.fetchedAt, 'Asia/Shanghai').day : today
  if (yf) {
    if (yf.calendar?.ok) ok('yahoo', { fetchedAt: yf.fetchedAt ?? nowIso, version: yf.yfinance ?? null, tickers: Object.keys(yf.tickers ?? {}).length })
    else fail('yahoo', new Error(yf.calendar?.error || '财报日历不可用'))
    const seen = new Set()
    for (const row of [...(yf.calendar?.rows ?? [])].sort((a, b) => String(a.start).localeCompare(String(b.start)))) {
      const c = bySymbol.get(row.symbol)
      const d = usDateFromRow(row)
      if (!c || !d || d.date < window.start || d.date > window.end) continue
      const k = keyOf(c.market, c.code)
      if (seen.has(k)) continue // 同一家窗口内只取最近一次（日历按日期排序后的第一条）
      seen.add(k)
      const t = yf.tickers?.[row.symbol]
      const fields = yahooFields(t, { date: d.date, today, asOf: yahooAsOf, calendarRow: row })
      const item = {
        ...base(c), date: d.date, time: d.time, confirmed: confirmedOf(t?.info), dateSource: 'yahoo', period: d.period,
        consensus: fields.consensus ?? null, lastYear: fields.lastYear ?? null, history: fields.history, result: fields.result ?? null,
        marketCap: isNum(t?.info?.marketCap) ? { value: t.info.marketCap, currency: t.info.currency ?? 'USD' } : isNum(row.marketCap) ? { value: Math.round(row.marketCap), currency: 'USD' } : null,
        research: research(c), asOf: yahooAsOf,
      }
      items.push(t && !t.errors?.length ? item : fillFromPrevious(item, prevByKey.get(k)))
    }
  }

  // ── 港股：披露易董事会会议通告（官方会议日）优先，Yahoo 补充 ──
  let bmn = null
  try {
    bmn = parseHkexBoardMeetings(await getText(URLS.hkex))
    if (!bmn.length) throw new Error('董事会会议通告表为空或格式变化')
    ok('hkex', { rows: bmn.length })
  } catch (e) { fail('hkex', e) }
  const hkByCode = new Map(hkLib.map(c => [c.code, c]))
  const hkDone = new Set()
  for (const r of bmn ?? []) {
    const c = hkByCode.get(r.code)
    const p = hkPeriodLabel(r.purpose, r.period)
    if (!c || !p || r.date < window.start || r.date > window.end || hkDone.has(c.code)) continue
    hkDone.add(c.code)
    const t = yf?.tickers?.[yahooSymbol('hk', c.code)]
    const fields = t ? yahooFields(t, { date: r.date, today, asOf: yahooAsOf }) : {}
    items.push(fillFromPrevious({
      ...base(c), date: r.date, time: 'unknown', confirmed: true, dateSource: 'hkex', period: p.label, periodEnd: p.periodEnd,
      consensus: fields.consensus ?? null, lastYear: fields.lastYear ?? null, history: fields.history ?? [], result: fields.result ?? null,
      marketCap: isNum(t?.info?.marketCap) ? { value: t.info.marketCap, currency: t.info.currency ?? 'HKD' } : null,
      research: research(c), asOf: today, note: '董事会会议日；业绩公告通常于会议当日或次日发布',
    }, prevByKey.get(keyOf(c.market, c.code))))
  }
  if (yf) {
    for (const c of hkLib) {
      if (hkDone.has(c.code)) continue
      const sym = yahooSymbol('hk', c.code)
      const t = yf.tickers?.[sym]
      const ts = t?.info?.earningsTimestamp
      const z = isNum(ts) ? zoned(ts, 'Asia/Hong_Kong') : null
      if (!z || z.day < window.start || z.day > window.end) continue
      const confirmed = confirmedOf(t.info)
      const fields = yahooFields(t, { date: z.day, today, asOf: yahooAsOf })
      items.push(fillFromPrevious({
        ...base(c), date: z.day, time: hkTime(ts, confirmed === true), confirmed, dateSource: 'yahoo', period: null,
        consensus: fields.consensus ?? null, lastYear: fields.lastYear ?? null, history: fields.history, result: fields.result ?? null,
        marketCap: isNum(t.info.marketCap) ? { value: t.info.marketCap, currency: t.info.currency ?? 'HKD' } : null,
        research: research(c), asOf: yahooAsOf,
      }, prevByKey.get(keyOf(c.market, c.code))))
    }
  }

  // ── A 股：预约披露 → 条目；业绩报表 → 已公布结果；盈利预测 → 年报一致预期 ──
  const cnLib = new Map([...library.values()].filter(c => c.market === 'cn').map(c => [c.code, c]))
  const periods = cnPeriodsForWindow(window.start, window.end)
  const cnItems = []
  try {
    for (const p of periods) {
      const rows = await eastmoneyAll({ reportName: 'RPT_PUBLIC_BS_APPOIN', filter: `(REPORT_DATE='${p.reportDate}')`, sortColumns: 'SECURITY_CODE', sortTypes: 1 })
      for (const r of rows) {
        const c = cnLib.get(String(r.SECURITY_CODE))
        const d = cnAppointDate(r)
        if (!c || !d.date || d.date < window.start || d.date > window.end) continue
        cnItems.push({
          ...base(c), date: d.date, time: 'offhours', confirmed: true, dateSource: 'cnAppoint', period: p.period, periodEnd: p.reportDate,
          consensus: null, lastYear: null, history: [], result: null, marketCap: null, research: research(c), asOf: today,
          appoint: { first: d.firstAppoint, changes: d.changes, actual: d.actual },
        })
      }
      await sleep(THROTTLE_MS)
    }
    ok('cnAppoint', { periods: periods.map(p => p.period) })
  } catch (e) { fail('cnAppoint', e) }
  const reported = cnItems.filter(i => i.appoint.actual && i.appoint.actual <= today)
  if (reported.length) {
    try {
      const byPeriod = new Map()
      for (const i of reported) byPeriod.set(i.periodEnd, [...(byPeriod.get(i.periodEnd) ?? []), i.code])
      const rows = []
      for (const [rd, codes] of byPeriod) rows.push(...await eastmoneyByCodes({ reportName: 'RPT_LICO_FN_CPD', filter: `(REPORTDATE='${rd}')` }, codes))
      const at = new Map(rows.map(r => [`${r.SECURITY_CODE}|${day10(r.REPORTDATE)}`, r]))
      for (const i of reported) i.result = cnReportResult(at.get(`${i.code}|${i.periodEnd}`), today)
      ok('cnReport', { rows: rows.length })
    } catch (e) { fail('cnReport', e) }
  }
  const annual = cnItems.filter(i => /^FY\d{4}$/.test(i.period) && !i.result)
  if (annual.length) {
    try {
      const rows = await eastmoneyByCodes({ reportName: 'RPT_WEB_RESPREDICT' }, [...new Set(annual.map(i => i.code))])
      const by = new Map(rows.map(r => [String(r.SECURITY_CODE), r]))
      for (const i of annual) i.consensus = cnConsensus(by.get(i.code), Number(i.period.slice(2)), today)
      ok('cnConsensus', { rows: rows.length })
    } catch (e) { fail('cnConsensus', e) }
  }
  items.push(...cnItems.map(({ appoint, ...i }) => ({ ...i, appoint })))

  // ── A 股业绩预告 / 快报（最近 45 天）──
  const since = addDays(today, -NOTICE_DAYS)
  let notices = []
  for (const [id, reportName, pick, toNotice] of [
    ['cnForecast', 'RPT_PUBLIC_OP_NEWPREDICT', pickForecasts, forecastNotice],
    ['cnExpress', 'RPT_FCI_PERFORMANCEE', rows => rows, expressNotice],
  ]) {
    try {
      const rows = await eastmoneyAll({ reportName, filter: `(NOTICE_DATE>='${since}')`, sortColumns: 'NOTICE_DATE', sortTypes: -1, maxPages: 20 })
      for (const r of pick(rows.filter(r => cnLib.has(String(r.SECURITY_CODE))))) {
        const c = cnLib.get(String(r.SECURITY_CODE))
        notices.push({ ...base(c), ...toNotice(r), research: research(c) })
      }
      ok(id, { rows: rows.length })
    } catch (e) {
      fail(id, e)
      notices.push(...(prev?.cnNotices ?? []).filter(n => n.source === id && n.noticeDate >= since))
    }
  }
  notices = notices.filter(n => n.noticeDate).sort((a, b) => b.noticeDate.localeCompare(a.noticeDate) || a.code.localeCompare(b.code) || a.kind.localeCompare(b.kind))

  // ── 失败源沿用上次条目 ──
  const failed = new Set(Object.entries(sources).filter(([, s]) => !s.ok).map(([id]) => id))
  if (args.skipYahoo && !args.yfJson) failed.add('yahoo')
  const merged = sortItems(carryForward(items, prevItems, failed, window))
  const next = nextCnWindow(today)
  const out = {
    schemaVersion: 1,
    generatedAt: nowIso,
    today,
    window,
    sources: Object.fromEntries(Object.keys(SOURCE_LABEL).map(id => [id, { label: SOURCE_LABEL[id], url: id === 'yahoo' ? URLS.yahoo : id === 'hkex' ? URLS.hkex : URLS.eastmoney, ...(sources[id] ?? (prev?.sources?.[id] ? { ...prev.sources[id], skipped: true } : { ok: null, fetchedAt: null, error: '本次未运行（窗口内没有需要该源的条目）' })) }])),
    seasons: {
      cn: { next: next ?? null, rule: '沪深定期报告法定披露期：年报次年 1–4 月、一季报 4 月、半年报 7–8 月、三季报 10 月；预约披露表通常在窗口开始前数周发布。' },
      hk: { rule: '港股主板：全年业绩须在财年结束后 3 个月内、中期业绩在半年结束后 2 个月内公布（12 月年结公司对应 3 月底与 8 月底）；披露易只列已通告的董事会会议。' },
    },
    items: merged,
    cnNotices: notices,
  }
  const changed = writeJsonIfChanged(outFile, out)
  const by = m => merged.filter(i => i.market === m).length
  console.log(`[earnings] ${changed ? '已写入' : '内容未变'} ${outFile.replace(ROOT + '/', '')}：${merged.length} 条（us ${by('us')} / ndx ${by('ndx')} / adr ${by('adr')} / hk ${by('hk')} / cn ${by('cn')}），A 股预告/快报 ${notices.length} 条；失败源：${[...failed].join('、') || '无'}`)
  return out
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(e => { console.error(`[earnings] 生成失败，保留现有文件：${errText(e)}`); process.exitCode = 1 })
}
