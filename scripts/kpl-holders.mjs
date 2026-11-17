// 开盘啦「持仓两融」页签数据：每个交易日盘后运行（.github/workflows/kpl-tabs.yml），生成 public/data/kpl-holders.json。
// 来源全部是东方财富数据中心带日期的公开报表（报表名与口径见 scripts/kpl-holders-lib.mjs）。
// 目标日 = 两融个股明细已发布的最近交易日（两融数据在次一交易日早上才更新，所以盘后跑出来的通常是上一交易日）。
// 基金持仓、十大流通股东按季度变化，每个北京日期只重取一次（同一天的后续运行沿用文件里已有的结果），十大流通股东约 56 页、2~3 分钟。
// 用法：node scripts/kpl-holders.mjs
import fs from 'node:fs'
import path from 'node:path'
import { isTradingDay } from './market-mood-lib.mjs'
import {
  addDays, buildFunds, buildInvestors, buildMargin, checkComplete, day, parseFunds, parseInvestors, parseMargin, parseMarginIndustries,
  pickFundPeriod, prevQuarter, quartersBefore, sameContent,
} from './kpl-holders-lib.mjs'

const OUT = 'public/data/kpl-holders.json'
const API = 'https://datacenter-web.eastmoney.com/api/data/v1/get'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

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
const query = (reportName, filter, { columns = 'ALL', pageSize = 500, page = 1, sort, dir = '1' } = {}) => {
  const q = new URLSearchParams({ reportName, columns, pageSize: String(pageSize), pageNumber: String(page), filter, source: 'WEB', client: 'WEB' })
  if (sort) { q.set('sortColumns', sort); q.set('sortTypes', sort.split(',').map(() => dir).join(',')) }
  return `${API}?${q}`
}
const isEmpty = (body) => body?.code === 9201 || (body?.success === false && /为空/.test(body?.message ?? ''))
/** 分页取完整张报表；「返回数据为空」返回空数组 */
async function report(reportName, filter, { sort, columns = 'ALL', maxPages = 120 } = {}) {
  const rows = []
  let count = null
  for (let page = 1; ; page++) {
    const body = await getJson(query(reportName, filter, { columns, page, sort }))
    if (isEmpty(body)) return []
    if (!body?.success || !Array.isArray(body?.result?.data)) throw new Error(`${reportName} 返回异常：${body?.message ?? '无结果'}`)
    count ??= body.result.count
    rows.push(...body.result.data)
    if (page >= body.result.pages) break
    if (page >= maxPages) throw new Error(`${reportName} 页数过多`)
    await sleep(200)
  }
  return checkComplete(rows, count, reportName)
}
async function countOf(reportName, filter, column) {
  const body = await getJson(query(reportName, filter, { columns: column, pageSize: 1 }))
  if (isEmpty(body)) return 0
  if (!body?.success) throw new Error(`${reportName} 计数失败：${body?.message}`)
  return body.result.count
}
async function first(reportName, filter, sort, columns) {
  const body = await getJson(query(reportName, filter, { columns, pageSize: 1, sort, dir: '-1' }))
  return body?.success ? body.result?.data?.[0] ?? null : null
}

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null } }
const write = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v)) }

const bj = new Date(Date.now() + 8 * 3600_000)
const today = bj.toISOString().slice(0, 10)
const prevOut = readJson(OUT)

/* ---------- 1. 两融：最近一个已发布的交易日 ---------- */
const latestRow = await first('RPTA_WEB_RZRQ_GGMX', '(TRADE_MARKET_CODE="069001001001")', 'DATE', 'DATE')
const asOf = day(latestRow?.DATE)
if (!asOf || asOf > today || !isTradingDay(asOf)) { console.log(`两融明细最新日期异常（${latestRow?.DATE}），不写文件`); process.exit(0) }
if (prevOut?.asOf && prevOut.asOf > asOf) { console.log(`现有文件更新（${prevOut.asOf}），不覆盖`); process.exit(0) }

const section = async (key, fn) => {
  try { return await fn() } catch (e) {
    console.log(`${key} 失败：${e.message}`)
    return prevOut?.[key] ?? null
  }
}

let margin
try {
  const stocks = parseMargin(await report('RPTA_WEB_RZRQ_GGMX', `(DATE='${asOf}')`, { sort: 'SCODE' }), asOf)
  const inds = parseMarginIndustries(await report('RPTA_WEB_BKJYMXN', `(TRADE_DATE='${asOf}')(BOARD_TYPE_CODE="005")`, { sort: 'BOARD_CODE' }), asOf)
  margin = buildMargin(stocks, inds, asOf)
} catch (e) {
  // 两融是本页的目标日依据：取不到就整份不写，保留旧文件
  console.log(`两融明细失败：${e.message}，不写文件`)
  process.exit(0)
}

/* ---------- 2. 基金季度持仓（每天一次） ---------- */
const funds = prevOut?.funds?.fetched === today ? prevOut.funds : await section('funds', async () => {
  const periods = quartersBefore(today, 3)
  const candidates = []
  for (const p of periods) candidates.push({ period: p, count: await countOf('RPT_MAIN_ORGHOLD', `(REPORT_DATE='${p}')(ORG_TYPE="01")`, 'SECURITY_CODE') })
  const period = pickFundPeriod(candidates, today)
  if (!period) throw new Error(`没有披露完的报告期（${JSON.stringify(candidates)}）`)
  const cols = 'SECURITY_CODE,SECURITY_NAME_ABBR,REPORT_DATE,ORG_TYPE,HOULD_NUM,TOTAL_SHARES,HOLD_VALUE,FREESHARES_RATIO,HOLDCHA_NUM,HOLDCHA_RATIO'
  const cur = parseFunds(await report('RPT_MAIN_ORGHOLD', `(REPORT_DATE='${period}')(ORG_TYPE="01")`, { sort: 'SECURITY_CODE', columns: cols }), period)
  const prevPeriod = prevQuarter(period)
  const prevRows = await report('RPT_MAIN_ORGHOLD', `(REPORT_DATE='${prevPeriod}')(ORG_TYPE="01")`, { sort: 'SECURITY_CODE', columns: 'SECURITY_CODE,REPORT_DATE' })
  if (prevRows.some((r) => day(r.REPORT_DATE) !== prevPeriod)) throw new Error('上期基金持仓报告期不符')
  const prevCodes = prevRows.length >= 2000 ? prevRows.map((r) => String(r.SECURITY_CODE)) : null
  // 行业：两融目标日的每日估值表（东方财富行业）
  const val = await report('RPT_VALUEANALYSIS_DET', `(TRADE_DATE='${asOf}')`, { sort: 'SECURITY_CODE', columns: 'SECURITY_CODE,BOARD_NAME,TRADE_DATE' })
  if (val.some((r) => day(r.TRADE_DATE) !== asOf)) throw new Error('估值表日期不符')
  const industryOf = new Map(val.filter((r) => r.BOARD_NAME).map((r) => [String(r.SECURITY_CODE), String(r.BOARD_NAME).trim()]))
  return { fetched: today, industryDate: asOf, ...buildFunds(cur, prevCodes, industryOf, period, prevCodes ? prevPeriod : null) }
})

/* ---------- 3. 牛散：十大流通股东里的自然人（每天一次） ---------- */
const investors = prevOut?.investors?.fetched === today ? prevOut.investors : await section('investors', async () => {
  const cols = 'SECURITY_CODE,SECURITY_NAME_ABBR,END_DATE,NOTICE_DATE,HOLDER_NAME,HOLDER_RANK,HOLD_NUM,HOLDER_MARKET_CAP,FREE_HOLDNUM_RATIO,HOLDER_STATE_NEW,XZCHANGE,IS_SJKZR,IS_DJG'
  const raw = await report('RPT_F10_EH_FREEHOLDERS', '(IS_MAX_REPORTDATE="1")(HOLDER_NEWTYPE="个人")', { sort: 'SECURITY_CODE,HOLDER_RANK', columns: cols })
  if (raw.length < 10000) throw new Error(`自然人股东行数太少（${raw.length}）`)
  // 只看截止日在最近约一年内的最新一期（停牌多年、已退市的公司最新一期可能停在多年前）
  const minEnd = addDays(today, -400)
  return { fetched: today, minEnd, ...buildInvestors(parseInvestors(raw, minEnd)) }
})

const out = {
  version: 1, generatedAt: new Date().toISOString(), asOf,
  note: '盘后统计：两融为交易所公布的上一交易日数据，基金持仓和十大流通股东来自定期报告，有明显滞后；不是买卖建议。',
  margin, funds, investors,
  sources: [
    { id: 'margin', label: '东方财富数据中心 · 融资融券个股明细', url: 'https://data.eastmoney.com/rzrq/detail/all.html' },
    { id: 'marginInd', label: '东方财富数据中心 · 融资融券板块（行业）', url: 'https://data.eastmoney.com/rzrq/bk.html' },
    { id: 'funds', label: '东方财富数据中心 · 主力持仓（基金）', url: 'https://data.eastmoney.com/zlsj/' },
    { id: 'holders', label: '东方财富数据中心 · 十大流通股东', url: 'https://data.eastmoney.com/gdfx/' },
    { id: 'value', label: '东方财富数据中心 · 估值分析（行业归属）', url: 'https://data.eastmoney.com/gzfx/list.html' },
  ],
}
if (sameContent(out, prevOut)) { console.log(`${asOf} 内容无变化，不写文件`); process.exit(0) }
write(OUT, out)
console.log(JSON.stringify({
  asOf, margin: [margin.count, margin.buy.length, margin.industries.count],
  funds: funds && [funds.period, funds.count, funds.newCount, funds.addCount, funds.cutCount],
  investors: investors && [investors.rows, investors.eligible, investors.list.length, investors.list[0]?.name],
}))
