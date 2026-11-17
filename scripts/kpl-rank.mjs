// 开盘啦「人气排行」页签数据：每个交易日盘后运行（.github/workflows/kpl-tabs.yml），生成 public/data/kpl-rank.json。
// 四个部分各自带日期、各自更新，某部分这次取不到就保留上次的结果：
//   1. 人气榜（东财股吧人气，快照）          只在交易日 15:10 之后、同一北京日期内取
//   2. 个股区间排行（东财 clist 区间字段，快照）  同上，另核对每行行情时间是当天收盘后
//   3. 板块区间排行 / 领涨次数（板块资金流日线，带日期）  任何时候都可以补，日期必须是最近一个已收盘交易日
//   4. 机构多日榜（读 data-raw/kpl-lhb/days，scripts/kpl-lhb.mjs 落盘的龙虎榜明细，不重复抓取）
// 原始数据：data-raw/kpl-rank/popularity/<日期>.json（当日人气前 100 与飙升榜快照，自存历史）。
// 用法：node scripts/kpl-rank.mjs
import fs from 'node:fs'
import path from 'node:path'
import {
  INST_WINDOWS, LIST_LIMIT, NET_WINDOWS, STOCK_WINDOWS, assertFresh, buildBoardKind, buildPopularity, cutTo, inflowDays, instWindow,
  keepBetterBoards, lastClosedDay, parseCurrentList, parseFflow, parseHisList, parseQuotes, parseSurgeList, snapshotAllowed, snapshotStillValid, stockRangeRows, stockrankData, tradingDaysBack,
} from './kpl-rank-lib.mjs'

const OUT = 'public/data/kpl-rank.json'
const RAW = 'data-raw/kpl-rank/popularity'
const LHB_RAW = 'data-raw/kpl-lhb/days'
const KEEP_RAW = 120
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
const QUOTE_HOSTS = ['https://push2delay.eastmoney.com', 'https://push2.eastmoney.com']
const RANK_API = 'https://emappdata.eastmoney.com/stockrank'
const RANK_BODY = { appId: 'appId01', globalId: '786e4c21-70dc-435a-93bb-38', marketType: '' } // 东财人气榜网页使用的固定参数
const A_SHARES = 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function req(url, init = {}, tries = 3) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { ...init, headers: { 'user-agent': UA, referer: 'https://quote.eastmoney.com/', ...(init.headers ?? {}) }, signal: AbortSignal.timeout(20000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (e) {
      if (attempt >= tries - 1) throw e
      await sleep(1500 * (attempt + 1))
    }
  }
}
async function quote(p) {
  let last
  for (const host of QUOTE_HOSTS) {
    try { return await req(`${host}${p}`, {}, 2) } catch (e) { last = e }
  }
  throw last
}
const rank = (ep, extra) => req(`${RANK_API}/${ep}`, { method: 'POST', headers: { 'content-type': 'application/json', referer: 'https://guba.eastmoney.com/rank/' }, body: JSON.stringify({ ...RANK_BODY, ...extra }) })
const fflow = (secid, lmt) => req(`https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get?${new URLSearchParams({ secid, fields1: 'f1,f2,f3,f7', fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65', lmt: String(lmt) })}`, { headers: { referer: 'https://data.eastmoney.com/' } })

/** 简单并发池 */
async function pool(items, n, fn) {
  const out = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k) }
  }))
  return out
}
const secidOf = (code) => `${/^6/.test(code) ? 1 : 0}.${code}`

const nowBj = () => { const d = new Date(Date.now() + 8 * 3600_000); return { today: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() } }
const { today, minutes } = nowBj()
/** 不带日期的快照取完后立刻复核：仍是同一北京日期、仍在盘后时段，否则（跨过午夜等）整段作废，不能贴上 today 的日期 */
const assertSnapshotWindow = (label) => {
  const t = nowBj()
  if (!snapshotStillValid(today, t)) throw new Error(`${label} 取完时已是 ${t.today} ${t.minutes} 分，不在 ${today} 盘后快照时段`)
}
const closed = lastClosedDay(today, minutes)
const snapOk = snapshotAllowed(today, minutes)
const takenAt = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

const prev = (() => { try { const j = JSON.parse(fs.readFileSync(OUT, 'utf8')); return j?.version === 1 ? j : null } catch { return null } })()
const next = { popularity: prev?.popularity ?? null, stockRange: prev?.stockRange ?? null, boards: prev?.boards ?? null, inst: prev?.inst ?? null }
const changed = []
let rawPopularity = null

/* ---------- 1. 人气榜 ---------- */
if (snapOk) {
  try {
    const top = parseCurrentList(stockrankData(await rank('getAllCurrentList', { pageNo: 1, pageSize: 100 }), '人气榜'))
    const surge = parseSurgeList(stockrankData(await rank('getAllHisRcList', { pageNo: 1, pageSize: 100 }), '飙升榜'))
    const codes = [...new Set([...top, ...surge].map((r) => r.code))]
    const scOf = new Map([...top, ...surge].map((r) => [r.code, `${r.secid.startsWith('1.') ? 'SH' : 'SZ'}${r.code}`]))
    const hist = new Map()
    await pool(codes, 6, async (code) => {
      try { hist.set(code, parseHisList(stockrankData(await rank('getHisList', { srcSecurityCode: scOf.get(code) }), '人气历史'))) } catch { /* 缺历史的个股排名变化留空 */ }
    })
    if (hist.size < codes.length * 0.8) throw new Error(`人气历史缺失过多：${hist.size}/${codes.length}`)
    const quotes = new Map()
    for (let i = 0; i < codes.length; i += 100) {
      const batch = codes.slice(i, i + 100)
      for (const [k, v] of parseQuotes(await quote(`/api/qt/ulist.np/get?${new URLSearchParams({ secids: batch.map(secidOf).join(','), fields: 'f12,f14,f2,f3,f124', fltt: '2', invt: '2' })}`), today)) quotes.set(k, v)
    }
    assertSnapshotWindow('人气榜')
    next.popularity = buildPopularity({ date: today, takenAt, top, surge, hist, quotes })
    rawPopularity = { date: today, takenAt, top: top.map((r) => [r.code, r.rank]), surge: surge.map((r) => [r.code, r.rank, r.rise]) }
    changed.push('popularity')
  } catch (e) { console.log(`人气榜跳过：${e.message}`) }
} else console.log(`${today} ${takenAt} 不在盘后快照时段，人气榜与个股区间排行保留上次`)

/* ---------- 2. 个股区间排行 ---------- */
if (snapOk) {
  try {
    const sorted = async (field, po) => {
      const body = await quote(`/api/qt/clist/get?${new URLSearchParams({ pn: '1', pz: '100', po: String(po), np: '1', fltt: '2', invt: '2', fid: field, fs: A_SHARES, fields: `f12,f14,f2,f3,f6,f26,f124,${field}` })}`)
      const diff = body?.data?.diff
      if (body?.rc !== 0 || !Array.isArray(diff)) throw new Error(`clist ${field} 结构异常`)
      return diff
    }
    const windows = []
    for (const w of STOCK_WINDOWS) {
      const g = await sorted(w.field, 1), l = await sorted(w.field, 0)
      assertFresh(g, today, `${w.days} 日涨幅榜`)
      assertFresh(l, today, `${w.days} 日跌幅榜`)
      windows.push({ days: w.days, gain: stockRangeRows(g, today, w.field, w.days).slice(0, LIST_LIMIT), loss: stockRangeRows(l, today, w.field, w.days).slice(0, LIST_LIMIT) })
      await sleep(200)
    }
    const nets = []
    for (const w of NET_WINDOWS) {
      const i = await sorted(w.field, 1), o = await sorted(w.field, 0)
      assertFresh(i, today, `${w.days} 日主力净流入榜`)
      assertFresh(o, today, `${w.days} 日主力净流出榜`)
      nets.push({ days: w.days, inflow: stockRangeRows(i, today, w.field, 0).slice(0, LIST_LIMIT), outflow: stockRangeRows(o, today, w.field, 0).slice(0, LIST_LIMIT) })
      await sleep(200)
    }
    // 净流入天数：资金流日线（带日期）逐只数，只算各榜前 20
    const need = [...new Set(nets.flatMap((n) => [...n.inflow.slice(0, 20), ...n.outflow.slice(0, 20)]).map((r) => r.code))]
    const series = new Map()
    await pool(need, 6, async (code) => {
      try { const s = cutTo(parseFflow(await fflow(secidOf(code), 12)), today); if (s) series.set(code, s) } catch { /* 留空 */ }
    })
    for (const n of nets) {
      for (const side of ['inflow', 'outflow']) n[side] = n[side].map((r, i) => ({ ...r, inflowDays: i < 20 ? inflowDays(series.get(r.code), n.days) : null }))
    }
    // 两个方向都必须有数据：任何一边为空就整段不写（保留上次）
    for (const w of windows) if (!w.gain.length || !w.loss.length) throw new Error(`${w.days} 日涨 / 跌幅榜有一边为空`)
    for (const n of nets) if (!n.inflow.length || !n.outflow.length) throw new Error(`${n.days} 日主力净流入 / 流出榜有一边为空`)
    assertSnapshotWindow('个股区间排行')
    next.stockRange = { date: today, windows, nets }
    changed.push('stockRange')
  } catch (e) { console.log(`个股区间排行跳过：${e.message}`) }
}

/* ---------- 3. 板块区间排行 / 领涨次数 ---------- */
if (next.boards?.date !== closed || snapOk) {
  try {
    const clist = async (fsq) => {
      const out = []
      let total = null
      for (let p = 1; p <= 20; p++) {
        const body = await quote(`/api/qt/clist/get?${new URLSearchParams({ pn: String(p), pz: '100', po: '1', np: '1', fltt: '2', invt: '2', fid: 'f12', fs: fsq, fields: 'f12,f14' })}`)
        if (body?.rc !== 0 || !Array.isArray(body?.data?.diff)) throw new Error(`板块列表 ${fsq} 结构异常`)
        total ??= body.data.total
        out.push(...body.data.diff)
        if (out.length >= total || !body.data.diff.length) break
        await sleep(200)
      }
      if (out.length !== total) throw new Error(`板块列表 ${fsq} 条数不全：${out.length}/${total}`)
      return out.filter((r) => /^BK\d{4}$/.test(r.f12) && typeof r.f14 === 'string').map((r) => ({ code: r.f12, name: r.f14.trim() }))
    }
    const special = new Set((await clist('m:90+e:4')).map((b) => b.code)) // 「昨日涨停」等统计类板块
    const kinds = {
      industry: await clist('m:90+s:4'),
      concept: (await clist('m:90+t:3+f:!50')).filter((b) => !special.has(b.code)),
      region: await clist('m:90+t:1'),
    }
    if (kinds.industry.length < 80 || kinds.concept.length < 200 || kinds.region.length < 25) throw new Error(`板块数量异常：${kinds.industry.length}/${kinds.concept.length}/${kinds.region.length}`)
    const all = [...kinds.industry, ...kinds.concept, ...kinds.region]
    const series = new Map()
    await pool([...new Set(all.map((b) => b.code))], 8, async (code) => {
      try { series.set(code, parseFflow(await fflow(`90.${code}`, 30))) } catch { /* 记为缺失 */ }
    })
    const dates = tradingDaysBack(closed, 20)
    const out = { date: closed }
    for (const [k, list] of Object.entries(kinds)) {
      const r = buildBoardKind(list.map((b) => ({ ...b, series: series.get(b.code) ?? null })), closed, dates)
      if (r.rows.length < list.length * 0.9) throw new Error(`${k} 板块 ${closed} 日线不全：${r.rows.length}/${list.length}`)
      out[k] = { rows: r.rows, missing: r.missing, ...(k === 'region' ? {} : { leaders: r.leaders }) }
    }
    const best = keepBetterBoards(next.boards, out)
    if (best !== out) console.log(`板块区间排行：本次缺日线的板块比已有的 ${closed} 结果多，保留已有结果`)
    else if (JSON.stringify(out) !== JSON.stringify(next.boards)) { next.boards = out; changed.push('boards') }
  } catch (e) { console.log(`板块区间排行跳过：${e.message}`) }
}

/* ---------- 4. 机构多日榜（读本地龙虎榜明细） ---------- */
try {
  const files = fs.existsSync(LHB_RAW) ? fs.readdirSync(LHB_RAW).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort() : []
  const days = new Map(files.map((f) => [f.slice(0, 10), JSON.parse(fs.readFileSync(path.join(LHB_RAW, f), 'utf8'))]).filter(([d, v]) => v?.date === d && Array.isArray(v.entries)))
  const asOf = [...days.keys()].at(-1)
  if (asOf) {
    const out = { date: asOf, windows: INST_WINDOWS.map((n) => instWindow(days, asOf, n)) }
    if (JSON.stringify(out) !== JSON.stringify(next.inst)) { next.inst = out; changed.push('inst') }
  }
} catch (e) { console.log(`机构多日榜跳过：${e.message}`) }

if (!changed.length) { console.log('没有新的数据，不写文件'); process.exit(0) }

const dates = [next.popularity?.date, next.stockRange?.date, next.boards?.date, next.inst?.date].filter(Boolean).sort()
const out = {
  version: 1, generatedAt: new Date().toISOString(), asOf: dates.at(-1),
  note: '盘后统计，不是买卖建议。人气为东方财富股吧人气排名，不是开盘啦人气值。',
  ...next,
  sources: [
    { id: 'popularity', label: '东方财富股吧 · 人气榜 / 飙升榜 / 个股人气排名历史', url: 'https://guba.eastmoney.com/rank/' },
    { id: 'clist', label: '东方财富行情中心 · 沪深京 A 股区间涨幅与主力净额', url: 'https://data.eastmoney.com/zjlx/detail.html' },
    { id: 'fflow', label: '东方财富 · 个股 / 板块资金流日线', url: 'https://data.eastmoney.com/bkzj/hy.html' },
    { id: 'lhb', label: '东方财富数据中心 · 龙虎榜买入 / 卖出前五席位（本站已落盘的近 20 个交易日）', url: 'https://data.eastmoney.com/stock/lhb.html' },
  ],
}
if (rawPopularity) {
  fs.mkdirSync(RAW, { recursive: true })
  fs.writeFileSync(path.join(RAW, `${rawPopularity.date}.json`), JSON.stringify(rawPopularity))
  const raws = fs.readdirSync(RAW).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
  for (const f of raws.slice(0, -KEEP_RAW)) fs.rmSync(path.join(RAW, f), { force: true })
}
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(out))
console.log(JSON.stringify({ changed, popularity: next.popularity?.date ?? null, stockRange: next.stockRange?.date ?? null, boards: next.boards?.date ?? null, inst: next.inst?.date ?? null }))
