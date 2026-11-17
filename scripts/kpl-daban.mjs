// 开盘啦 · 打板页数据：每个交易日收盘后运行（.github/workflows/kpl-tabs.yml），生成 public/data/kpl-daban.json。
// 来源：东财涨停 / 炸板 / 跌停 / 昨日涨停 / 次新股池（只能查当天）、新浪全市场分页行情（开高低收）、腾讯报价（逐只确认跌停价）。
// 历史：data-raw/kpl-daban/history.json 存每日涨停名单、炸板名单与昨日涨停股的次日表现（溢价基因样本）；首次运行用每日复盘归档补出早期涨停名单。
// 用法：node scripts/kpl-daban.mjs   （FORCE=1 跳过收盘时间检查；FORCE=1 DATE=YYYY-MM-DD 指定日期，只用于排查形状，产出不要提交）
import fs from 'node:fs'
import { isTradingDay } from './market-mood-lib.mjs'
import { buildDaban, mapDt, mapNew, mapYzt, mapZb, mapZt, mergeStore, parseSinaFull, parseTencent, poolRaw, seedFromArchive, touchCandidates } from './kpl-daban-lib.mjs'

const OUT = 'public/data/kpl-daban.json'
const RAW = 'data-raw/kpl-daban'
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
      if (kind === 'gbk') return new TextDecoder('gbk').decode(await res.arrayBuffer())
      return await res.json()
    } catch (e) {
      if (attempt >= 2) throw e
      await sleep(2000 * (attempt + 1))
    }
  }
}

const force = process.env.FORCE === '1'
const bj = new Date(Date.now() + 8 * 3600_000)
const today = force && /^\d{4}-\d{2}-\d{2}$/.test(process.env.DATE ?? '') ? process.env.DATE : bj.toISOString().slice(0, 10)
const minutes = bj.getUTCHours() * 60 + bj.getUTCMinutes()
if (!isTradingDay(today)) { console.log(`${today} 非交易日，跳过`); process.exit(0) }
if (minutes < 15 * 60 + 10 && !force) { console.log(`${today} 未收盘（北京 ${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}），跳过`); process.exit(0) }

const poolUrl = (ep, sort) => `https://push2ex.eastmoney.com/${ep}?${new URLSearchParams({ ut: POOL_TOKEN, dpt: 'wz.ztzt', Pageindex: '0', pagesize: '10000', sort, date: today.replaceAll('-', '') })}`
// 排序字段必须是该池有的列，否则东财返回空池（tc 仍有值），校验会失败
async function pool(ep, sort) { return poolRaw(await get(poolUrl(ep, sort), { headers: { referer: 'https://quote.eastmoney.com/' } }), today) }

let zt
try { zt = (await pool('getTopicZTPool', 'fbt:asc')).map(mapZt) } catch (e) { console.log(`${today} 没有当日涨停池（休市或尚未更新）：${e.message}`); process.exit(0) }
const zb = (await pool('getTopicZBPool', 'fbt:asc')).map(mapZb)
const dt = (await pool('getTopicDTPool', 'fund:asc')).map(mapDt)
const yzt = (await pool('getYesterdayZTPool', 'zs:desc')).map(mapYzt)
const cx = (await pool('getTopicCXPooll', 'ods:asc')).map(mapNew)

// 新浪全市场：总数 → 分页（每页 80）→ 再核总数，任何一页不足都放弃本次（不写不完整的数据）
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
      const url = `${SINA}Market_Center.getHQNodeData?${new URLSearchParams({ node: 'hs_a', sort: 'symbol', asc: '1', num: '80', page: String(p + 1) })}`
      const body = await get(url, { headers: { referer: 'https://finance.sina.com.cn/' } })
      const want = Math.min(80, total - p * 80)
      if (!Array.isArray(body) || body.length !== want) throw new Error(`新浪第 ${p + 1} 页不足`)
      out[p] = body.map(parseSinaFull)
    }
  }))
  const rows = out.flat()
  if ((await count()) !== total || new Set(rows.map((r) => r.code)).size !== total) throw new Error('新浪全市场总数变化或证券重复')
  return rows
}
const rows = await sinaMarket()

// 曾跌停：候选股逐只取腾讯报价里的当日跌停价确认（每批 60 只，只收当日行情）
const cands = touchCandidates(rows, { dtCodes: new Set(dt.map((r) => r.code)), noLimit: new Set(cx.filter((r) => r.noLimit).map((r) => r.code)) })
const limits = new Map()
for (let i = 0; i < cands.length; i += 60) {
  const text = await get(`https://qt.gtimg.cn/q=${cands.slice(i, i + 60).map((r) => r.symbol).join(',')}`, { kind: 'gbk' })
  for (const [k, v] of parseTencent(text, today)) limits.set(k, v)
}
if (cands.length && !limits.size) throw new Error('腾讯报价没有返回当日行情，放弃本次（不写曾跌停为 0 的数据）')

// 历史：已有记录 + 每日复盘归档种子
let store = fs.existsSync(`${RAW}/history.json`) ? JSON.parse(fs.readFileSync(`${RAW}/history.json`, 'utf8')) : { days: {} }
try {
  const archive = JSON.parse(fs.readFileSync('public/data/daily-analysis.json', 'utf8'))
  store = mergeStore(store, seedFromArchive(archive.snapshots ?? []))
} catch (e) { console.log(`读取每日复盘归档失败：${e.message}`) }

const { payload, store: merged } = buildDaban({ date: today, zt, zb, dt, yzt, cx, rows, limits, store })
const sources = [
  { id: 'pools', label: '东方财富涨停 / 炸板 / 跌停 / 昨日涨停 / 次新股池', url: 'https://quote.eastmoney.com/ztb/' },
  { id: 'market', label: '新浪 A 股全市场行情（开高低收）', url: 'https://finance.sina.com.cn/' },
  { id: 'limits', label: '腾讯行情报价（当日涨跌停价）', url: 'https://gu.qq.com/' },
]
const out = {
  version: 1, generatedAt: new Date().toISOString(),
  note: '盘后统计，不是买卖建议。自然涨停、曾跌停、竞价、溢价基因的口径为本站自定，见页面说明。',
  ...payload, sources,
}
fs.mkdirSync(RAW, { recursive: true })
fs.writeFileSync(`${RAW}/history.json`, JSON.stringify(merged))
fs.writeFileSync(OUT, JSON.stringify(out))
const s = payload.summary
console.log(JSON.stringify({ date: today, zt: s.zt, zb: s.zb, dt: s.dt, natural: s.natural, touched: s.touched, newStocks: s.newStocks, auction: s.auction, gene: payload.gene }))
