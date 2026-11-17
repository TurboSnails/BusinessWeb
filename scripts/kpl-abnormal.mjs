// 开盘啦「异动监管」页签数据：每个交易日收盘后运行（.github/workflows/kpl-tabs.yml），生成 public/data/kpl-abnormal.json。
// 内容：异常波动偏离值（3 日 / 10 日 / 30 日）、已触发与下一交易日可能触发的个股（按规则机械估算）、停牌与复牌 10 日内、
// 按龙虎榜规则判断今日应上榜名单并与实际龙虎榜对照、东财盘口异动当日回放。计算口径见 scripts/kpl-abnormal-lib.mjs。
// 来源：东财日 K（个股 + 基准指数，带日期）、新浪全市场行情（当日收盘快照，无日期，只在交易日 15:10 后当天使用）、
//       东财数据中心停复牌报表（带日期）、东财盘口异动（无日期，只在交易日收盘后当天采集）、本站龙虎榜数据（只读）。
// 存档：data-raw/kpl-abnormal/days/<日期>.json 每日全市场逐只涨跌幅（偏离值窗口用），保留最近约 45 个交易日；
//       缺存档（首次运行或漏跑）时改用东财日 K 逐只补齐（约 5000 次请求、3～4 分钟）。
// 用法：node scripts/kpl-abnormal.mjs
//       DATE=YYYY-MM-DD node scripts/kpl-abnormal.mjs  只用带日期的来源（日 K、停复牌报表）补出指定交易日，不采集无日期快照
import fs from 'node:fs'
import path from 'node:path'
import { isTradingDay } from './market-mood-lib.mjs'
import {
  BOARDS, HISTORY_DAYS, actualFromLhbDay, actualFromLhbLatest, boardOfCode, buildAbnormal, buildSuspend, compareLhb, dayRecord, delistName,
  indexReturns, mergeHistory, parseChanges, parseKline, predictLhb, sinaBar, summarizeRadar, tradingDaysBack,
} from './kpl-abnormal-lib.mjs'

const OUT = 'public/data/kpl-abnormal.json'
const RAW = 'data-raw/kpl-abnormal/days'
const LHB_RAW = 'data-raw/kpl-lhb/days'
const LHB_OUT = 'public/data/kpl-lhb.json'
const KEEP_RAW = HISTORY_DAYS + 5
const POOL_TOKEN = '7eea3edcaed734bea9cbfc24409ed989' // 东财公开页面使用的固定参数（与 scripts/market-mood.mjs 相同）
const SINA = 'https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

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
      await sleep(1500 * (attempt + 1))
    }
  }
}

/* ---------- 目标日期与模式 ---------- */
const bj = new Date(Date.now() + 8 * 3600_000)
const bjToday = bj.toISOString().slice(0, 10)
const minutes = bj.getUTCHours() * 60 + bj.getUTCMinutes()
const envDate = process.env.DATE ?? ''
const datedOnly = /^\d{4}-\d{2}-\d{2}$/.test(envDate)
const date = datedOnly ? envDate : bjToday
if (!isTradingDay(date)) { console.log(`${date} 非交易日，跳过`); process.exit(0) }
if (datedOnly && date > bjToday) { console.log(`${date} 晚于今天，跳过`); process.exit(0) }
if (!datedOnly && minutes < 15 * 60 + 10) { console.log(`${date} 未收盘（北京 ${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}），跳过`); process.exit(0) }
// 无日期快照（新浪全市场、盘口异动）只在交易日 15:10 后的当天采集
const live = !datedOnly

const klineUrl = (secid, lmt) => `https://push2his.eastmoney.com/api/qt/stock/kline/get?${new URLSearchParams({ secid, fields1: 'f1,f2,f3', fields2: 'f51,f53,f54,f55,f56,f57,f61', klt: '101', fqt: '1', end: date.replaceAll('-', ''), lmt: String(lmt) })}`
const emHeaders = { referer: 'https://quote.eastmoney.com/' }

/* ---------- 基准指数 ---------- */
const days = tradingDaysBack(date, HISTORY_DAYS).reverse() // 从远到近，含当日
const idxByDay = new Map(days.map((d) => [d, {}]))
for (const [id, b] of Object.entries(BOARDS)) {
  const m = indexReturns(await get(klineUrl(b.index.secid, HISTORY_DAYS + 5), { headers: emHeaders }))
  if (!m.has(date)) { console.log(`${date} ${b.index.name} 日 K 尚无当日数据，跳过`); process.exit(0) }
  for (const d of days) idxByDay.get(d)[id] = m.get(d) ?? null
}

/* ---------- 逐日存档 ---------- */
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }
const saved = new Map()
for (const d of days.slice(0, -1)) { const r = readJson(path.join(RAW, `${d}.json`)); if (r?.date === d && r.s) saved.set(d, r) }
// 30 日窗口 + 当日：最近 31 个交易日必须齐全，否则用日 K 逐只补齐
const need = days.slice(-32, -1)
const sweep = datedOnly || need.some((d) => !saved.has(d))

// 新浪全市场：总数 → 分页（每页 80）→ 再核总数，任何一页不足都放弃本次
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
      const want = Math.min(80, total - p * 80)
      if (!Array.isArray(body) || body.length !== want) throw new Error(`新浪第 ${p + 1} 页不足`)
      out[p] = body
    }
  }))
  const rows = out.flat()
  if ((await count()) !== total || new Set(rows.map((r) => r.symbol)).size !== total) throw new Error('新浪全市场总数变化或证券重复')
  return rows
}

/** 证券代码清单（只用代码，不用行情）：新浪全市场 */
async function codeList() {
  const rows = await sinaMarket()
  return rows.map((r) => ({ code: String(r.code ?? r.symbol?.slice(2)), name: String(r.name ?? '').trim() })).filter((r) => boardOfCode(r.code))
}

let bars = []
const records = new Map(saved)
if (sweep) {
  const list = await codeList()
  console.log(`逐只补日 K：${list.length} 只${datedOnly ? '（DATE 模式）' : '（存档不全）'}`)
  const perDay = new Map(days.map((d) => [d, {}]))
  let cursor = 0, fail = 0
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (cursor < list.length) {
      const it = list[cursor++]
      let k
      try { k = parseKline(await get(klineUrl(`${it.code.startsWith('6') ? 1 : 0}.${it.code}`, HISTORY_DAYS + 1), { headers: emHeaders }), HISTORY_DAYS + 1) } catch { fail++; continue }
      if (!k) { fail++; continue }
      const name = k.name || it.name
      if (delistName(name)) continue
      for (const bar of k.bars) if (perDay.has(bar.date)) perDay.get(bar.date)[it.code] = bar.ret
      const t = k.bars.at(-1)
      if (t?.date === date) bars.push({ code: it.code, name, board: boardOfCode(it.code), close: t.close, prev: t.prev, high: t.high, low: t.low, volume: t.volume, amount: t.amount, turnover: t.turnover, ret: t.ret })
    }
  }))
  if (fail > list.length * 0.02) throw new Error(`日 K 失败过多（${fail}/${list.length}），放弃本次`)
  if (bars.length < 4000) { console.log(`${date} 日 K 当日行情只有 ${bars.length} 只，数据未就绪，跳过`); process.exit(0) }
  for (const d of days.slice(0, -1)) {
    if (!saved.has(d) || datedOnly) records.set(d, { date: d, idx: idxByDay.get(d), s: perDay.get(d), backfilled: true })
  }
} else {
  bars = (await sinaMarket()).map(sinaBar).filter(Boolean).filter((b) => !delistName(b.name))
  if (bars.length < 4000) throw new Error(`新浪当日有成交的沪深 A 股只有 ${bars.length} 只`)
}
records.set(date, { ...dayRecord(date, idxByDay.get(date), bars), source: sweep ? 'kline' : 'sina' })
const history = days.filter((d) => records.has(d)).map((d) => ({ ...records.get(d), idx: idxByDay.get(d) }))

/* ---------- 实际龙虎榜（只读） ---------- */
const actualByDate = new Map()
if (fs.existsSync(LHB_RAW)) {
  for (const f of fs.readdirSync(LHB_RAW)) {
    const d = f.slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(f) || !idxByDay.has(d)) continue
    const day = readJson(path.join(LHB_RAW, f))
    if (day?.date === d && Array.isArray(day.entries)) actualByDate.set(d, actualFromLhbDay(day))
  }
}
let todayActual = actualByDate.get(date) ?? null
const lhbOut = readJson(LHB_OUT)
if (!todayActual && lhbOut?.asOf === date && lhbOut.latest?.date === date) todayActual = actualFromLhbLatest(lhbOut.latest)
if (todayActual) actualByDate.set(date, todayActual)
else actualByDate.delete(date)

const res = buildAbnormal({ date, history, bars, actualByDate, todayActual })
const names = new Map(bars.map((b) => [b.code, b.name]))
const idxToday = idxByDay.get(date)
const lhb = compareLhb(predictLhb(bars, idxToday, res.d3Hits), todayActual, names)

/* ---------- 停牌 / 复牌（东财数据中心，带日期） ---------- */
let suspend = null
try {
  const since = tradingDaysBack(date, 30).at(-1)
  const rows = []
  for (let page = 1; page <= 20; page++) {
    const q = new URLSearchParams({ reportName: 'RPT_CUSTOM_SUSPEND_DATA_INTERFACE', columns: 'ALL', pageSize: '500', pageNumber: String(page), sortColumns: 'SUSPEND_START_DATE', sortTypes: '-1', source: 'WEB', client: 'WEB', filter: `(MARKET="全部")(DATETIME='${since}')` })
    const body = await get(`https://datacenter-web.eastmoney.com/api/data/v1/get?${q}`, { headers: { referer: 'https://data.eastmoney.com/tfpxx/' } })
    if (!body?.success || !Array.isArray(body?.result?.data)) throw new Error(body?.message ?? '无结果')
    rows.push(...body.result.data)
    if (page >= body.result.pages) { if (rows.length !== body.result.count) throw new Error(`停复牌行数不完整（${rows.length}/${body.result.count}）`); break }
  }
  suspend = buildSuspend(rows, date)
  // 复牌后的累计涨跌幅（复牌首日起，按存档逐日收益复利）
  for (const r of suspend.resumed) {
    let p = 1, n = 0
    for (const h of history) if (h.date >= r.resume && r.code in h.s && h.s[r.code] !== null) { p *= 1 + h.s[r.code] / 100; n++ }
    r.since = n ? Math.round((p - 1) * 10000) / 100 : null
    r.dev3 = res.devOf.get(r.code) ?? null
  }
} catch (e) { console.log(`停复牌获取失败：${e.message}`) }

/* ---------- 盘口异动（无日期快照，只在收盘后当天采集） ---------- */
const prev = readJson(OUT)
let radar = prev?.radar?.date === date ? prev.radar : null
if (live) {
  try {
    const types = [4, 8, 16, 32, 64, 128, 8193, 8194, 8201, 8202, 8203, 8204, 8207, 8208, 8209, 8210, 8211, 8212, 8213, 8214, 8215, 8216]
    const body = await get(`https://push2ex.eastmoney.com/getAllStockChanges?${new URLSearchParams({ type: types.join(','), ut: POOL_TOKEN, pageindex: '0', pagesize: '50000', dpt: 'wzchanges' })}`, { headers: emHeaders })
    const events = parseChanges(body)
    // 当日校验：收盘后应有 14:5x 之后的事件，且封涨停板事件里能找到今日收在涨停的股票
    const lastTime = events.reduce((m, e) => (e.time > m ? e.time : m), '')
    if (events.length < 1000 || lastTime < '14:50:00') throw new Error(`盘口异动不像完整的当日数据（${events.length} 条，最后 ${lastTime}）`)
    radar = { date, ...summarizeRadar(events) }
  } catch (e) { console.log(`盘口异动获取失败（保留已有）：${e.message}`) }
}

/* ---------- 输出 ---------- */
const trimNear = (rows, dir) => rows.filter((r) => (dir > 0 ? r.up3 : r.down3)).sort((a, b) => (dir > 0 ? a.up3.need - b.up3.need : b.down3.need - a.down3.need)).slice(0, 80)
const nearUp = trimNear(res.near, 1), nearDown = trimNear(res.near, -1)
const summary = {
  universe: bars.filter((b) => b.ret !== null).length,
  d3up: res.triggered.filter((r) => r.trig.includes('d3up')).length,
  d3down: res.triggered.filter((r) => r.trig.includes('d3down')).length,
  severe: res.triggered.filter((r) => r.trig.some((t) => /^d(10|30)|same3/.test(t))).length,
  nearUp: res.near.filter((r) => r.up3).length,
  nearDown: res.near.filter((r) => r.down3).length,
  suspended: suspend ? suspend.today.length : null,
  resumed: suspend ? suspend.resumed.length : null,
  lhbPredicted: lhb.rows.length,
  lhbHit: lhb.stats?.hit ?? null,
  radarTotal: radar?.total ?? null,
}
const out = {
  version: 1, generatedAt: new Date().toISOString(), date,
  note: '按沪深交易所公开规则机械计算的盘后统计，不是预测，也不是买卖建议。「下一交易日再涨 / 跌多少会触发」假设基准指数当天持平。',
  indices: Object.entries(BOARDS).map(([id, b]) => ({ board: id, code: b.index.code, name: b.index.name, pct: idxToday[id] === null ? null : Math.round(idxToday[id] * 100) / 100 })),
  summary,
  triggered: res.triggered,
  nearUp, nearDown,
  severeWatch: res.severeWatch.slice(0, 80),
  lhb: { available: lhb.available, rows: lhb.rows, missed: lhb.missed, stats: lhb.stats, backtest: res.backtest },
  suspend,
  radar,
  history: mergeHistory(prev?.history ?? [], { date, d3up: summary.d3up, d3down: summary.d3down, severe: summary.severe, nearUp: summary.nearUp, nearDown: summary.nearDown, suspended: summary.suspended, resumed: summary.resumed, lhbPredicted: summary.lhbPredicted, lhbHit: summary.lhbHit, radarTotal: summary.radarTotal, ...(sweep ? { kline: true } : {}) }),
  archive: { from: history[0]?.date ?? null, to: date, days: history.length, backfilled: history.filter((h) => h.backfilled).length },
  sources: [
    { id: 'kline', label: '东方财富日 K（个股前复权收盘价、基准指数）', url: 'https://quote.eastmoney.com/' },
    ...(sweep ? [] : [{ id: 'sina', label: '新浪 A 股全市场行情（当日收盘）', url: 'https://finance.sina.com.cn/' }]),
    { id: 'suspend', label: '东方财富数据中心 · 停复牌信息', url: 'https://data.eastmoney.com/tfpxx/' },
    { id: 'changes', label: '东方财富 · 盘口异动', url: 'https://quote.eastmoney.com/changes/' },
    { id: 'lhb', label: '本站龙虎榜（东方财富数据中心每日上榜明细）', url: 'https://data.eastmoney.com/stock/lhb.html' },
  ],
}
fs.mkdirSync(RAW, { recursive: true })
for (const [d, r] of records) if (d === date || !saved.has(d) || datedOnly) fs.writeFileSync(path.join(RAW, `${d}.json`), JSON.stringify(r))
for (const f of fs.readdirSync(RAW).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(0, -KEEP_RAW)) fs.rmSync(path.join(RAW, f), { force: true })
fs.writeFileSync(OUT, JSON.stringify(out))
console.log(JSON.stringify({ date, mode: sweep ? 'kline' : 'sina', ...summary, lhb: lhb.stats, backtest: res.backtest }))
