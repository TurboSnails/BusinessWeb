// 同花顺 · 技术选股：读开盘啦「复盘」页维护的全市场日线快照仓（只读），收盘后机械筛选 + 市场宽度，生成 public/data/ths-tab-screener.json。
// 价格类条件不发网络请求，只读快照仓。量能类条件（量比 / 换手 / 振幅）另抓一次东财全市场行情快照 clist（约 60 次请求，< 60 秒），
// 只在目标交易日当天北京时间 15:10 之后抓；失败只让量能区块为空（同日上一份文件里有就沿用），不影响其余部分。快照仓由 .github/workflows/kpl-tabs.yml 维护，与本脚本所在的 ths-tabs.yml 各自运行：
// 快照仓还没有目标交易日时直接退出（不写文件，保留上一份），下一次运行（17:15 / 18:30）再补上。
// 用法：node scripts/ths-screener.mjs                  目标日 = 北京时间交易日 15:10 之后为当天，否则为上一交易日
//       DATE=YYYY-MM-DD node scripts/ths-screener.mjs  用快照仓里 ≤ 该日的数据重算该日
import fs from 'node:fs'
import { isTradingDay, prevTradingDay } from './market-mood-lib.mjs'
import { parseCloses } from './kpl-review-lib.mjs'
import {
  SNAP_MAX_PAGES, SNAP_PZ, buildScreener, buildSnapshot, expectedDate, mergeSnapHistory, parseSnapPage, snapUrl, snapshotWindow, validateSnapshot,
} from './ths-screener-lib.mjs'

const OUT = 'public/data/ths-tab-screener.json'
const STORE = 'data-raw/kpl-review'
const CLOSES = `${STORE}/closes`
const MIN_ROWS = 4000
const SNAP_HISTORY = 'data-raw/ths-tab-screener/snapshot-history.json'
const SNAP_BUDGET_MS = 50_000
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return d } }
const override = /^\d{4}-\d{2}-\d{2}$/.test(process.env.DATE ?? '') ? process.env.DATE : null
const date = override ?? expectedDate(new Date(), isTradingDay)
const quit = (msg) => { console.log(`技术选股：${msg}，不写文件`); process.exit(0) }

if (!fs.existsSync(CLOSES)) quit('快照仓不存在')
const dates = fs.readdirSync(CLOSES).filter((f) => /^\d{4}-\d{2}-\d{2}\.csv$/.test(f)).map((f) => f.slice(0, 10)).filter((d) => d <= date).sort()
if (dates.at(-1) !== date) quit(`快照仓还没有 ${date}（最新 ${dates.at(-1) ?? '无'}）`)
const bf = readJson(`${STORE}/backfill.json`, null)
if (!bf?.complete) quit('快照仓回补尚未完成')

const days = dates.map((d) => {
  const { meta, rows } = parseCloses(fs.readFileSync(`${CLOSES}/${d}.csv`, 'utf8'))
  if (meta.date && meta.date !== d) quit(`${d}.csv 头部日期为 ${meta.date}`)
  return { date: d, source: meta.source ?? '', rows }
})
const i = days.length - 1
if (days[i].rows.size < MIN_ROWS) quit(`${date} 只有 ${days[i].rows.size} 行，疑似不完整`)
if (days[i - 1]?.date !== prevTradingDay(date)) quit(`快照仓缺上一交易日 ${prevTradingDay(date)}`)

const metaList = readJson(`${STORE}/meta.json`, { list: [] }).list ?? []
const meta = new Map(metaList.map((u) => [u.code, { name: u.name, industry: u.industry }]))

const t0 = Date.now()
const r = buildScreener(days, i, meta)

/** 抓整份 clist 快照：每页 10 秒超时、最多重试 2 次，总预算 50 秒；超出预算或任一页失败即放弃 */
async function fetchSnapshot() {
  const start = Date.now()
  const page = async (pn) => {
    for (let a = 0; ; a++) {
      if (Date.now() - start > SNAP_BUDGET_MS) throw new Error('超出 50 秒预算')
      try {
        const res = await fetch(snapUrl(pn), { headers: { 'user-agent': UA, referer: 'https://quote.eastmoney.com/' }, signal: AbortSignal.timeout(10_000) })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return parseSnapPage(await res.json())
      } catch (e) {
        if (a >= 2) throw new Error(`第 ${pn} 页：${e.message}`)
        await sleep(800 * (a + 1))
      }
    }
  }
  const first = await page(1)
  const pages = Math.ceil(first.total / SNAP_PZ)
  if (pages > SNAP_MAX_PAGES) throw new Error(`总数 ${first.total} 超出页数上限`)
  const rows = [...first.rows]
  for (let pn = 2; pn <= pages; pn++) {
    const p = await page(pn)
    if (p.total !== first.total) throw new Error(`第 ${pn} 页总数 ${p.total} 与首页 ${first.total} 不一致`)
    rows.push(...p.rows)
    await sleep(30)
  }
  return { total: first.total, rows, requests: pages }
}

let snapshot = null
let snapshotNote = null
const prev = readJson(OUT, null)
if (override || !snapshotWindow(new Date(), date, isTradingDay)) {
  snapshotNote = `量能快照不带日期，只在 ${date} 当天北京时间 15:10 之后采集；本次不是在该时段运行，所以没有当日量能数据。`
} else {
  try {
    const snap = await fetchSnapshot()
    const v = validateSnapshot(snap.rows, snap.total, date, days[i].rows)
    if (!v.ok) throw new Error(v.reason)
    const high20 = new Set(r.presets.find((p) => p.id === 'high20').hits.map(([c]) => c))
    const hist = readJson(SNAP_HISTORY, { version: 1, days: {} })
    snapshot = buildSnapshot(v.valid, date, high20, meta, hist)
    fs.mkdirSync('data-raw/ths-tab-screener', { recursive: true })
    const merged = mergeSnapHistory(hist, date, Object.fromEntries(snapshot.presets.map((p) => [p.id, p.count])))
    fs.writeFileSync(`${SNAP_HISTORY}.tmp`, JSON.stringify(merged) + '\n'); fs.renameSync(`${SNAP_HISTORY}.tmp`, SNAP_HISTORY)
    console.log(`量能快照：${snap.requests} 次请求，总数 ${snap.total}，有效 ${v.valid.size}`)
  } catch (e) {
    snapshotNote = `量能快照采集失败（${e.message}），本区块暂缺，下一次运行再补。`
    console.log(snapshotNote)
  }
}
if (!snapshot && prev?.asOf === date && prev?.snapshot?.date === date) {
  snapshot = prev.snapshot; snapshotNote = null
  console.log('量能快照：沿用同日上一份文件')
}
const out = {
  version: 1, asOf: date, generatedAt: new Date().toISOString(),
  store: {
    from: days[0].date, to: date, days: days.length, stocks: r.universe,
    source: days[i].source.startsWith('em-kline') ? 'kline' : 'sina',
    backfillEnd: bf.end ?? null,
  },
  presets: r.presets, stocks: r.stocks, breadth: r.breadth,
  snapshot, snapshotNote,
  sources: [
    { label: '东方财富日 K（前复权，快照仓回补）', url: 'https://quote.eastmoney.com/' },
    { label: '新浪财经沪深 A 股行情（快照仓每日追加）', url: 'https://vip.stock.finance.sina.com.cn/mkt/#hs_a' },
    { label: '东方财富沪深京 A 股行情列表（量比、换手率、振幅当日快照）', url: 'https://quote.eastmoney.com/center/gridlist.html#hs_a_board' },
  ],
}
const text = JSON.stringify(out) + '\n'
fs.writeFileSync(`${OUT}.tmp`, text); fs.renameSync(`${OUT}.tmp`, OUT)
console.log(JSON.stringify({ date, ms: Date.now() - t0, kb: Math.round(text.length / 1024), stocks: r.universe, breadth: r.breadth.length, presets: Object.fromEntries(r.presets.map((p) => [p.id, p.count])), snapshot: snapshot ? Object.fromEntries(snapshot.presets.map((p) => [p.id, p.count])) : snapshotNote }))
