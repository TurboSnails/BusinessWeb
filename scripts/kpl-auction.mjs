// 开盘啦 · 竞价尾盘页数据：每个交易日收盘后运行（.github/workflows/kpl-tabs.yml），生成 public/data/kpl-auction.json。
// 来源（均为公开行情）：
// - 东财分时 push2his trends2（ndays=5，分钟线带日期）：09:30 那根 = 开盘集合竞价撮合，15:00 那根 = 收盘集合竞价撮合（口径见 kpl-auction-lib.mjs 顶部）；
//   两市合计用上证综指 1.000001 + 深证综指 0.399106，板块用东财行业（申万二级口径 m:90+s:4）与成交额前列概念的板块指数分时；
// - 东财涨停池 / 昨日涨停池（push2ex，带日期）；
// - 东财 A 股行情快照 clist（不带日期）只用来挑「成交额前 N」候选股和取行业名；用分时当日成交额核对快照确属目标交易日，对不上就放弃本次。
// 历史：data-raw/kpl-auction/history.json；分时可回取近 5 个交易日，首次运行回补（标 backfilled）。
// 用法：node scripts/kpl-auction.mjs（交易日 15:10 后）；DATE=YYYY-MM-DD 指定目标交易日（数据全部带日期并逐项核对，可在当晚或次日凌晨补跑）。
import fs from 'node:fs'
import { isTradingDay, prevTradingDay } from './market-mood-lib.mjs'
import {
  checkSnapshot, dayStats, groupSummary, historyRow, indexRow, latestDay, marketDay, mergeHistory, parseMinutes, parseSnapshotRow,
  pickCandidates, secidOf, stockRow,
} from './kpl-auction-lib.mjs'

const OUT = 'public/data/kpl-auction.json'
const RAW = 'data-raw/kpl-auction'
const POOL_TOKEN = '7eea3edcaed734bea9cbfc24409ed989' // 东财公开页面使用的固定参数（与 scripts/market-mood.mjs 相同）
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
const QUOTE_HOSTS = ['https://push2.eastmoney.com', 'https://push2delay.eastmoney.com', 'https://82.push2.eastmoney.com']
const TOP_N = 400 // 成交额前 400 的个股
const CONCEPT_N = 50 // 成交额前 50 的概念板块
const CONCURRENCY = 6
const INDEXES = [
  { secid: '1.000001', code: '000001', name: '上证指数' }, { secid: '0.399001', code: '399001', name: '深证成指' },
  { secid: '0.399006', code: '399006', name: '创业板指' }, { secid: '1.000688', code: '000688', name: '科创50' }, { secid: '1.000300', code: '000300', name: '沪深300' },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function get(url, { tries = 3 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, referer: 'https://quote.eastmoney.com/' }, signal: AbortSignal.timeout(15000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (e) {
      if (attempt >= tries - 1) throw e
      await sleep(1500 * (attempt + 1))
    }
  }
}
async function quote(path) {
  let last
  for (const host of QUOTE_HOSTS) {
    try { return await get(`${host}${path}`, { tries: 2 }) } catch (e) { last = e }
  }
  throw last
}
const minutesUrl = (secid) => `https://push2his.eastmoney.com/api/qt/stock/trends2/get?${new URLSearchParams({ secid, fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13', fields2: 'f51,f53,f57', iscr: '0', ndays: '5' })}`
const minutes = async (secid) => parseMinutes(await get(minutesUrl(secid)))

/** 并发拉取，单只失败记为 null（不编造） */
async function pool(items, fn) {
  const out = new Array(items.length).fill(null)
  let cursor = 0
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < items.length) {
      const i = cursor++
      try { out[i] = await fn(items[i]) } catch { out[i] = null }
      await sleep(80)
    }
  }))
  return out
}

// ---------- 目标交易日 ----------
const bj = new Date(Date.now() + 8 * 3600_000)
const bjToday = bj.toISOString().slice(0, 10)
const envDate = /^\d{4}-\d{2}-\d{2}$/.test(process.env.DATE ?? '') ? process.env.DATE : null
const date = envDate ?? bjToday
if (!isTradingDay(date)) { console.log(`${date} 非交易日，跳过`); process.exit(0) }
if (envDate ? date > bjToday : bj.getUTCHours() * 60 + bj.getUTCMinutes() < 15 * 60 + 10) { console.log(`${date} 未收盘，跳过`); process.exit(0) }
if (envDate && date === bjToday && bj.getUTCHours() * 60 + bj.getUTCMinutes() < 15 * 60 + 10) { console.log(`${date} 未收盘，跳过`); process.exit(0) }
const prevDate = prevTradingDay(date)
const started = Date.now()

// ---------- 1. 两市合计与主要指数（带日期，必须有目标日完整分时） ----------
let sh, sz
try {
  ;[sh, sz] = [await minutes('1.000001'), await minutes('0.399106')]
} catch (e) { console.log(`指数分时获取失败：${e.message}`); process.exit(0) }
if (latestDay(sh) !== date || latestDay(sz) !== date) { console.log(`指数分时最新日期为 ${latestDay(sh)} / ${latestDay(sz)}，不是 ${date}，跳过`); process.exit(0) }
const market = marketDay(sh, sz, date, prevDate)
if (!market) { console.log(`${date} 指数分时不完整（不足 241 根），跳过`); process.exit(0) }
const indexes = []
for (const ix of INDEXES) {
  try {
    const m = ix.secid === '1.000001' ? sh : await minutes(ix.secid)
    const s = latestDay(m) === date ? dayStats(m, date, prevDate, m.preClose) : null
    if (s) indexes.push(indexRow({ code: ix.code, name: ix.name, kind: 'index' }, s))
  } catch (e) { console.log(`${ix.name} 分时失败：${e.message}`) }
}

// ---------- 2. 涨停池 / 昨日涨停池（带日期） ----------
async function ztPool(ep, sort) {
  const body = await get(`https://push2ex.eastmoney.com/${ep}?${new URLSearchParams({ ut: POOL_TOKEN, dpt: 'wz.ztzt', Pageindex: '0', pagesize: '10000', sort, date: date.replaceAll('-', '') })}`)
  const d = body?.data
  if (!d || String(d.qdate) !== date.replaceAll('-', '') || !Array.isArray(d.pool) || d.pool.length !== d.tc) throw new Error(`${ep} 日期或条数不符`)
  return d.pool
}
let zt = [], yzt = [], poolsOk = true
try { zt = await ztPool('getTopicZTPool', 'fbt:asc'); yzt = await ztPool('getYesterdayZTPool', 'zs:desc') } catch (e) { poolsOk = false; console.log(`涨停池获取失败（只用成交额前列）：${e.message}`) }

// ---------- 3. 快照：成交额前 N 候选股 + 行业名 ----------
async function clist(fs, fields, pages, fid = 'f6') {
  const rows = []
  for (let p = 1; p <= pages; p++) {
    const body = await quote(`/api/qt/clist/get?${new URLSearchParams({ pn: String(p), pz: '100', po: '1', np: '1', fltt: '2', invt: '2', fid, fs, fields })}`)
    const diff = body?.data?.diff
    if (!Array.isArray(diff)) throw new Error(`${fs} 第 ${p} 页为空`)
    rows.push(...diff)
    if (rows.length >= (body.data.total ?? 0)) break
    await sleep(200)
  }
  return rows
}
let snapshot
try {
  snapshot = (await clist('m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23', 'f12,f13,f14,f6,f100', Math.ceil(TOP_N / 100) + 1)).map(parseSnapshotRow)
} catch (e) { console.log(`行情快照获取失败：${e.message}`); process.exit(0) }
const cands = pickCandidates({ snapshot, zt, yzt, topN: TOP_N })

// ---------- 4. 候选股分时 ----------
const mins = await pool(cands, (c) => minutes(secidOf(c.code, c.market)))
const statsByCode = new Map()
const rows = []
const backfill = new Map() // 回补日 → { top: [], yzt: [] }
let failed = 0, stale = 0
cands.forEach((c, i) => {
  const m = mins[i]
  if (!m) { failed++; return }
  if (latestDay(m) !== date) { stale++; return } // 停牌或未更新：不收
  const s = dayStats(m, date, prevDate, m.preClose)
  if (!s) { stale++; return }
  statsByCode.set(c.code, s)
  rows.push(stockRow(c, s))
  if (c.tags.includes('top')) {
    for (const d of Object.keys(m.days)) {
      if (d >= date) continue
      const bs = dayStats(m, d, prevTradingDay(d))
      if (bs) { const g = backfill.get(d) ?? []; g.push(stockRow(c, bs)); backfill.set(d, g) }
    }
  }
})
if (failed > cands.length * 0.1) { console.log(`候选股分时失败过多（${failed}/${cands.length}），放弃本次`); process.exit(0) }
const snap = checkSnapshot(snapshot, statsByCode)
if (!snap.pass) { console.log(`行情快照与 ${date} 分时成交额对不上（${snap.ok}/${snap.n}），快照可能不是该日收盘后的，放弃本次`); process.exit(0) }

// ---------- 5. 板块：行业全量 + 成交额前列概念 ----------
let boards = []
try {
  const industries = (await clist('m:90+s:4', 'f12,f14,f6', 2)).map((r) => ({ code: String(r.f12), name: String(r.f14), kind: 'industry' }))
  let concepts = []
  try {
    const special = new Set((await clist('m:90+e:4', 'f12', 3, 'f12')).map((r) => String(r.f12)))
    concepts = (await clist('m:90+t:3+f:!50', 'f12,f14,f6', 1)).filter((r) => !special.has(String(r.f12))).slice(0, CONCEPT_N).map((r) => ({ code: String(r.f12), name: String(r.f14), kind: 'concept' }))
  } catch (e) { console.log(`概念板块列表失败：${e.message}`) }
  const list = [...industries, ...concepts]
  const ms = await pool(list, (b) => minutes(`90.${b.code}`))
  list.forEach((b, i) => {
    const m = ms[i]
    if (!m || latestDay(m) !== date) return
    const s = dayStats(m, date, prevDate, m.preClose)
    if (s) boards.push(indexRow(b, s))
  })
  if (boards.filter((b) => b.kind === 'industry').length < industries.length * 0.8) throw new Error(`行业分时不全：${boards.length}/${industries.length}`)
} catch (e) { boards = []; console.log(`板块竞价跳过：${e.message}`) }

// ---------- 6. 汇总与历史 ----------
const topRows = rows.filter((r) => r.tags.includes('top'))
const yztRows = rows.filter((r) => r.tags.includes('yzt'))
const groups = { all: groupSummary(rows), top: groupSummary(topRows), yzt: groupSummary(yztRows), zt: groupSummary(rows.filter((r) => r.tags.includes('zt'))) }

let history = []
try { history = JSON.parse(fs.readFileSync(`${RAW}/history.json`, 'utf8')) } catch { history = [] }
const backRows = []
for (const d of Object.keys(sh.days).filter((x) => x < date).sort()) {
  const mk = marketDay(sh, sz, d, prevTradingDay(d))
  if (mk) backRows.push(historyRow(mk, backfill.get(d) ?? [], [], { backfilled: true }))
}
history = mergeHistory(history, [...backRows, historyRow(market, topRows, yztRows)])

const payload = {
  version: 1, generatedAt: new Date().toISOString(), asOf: date, prevDate,
  note: '盘后统计，不是买卖建议。竞价数据取自东财分时首根（09:30，只含开盘集合竞价撮合）与末根（15:00，只含收盘集合竞价撮合）；拿不到竞价过程中的委托、未成交量和 L2 大单。',
  market: { ...market, sh: undefined, sz: undefined, shAuction: market.sh.auctionAmount, szAuction: market.sz.auctionAmount, shCloseAuction: market.sh.closeAuctionAmount, szCloseAuction: market.sz.closeAuctionAmount },
  universe: { topN: TOP_N, candidates: cands.length, used: rows.length, failed, stale, pools: poolsOk, zt: zt.length, yzt: yzt.length, snapshotCheck: { n: snap.n, ok: snap.ok } },
  groups, indexes, boards, stocks: rows, history,
  sources: [
    { id: 'trends', label: '东方财富分时（push2his trends2，近 5 个交易日分钟线）', url: 'https://quote.eastmoney.com/' },
    { id: 'pools', label: '东方财富涨停池 / 昨日涨停池', url: 'https://quote.eastmoney.com/ztb/' },
    { id: 'clist', label: '东方财富沪深 A 股行情列表（挑候选股、行业名）', url: 'https://quote.eastmoney.com/center/gridlist.html' },
  ],
}
fs.mkdirSync(RAW, { recursive: true })
fs.writeFileSync(`${RAW}/history.json`, JSON.stringify(history))
fs.writeFileSync(OUT, JSON.stringify(payload))
console.log(JSON.stringify({ date, secs: Math.round((Date.now() - started) / 1000), candidates: cands.length, used: rows.length, failed, stale, boards: boards.length, snapshot: snap, auction: market.auctionAmount, closeAuction: market.closeAuctionAmount, history: history.length }))
