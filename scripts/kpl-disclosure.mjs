// 开盘啦「财报避雷」页签数据：每个交易日盘后运行（.github/workflows/kpl-tabs.yml），生成 public/data/kpl-disclosure.json。
// 来源全部是东方财富数据中心带日期的公开报表（报表名与口径见 scripts/kpl-disclosure-lib.mjs）。
// 目标日 = 估值报表（RPT_VALUEANALYSIS_DET）已发布的最近交易日：今天的还没出就用上一交易日；都没有则不写文件、正常退出。
// 原始数据：data-raw/kpl-disclosure/days/<日期>.json（ST 代码表、低价/小市值个股，用于 ST 增减与面值、市值连续天数），
//           data-raw/kpl-disclosure/closes/<日期>.json（全市场收盘价，用于公告后 1/3/5 日涨跌），
//           data-raw/kpl-disclosure/holders-dec.json（股东户数历次减少记录，增量更新）。
// 用法：node scripts/kpl-disclosure.mjs
import fs from 'node:fs'
import path from 'node:path'
import { isTradingDay, prevTradingDay } from './market-mood-lib.mjs'
import {
  addDays, buildBlock, buildCalendar, buildHolders, buildRiskTrading, buildSurvey, checkComplete, compactDay, compareConsensus, financeFlags,
  lastTradingDays, parseBlock, parseConsensus, parseExpress, parseFinance, parseForecasts, parseReports, parseSnapshot, parseSurveys, perfAfter,
  periodLabel, sameContent, stDiff,
} from './kpl-disclosure-lib.mjs'

const OUT = 'public/data/kpl-disclosure.json'
const RAW = 'data-raw/kpl-disclosure'
const DAYS = path.join(RAW, 'days')
const CLOSES = path.join(RAW, 'closes')
const HOLDERS_CACHE = path.join(RAW, 'holders-dec.json')
const SPAN = 30 // 面值 / 市值连续天数回看的交易日数（规则看 20 日，多留 10 日以显示「已超过 20 日」）
const KEEP_DAYS = 80
const KEEP_CLOSES = 30
const NOTICE_WINDOW = 30 // 最新披露：近 30 个自然日的公告
const MAX_ITEMS = 200 // 每类公告最多保留条数
const API = 'https://datacenter-web.eastmoney.com/api/data/v1/get'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
const A_SHARE = '(SECURITY_TYPE_CODE="058001001")(TRADE_MARKET_CODE!="069001004001")'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function getJson(url) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, referer: 'https://data.eastmoney.com/' }, signal: AbortSignal.timeout(30000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (e) {
      if (attempt >= 2) throw e
      await sleep(2000 * (attempt + 1))
    }
  }
}
/** 分页取完整张报表；「返回数据为空」（code 9201）返回空数组 */
async function report(reportName, filter, { sort = 'SECURITY_CODE', columns = 'ALL', pageSize = 500, maxPages = 200 } = {}) {
  const rows = []
  let count = null
  for (let page = 1; ; page++) {
    const q = new URLSearchParams({ reportName, columns, pageSize: String(pageSize), pageNumber: String(page), sortColumns: sort, sortTypes: sort.split(',').map(() => '1').join(','), filter, source: 'WEB', client: 'WEB' })
    const body = await getJson(`${API}?${q}`)
    if (body?.code === 9201 || (body?.success === false && /为空/.test(body?.message ?? ''))) return []
    if (!body?.success || !Array.isArray(body?.result?.data)) throw new Error(`${reportName} 返回异常：${body?.message ?? '无结果'}`)
    count ??= body.result.count
    rows.push(...body.result.data)
    if (page >= body.result.pages) break
    if (page >= maxPages) throw new Error(`${reportName} 页数过多`)
    await sleep(200)
  }
  return checkComplete(rows, count, reportName)
}
/** 排序后的第一行（没有则 null） */
async function first(reportName, filter, sort, dir) {
  const q = new URLSearchParams({ reportName, columns: 'ALL', pageSize: '1', pageNumber: '1', sortColumns: sort, sortTypes: dir, filter, source: 'WEB', client: 'WEB' })
  const body = await getJson(`${API}?${q}`)
  return body?.success ? body.result?.data?.[0] ?? null : null
}
async function countOf(reportName, filter) {
  const q = new URLSearchParams({ reportName, columns: 'SECURITY_CODE', pageSize: '1', pageNumber: '1', filter, source: 'WEB', client: 'WEB' })
  const body = await getJson(`${API}?${q}`)
  if (body?.code === 9201) return 0
  if (!body?.success) throw new Error(`${reportName} 计数失败：${body?.message}`)
  return body.result.count
}

const SNAP_COLS = 'SECURITY_CODE,SECURITY_NAME_ABBR,CLOSE_PRICE,TOTAL_MARKET_CAP,TOTAL_SHARES,TRADE_DATE'
const fetchSnapshot = async (date) => parseSnapshot(await report('RPT_VALUEANALYSIS_DET', `(TRADE_DATE='${date}')`, { columns: SNAP_COLS, pageSize: 6000 }), date)

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null } }
const write = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v)) }
const prune = (dir, keep) => { if (!fs.existsSync(dir)) return; const f = fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort(); for (const x of f.slice(0, -keep)) fs.rmSync(path.join(dir, x), { force: true }) }

/* ---------- 1. 目标日与估值快照 ---------- */
const bj = new Date(Date.now() + 8 * 3600_000)
const today = bj.toISOString().slice(0, 10)
let asOf = isTradingDay(today) ? today : prevTradingDay(today)
let snap = null
for (let i = 0; i < 2 && !snap; i++) {
  try { snap = await fetchSnapshot(asOf) } catch (e) { console.log(`${asOf} 估值快照不可用：${e.message}`); if (i === 0) asOf = prevTradingDay(asOf) }
}
if (!snap) { console.log('估值快照都不可用，不写文件'); process.exit(0) }
const prevOut = readJson(OUT)
if (prevOut?.asOf && prevOut.asOf > asOf) { console.log(`现有文件更新（${prevOut.asOf}），不覆盖`); process.exit(0) }

write(path.join(DAYS, `${asOf}.json`), compactDay(asOf, snap))
write(path.join(CLOSES, `${asOf}.json`), Object.fromEntries(snap.filter((s) => s.close !== null).map((s) => [s.code, s.close])))
// 补齐最近 SPAN 个交易日的存档（首次运行约 30 次请求）
for (const d of lastTradingDays(asOf, SPAN)) {
  const haveDay = fs.existsSync(path.join(DAYS, `${d}.json`)), haveClose = fs.existsSync(path.join(CLOSES, `${d}.json`))
  if (haveDay && (haveClose || d < lastTradingDays(asOf, KEEP_CLOSES)[0])) continue
  try {
    const s = await fetchSnapshot(d)
    write(path.join(DAYS, `${d}.json`), compactDay(d, s))
    write(path.join(CLOSES, `${d}.json`), Object.fromEntries(s.filter((x) => x.close !== null).map((x) => [x.code, x.close])))
    await sleep(300)
  } catch (e) { console.log(`${d} 估值快照补齐失败：${e.message}`) }
}
prune(DAYS, KEEP_DAYS)
prune(CLOSES, KEEP_CLOSES)
const dayArchive = lastTradingDays(asOf, SPAN).map((d) => readJson(path.join(DAYS, `${d}.json`))).filter(Boolean)
const closeArchive = new Map(lastTradingDays(asOf, KEEP_CLOSES).map((d) => [d, readJson(path.join(CLOSES, `${d}.json`))]).filter(([, v]) => v))
const latestDay = dayArchive.find((d) => d.date === asOf)
const prevDay = dayArchive.find((d) => d.date === prevTradingDay(asOf)) ?? null
const stSet = new Set(latestDay.st)
const shares = new Map(snap.map((s) => [s.code, s.shares]))

// 某一节失败时：同一天的旧结果可沿用，否则置空（页面显示该节暂缺），不影响其它节
const section = async (key, fn) => {
  try { return await fn() } catch (e) {
    console.log(`${key} 失败：${e.message}`)
    return prevOut?.asOf === asOf ? prevOut?.[key] ?? null : null
  }
}

/* ---------- 2. 避雷 ---------- */
const [y, m] = [Number(asOf.slice(0, 4)), Number(asOf.slice(5, 7))]
const annualPeriod = `${m >= 5 ? y - 1 : y - 2}-12-31`
const md = asOf.slice(5)
const obsPeriod = md > '10-31' ? `${y}-09-30` : md > '08-31' ? `${y}-06-30` : md > '04-30' ? `${y}-03-31` : `${y - 1}-09-30`
async function financeOf(period) {
  const base = `(REPORTDATE='${period}')${A_SHARE}`
  const cols = 'SECURITY_CODE,SECURITY_NAME_ABBR,SECURITY_TYPE_CODE,TRADE_MARKET_CODE,REPORTDATE,NOTICE_DATE,PARENT_NETPROFIT,DEDUCT_BASIC_EPS,TOTAL_OPERATE_INCOME,BPS'
  const rows = []
  for (const f of ['(PARENT_NETPROFIT<0)(TOTAL_OPERATE_INCOME<300000000)', '(DEDUCT_BASIC_EPS<0)(TOTAL_OPERATE_INCOME<300000000)', '(BPS<0)']) {
    rows.push(...await report('RPT_LICO_FN_CPD', base + f, { columns: cols }))
    await sleep(200)
  }
  return { period, label: periodLabel(period), ...financeFlags(parseFinance(rows, period), stSet) }
}
const risk = await section('risk', async () => ({
  date: asOf,
  st: stDiff(latestDay, prevDay),
  ...buildRiskTrading(dayArchive),
  annual: await financeOf(annualPeriod),
  observe: await financeOf(obsPeriod),
  history: dayArchive.map((d) => ({ date: d.date, st: d.st.length, face: d.low.filter((r) => r[2] !== null && r[2] < 1).length })),
}))

/* ---------- 3. 业绩披露 ---------- */
const disclosure = await section('disclosure', async () => {
  const from = addDays(asOf, -NOTICE_WINDOW)
  const nf = `(NOTICE_DATE>='${from}')${A_SHARE}`
  const items = [
    ...parseForecasts(await report('RPT_PUBLIC_OP_NEWPREDICT', nf, { sort: 'NOTICE_DATE' })),
    ...parseExpress(await report('RPT_FCI_PERFORMANCEE', nf, { sort: 'NOTICE_DATE' })),
    ...parseReports(await report('RPT_LICO_FN_CPD', nf, { sort: 'NOTICE_DATE' })),
  ].filter((x) => x.period && x.notice)
  // 定期报告表也收录补登的旧报告期（例如 2025 年三季报晚到），只保留报告期在公告日前一年内的
  const fresh = items.filter((x) => x.period >= addDays(x.notice, -400))
  fresh.sort((a, b) => b.notice.localeCompare(a.notice) || Math.abs(b.yoy ?? 0) - Math.abs(a.yoy ?? 0))
  const counts = { forecast: fresh.filter((x) => x.kind === 'forecast').length, express: fresh.filter((x) => x.kind === 'express').length, report: fresh.filter((x) => x.kind === 'report').length }
  // 每类各保留最近 MAX_ITEMS 条（财报季定期报告可达数千条，不能把预告、快报挤掉）
  const kept = ['forecast', 'express', 'report'].flatMap((k) => fresh.filter((x) => x.kind === k).slice(0, MAX_ITEMS))
    .sort((a, b) => b.notice.localeCompare(a.notice) || Math.abs(b.yoy ?? 0) - Math.abs(a.yoy ?? 0))
  const annualCodes = [...new Set(kept.filter((x) => x.period.endsWith('-12-31') && x.isProfit).map((x) => x.code))]
  const cons = new Map()
  for (let i = 0; i < annualCodes.length; i += 80) {
    const part = annualCodes.slice(i, i + 80)
    for (const [k, v] of parseConsensus(await report('RPT_WEB_RESPREDICT', `(SECURITY_CODE in (${part.map((c) => `"${c}"`).join(',')}))`))) cons.set(k, v)
  }
  // 公告后表现：用存档的每日收盘价（未复权）
  const dates = [...closeArchive.keys()].sort()
  const out = kept.map((x) => {
    const kline = dates.map((d) => ({ date: d, close: closeArchive.get(d)?.[x.code] ?? null })).filter((k) => k.close !== null)
    const { isProfit: _p, ...rest } = x
    return { ...rest, consensus: compareConsensus(x, cons.get(x.code), shares.get(x.code)), perf: perfAfter(x.notice, kline, asOf) }
  })
  // 预约披露日历 + 最近一期披露进度
  const cal = buildCalendar(await report('RPT_PUBLIC_BS_APPOIN', `(APPOINT_PUBLISH_DATE>'${asOf}')(APPOINT_PUBLISH_DATE<='${addDays(asOf, 20)}')`, { sort: 'APPOINT_PUBLISH_DATE' }), asOf)
  let progress = null
  const nextAppoint = await first('RPT_PUBLIC_BS_APPOIN', `(APPOINT_PUBLISH_DATE>'${cal.to}')(IS_PUBLISH="0")(SECURITY_TYPE_CODE="058001001")`, 'APPOINT_PUBLISH_DATE', '1')
  // 最近一期已到报告期末的定期报告（按报告期倒序第一条）
  const period = String((await first('RPT_PUBLIC_BS_APPOIN', `(REPORT_DATE<='${asOf}')`, 'REPORT_DATE', '-1'))?.REPORT_DATE ?? '').slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) {
    const total = await countOf('RPT_PUBLIC_BS_APPOIN', `(REPORT_DATE='${period}')(SECURITY_TYPE_CODE="058001001")`)
    const published = await countOf('RPT_PUBLIC_BS_APPOIN', `(REPORT_DATE='${period}')(SECURITY_TYPE_CODE="058001001")(IS_PUBLISH="1")`)
    progress = { period, label: periodLabel(period), total, published }
  }
  return {
    from, to: asOf, windowDays: NOTICE_WINDOW, counts, truncated: kept.length < fresh.length, items: out,
    calendar: { ...cal, next: nextAppoint ? { date: String(nextAppoint.APPOINT_PUBLISH_DATE).slice(0, 10), label: String(nextAppoint.REPORT_TYPE_NAME ?? '') } : null },
    progress,
  }
})

/* ---------- 4. 股东户数 ---------- */
const holders = await section('holders', async () => {
  const since = addDays(asOf, -330)
  const latest = await report('RPT_HOLDERNUMLATEST', '(SECURITY_TYPE_CODE="058001001")', { columns: 'SECURITY_CODE,SECURITY_NAME_ABBR,SECURITY_TYPE_CODE,END_DATE,PRE_END_DATE,HOLDER_NUM,PRE_HOLDER_NUM,HOLDER_NUM_RATIO,HOLD_NOTICE_DATE,AVG_MARKET_CAP,CLOSE_PRICE' })
  // 历次「户数减少」记录约 2.7 万行（55 页）：存档增量更新，只补公告日在存档最新公告日前 10 天之后的行；存档起点太旧（> 90 天）时整表重取
  const cols = 'SECURITY_CODE,END_DATE,PRE_END_DATE,PRE_HOLDER_NUM,HOLDER_NUM_RATIO,HOLD_NOTICE_DATE'
  const cache = readJson(HOLDERS_CACHE)
  const full = !cache || !Array.isArray(cache.rows) || cache.since > since || addDays(cache.since, 90) < since
  const fetchFrom = full ? since : cache.since
  const fresh = await report('RPT_HOLDERNUM_DET', `(END_DATE>='${fetchFrom}')(HOLDER_NUM_RATIO<0)${full ? '' : `(HOLD_NOTICE_DATE>='${addDays(cache.through, -10)}')`}`, { columns: cols })
  const merged = new Map(full ? [] : cache.rows.map((r) => [`${r[0]}|${r[1]}`, r]))
  for (const r of fresh) merged.set(`${r.SECURITY_CODE}|${String(r.END_DATE).slice(0, 10)}`, [String(r.SECURITY_CODE), String(r.END_DATE).slice(0, 10), String(r.PRE_END_DATE ?? '').slice(0, 10) || null, r.PRE_HOLDER_NUM, r.HOLDER_NUM_RATIO, String(r.HOLD_NOTICE_DATE ?? '').slice(0, 10) || null])
  const rows = [...merged.values()].filter((r) => r[1] >= fetchFrom).sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))
  const through = rows.reduce((m, r) => (r[5] && r[5] <= asOf && r[5] > m ? r[5] : m), cache?.through ?? fetchFrom)
  write(HOLDERS_CACHE, { since: fetchFrom, through, rows })
  const dec = rows.map((r) => ({ SECURITY_CODE: r[0], END_DATE: r[1], PRE_END_DATE: r[2], PRE_HOLDER_NUM: r[3], HOLDER_NUM_RATIO: r[4] }))
  return { date: asOf, ...buildHolders(latest, dec, asOf, { minEnd: addDays(asOf, -200), since: fetchFrom }) }
})

/* ---------- 5. 大宗交易 ---------- */
const block = await section('block', async () => {
  const win = lastTradingDays(asOf, 20)
  const trades = parseBlock(await report('RPT_DATA_BLOCKTRADE', `(TRADE_DATE>='${win[0]}')(TRADE_DATE<='${asOf}')(SECURITY_TYPE="EQA")`, { sort: 'TRADE_DATE,SECURITY_CODE' }))
  const lastDate = trades.map((t) => t.date).sort().at(-1) ?? null
  if (!lastDate) return null
  return buildBlock(trades, lastDate, win.filter((d) => d <= lastDate))
})

/* ---------- 6. 机构调研 ---------- */
const survey = await section('survey', async () => {
  const from = lastTradingDays(asOf, 20)[0]
  const rows = await report('RPT_ORG_SURVEYNEW', `(NOTICE_DATE>='${from}')(NOTICE_DATE<='${asOf}')(NUM=1)`, { sort: 'NOTICE_DATE,SECURITY_CODE', columns: 'SECURITY_CODE,SECURITY_NAME_ABBR,NOTICE_DATE,RECEIVE_START_DATE,SUM,RECEIVE_WAY_EXPLAIN' })
  return buildSurvey(parseSurveys(rows), asOf)
})

const out = {
  version: 1, generatedAt: new Date().toISOString(), asOf,
  note: '盘后统计与按公开规则的机械筛选，不是买卖建议，也不预测个股是否会被 ST 或退市；以交易所公告为准。',
  disclosure, risk, holders, block, survey,
  sources: [
    { id: 'appoint', label: '东方财富数据中心 · 预约披露时间', url: 'https://data.eastmoney.com/bbsj/yysj.html' },
    { id: 'forecast', label: '东方财富数据中心 · 业绩预告', url: 'https://data.eastmoney.com/bbsj/yjyg.html' },
    { id: 'express', label: '东方财富数据中心 · 业绩快报', url: 'https://data.eastmoney.com/bbsj/yjkb.html' },
    { id: 'report', label: '东方财富数据中心 · 业绩报表', url: 'https://data.eastmoney.com/bbsj/yjbb.html' },
    { id: 'predict', label: '东方财富数据中心 · 机构盈利预测', url: 'https://data.eastmoney.com/report/profitforecast.jshtml' },
    { id: 'value', label: '东方财富数据中心 · 估值分析（每日收盘价、总市值、简称）', url: 'https://data.eastmoney.com/gzfx/list.html' },
    { id: 'holders', label: '东方财富数据中心 · 股东户数', url: 'https://data.eastmoney.com/gdhs/' },
    { id: 'block', label: '东方财富数据中心 · 大宗交易', url: 'https://data.eastmoney.com/dzjy/dzjy_mrmxa.html' },
    { id: 'survey', label: '东方财富数据中心 · 机构调研', url: 'https://data.eastmoney.com/jgdy/' },
  ],
}
if (sameContent(out, prevOut)) { console.log(`${asOf} 内容无变化，不写文件`); process.exit(0) }
write(OUT, out)
console.log(JSON.stringify({
  asOf, items: disclosure?.items.length, counts: disclosure?.counts, calendar: disclosure?.calendar.total, progress: disclosure?.progress,
  st: risk?.st.count, stAdded: risk?.st.added?.length, face: risk?.face.length, cap: risk?.cap.length, span: risk?.span,
  annual: risk && [risk.annual.lossLowRev.length, risk.annual.negEquity.length], observe: risk && [risk.observe.lossLowRev.length, risk.observe.negEquity.length],
  holders: holders && [holders.total, holders.fallingCount], block: block && [block.date, block.count], survey: survey?.long.events,
}))
