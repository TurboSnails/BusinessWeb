// 同花顺 · 可转债页数据：每个交易日收盘后运行（.github/workflows/ths-tabs.yml），生成 public/data/ths-tab-cbond.json。
// 来源（全部公开）：东财转债列表 RPT_BOND_CB_LIST（发行、上市、到期、配售）、东财转债条款表 RPT_BOND_CB_CLAUSE（转股价、触发比例、
// 剩余规模、最新评级、强赎 / 下修公告状态）、东财可转债逐日估值表 RPTA_WEB_KZZ_LS（带日期的收盘价、转股价值、纯债价值、溢价率）、
// 东财日 K（中证转债指数 000832、各正股、新上市转债首日）。逐日估值表当天还没出时，收盘后同一天可退回 push2 转债列表快照（逐行核对交易日）。
// 不调用同花顺接口。历史：data-raw/ths-tab-cbond/history.json，首次运行按逐日估值表回补最近约一年。
// 用法：node scripts/ths-cbond.mjs        （收盘前运行时生成上一交易日；DATE=YYYY-MM-DD 指定已结束的交易日，只接受带日期的数据源）
import fs from 'node:fs'
import { isTradingDay, prevTradingDay } from './market-mood-lib.mjs'
import {
  buildRow, callList, dcRows, discountList, downList, historyDay, issueList, maturityList, mergeHistory, parseClist, parseKline, parseLs,
  clauseCheck, pickTarget, rightsList, secidOf, summarize, universe, updateRestarts,
} from './ths-cbond-lib.mjs'

const OUT = 'public/data/ths-tab-cbond.json'
const RAW = 'data-raw/ths-tab-cbond'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
const DC = 'https://datacenter-web.eastmoney.com/api/data/v1/get'
const HEAD = { referer: 'https://data.eastmoney.com/' }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function get(url, { headers = HEAD } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, ...headers }, signal: AbortSignal.timeout(20000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      // 个别字段不是 UTF-8，按替换字符解码，避免整包解析失败
      return JSON.parse(new TextDecoder('utf-8').decode(await res.arrayBuffer()))
    } catch (e) {
      if (attempt >= 2) throw e
      await sleep(1500 * (attempt + 1))
    }
  }
}
/** 有限并发 */
async function pool(items, n, fn) {
  const out = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k) } }))
  return out
}
const dc = async (params) => {
  const all = []
  for (let page = 1; ; page++) {
    const body = await get(`${DC}?${new URLSearchParams({ pageSize: '500', pageNumber: String(page), source: 'WEB', client: 'WEB', ...params })}`)
    all.push(...dcRows(body))
    if (page >= (body.result?.pages ?? 1)) return all
  }
}
const kline = async (secid, extra = { lmt: '45' }) => parseKline(await get(`https://push2his.eastmoney.com/api/qt/stock/kline/get?${new URLSearchParams({ secid, klt: '101', fqt: '0', end: '20500101', fields1: 'f1,f2,f3', fields2: 'f51,f52,f53,f59', ...extra })}`, { headers: { referer: 'https://quote.eastmoney.com/' } }))
const LS_COLS = 'DATE,ZCODE,FCLOSE,SWAPVALUE,PUREBONDVALUE,SWAPOR,PUREBONDOR'
const lsOf = async (date) => parseLs(await dc({ reportName: 'RPTA_WEB_KZZ_LS', columns: LS_COLS, filter: `(DATE='${date}')` }), date)

/* ---------- 目标日 ---------- */
const bj = new Date(Date.now() + 8 * 3600_000)
const bjDate = bj.toISOString().slice(0, 10)
const minutes = bj.getUTCHours() * 60 + bj.getUTCMinutes()
let target = pickTarget({ bjDate, minutes, isTradingDay, prevTradingDay })
if (process.env.DATE) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(process.env.DATE) || process.env.DATE > target.date) { console.error(`DATE=${process.env.DATE} 不是已结束的交易日`); process.exit(1) }
  target = { date: process.env.DATE, sameDay: false }
}
const date = target.date
if (!isTradingDay(date)) { console.log(`${date} 非交易日，跳过`); process.exit(0) }
const prev = prevTradingDay(date)

/* ---------- 指数日 K：确认 date 已是一根完整日 K ---------- */
const index = await kline('1.000832', { lmt: '300' })
const iBar = index.find((k) => k.date === date)
if (!iBar) { console.log(`中证转债指数还没有 ${date} 的日 K（最后一根 ${index.at(-1)?.date ?? '无'}），跳过`); process.exit(0) }

/* ---------- 列表与条款 ---------- */
const list = await dc({ reportName: 'RPT_BOND_CB_LIST', columns: 'ALL', sortColumns: 'SECURITY_CODE', sortTypes: '1' })
if (list.length < 800) throw new Error(`转债列表条数异常：${list.length}`)
const clauseRows = await dc({ reportName: 'RPT_BOND_CB_CLAUSE', columns: 'ALL', filter: '(IS_DELIST="0")' })
const clauses = new Map(clauseRows.map((r) => [String(r.SECURITY_CODE), r]))
const uni = universe(list, date)
if (uni.length < 150) throw new Error(`当日存续转债只有 ${uni.length} 只，数据异常`)

/* ---------- 当日估值：逐日估值表优先，收盘后同一天可退回快照 ---------- */
let quotes = await lsOf(date)
let source = 'report'
const covered = uni.filter((r) => quotes.get(String(r.SECURITY_CODE))?.close != null).length
if (covered < uni.length * 0.9) {
  if (!target.sameDay) { console.log(`${date} 逐日估值表只覆盖 ${covered}/${uni.length} 只，且已不是当天，跳过`); process.exit(0) }
  const diff = []
  for (let pn = 1; pn <= 10; pn++) {
    const body = await get(`https://push2delay.eastmoney.com/api/qt/clist/get?${new URLSearchParams({ pn: String(pn), pz: '100', po: '1', np: '1', fltt: '2', invt: '2', fid: 'f12', fs: 'b:MK0354', fields: 'f2,f12,f14,f18,f227,f236,f237,f238,f297' })}`)
    const rows = body?.data?.diff ?? []
    diff.push(...rows)
    if (diff.length >= (body?.data?.total ?? 0) || !rows.length) break
  }
  quotes = parseClist(diff, date) // 交易日不是 date 时抛错，不写文件
  source = 'snapshot'
  const c2 = uni.filter((r) => quotes.get(String(r.SECURITY_CODE))?.close != null).length
  if (c2 < uni.length * 0.9) { console.log(`快照也只覆盖 ${c2}/${uni.length} 只，跳过`); process.exit(0) }
}
const prevQuotes = source === 'report' ? await lsOf(prev) : new Map()

/* ---------- 正股日 K（条款计数、正股涨跌）与新债首日 ---------- */
const issuesRaw = list.filter((r) => { const d = String(r.PUBLIC_START_DATE ?? '').slice(0, 10); return d && Date.parse(d) >= Date.parse(date) - 45 * 864e5 })
const stockSec = new Map()
for (const r of [...uni, ...issuesRaw]) {
  const c = clauses.get(String(r.SECURITY_CODE))
  const sec = secidOf(c?.CONVERT_SECUCODE) ?? secidOf(`${r.CONVERT_STOCK_CODE}.${String(r.SECUCODE ?? '').split('.')[1] ?? ''}`)
  if (sec) stockSec.set(String(r.SECURITY_CODE), sec)
}
const uniqueSec = [...new Set(stockSec.values())]
const barsBySec = new Map()
let klineFail = 0
await pool(uniqueSec, 6, async (sec) => { try { barsBySec.set(sec, await kline(sec)) } catch { klineFail++ } })
if (klineFail > uniqueSec.length * 0.1) throw new Error(`正股日 K 失败 ${klineFail}/${uniqueSec.length}，放弃本次`)
const bars = new Map([...stockSec].map(([code, sec]) => [code, barsBySec.get(sec) ?? []]))
const firstBars = new Map()
await pool(issuesRaw.filter((r) => r.LISTING_DATE && r.LISTING_DATE.slice(0, 10) <= date), 4, async (r) => {
  const d = r.LISTING_DATE.slice(0, 10).replaceAll('-', '')
  try {
    const ks = await kline(`${String(r.SECUCODE).endsWith('.SH') ? 1 : 0}.${r.SECURITY_CODE}`, { beg: d, end: d })
    if (ks[0]) firstBars.set(String(r.SECURITY_CODE), ks[0])
  } catch { /* 首日表现缺失时显示「—」 */ }
})

/* ---------- 组装 ---------- */
const rows = uni.map((item) => {
  const code = String(item.SECURITY_CODE)
  return buildRow({ item, clause: clauses.get(code), quote: quotes.get(code), prev: prevQuotes.get(code), bars: bars.get(code), date })
}).filter((r) => r.price !== null)
const summary = summarize(rows)
const restartPath = `${RAW}/restarts.json`
const restarts = updateRestarts(fs.existsSync(restartPath) ? JSON.parse(fs.readFileSync(restartPath, 'utf8')) : {}, clauseRows)
const ctx = { clauses, bars, date, restarts }
const issues = issueList(list, { date, firstBars, stockBars: bars })
const call = callList(rows, ctx)
const iPrev = index[index.findIndex((k) => k.date === date) - 1]

/* ---------- 历史：已有记录 + 按逐日估值表回补（约一年） ---------- */
const storePath = `${RAW}/history.json`
const store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : { days: [] }
const have = new Map(store.days.map((d) => [d.date, d]))
const calendar = index.map((k) => k.date).filter((d) => d < date).slice(-250)
const need = calendar.filter((d) => have.get(d)?.source !== 'report')
const lsCache = new Map()
const lsCached = async (d) => { if (!lsCache.has(d)) lsCache.set(d, await lsOf(d).catch(() => null)); return lsCache.get(d) }
const backfilled = []
await pool(need, 4, async (d) => {
  const i = calendar.indexOf(d)
  const [cur, before] = [await lsCached(d), i > 0 ? await lsCached(calendar[i - 1]) : null]
  if (!cur || !cur.size) return
  const u = universe(list, d)
  const rs = u.map((it) => {
    const q = cur.get(String(it.SECURITY_CODE)), p = before?.get(String(it.SECURITY_CODE))
    return { price: q?.close ?? null, premium: q?.premium ?? null, pct: q?.close != null && p?.close ? ((q.close / p.close) - 1) * 100 : null }
  }).filter((r) => r.price !== null)
  if (rs.length < u.length * 0.9) return
  backfilled.push(historyDay(d, summarize(rs), { source: 'report', backfilled: true }))
})
const todayRec = historyDay(date, summary, { source })
const days = mergeHistory(store.days, [...backfilled, todayRec])

const payload = {
  version: 1,
  generatedAt: new Date().toISOString(),
  asOf: date,
  source,
  note: '盘后统计，不是买卖建议。双低、到期税前收益率、强赎 / 下修 / 回售计数、百元股票含权等为本站按公开数据计算，口径见页面说明。',
  index: { close: iBar.close, pct: iBar.pct, prevClose: iPrev?.close ?? null },
  summary,
  rows,
  discount: discountList(rows),
  call,
  clauseCheck: clauseCheck(call, date),
  down: downList(rows, ctx),
  maturity: maturityList(rows, ctx),
  issues,
  rights: rightsList(issues, date),
  history: days,
  indexHistory: index.filter((k) => k.date <= date).slice(-250).map((k) => ({ date: k.date, close: k.close })),
  sources: [
    { id: 'list', label: '东方财富可转债数据一览（发行、上市、配售）', url: 'https://data.eastmoney.com/kzz/default.html' },
    { id: 'value', label: '东方财富可转债逐日估值（转股价值、纯债价值、溢价率）', url: 'https://data.eastmoney.com/kzz/default.html' },
    { id: 'clause', label: '东方财富可转债条款（转股价、触发条件、剩余规模、强赎 / 下修公告状态）', url: 'https://data.eastmoney.com/kzz/default.html' },
    { id: 'kline', label: '东方财富日 K（中证转债指数、正股、新债首日）', url: 'https://quote.eastmoney.com/zz/1.000832.html' },
  ],
}
fs.mkdirSync(RAW, { recursive: true })
fs.writeFileSync(storePath, JSON.stringify({ days }))
fs.writeFileSync(restartPath, JSON.stringify(restarts))
fs.writeFileSync(OUT, JSON.stringify(payload))
console.log(JSON.stringify({ date, source, count: summary.count, medianPrice: summary.medianPrice, avgPremium: summary.avgPremium, discount: payload.discount.length, call: payload.call.length, down: payload.down.length, maturity: payload.maturity.length, issues: issues.length, rights: payload.rights.length, history: days.length, backfilled: backfilled.length, klineFail }))
