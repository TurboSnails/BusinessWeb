// 开盘啦 · 板块题材页数据：每个交易日收盘后运行（.github/workflows/kpl-tabs.yml），生成 public/data/kpl-plates.json。
// 来源（均为公开行情）：东财板块行情 clist（申万二级行业 m:90+s:4、概念板块 m:90+t:3 去掉 e:4 统计类板块）、
// 东财涨停股池（getTopicZTPool）、东财个股所属行业 / 概念（ulist f100 / f103）、东财板块日 K（push2his）。
// 历史：data-raw/kpl-plates/days/<日期>.json 每日一份精简记录（各板块涨幅、涨停家数、强度）；首次运行用每日复盘归档补出早期涨停家数。
// 任何一项核心数据不完整或不是当天收盘后的数据，就放弃本次，不写半截数据。
// 用法：node scripts/kpl-plates.mjs   （FORCE=1 [DATE=YYYY-MM-DD] 跳过收盘时间检查、只打印摘要；DUMP=<路径> 另存完整输出供排查。FORCE 产出不要提交）
import fs from 'node:fs'
import { isTradingDay, parsePool } from './market-mood-lib.mjs'
import {
  CONCEPT_MIN_ZT, annotateBoards, boardSeries, compactDay, parseBoardRow, parseClistPage, parseKline, parseStockMeta,
  rangeReturn, secidOf, seedDays, sortByStrength, strongHistory, validateBoards, ztGroups,
} from './kpl-plates-lib.mjs'

const OUT = 'public/data/kpl-plates.json'
const RAW = 'data-raw/kpl-plates'
const POOL_TOKEN = '7eea3edcaed734bea9cbfc24409ed989' // 东财公开页面使用的固定参数（与 scripts/market-mood.mjs 相同）
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
// push2 在部分网络会 302 到 push2delay（收盘后两者数据相同），依次尝试
const QUOTE_HOSTS = ['https://push2.eastmoney.com', 'https://push2delay.eastmoney.com', 'https://82.push2.eastmoney.com']
const BOARD_FIELDS = 'f12,f14,f3,f6,f62,f184,f104,f105,f106,f128,f140,f136,f124'
const TREND_TOP = 12 // 每类取强度前 12 的板块拉日 K，用于近 N 日走势
const FORCE = process.env.FORCE === '1'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function get(url, { headers = {} } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, referer: 'https://quote.eastmoney.com/', ...headers }, signal: AbortSignal.timeout(15000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (e) {
      if (attempt >= 2) throw e
      await sleep(1500 * (attempt + 1))
    }
  }
}
async function quote(path) {
  let last
  for (const host of QUOTE_HOSTS) {
    try { return await get(`${host}${path}`) } catch (e) { last = e }
  }
  throw last
}

const bj = new Date(Date.now() + 8 * 3600_000)
const today = bj.toISOString().slice(0, 10)
const minutes = bj.getUTCHours() * 60 + bj.getUTCMinutes()
if (!isTradingDay(today) && !FORCE) { console.log(`${today} 非交易日，跳过`); process.exit(0) }
if (minutes < 15 * 60 + 10 && !FORCE) { console.log(`${today} 未收盘（北京 ${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}），跳过`); process.exit(0) }
// FORCE 时用最近一个有涨停池的交易日（午夜后排查用）
const date = FORCE && process.env.DATE ? process.env.DATE : today

// 1. 涨停池（带日期，校验 qdate 与条数）
let zt
try {
  const url = `https://push2ex.eastmoney.com/getTopicZTPool?${new URLSearchParams({ ut: POOL_TOKEN, dpt: 'wz.ztzt', Pageindex: '0', pagesize: '10000', sort: 'fbt:asc', date: date.replaceAll('-', '') })}`
  zt = parsePool(await get(url), date)
} catch (e) { console.log(`${date} 没有当日涨停池（休市或尚未更新）：${e.message}`); process.exit(0) }

// 2. 板块列表：分页取全（每页最多 100），再核总数
async function clist(fs, fields = BOARD_FIELDS) {
  const out = []
  let total = null
  for (let p = 1; p <= 20; p++) {
    const page = parseClistPage(await quote(`/api/qt/clist/get?${new URLSearchParams({ pn: String(p), pz: '100', po: '1', np: '1', fltt: '2', invt: '2', fid: 'f12', fs, fields })}`))
    if (total === null) total = page.total
    else if (page.total !== total) throw new Error(`${fs} 分页期间总数变化`)
    out.push(...page.rows)
    if (out.length >= total || !page.rows.length) break
    await sleep(250)
  }
  if (out.length !== total) throw new Error(`${fs} 条数不全：${out.length}/${total}`)
  return out
}
let industryRows, conceptRows
try {
  industryRows = validateBoards((await clist('m:90+s:4')).map(parseBoardRow), date, { min: 100, max: 160, label: '行业' })
  const special = new Set((await clist('m:90+e:4', 'f12')).map((r) => r.f12))
  if (special.size < 50) throw new Error(`统计类板块数量异常：${special.size}`)
  conceptRows = validateBoards((await clist('m:90+t:3+f:!50')).filter((r) => !special.has(r.f12)).map(parseBoardRow), date, { min: 250, max: 800, label: '概念' })
} catch (e) { console.log(`板块行情不可用，放弃本次：${e.message}`); process.exit(0) }

// 3. 涨停股所属行业 / 概念（每批 50 只）
async function stockMeta(codes) {
  const meta = new Map()
  for (let i = 0; i < codes.length; i += 50) {
    const batch = codes.slice(i, i + 50)
    const m = parseStockMeta(await quote(`/api/qt/ulist.np/get?${new URLSearchParams({ secids: batch.map(secidOf).join(','), fields: 'f12,f14,f100,f103', fltt: '2', invt: '2' })}`))
    for (const [k, v] of m) meta.set(k, v)
    await sleep(250)
  }
  return meta
}
let meta
try {
  meta = await stockMeta(zt.map((s) => s.code))
  const covered = zt.filter((s) => meta.get(s.code)?.industry).length
  if (covered < zt.length * 0.95) throw new Error(`涨停股所属行业缺失过多：${covered}/${zt.length}`)
} catch (e) { console.log(`涨停股所属板块不可用，放弃本次：${e.message}`); process.exit(0) }

const industryKey = (m) => (m.industry ? [m.industry] : [])
const conceptKey = (m) => m.concepts
const industry = sortByStrength(annotateBoards(industryRows, zt, meta, industryKey))
const concept = sortByStrength(annotateBoards(conceptRows, zt, meta, conceptKey))
const unmatched = zt.filter((s) => { const m = meta.get(s.code); return !m?.industry || !industry.some((b) => b.name === m.industry) }).map((s) => ({ code: s.code, name: s.name, industry: meta.get(s.code)?.industry ?? null }))

// 4. 每日存档 + 归档种子
const readDays = () => !fs.existsSync(`${RAW}/days`) ? [] : fs.readdirSync(`${RAW}/days`).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
  .map((f) => { try { return JSON.parse(fs.readFileSync(`${RAW}/days/${f}`, 'utf8')) } catch { return null } }).filter(Boolean)
const todayRec = { date, industry: compactDay(industry), concept: compactDay(concept) }
let days = readDays().filter((d) => d.date !== date)
let seeded = []
try {
  const archive = JSON.parse(fs.readFileSync('public/data/daily-analysis.json', 'utf8')).snapshots ?? []
  const have = new Set([...days.map((d) => d.date), date])
  const need = archive.filter((s) => !have.has(s.dataDate) && s.dataDate < date)
  if (need.length) {
    const codes = [...new Set(need.flatMap((s) => (s.upStocks ?? []).map((x) => x.code)))].filter((c) => /^\d{6}$/.test(c))
    const seedMeta = await stockMeta(codes)
    seeded = seedDays(need, seedMeta, new Map(industry.map((b) => [b.name, b.code])), new Map(concept.map((b) => [b.name, b.code])), have)
    days = [...days, ...seeded]
    console.log(`归档种子：补 ${seeded.length} 天`)
  }
} catch (e) { console.log(`归档种子失败（不影响当日数据）：${e.message}`) }
days = [...days, todayRec].sort((a, b) => a.date.localeCompare(b.date)).slice(-120)

// 5. 强度前几的板块拉日 K，算近 5 / 20 日区间涨幅，合并每日存档成走势
async function trendOf(b, kind) {
  let kline = []
  try {
    kline = parseKline(await get(`https://push2his.eastmoney.com/api/qt/stock/kline/get?${new URLSearchParams({ secid: `90.${b.code}`, fields1: 'f1,f2,f3', fields2: 'f51,f53,f59', klt: '101', fqt: '0', end: '20500101', lmt: '61' })}`))
    if (kline.at(-1)?.date !== date) kline = [] // 日 K 还没更新到当天就不用，免得错位
  } catch (e) { console.log(`${b.name} 日 K 获取失败：${e.message}`) }
  await sleep(200)
  return {
    code: b.code, name: b.name, kind, r5: rangeReturn(kline, 5), r20: rangeReturn(kline, 20),
    points: boardSeries({ code: b.code, kind, kline, days, n: 40 }),
  }
}
const trend = []
for (const [kind, list] of [['industry', industry], ['concept', concept]]) {
  for (const b of list.filter((x) => x.strength !== null).slice(0, TREND_TOP)) trend.push(await trendOf(b, kind))
}

// 6. 汇总与输出
const names = new Map([...industry, ...concept].map((b) => [b.code, b.name]))
const out = {
  version: 1, generatedAt: new Date().toISOString(), asOf: date,
  note: '盘后统计，不是买卖建议。板块强度的计算方法为本站自定，口径见页面说明。',
  summary: {
    zt: zt.length, ztMatched: zt.length - unmatched.length, industries: industry.length, concepts: concept.length,
    industryWithZt: industry.filter((b) => b.zt > 0).length, conceptWithZt: concept.filter((b) => b.zt > 0).length,
    upIndustries: industry.filter((b) => b.pct !== null && b.pct > 0).length, upConcepts: concept.filter((b) => b.pct !== null && b.pct > 0).length,
  },
  industry, concept,
  groups: {
    industry: ztGroups(zt, meta, industryKey, { minCount: 1, limit: 60, boards: industry }),
    concept: ztGroups(zt, meta, conceptKey, { minCount: CONCEPT_MIN_ZT, limit: 40, boards: concept }),
  },
  unmatched,
  trend,
  strong: { industry: strongHistory(days, 'industry', names), concept: strongHistory(days, 'concept', names) },
  seededDays: days.filter((d) => d.seeded).map((d) => d.date),
  sources: [
    { id: 'boards', label: '东方财富行业 / 概念板块行情', url: 'https://quote.eastmoney.com/center/boardlist.html' },
    { id: 'pool', label: '东方财富涨停股池', url: 'https://quote.eastmoney.com/ztb/' },
    { id: 'kline', label: '东方财富板块日 K', url: 'https://quote.eastmoney.com/' },
  ],
}
if (process.env.DUMP) fs.writeFileSync(process.env.DUMP, JSON.stringify(out, null, 1))
if (FORCE && process.env.WRITE !== "1") {
  console.log('FORCE 模式只打印摘要，不写文件（如需写入另设 WRITE=1，且不要提交）')
} else {
  fs.mkdirSync(`${RAW}/days`, { recursive: true })
  for (const d of seeded) fs.writeFileSync(`${RAW}/days/${d.date}.json`, JSON.stringify(d))
  fs.writeFileSync(`${RAW}/days/${date}.json`, JSON.stringify(todayRec))
  fs.writeFileSync(OUT, JSON.stringify(out))
}
console.log(JSON.stringify({ date, zt: zt.length, unmatched: unmatched.length, industry: industry.length, concept: concept.length, top: industry.slice(0, 3).map((b) => `${b.name}:${b.strength}`), topConcept: concept.slice(0, 3).map((b) => `${b.name}:${b.strength}`), groups: out.groups.concept.length, trend: trend.length, days: days.length, seeded: out.seededDays.length }))
