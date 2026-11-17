// 开盘啦「时间线」页签数据：每个交易日收盘后运行（.github/workflows/kpl-tabs.yml，排在 kpl-abnormal、kpl-review 之后），
// 生成 public/data/kpl-timeline.json。收盘后还原当日盘面时间线，不是盘中直播。口径见 scripts/kpl-timeline-lib.mjs 顶部。
// 来源：东财指数分时 trends2（带日期，必需）、东财板块异动 getAllBKChanges（带 dt 日期）、东财板块分类 clist（只取代码）、
//       本站打板数据 public/data/kpl-daban.json（涨停 / 炸板池首封时间，只读；缺失时直接取带日期的东财涨停池）、
//       东财个股所属行业 / 概念 ulist f100 / f103（概念提示用）、本站异动监管 public/data/kpl-abnormal.json 的盘口异动（只读）。
// 存档：data-raw/kpl-timeline/days/<日期>.json 每日完整输出，保留最近 30 个交易日。
// 用法：node scripts/kpl-timeline.mjs
//       DATE=YYYY-MM-DD node scripts/kpl-timeline.mjs  补出指定交易日（只用带日期的来源；板块异动的 dt 对不上就留空）
import fs from 'node:fs'
import path from 'node:path'
import { isTradingDay, parsePool, prevTradingDay } from './market-mood-lib.mjs'
import {
  INDICES, boardTable, buildEvents, buildSlots, classifyBoards, conceptCounts, fromDaban, fromPoolRow, indexDay, mergeHistory,
  parseBkChanges, parseIndexTrends, parseStockMeta, radarOf, ztByBoard,
} from './kpl-timeline-lib.mjs'

const OUT = 'public/data/kpl-timeline.json'
const RAW = 'data-raw/kpl-timeline/days'
const KEEP_RAW = 30
const POOL_TOKEN = '7eea3edcaed734bea9cbfc24409ed989' // 东财公开页面使用的固定参数（与 scripts/market-mood.mjs 相同）
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
const QUOTE_HOSTS = ['https://push2.eastmoney.com', 'https://push2delay.eastmoney.com', 'https://82.push2.eastmoney.com']

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function get(url) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, referer: 'https://quote.eastmoney.com/' }, signal: AbortSignal.timeout(15000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (e) {
      if (attempt >= 2) throw e
      await sleep(1500 * (attempt + 1))
    }
  }
}
async function quote(p) {
  let last
  for (const host of QUOTE_HOSTS) {
    try { return await get(`${host}${p}`) } catch (e) { last = e }
  }
  throw last
}
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }

/* ---------- 目标日期 ---------- */
const bj = new Date(Date.now() + 8 * 3600_000)
const bjToday = bj.toISOString().slice(0, 10)
const minutes = bj.getUTCHours() * 60 + bj.getUTCMinutes()
const envDate = process.env.DATE ?? ''
const datedOnly = /^\d{4}-\d{2}-\d{2}$/.test(envDate)
const date = datedOnly ? envDate : bjToday
if (!isTradingDay(date)) { console.log(`${date} 非交易日，跳过`); process.exit(0) }
if (datedOnly && date > bjToday) { console.log(`${date} 晚于今天，跳过`); process.exit(0) }
if (!datedOnly && minutes < 15 * 60 + 10) { console.log(`${date} 未收盘（北京 ${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}），跳过`); process.exit(0) }
const prevDate = prevTradingDay(date)
const prev = readJson(OUT)
const prevSame = prev?.date === date ? prev : null

/* ---------- 1. 指数分时（必需，带日期） ---------- */
const indices = {}
try {
  for (const x of INDICES) {
    const body = await get(`https://push2his.eastmoney.com/api/qt/stock/trends2/get?${new URLSearchParams({ secid: x.secid, fields1: 'f1,f2,f3,f4,f5,f6,f7,f8', fields2: 'f51,f53,f54,f55', iscr: '0', iscca: '0', ndays: '5' })}`)
    indices[x.id] = indexDay(parseIndexTrends(body), date, prevDate)
    await sleep(200)
  }
} catch (e) { console.log(`${date} 指数分时不可用，放弃本次：${e.message}`); process.exit(0) }

/* ---------- 2. 涨停 / 炸板首封时间 ---------- */
let pools = fromDaban(readJson('public/data/kpl-daban.json'), date)
let poolSrc = pools ? 'daban' : null
if (!pools) {
  try {
    const pool = async (fn) => parsePool(await get(`https://push2ex.eastmoney.com/${fn}?${new URLSearchParams({ ut: POOL_TOKEN, dpt: 'wz.ztzt', Pageindex: '0', pagesize: '10000', sort: 'fbt:asc', date: date.replaceAll('-', '') })}`), date)
    pools = { zt: (await pool('getTopicZTPool')).map(fromPoolRow), zb: (await pool('getTopicZBPool')).map(fromPoolRow) }
    poolSrc = 'pool'
  } catch (e) { console.log(`涨停池不可用（时间线不含涨停）：${e.message}`) }
}
const zt = pools?.zt ?? [], zb = pools?.zb ?? []

/* ---------- 3. 板块分类（只取代码）+ 统计类概念名 ---------- */
async function clistCodes(fsq) {
  const out = []
  let total = null
  for (let p = 1; p <= 20; p++) {
    const d = (await quote(`/api/qt/clist/get?${new URLSearchParams({ pn: String(p), pz: '100', po: '1', np: '1', fltt: '2', invt: '2', fid: 'f12', fs: fsq, fields: 'f12,f14' })}`))?.data
    if (!d || !Array.isArray(d.diff)) throw new Error(`${fsq} 返回异常`)
    total ??= d.total
    out.push(...d.diff.map((r) => ({ code: String(r.f12), name: String(r.f14 ?? '').trim() })))
    if (out.length >= total || !d.diff.length) break
    await sleep(200)
  }
  if (out.length !== total) throw new Error(`${fsq} 条数不全：${out.length}/${total}`)
  return out
}
let kinds = null, statNames = new Set()
try {
  const stat = await clistCodes('m:90+e:4')
  if (stat.length < 50) throw new Error(`统计类板块数量异常：${stat.length}`)
  statNames = new Set(stat.map((r) => r.name))
  const set = async (fsq, min) => { const r = await clistCodes(fsq); if (r.length < min) throw new Error(`${fsq} 数量异常：${r.length}`); return new Set(r.map((x) => x.code)) }
  kinds = { stat: new Set(stat.map((r) => r.code)), industry1: await set('m:90+s:2', 25), industry2: await set('m:90+s:4', 100), region: await set('m:90+t:1', 25), concept: await set('m:90+t:3', 250) }
} catch (e) { console.log(`板块分类不可用（板块异动留空）：${e.message}`) }

/* ---------- 4. 涨停股所属行业 / 概念（概念提示） ---------- */
let meta = new Map()
try {
  const codes = zt.map((s) => s.code)
  const secid = (c) => `${/^(6|9)/.test(c) && !c.startsWith('92') ? 1 : 0}.${c}`
  for (let i = 0; i < codes.length; i += 50) {
    const m = parseStockMeta(await quote(`/api/qt/ulist.np/get?${new URLSearchParams({ secids: codes.slice(i, i + 50).map(secid).join(','), fields: 'f12,f14,f100,f103', fltt: '2', invt: '2' })}`), statNames)
    for (const [k, v] of m) meta.set(k, v)
    await sleep(200)
  }
  if (codes.length && meta.size < codes.length * 0.9) throw new Error(`覆盖不足 ${meta.size}/${codes.length}`)
} catch (e) { console.log(`个股所属概念不可用（不给概念提示）：${e.message}`); meta = new Map() }
const counts = conceptCounts(zt, meta)
const groups = ztByBoard(zt, meta)

/* ---------- 5. 板块异动（带 dt 日期） ---------- */
let boards = prevSame?.boards ?? null
if (kinds) {
  try {
    const bk = parseBkChanges(await get(`https://push2ex.eastmoney.com/getAllBKChanges?${new URLSearchParams({ ut: POOL_TOKEN, dpt: 'wzchanges', pageindex: '0', pagesize: '5000' })}`), date)
    const rows = classifyBoards(bk.boards, kinds)
    if (rows.length < 300) throw new Error(`分类后板块太少：${rows.length}`)
    boards = { asOf: bk.time, total: bk.boards.length, kept: rows.length, rows: boardTable(rows, groups, meta, counts) }
  } catch (e) { console.log(`板块异动获取失败（保留已有）：${e.message}`) }
}

/* ---------- 6. 盘口异动（读异动监管页已采集的） ---------- */
const radar = radarOf(readJson('public/data/kpl-abnormal.json'), date)

/* ---------- 输出 ---------- */
const events = buildEvents({ indices, zt, zb, groups, meta, counts, radar })
const slots = buildSlots({ zt, zb, meta, sh: indices.sh, radar })
const topBoard = boards?.rows?.[0] ?? null
const out = {
  version: 1, generatedAt: new Date().toISOString(), date, prevDate,
  note: '收盘后用公开数据还原的当日盘面时间线，不是盘中直播；不做涨跌原因的文字归因，也不是买卖建议。',
  // 分钟时间轴三只指数相同（241 根），只存一份
  times: indices.sh.times,
  indices: INDICES.map((x) => { const { times: _t, ...d } = indices[x.id]; return { id: x.id, code: x.code, name: x.name, ...d } }),
  parts: {
    index: true,
    pools: poolSrc,
    boards: boards ? boards.asOf : null,
    concepts: meta.size > 0,
    radar: radar ? radar.total : null,
  },
  summary: {
    zt: pools ? zt.length : null, touch: pools ? zb.length : null,
    firstZt: zt.filter((s) => s.firstSeal).sort((a, b) => a.firstSeal.localeCompare(b.firstSeal))[0]?.firstSeal ?? null,
    boardTop: topBoard ? { name: topBoard.name, count: topBoard.count } : null,
    radarTotal: radar?.total ?? null,
    events: events.length,
  },
  slots, events, boards,
  history: mergeHistory(prev?.history ?? [], {
    date, zt: pools ? zt.length : null, shPct: indices.sh.pct, shAmp: indices.sh.amp,
    boardTop: topBoard?.name ?? null, boardTopCount: topBoard?.count ?? null, radarTotal: radar?.total ?? null,
  }),
  sources: [
    { id: 'trends', label: '东方财富指数分时（上证指数、深证成指、创业板指）', url: 'https://quote.eastmoney.com/zs000001.html' },
    { id: 'bk', label: '东方财富 · 板块异动', url: 'https://quote.eastmoney.com/changes/' },
    { id: 'pools', label: '东方财富涨停 / 炸板股池（经本站打板页）', url: 'https://quote.eastmoney.com/ztb/' },
    { id: 'meta', label: '东方财富个股所属行业 / 概念', url: 'https://quote.eastmoney.com/center/boardlist.html' },
    { id: 'changes', label: '东方财富 · 盘口异动（经本站异动监管页）', url: 'https://quote.eastmoney.com/changes/' },
  ],
}
fs.mkdirSync(RAW, { recursive: true })
fs.writeFileSync(path.join(RAW, `${date}.json`), JSON.stringify(out))
for (const f of fs.readdirSync(RAW).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(0, -KEEP_RAW)) fs.rmSync(path.join(RAW, f), { force: true })
// 补历史日期时不覆盖更新的当前文件
if (!prev || !prev.date || prev.date <= date) fs.writeFileSync(OUT, JSON.stringify(out))
else console.log(`现有 ${OUT} 是 ${prev.date}，比 ${date} 新，只写存档`)
console.log(JSON.stringify({ date, ...out.parts, ...out.summary }))
