// 同花顺「数据中心」页签数据：每个交易日盘后运行（.github/workflows/ths-tabs.yml），生成 public/data/ths-tab-datacenter.json。
// 来源：东方财富数据中心公开报表（新股申购、限售解禁、股东增减持、中登质押统计、商誉、股票回购）+ 东方财富日 K（push2his，带日期）。
// 数据日期 asOf：交易日 15:30 后为当天，否则为上一个交易日；上证指数日 K 里还没有 asOf 这根时不写文件、正常退出。
// 公告类报表只取公告日 ≤ asOf 的记录（晚间发布、日期记为次日的公告下一次运行再计入）。任一报表失败时整份不写，保留上一份。
// 摘要历史：data-raw/ths-tab-datacenter/history.json（每个数据日期一条，同日覆盖）。可重复运行。
// 研报评级（东方财富研报列表 reportapi.eastmoney.com/report/list）：原始日文件 data-raw/ths-tab-datacenter/reports/YYYY-MM-DD.json，
// 每次重取最近 7 天、补齐 30 日窗口里缺的天；这一段失败时只把 reports 记为 null + 原因（同一数据日期已有的保留），不影响其他板块。
// 用法：node scripts/ths-datacenter.mjs   （AS_OF=YYYY-MM-DD 可指定数据日期，只用于排查）
import fs from 'node:fs'
import path from 'node:path'
import { addDays, aimCodes, buildBuyback, buildReports, groupReports, okDayFile, pickReportDay, reportDayFile, reportFetchRange, staleReportFiles, withUpside, buildCalendar, buildGoodwill, buildHolders, buildLift, buildPledge, buildSubNew, checkComplete, closeOn, GOODWILL_LINES, latestPeriod, mergeHistory, parseKline, PLEDGE_LINES, secidOf, shouldReplace, SUBNEW_DAYS, targetDay, WINDOW } from './ths-datacenter-lib.mjs'

const OUT = 'public/data/ths-tab-datacenter.json'
const RAW = 'data-raw/ths-tab-datacenter'
const HIST = path.join(RAW, 'history.json')
const REP_DIR = path.join(RAW, 'reports')
const API = 'https://datacenter-web.eastmoney.com/api/data/v1/get'
const REPORT_API = 'https://reportapi.eastmoney.com/report/list'
const KLINE = 'https://push2his.eastmoney.com/api/qt/stock/kline/get'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
const TOP = 50

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function getJson(url) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, referer: 'https://data.eastmoney.com/' }, signal: AbortSignal.timeout(15000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (e) {
      if (attempt >= 2) throw e
      await sleep(1500 * (attempt + 1))
    }
  }
}

/** 取报表：all=true 时分页取完整张并校验行数；否则只取第一页（排行 Top N）。返回 {rows, count} */
async function report(reportName, { filter = '', sort, dir = '-1', pageSize = 500, all = true }) {
  const rows = []
  let count = null
  for (let page = 1; ; page++) {
    const q = new URLSearchParams({ reportName, columns: 'ALL', pageSize: String(pageSize), pageNumber: String(page), sortColumns: sort, sortTypes: sort.split(',').map(() => dir).join(','), filter, source: 'WEB', client: 'WEB' })
    const body = await getJson(`${API}?${q}`)
    if (body?.code === 9201 || (body?.success === false && /为空/.test(body?.message ?? ''))) return { rows: [], count: 0 }
    if (!body?.success || !Array.isArray(body?.result?.data)) throw new Error(`${reportName} 返回异常：${body?.message ?? '无结果'}`)
    count ??= body.result.count
    rows.push(...body.result.data)
    if (!all || page >= body.result.pages) break
    await sleep(250)
  }
  return { rows: all ? checkComplete(rows, count, reportName) : rows, count }
}
const countOf = async (reportName, filter, sort) => (await report(reportName, { filter, sort, pageSize: 1, all: false })).count

/** 并发取日 K；失败的记为 null（页面显示「—」），不中断整体 */
async function klines(items, fqt, lmtOf, asOf) {
  const out = new Map()
  const queue = [...items]
  const end = asOf.replaceAll('-', '')
  async function worker() {
    for (let it; (it = queue.shift());) {
      const q = new URLSearchParams({ secid: it.secid, fields1: 'f1,f2,f3', fields2: 'f51,f53', klt: '101', fqt: String(fqt), end, lmt: String(lmtOf(it)) })
      try { out.set(it.code, parseKline(await getJson(`${KLINE}?${q}`), asOf)) } catch { out.set(it.code, null) }
      await sleep(80)
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  return out
}
const uniq = (xs) => [...new Map(xs.map((x) => [x.code, x])).values()]

const bj = new Date(Date.now() + 8 * 3600_000)
const today = bj.toISOString().slice(0, 10)
const asOf = process.env.AS_OF || targetDay(today, bj.getUTCHours() * 60 + bj.getUTCMinutes())

// 1) 上证指数日 K 必须已有 asOf 这根
const idx = parseKline(await getJson(`${KLINE}?${new URLSearchParams({ secid: '1.000001', fields1: 'f1', fields2: 'f51,f53', klt: '101', fqt: '0', end: asOf.replaceAll('-', ''), lmt: '5' })}`), asOf)
if (closeOn(idx, asOf) === null) { console.log(`${asOf} 日 K 尚未生成，不写文件`); process.exit(0) }

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }
const published = readJson(OUT)

/* ---------- 研报评级（独立一段：失败不影响其他板块） ---------- */
/** 研报列表分页取完：pageSize 上限 100；返回 {rows, hits}，行数校验在 groupReports 里做 */
async function reportList(qType, from, to) {
  const rows = []
  let hits = null
  for (let page = 1; ; page++) {
    const q = new URLSearchParams({ industryCode: '*', pageSize: '100', industry: '*', rating: '*', ratingChange: '*', beginTime: from, endTime: to, pageNo: String(page), fields: '', qType: String(qType), orgCode: '', code: '*', rcode: '' })
    const body = await getJson(`${REPORT_API}?${q}`)
    if (!Array.isArray(body?.data) || !Number.isInteger(body?.hits)) throw new Error(`研报列表返回异常（qType=${qType}）`)
    hits ??= body.hits
    rows.push(...body.data)
    if (page >= (body.TotalPage ?? 0) || !body.data.length) break
    if (page >= 60) throw new Error('研报列表页数异常')
    await sleep(200)
  }
  return { rows, hits }
}
async function buildReportSection() {
  const t0 = Date.now()
  const repToday = process.env.AS_OF || today
  const repMinutes = process.env.AS_OF ? 24 * 60 : bj.getUTCHours() * 60 + bj.getUTCMinutes()
  fs.mkdirSync(REP_DIR, { recursive: true })
  const dayFiles = new Map()
  for (const n of fs.readdirSync(REP_DIR)) {
    if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(n)) continue
    const f = readJson(path.join(REP_DIR, n))
    if (okDayFile(f) && f.date === n.slice(0, 10) && f.date <= repToday) dayFiles.set(f.date, f)
  }
  const { from, to } = reportFetchRange(new Set(dayFiles.keys()), repToday)
  const st = await reportList(0, from, to)
  const ind = await reportList(1, from, to)
  const sg = groupReports(st.rows, st.hits, from, to, 'stock')
  const ig = groupReports(ind.rows, ind.hits, from, to, 'industry')
  const now = new Date().toISOString()
  let changed = 0
  for (const d of sg.keys()) {
    const next = reportDayFile(d, sg.get(d), ig.get(d), now)
    const prev = dayFiles.get(d)
    // 内容没变不改文件（fetchedAt 保留上次），避免每次运行都产生提交
    if (prev && JSON.stringify(prev.stock) === JSON.stringify(next.stock) && JSON.stringify(prev.industry) === JSON.stringify(next.industry)) continue
    fs.writeFileSync(path.join(REP_DIR, `${d}.json`), JSON.stringify(next))
    dayFiles.set(d, next)
    changed++
  }
  if (from < addDays(repToday, -6) && !readJson(path.join(REP_DIR, 'seed.json'))) fs.writeFileSync(path.join(REP_DIR, 'seed.json'), JSON.stringify({ from, to, at: now }))
  for (const n of staleReportFiles(fs.readdirSync(REP_DIR), repToday)) fs.unlinkSync(path.join(REP_DIR, n))
  const day = pickReportDay(dayFiles, repToday, repMinutes)
  if (!day) throw new Error('近 30 日没有个股研报')
  let section = buildReports(dayFiles, day, repToday)
  // 目标价空间：只对有目标价的个股取 asOf 日 K 收盘（不复权，与目标价同口径）
  const codes = aimCodes(section)
  const bars = await klines(codes.map((code) => ({ code, secid: secidOf('', code) })), 0, () => 5, asOf)
  section = withUpside(section, new Map(codes.map((c) => [c, closeOn(bars.get(c), asOf)])), asOf)
  const seed = readJson(path.join(REP_DIR, 'seed.json'))
  console.log(`研报：取 ${from}~${to}（个股 ${st.hits}、行业 ${ind.hits}），改写 ${changed} 个日文件；统计日 ${day}，目标价收盘 ${codes.length} 只，用时 ${Math.round((Date.now() - t0) / 1000)} 秒`)
  return { ...section, seed: seed?.from ? { from: seed.from, to: seed.to } : null }
}
let reports = null
let reportsError = null
try {
  reports = await buildReportSection()
} catch (e) {
  console.log(`研报评级获取失败：${e.message}`)
  if (published?.reports && published.asOf === asOf) reports = published.reports
  else reportsError = `研报列表获取失败（${e.message}）`
}
/** 其他板块不重写时，只把新的研报评级合进已发布的文件 */
function patchReports() {
  if (!published || !reports || JSON.stringify(published.reports) === JSON.stringify(reports)) return
  fs.writeFileSync(OUT, JSON.stringify({ ...published, reports, reportsError: null, sources: mergeSources(published.sources) }))
  console.log(`已更新研报评级（统计日 ${reports.day}），其他板块保持不变`)
}
const REPORT_SOURCE = { id: 'reports', label: '东方财富 · 研报中心（个股研报、行业研报）', url: 'https://data.eastmoney.com/report/' }
const mergeSources = (xs) => [...(xs ?? []).filter((x) => x.id !== 'reports'), REPORT_SOURCE]

let out
try {
  // 2) 新股：申购日历 + 次新股（上市不满一年）
  const ipoCal = await report('RPTA_APP_IPOAPPLY', { filter: `(APPLY_DATE>='${addDays(asOf, -WINDOW)}')`, sort: 'APPLY_DATE' })
  const ipoSub = await report('RPTA_APP_IPOAPPLY', { filter: `(LISTING_DATE>'${addDays(asOf, -SUBNEW_DAYS)}')(LISTING_DATE<='${asOf}')`, sort: 'LISTING_DATE' })
  // 3) 解禁：未来 30 日、近 30 日
  const liftUp = await report('RPT_LIFT_STAGE', { filter: `(FREE_DATE>'${asOf}')(FREE_DATE<='${addDays(asOf, WINDOW)}')`, sort: 'FREE_DATE', dir: '1' })
  const liftPast = await report('RPT_LIFT_STAGE', { filter: `(FREE_DATE>='${addDays(asOf, -WINDOW + 1)}')(FREE_DATE<='${asOf}')`, sort: 'FREE_DATE' })
  // 4) 增减持（公告日近 30 日）
  const holders = await report('RPT_SHARE_HOLDER_INCREASE', { filter: `(NOTICE_DATE>='${addDays(asOf, -WINDOW + 1)}')(NOTICE_DATE<='${asOf}')`, sort: 'NOTICE_DATE' })
  // 5) 质押：最新一期统计日（≤ asOf）
  const pd = (await report('RPT_CSDC_LIST', { filter: `(TRADE_DATE<='${asOf}')`, sort: 'TRADE_DATE', pageSize: 1, all: false })).rows[0]?.TRADE_DATE?.slice(0, 10)
  if (!pd || pd < addDays(asOf, -14)) throw new Error(`质押统计日期过旧（${pd}）`)
  const pledgeTop = await report('RPT_CSDC_LIST', { filter: `(TRADE_DATE='${pd}')`, sort: 'PLEDGE_RATIO', pageSize: TOP, all: false })
  const pledgeCounts = {}
  for (const line of PLEDGE_LINES) pledgeCounts[line] = await countOf('RPT_CSDC_LIST', `(TRADE_DATE='${pd}')(PLEDGE_RATIO>=${line})`, 'PLEDGE_RATIO')
  // 6) 商誉：最近一个披露截止日已过的报告期
  const period = latestPeriod(asOf)
  const gwTop = await report('RPT_GOODWILL_STOCKDETAILS', { filter: `(REPORT_DATE='${period}')(SUMSHEQUITY>0)`, sort: 'SUMSHEQUITY_RATIO', pageSize: TOP, all: false })
  if (gwTop.count < 1000) throw new Error(`商誉报告期 ${period} 只有 ${gwTop.count} 家`)
  const gwCounts = {}
  for (const line of GOODWILL_LINES) gwCounts[line] = await countOf('RPT_GOODWILL_STOCKDETAILS', `(REPORT_DATE='${period}')(SUMSHEQUITY>0)(SUMSHEQUITY_RATIO>=${line / 100})`, 'SUMSHEQUITY_RATIO')
  const gwNeg = await countOf('RPT_GOODWILL_STOCKDETAILS', `(REPORT_DATE='${period}')(SUMSHEQUITY<=0)`, 'SUMSHEQUITY_RATIO')
  // 7) 回购（最新公告日近 30 日）
  const buyback = await report('RPTA_WEB_GETHGLIST_NEW', { filter: `(UPD>='${addDays(asOf, -WINDOW + 1)}')(UPD<='${asOf}')`, sort: 'UPD' })

  // 日 K：次新股用后复权（首日收盘为原始价）；解禁用前复权（最新一根即原始收盘）
  const subItems = uniq(ipoSub.rows.filter((r) => /^\d{6}$/.test(r.SECURITY_CODE)).map((r) => ({ code: r.SECURITY_CODE, secid: secidOf(r.SECUCODE, r.SECURITY_CODE), lmt: 260 })))
  const liftItems = uniq([...liftUp.rows, ...liftPast.rows].filter((r) => /^\d{6}$/.test(r.SECURITY_CODE)).map((r) => ({ code: r.SECURITY_CODE, secid: secidOf(r.SECUCODE, r.SECURITY_CODE) })))
  const subBars = await klines(subItems, 2, (it) => it.lmt, asOf)
  const liftBars = await klines(liftItems, 1, () => 40, asOf)
  const missK = [...subBars.values(), ...liftBars.values()].filter((v) => v === null).length
  if (missK > (subItems.length + liftItems.length) * 0.1) throw new Error(`日 K 失败过多（${missK}）`)
  const quality = { klineMiss: missK, klineTotal: subItems.length + liftItems.length }
  // 同一天已有更完整的一份（日 K 失败更少）、或已发布更晚的日期时，不覆盖（也不改历史）
  if (!shouldReplace(published, { asOf, quality })) {
    console.log(`保留已发布的 ${published.asOf}（日 K 缺 ${published.quality?.klineMiss ?? '?'}），本次 ${asOf} 日 K 缺 ${missK}，不替换`)
    patchReports()
    process.exit(0)
  }

  const subNew = buildSubNew(ipoSub.rows, subBars, asOf)
  const recent = subNew.rows.filter((r) => r.listDate >= addDays(asOf, -WINDOW + 1))
  const lift = buildLift(liftUp.rows, liftPast.rows, liftBars, asOf)
  const hold = buildHolders(holders.rows, asOf)
  const pledge = buildPledge(pledgeTop.rows, pd, pledgeCounts, pledgeTop.count)
  const goodwill = buildGoodwill(gwTop.rows, period, gwCounts, gwTop.count + gwNeg, gwNeg)
  const bb = buildBuyback(buyback.rows, asOf)

  const day = {
    date: asOf, subNew: subNew.valid, brokeRate: subNew.brokeRate, medianCum: subNew.medianCum,
    liftCount: lift.upcoming.count, liftCap: lift.upcoming.cap, holderInc: hold.incAmount, holderDec: hold.decAmount,
    buybackCount: bb.count, pledge50: pledgeCounts[50],
  }
  const prevHist = (() => { try { return JSON.parse(fs.readFileSync(HIST, 'utf8')) } catch { return [] } })()
  const history = mergeHistory(prevHist, day)
  out = {
    version: 1, generatedAt: new Date().toISOString(), asOf, quality,
    note: '盘后整理的公开披露数据，只列客观数值与阈值说明，不做评级，不构成投资建议。',
    ipo: { calendar: buildCalendar(ipoCal.rows, asOf), recent, subNew },
    lift, holders: hold, pledge, goodwill, buyback: bb, history, reports, reportsError,
    sources: [
      { id: 'ipo', label: '东方财富数据中心 · 新股申购与中签', url: 'https://data.eastmoney.com/xg/xg/default.html' },
      { id: 'lift', label: '东方财富数据中心 · 限售股解禁', url: 'https://data.eastmoney.com/dxf/default.html' },
      { id: 'holders', label: '东方财富数据中心 · 股东增减持', url: 'https://data.eastmoney.com/executive/gdzjc.html' },
      { id: 'pledge', label: '东方财富数据中心 · 股权质押（中登公司周统计）', url: 'https://data.eastmoney.com/gpzy/' },
      { id: 'goodwill', label: '东方财富数据中心 · 商誉', url: 'https://data.eastmoney.com/sy/' },
      { id: 'buyback', label: '东方财富数据中心 · 股票回购', url: 'https://data.eastmoney.com/gphg/' },
      { id: 'kline', label: '东方财富日 K（push2his，前/后复权收盘价）', url: 'https://quote.eastmoney.com/' },
      REPORT_SOURCE,
    ],
  }
  fs.mkdirSync(RAW, { recursive: true })
  fs.writeFileSync(HIST, JSON.stringify(history))
} catch (e) {
  console.log(`获取失败，保留上一份数据：${e.message}`)
  patchReports()
  process.exit(0)
}
fs.writeFileSync(OUT, JSON.stringify(out))
console.log(JSON.stringify({
  asOf, calendar: out.ipo.calendar.length, subNew: out.ipo.subNew.count, broke: out.ipo.subNew.brokeRate, liftUp: out.lift.upcoming.count, liftPast: out.lift.past.count,
  holders: out.holders.count, pledgeDate: out.pledge.date, goodwill: out.goodwill.period, buyback: out.buyback.count, reportDay: out.reports?.day ?? null, bytes: fs.statSync(OUT).size,
}))
