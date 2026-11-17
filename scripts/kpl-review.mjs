// 开盘啦 · 复盘页数据：每个交易日收盘后运行（.github/workflows/kpl-tabs.yml），生成 public/data/kpl-review.json。
// 来源：东财涨停 / 炸板 / 跌停 / 昨日涨停股池（按日期查询，校验 qdate）、东财日 K（前复权，回补快照仓）、东财行情列表（代码、名称、行业）、
// 新浪全市场分页行情（收盘后滚动追加快照仓）。
// 历史：data-raw/kpl-review/history.json 存每日赚钱 / 亏钱效应计数、标签名单与标签次日表现；首次运行用每日复盘归档、打板页历史与快照仓补出早期计数。
// 快照仓：data-raw/kpl-review/closes/<日期>.csv；回补进度 data-raw/kpl-review/backfill.json（每次最多回补 BACKFILL_MAX 只股票，默认 1500）。
// 用法：node scripts/kpl-review.mjs                     收盘后（北京 15:10 之后）的正常运行，用新浪当日快照
//       DATE=YYYY-MM-DD node scripts/kpl-review.mjs     只用带日期的数据重算某日：快照仓已有该日（日 K 回补）且股池 qdate = 该日
//       BACKFILL_ONLY=1 BACKFILL_MAX=6000 node ...      只做快照仓回补（回补完成后也做缺口修补）
// 缺口修补：快照仓窗口内漏掉的过去交易日（上证指数日 K 与交易日历都认定开市），用东财前复权日 K 逐股重建，
//   每次最多 REPAIR_MAX 只（默认 2000，0 = 关闭），进度 data-raw/kpl-review/repair.json，全部完成并通过校验才写出 closes/<日期>.csv。
import fs from 'node:fs'
import { calendarCovers, isTradingDay, prevTradingDay } from './market-mood-lib.mjs'
import { mapDt, mapYzt, mapZb, mapZt, parseSinaFull, poolRaw } from './kpl-daban-lib.mjs'
import {
  BACKFILL_DAYS, KEEP_CLOSE_DAYS, NEW_HIGH_DAYS, TAGS, buildDay, canReplaceOut, firstSeenOf, formatCloses, historyOf, mergeKline, mergeStore, missingDays, newHighHistory, newHighsAt,
  newRepair, nextPerf, parseCloses, parseKline, pctAt, repairEntry, repairFinalize, repairPlan, repairRecord, repairTodo, seedDays, sinaToRows, snapshotComplete, tagStats, tradingWindow,
} from './kpl-review-lib.mjs'

const OUT = 'public/data/kpl-review.json'
const RAW = 'data-raw/kpl-review'
const CLOSES = `${RAW}/closes`
const POOL_TOKEN = '7eea3edcaed734bea9cbfc24409ed989' // 东财公开页面使用的固定参数（与 scripts/market-mood.mjs 相同）
const SINA = 'https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/'
const EM_REF = { referer: 'https://quote.eastmoney.com/' }
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
const BACKFILL_MAX = Number(process.env.BACKFILL_MAX ?? 1500)
const REPAIR_MAX = Number(process.env.REPAIR_MAX ?? 2000)
const REPAIR_FILE = `${RAW}/repair.json`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function get(url, { kind = 'json', headers = {} } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, ...headers }, signal: AbortSignal.timeout(15000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      if (kind === 'text') return await res.text()
      return await res.json()
    } catch (e) {
      if (attempt >= 2) throw e
      await sleep(2000 * (attempt + 1))
    }
  }
}
const readJson = (f, dflt) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return dflt } }

const bjNow = () => { const bj = new Date(Date.now() + 8 * 3600_000); return { day: bj.toISOString().slice(0, 10), minutes: bj.getUTCHours() * 60 + bj.getUTCMinutes() } }
const { day: bjToday, minutes } = bjNow()
const override = /^\d{4}-\d{2}-\d{2}$/.test(process.env.DATE ?? '') ? process.env.DATE : null
const date = override ?? bjToday
// 无日期快照（新浪）取回前后都要核：仍是同一个北京日期且在 15:10 之后（回补可能拖过午夜）
const stillLive = () => { const n = bjNow(); return n.day === date && n.minutes >= 15 * 60 + 10 }
const backfillOnly = process.env.BACKFILL_ONLY === '1'

/* ---------- 快照仓读写 ---------- */
fs.mkdirSync(CLOSES, { recursive: true })
const listDays = () => fs.readdirSync(CLOSES).filter((f) => /^\d{4}-\d{2}-\d{2}\.csv$/.test(f)).map((f) => f.slice(0, 10)).sort()
const loadDay = (d) => ({ date: d, ...parseCloses(fs.readFileSync(`${CLOSES}/${d}.csv`, 'utf8')) })
const loadAll = () => listDays().map(loadDay)

/* ---------- 代码表（东财行情列表，代码 / 名称 / 行业；静态属性，非当日行情） ---------- */
async function universe() {
  const fs_ = 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048'
  const out = []
  for (let pn = 1; pn < 100; pn++) {
    const j = await get(`https://push2delay.eastmoney.com/api/qt/clist/get?${new URLSearchParams({ pn: String(pn), pz: '100', po: '1', np: '1', fltt: '2', invt: '2', fid: 'f12', fs: fs_, fields: 'f12,f13,f14,f100' })}`, { headers: EM_REF })
    const diff = j?.data?.diff
    if (!Array.isArray(diff) || !diff.length) break
    for (const r of diff) if (/^\d{6}$/.test(r.f12)) out.push({ code: r.f12, market: r.f13, name: String(r.f14 ?? '').trim(), industry: typeof r.f100 === 'string' && r.f100 !== '-' ? r.f100 : '' })
    if (out.length >= j.data.total) break
  }
  if (out.length < 4000) throw new Error(`代码表不完整：${out.length}`)
  return out
}

/* ---------- 快照仓回补（东财日 K，前复权，带日期） ---------- */
async function backfill(meta) {
  let bf = readJson(`${RAW}/backfill.json`, null)
  if (bf?.complete) return bf
  if (!bf) {
    // 回补窗口：以上证指数日 K 的最近 BACKFILL_DAYS 个交易日为准（不依赖本地节假日表）
    const end = override ?? prevTradingDay(bjToday) // 当日快照由新浪写，回补到上一交易日
    const j = await get(`https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=1.000001&fields1=f1&fields2=f51&klt=101&fqt=0&end=${end.replaceAll('-', '')}&lmt=${BACKFILL_DAYS}`, { headers: EM_REF })
    const dates = (j?.data?.klines ?? []).map((s) => String(s).slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= end)
    if (dates.length < BACKFILL_DAYS || dates.at(-1) !== end) { console.log(`回补窗口取不到（指数日 K 截至 ${dates.at(-1) ?? '无'}，目标 ${end}），本次不回补`); return null }
    bf = { start: dates[0], end, dates, done: [], failed: {}, complete: false, startedAt: new Date().toISOString() }
  }
  const done = new Set(bf.done)
  const todo = meta.list.filter((u) => !done.has(u.code)).slice(0, BACKFILL_MAX)
  if (!todo.length) { bf.complete = true; bf.finishedAt = new Date().toISOString(); fs.writeFileSync(`${RAW}/backfill.json`, JSON.stringify(bf)); return bf }
  const dayMaps = new Map(bf.dates.map((d) => [d, fs.existsSync(`${CLOSES}/${d}.csv`) ? loadDay(d).rows : new Map()]))
  let cursor = 0, fetched = 0
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < todo.length) {
      const u = todo[cursor++]
      const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?${new URLSearchParams({ secid: `${u.market}.${u.code}`, fields1: 'f1,f2,f3', fields2: 'f51,f52,f53,f54,f55,f60', klt: '101', fqt: '1', end: bf.end.replaceAll('-', ''), lmt: String(BACKFILL_DAYS + 1) })}`
      try {
        const bars = parseKline(await get(url, { headers: EM_REF }), bf.end).filter((b) => b.date >= bf.start)
        if (bars.some((b) => !dayMaps.has(b.date))) throw new Error('日 K 日期不在回补窗口内')
        mergeKline(dayMaps, u.code, bars)
        done.add(u.code)
        delete bf.failed[u.code]
        fetched++
      } catch (e) { bf.failed[u.code] = String(e.message).slice(0, 80) }
      await sleep(60)
    }
  }))
  for (const [d, rows] of dayMaps) fs.writeFileSync(`${CLOSES}/${d}.csv`, formatCloses(d, 'em-kline-qfq', rows))
  bf.done = [...done].sort()
  bf.universe = meta.list.length
  bf.complete = bf.done.length >= meta.list.length
  if (bf.complete) bf.finishedAt = new Date().toISOString()
  fs.writeFileSync(`${RAW}/backfill.json`, JSON.stringify(bf))
  console.log(`快照仓回补：本次 ${fetched} 只，累计 ${bf.done.length} / ${meta.list.length}，失败 ${Object.keys(bf.failed).length}`)
  return bf
}

/* ---------- 快照仓缺口修补（东财日 K，前复权，带日期；口径见 kpl-review-lib.mjs 末尾） ---------- */
const writeAtomic = (f, text) => { fs.writeFileSync(`${f}.tmp`, text); fs.renameSync(`${f}.tmp`, f) } // 临时文件名不匹配 <日期>.csv，读者看不到
const marketOf = new Map()
async function repairGaps(meta) {
  if (!(REPAIR_MAX > 0)) return
  for (const u of meta.list) marketOf.set(u.code, u.market)
  let budget = REPAIR_MAX
  for (;;) {
    const stored = listDays()
    if (stored.length < 2) return
    const to = prevTradingDay(date) // 只修过去的交易日；当日快照由新浪写
    const saved = readJson(REPAIR_FILE, {})
    const keepLog = (entry = null) => writeAtomic(REPAIR_FILE, JSON.stringify({ version: 1, date: null, log: (saved.log ?? []).concat(entry ? [entry] : []).slice(-20) }))
    let indexDates
    try {
      const j = await get(`https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=1.000001&fields1=f1&fields2=f51&klt=101&fqt=0&beg=${stored[0].replaceAll('-', '')}&end=${to.replaceAll('-', '')}`, { headers: EM_REF })
      indexDates = (j?.data?.klines ?? []).map((s_) => String(s_).slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    } catch (e) { console.log(`缺口检查：上证指数日 K 取不到（${e.message}），本次不修补`); return }
    if (!indexDates.length) { console.log('缺口检查：上证指数日 K 为空，本次不修补'); return }
    const { missing, indexOnly, calendarOnly } = missingDays({ stored, indexDates, from: stored[0], to, isTrading: isTradingDay })
    if (indexOnly.length) console.log(`缺口检查：指数日 K 有、交易日历没有的日子 ${indexOnly.join(',')}（请核对 market-mood-lib 休市表），不修补`)
    if (calendarOnly.length) console.log(`缺口检查：交易日历有、指数日 K 没有的日子 ${calendarOnly.join(',')}（请核对休市表），不修补`)
    let rep = saved.date && missing.includes(saved.date) && saved.plan ? saved : null
    if (!missing.length) { if (saved.date) keepLog(); console.log(`快照仓无缺口（${stored[0]} ~ ${to}）`); return }
    if (budget <= 0) { console.log(`快照仓缺 ${missing.length} 个交易日（${missing.join(',')}），本次请求额度已用完，下次继续`); return }
    const days = loadAll()
    if (!rep) rep = newRepair(missing[0], repairPlan(days, missing[0]))
    const gap = rep.date
    const todo = repairTodo(rep, budget)
    budget -= todo.length
    let cursor = 0, fetched = 0
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (cursor < todo.length) {
        const code = todo[cursor++]
        const next = rep.plan[code]
        const secid = `${marketOf.get(code) ?? (code.startsWith('6') ? 1 : 0)}.${code}`
        const end = (next ?? gap).replaceAll('-', '')
        const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?${new URLSearchParams({ secid, fields1: 'f1,f2,f3', fields2: 'f51,f52,f53,f54,f55,f60', klt: '101', fqt: '1', beg: gap.replaceAll('-', ''), end })}`
        try {
          const bars = parseKline(await get(url, { headers: EM_REF }), next ?? gap)
          repairRecord(rep, code, repairEntry(bars, gap, next))
          fetched++
        } catch (e) { repairRecord(rep, code, e instanceof Error ? e : new Error(String(e))) }
        await sleep(60)
      }
    }))
    const fin = repairFinalize(days, rep)
    if (!fin.ready) {
      writeAtomic(REPAIR_FILE, JSON.stringify({ ...rep, log: saved.log ?? [] }))
      console.log(`快照仓缺口 ${gap}：本次 ${fetched} 只，进度 ${Object.keys(rep.bars).length} / ${Object.keys(rep.plan).length}，未完成 ${fin.pending}（缺口共 ${missing.length} 天：${missing.join(',')}）`)
      return
    }
    if (!fin.ok) {
      // 完整性校验不通过：丢弃进度，下次从头再来；不写任何快照
      keepLog({ date: gap, rejected: fin.reason, at: new Date().toISOString() })
      console.log(`快照仓缺口 ${gap} 修补结果未通过校验（${fin.reason}），丢弃进度，不写文件`)
      return
    }
    // 先补相邻记录的昨收，再写缺口日（中途失败时缺口日仍缺，下次重做；补上的昨收本身就是正确值）
    let patched = 0
    for (const [d, m] of fin.patches) {
      const cur = loadDay(d)
      for (const [code, p] of m) { const r = cur.rows.get(code); if (r && r.p === undefined) { r.p = p; patched++ } }
      const extra = Object.fromEntries(Object.entries(cur.meta).filter(([k]) => !['date', 'source', 'fields'].includes(k)))
      writeAtomic(`${CLOSES}/${d}.csv`, formatCloses(d, cur.meta.source ?? 'unknown', cur.rows, extra))
    }
    writeAtomic(`${CLOSES}/${gap}.csv`, formatCloses(gap, 'em-kline-repair', fin.rows, { repaired: new Date().toISOString().slice(0, 10), skipped: fin.skipped.length }))
    keepLog({ date: gap, rows: fin.rows.size, patched, skipped: fin.skipped, at: new Date().toISOString() })
    console.log(`快照仓缺口 ${gap} 已修补：${fin.rows.size} 行，补昨收 ${patched} 条，放弃 ${fin.skipped.length} 只`)
  }
}

/* ---------- 主流程 ---------- */
if (!calendarCovers(date) || !calendarCovers(tradingWindow(date, NEW_HIGH_DAYS)[0])) { console.log(`${date} 或其百日窗口所在年份不在休市表内（scripts/market-mood-lib.mjs），无法确定交易日，跳过`); process.exit(0) }
if (!isTradingDay(date)) { console.log(`${date} 非交易日，跳过`); process.exit(0) }
if (!backfillOnly && !canReplaceOut(readJson(OUT, null), date)) { console.log(`${OUT} 已是比 ${date} 更新的日期，跳过（不倒退）`); process.exit(0) }
if (!override && !backfillOnly && minutes < 15 * 60 + 10) { console.log(`${date} 未收盘（北京 ${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}），跳过`); process.exit(0) }

let meta = readJson(`${RAW}/meta.json`, null)
try {
  const list = await universe()
  meta = { updatedAt: new Date().toISOString(), list: list.map(({ code, market, name, industry }) => ({ code, market, name, industry })) }
  fs.writeFileSync(`${RAW}/meta.json`, JSON.stringify(meta))
} catch (e) { console.log(`代码表获取失败，沿用上一份：${e.message}`) }
if (!meta) { console.log('没有代码表，跳过'); process.exit(0) }

const bf = await backfill(meta)
if (bf?.complete) {
  try { await repairGaps(meta) } catch (e) { console.log(`快照仓缺口修补失败（不影响本次其余计算）：${e.message}`) }
}
if (backfillOnly) process.exit(0)

const poolUrl = (ep, sort) => `https://push2ex.eastmoney.com/${ep}?${new URLSearchParams({ ut: POOL_TOKEN, dpt: 'wz.ztzt', Pageindex: '0', pagesize: '10000', sort, date: date.replaceAll('-', '') })}`
async function pool(ep, sort) { return poolRaw(await get(poolUrl(ep, sort), { headers: EM_REF }), date) }
let pools
try {
  pools = {
    zt: (await pool('getTopicZTPool', 'fbt:asc')).map(mapZt),
    zb: (await pool('getTopicZBPool', 'fbt:asc')).map(mapZb),
    dt: (await pool('getTopicDTPool', 'fund:asc')).map(mapDt),
    yzt: (await pool('getYesterdayZTPool', 'zs:desc')).map(mapYzt),
  }
} catch (e) { console.log(`${date} 股池日期校验未通过或尚未更新：${e.message}`); process.exit(0) }

// 当日快照：正常运行用新浪全市场（只在当日收盘后）；指定日期时只认快照仓里已有的带日期数据
if (!override) {
  async function sinaMarket() {
    const count = async () => Number(String(await get(`${SINA}Market_Center.getHQNodeStockCount?node=hs_a`, { kind: 'text', headers: { referer: 'https://finance.sina.com.cn/' } })).replace(/\D/g, ''))
    const total = await count()
    if (!(total > 4000 && total < 9000)) throw new Error(`新浪全市场总数异常：${total}`)
    const pages = Math.ceil(total / 80)
    const out = Array(pages)
    let cursor = 0
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (cursor < pages) {
        const p = cursor++
        const body = await get(`${SINA}Market_Center.getHQNodeData?${new URLSearchParams({ node: 'hs_a', sort: 'symbol', asc: '1', num: '80', page: String(p + 1) })}`, { headers: { referer: 'https://finance.sina.com.cn/' } })
        if (!Array.isArray(body) || body.length !== Math.min(80, total - p * 80)) throw new Error(`新浪第 ${p + 1} 页不足`)
        out[p] = body.map(parseSinaFull)
      }
    }))
    const rows = out.flat()
    if ((await count()) !== total || new Set(rows.map((r) => r.code)).size !== total) throw new Error('新浪全市场总数变化或证券重复')
    return rows
  }
  if (!stillLive()) { console.log(`已不在 ${date} 收盘后的当天（可能回补拖过了午夜），不采集无日期快照`); process.exit(0) }
  const rows = await sinaMarket()
  if (!stillLive()) { console.log(`新浪快照取回时已不在 ${date} 收盘后的当天，放弃（无日期快照不能记到别的日期）`); process.exit(0) }
  const older = listDays().filter((d) => d < date).slice(-15).map(loadDay)
  const lastClose = (code) => { for (let j = older.length - 1; j >= 0; j--) { const r = older[j].rows.get(code); if (r) return r.c } return null }
  fs.writeFileSync(`${CLOSES}/${date}.csv`, formatCloses(date, 'sina', sinaToRows(rows, lastClose)))
  // 只保留最近 KEEP_CLOSE_DAYS 个交易日
  for (const d of listDays().slice(0, -KEEP_CLOSE_DAYS)) fs.unlinkSync(`${CLOSES}/${d}.csv`)
} else if (!fs.existsSync(`${CLOSES}/${date}.csv`)) {
  console.log(`快照仓没有 ${date}（指定日期只用带日期的日 K 数据），跳过`); process.exit(0)
} else if (!snapshotComplete(loadDay(date).meta, bf?.complete)) {
  console.log(`快照仓 ${date} 是回补中的日 K 快照（${bf?.done?.length ?? 0} / ${meta.list.length}），回补完成前不出历史日数据，跳过`); process.exit(0)
}

const days = loadAll()
const i = days.findIndex((d) => d.date === date)
const storeComplete = !!bf?.complete
const names = new Map(meta.list.map((u) => [u.code, u.name]))
const industry = new Map(meta.list.map((u) => [u.code, u.industry]))

// 历史：已有记录 + 种子
let store = readJson(`${RAW}/history.json`, { days: {} })
const daban = readJson('data-raw/kpl-daban/history.json', { days: {} }).days ?? {}
try {
  const archive = readJson('public/data/daily-analysis.json', {})
  store = mergeStore(store, seedDays({ snapshots: archive.snapshots ?? [], daban, days: storeComplete ? days : [] }))
} catch (e) { console.log(`历史种子失败：${e.message}`) }

const yDate = prevTradingDay(date)
const prevRec = store.days[yDate] && !store.days[yDate].seeded ? store.days[yDate] : null
const yZbFallback = Array.isArray(daban[yDate]?.zb) ? new Set(daban[yDate].zb) : null
const yi = days[i - 1]?.date === yDate ? i - 1 : -1
const yUsable = yi >= 0 && snapshotComplete(days[yi].meta, storeComplete)
const { record, tags, dist, intraday } = buildDay({ date, pools, days, prevRec, yZbFallback, yUsable })
// 上一交易日标签的次日（今日）表现
if (prevRec?.tags) store.days[yDate] = { ...prevRec, next: nextPerf(prevRec.tags, days, i) }
store = mergeStore(store, { [date]: { ...record, next: store.days[date]?.next } })

// 百日新高（快照仓回补完成后才计算）
let newHigh = null, highs = []
if (storeComplete) {
  const firstSeen = firstSeenOf(days)
  highs = newHighHistory(days, firstSeen)
  const cur = newHighsAt(days, i, firstSeen)
  if (cur) {
    const prevSet = days[i - 1]?.date === yDate ? newHighsAt(days, i - 1, firstSeen)?.codes ?? null : null
    const groups = new Map()
    for (const c of cur.codes) {
      const ind = industry.get(c) || '未分类'
      const g = groups.get(ind) ?? []
      g.push({ code: c, name: names.get(c) ?? c, pct: pctAt(days, i, c), fresh: prevSet ? !prevSet.has(c) : null })
      groups.set(ind, g)
    }
    newHigh = {
      count: cur.codes.size, fresh: prevSet ? [...cur.codes].filter((c) => !prevSet.has(c)).length : null, eligible: cur.eligible,
      groups: [...groups].map(([name, stocks]) => ({ industry: name, count: stocks.length, stocks: stocks.sort((a, b) => (b.pct ?? -99) - (a.pct ?? -99)) }))
        .sort((a, b) => b.count - a.count || a.industry.localeCompare(b.industry)),
    }
  }
}
const nameOf = (r) => ({ ...r, name: r.name || names.get(r.code) || r.code })
const summary = { ...record.counts, newHigh: newHigh?.count ?? null, newHighFresh: newHigh?.fresh ?? null }
const closesInfo = {
  days: days.length, from: days[0]?.date ?? null, to: days.at(-1)?.date ?? null, complete: storeComplete,
  done: bf?.done?.length ?? 0, universe: bf?.universe ?? meta.list.length, failed: Object.keys(bf?.failed ?? {}).length, end: bf?.end ?? null,
}
const sources = [
  { id: 'pools', label: '东方财富涨停 / 炸板 / 跌停 / 昨日涨停股池', url: 'https://quote.eastmoney.com/ztb/' },
  { id: 'kline', label: '东方财富个股日 K（前复权，回补快照仓）', url: 'https://quote.eastmoney.com/' },
  { id: 'market', label: '新浪 A 股全市场行情（每日滚动追加快照仓）', url: 'https://finance.sina.com.cn/' },
]
const out = {
  version: 1, generatedAt: new Date().toISOString(), asOf: date,
  note: '盘后统计，不是买卖建议。标签、赚钱效应、亏钱效应、百日新高的口径为本站自定，见页面说明；标签次日表现是历史统计，不预示未来。',
  summary, openDist: dist, intraday,
  tags: TAGS.map((t) => ({ ...t, stocks: tags.get(t.id).map(nameOf) })),
  tagStats: tagStats(store),
  newHigh, closes: closesInfo,
  history: historyOf(store, highs),
  sources,
}
fs.writeFileSync(`${RAW}/history.json`, JSON.stringify(store))
fs.writeFileSync(OUT, JSON.stringify(out))
console.log(JSON.stringify({ date, ...summary, tags: Object.fromEntries([...tags].map(([k, v]) => [k, v.length])), closes: closesInfo, highs: highs.length, openDist: dist && { n: dist.n, avg: dist.avg } }))
