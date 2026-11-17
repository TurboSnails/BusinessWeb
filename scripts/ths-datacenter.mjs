// 同花顺「数据中心」页签数据：每个交易日盘后运行（.github/workflows/ths-tabs.yml），生成 public/data/ths-tab-datacenter.json。
// 来源：东方财富数据中心公开报表（新股申购、限售解禁、股东增减持、中登质押统计、商誉、股票回购）+ 东方财富日 K（push2his，带日期）。
// 数据日期 asOf：交易日 15:30 后为当天，否则为上一个交易日；上证指数日 K 里还没有 asOf 这根时不写文件、正常退出。
// 公告类报表只取公告日 ≤ asOf 的记录（晚间发布、日期记为次日的公告下一次运行再计入）。任一报表失败时整份不写，保留上一份。
// 摘要历史：data-raw/ths-tab-datacenter/history.json（每个数据日期一条，同日覆盖）。可重复运行。
// 用法：node scripts/ths-datacenter.mjs   （AS_OF=YYYY-MM-DD 可指定数据日期，只用于排查）
import fs from 'node:fs'
import path from 'node:path'
import { addDays, buildBuyback, buildCalendar, buildGoodwill, buildHolders, buildLift, buildPledge, buildSubNew, checkComplete, closeOn, GOODWILL_LINES, latestPeriod, mergeHistory, parseKline, PLEDGE_LINES, secidOf, SUBNEW_DAYS, targetDay, WINDOW } from './ths-datacenter-lib.mjs'

const OUT = 'public/data/ths-tab-datacenter.json'
const RAW = 'data-raw/ths-tab-datacenter'
const HIST = path.join(RAW, 'history.json')
const API = 'https://datacenter-web.eastmoney.com/api/data/v1/get'
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
    version: 1, generatedAt: new Date().toISOString(), asOf,
    note: '盘后整理的公开披露数据，只列客观数值与阈值说明，不做评级，不构成投资建议。',
    ipo: { calendar: buildCalendar(ipoCal.rows, asOf), recent, subNew },
    lift, holders: hold, pledge, goodwill, buyback: bb, history,
    sources: [
      { id: 'ipo', label: '东方财富数据中心 · 新股申购与中签', url: 'https://data.eastmoney.com/xg/xg/default.html' },
      { id: 'lift', label: '东方财富数据中心 · 限售股解禁', url: 'https://data.eastmoney.com/dxf/default.html' },
      { id: 'holders', label: '东方财富数据中心 · 股东增减持', url: 'https://data.eastmoney.com/executive/gdzjc.html' },
      { id: 'pledge', label: '东方财富数据中心 · 股权质押（中登公司周统计）', url: 'https://data.eastmoney.com/gpzy/' },
      { id: 'goodwill', label: '东方财富数据中心 · 商誉', url: 'https://data.eastmoney.com/sy/' },
      { id: 'buyback', label: '东方财富数据中心 · 股票回购', url: 'https://data.eastmoney.com/gphg/' },
      { id: 'kline', label: '东方财富日 K（push2his，前/后复权收盘价）', url: 'https://quote.eastmoney.com/' },
    ],
  }
  fs.mkdirSync(RAW, { recursive: true })
  fs.writeFileSync(HIST, JSON.stringify(history))
} catch (e) {
  console.log(`获取失败，保留上一份数据：${e.message}`)
  process.exit(0)
}
fs.writeFileSync(OUT, JSON.stringify(out))
console.log(JSON.stringify({
  asOf, calendar: out.ipo.calendar.length, subNew: out.ipo.subNew.count, broke: out.ipo.subNew.brokeRate, liftUp: out.lift.upcoming.count, liftPast: out.lift.past.count,
  holders: out.holders.count, pledgeDate: out.pledge.date, goodwill: out.goodwill.period, buyback: out.buyback.count, bytes: fs.statSync(OUT).size,
}))
