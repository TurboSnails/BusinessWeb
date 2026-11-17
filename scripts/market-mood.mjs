// 短线情绪页数据：每个交易日收盘后运行（.github/workflows/market-mood.yml），生成 public/data/market-mood.json。
// 来源：东财涨停/炸板/跌停/昨日涨停股池（只能查当天）、新浪全市场分页行情、腾讯指数报价、东财融资余额与指数成交额。
// 历史：data-raw/market-mood/days/<日期>.json 存每日完整记录；首次运行用每日复盘归档补出早期涨停与连板历史。
// 用法：node scripts/market-mood.mjs   （FORCE=1 跳过收盘时间检查，只用于排查）
import fs from 'node:fs'
import { BLUE_CHIP_SYMBOLS } from '../server/market-sentiment.mjs'
import { buildDay, intradayAmount, mergeHistory, parseTrends, parseMargin, parsePool, parseSinaRow, pickPrevState, saveState, seedFromArchive } from './market-mood-lib.mjs'

const OUT = 'public/data/market-mood.json'
const RAW = 'data-raw/market-mood'
const POOL_TOKEN = '7eea3edcaed734bea9cbfc24409ed989' // 东财公开页面使用的固定参数（与 server/daily-analysis.mjs 相同）
const SINA = 'https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
const INDICES = { sh000001: '上证指数', sz399001: '深证成指', sz399006: '创业板指', sh000688: '科创50', sh000300: '沪深300', sh000016: '上证50' }

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

const bj = new Date(Date.now() + 8 * 3600_000)
const today = bj.toISOString().slice(0, 10)
const minutes = bj.getUTCHours() * 60 + bj.getUTCMinutes()
if ([0, 6].includes(bj.getUTCDay())) { console.log(`${today} 周末，跳过`); process.exit(0) }
if (minutes < 15 * 60 + 10 && process.env.FORCE !== '1') { console.log(`${today} 未收盘（北京 ${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}），跳过`); process.exit(0) }

const poolUrl = (ep, sort) => `https://push2ex.eastmoney.com/${ep}?${new URLSearchParams({ ut: POOL_TOKEN, dpt: 'wz.ztzt', Pageindex: '0', pagesize: '10000', sort, date: today.replaceAll('-', '') })}`
async function pool(ep, sort) { return parsePool(await get(poolUrl(ep, sort), { headers: { referer: 'https://quote.eastmoney.com/' } }), today) }

let zt
try { zt = await pool('getTopicZTPool', 'fbt:asc') } catch (e) { console.log(`${today} 没有当日涨停池（休市或尚未更新）：${e.message}`); process.exit(0) }
const [zb, dt, yzt] = [await pool('getTopicZBPool', 'fbt:asc'), await pool('getTopicDTPool', 'fund:asc'), await pool('getYesterdayZTPool', 'zs:desc')]

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
      out[p] = body.map(parseSinaRow)
    }
  }))
  const rows = out.flat()
  if ((await count()) !== total || new Set(rows.map((r) => r.code)).size !== total) throw new Error('新浪全市场总数变化或证券重复')
  return rows
}
const rows = await sinaMarket()

// 权重表现：主要指数（腾讯报价）+ 权重股（新浪全市场里取）
async function weight() {
  const text = await get(`https://qt.gtimg.cn/q=${Object.keys(INDICES).join(',')}`, { kind: 'gbk' })
  const indices = []
  for (const m of text.matchAll(/v_((?:sh|sz)\d{6})="([^"]*)"/g)) {
    const f = m[2].split('~'), pct = Number(f[32]), price = Number(f[3])
    if (f[30]?.slice(0, 8) === today.replaceAll('-', '') && Number.isFinite(pct)) indices.push({ symbol: m[1], name: INDICES[m[1]], price, pct })
  }
  const bySym = new Map(rows.map((r) => [r.symbol, r]))
  const stocks = BLUE_CHIP_SYMBOLS.map((s) => bySym.get(s)).filter((r) => r && r.pct !== null).map((r) => ({ code: r.code, name: r.name, pct: r.pct, amount: Math.round(r.amount / 1e8) }))
  const avg = stocks.length ? Math.round((stocks.reduce((s, r) => s + r.pct, 0) / stocks.length) * 100) / 100 : null
  return { indices, stocks, avg }
}
let weightData = null
try { weightData = await weight() } catch (e) { console.log(`权重表现获取失败：${e.message}`) }

const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null
const stateStore = fs.existsSync(`${RAW}/state.json`) ? JSON.parse(fs.readFileSync(`${RAW}/state.json`, 'utf8')) : null
const prevState = pickPrevState(stateStore, today)

// 融资余额（近一年）与沪深两市成交额历史（上证综指 + 深证综指），失败时沿用上一份
let margin = prev?.margin ?? []
try {
  margin = parseMargin(await get('https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPTA_RZRQ_LSHJ&columns=DIM_DATE,RZYE,RZYEZB,NEW&pageSize=250&sortColumns=DIM_DATE&sortTypes=-1'))
} catch (e) { console.log(`融资余额获取失败：${e.message}`) }
let amountHistory = prev?.amountHistory ?? []
try {
  const kline = async (secid) => {
    const j = await get(`https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3&fields2=f51,f57&klt=101&fqt=0&end=20500101&lmt=250`, { headers: { referer: 'https://quote.eastmoney.com/' } })
    if (j?.rc !== 0 || !Array.isArray(j?.data?.klines)) throw new Error('东财指数成交额异常')
    return new Map(j.data.klines.map((s) => s.split(',')).map(([d, a]) => [d, Number(a)]))
  }
  const [sh, sz] = [await kline('1.000001'), await kline('0.399106')]
  amountHistory = [...sh.keys()].filter((d) => sz.has(d)).sort().map((d) => ({ date: d, total: Math.round((sh.get(d) + sz.get(d)) / 1e8) }))
} catch (e) { console.log(`两市成交额历史获取失败：${e.message}`) }

// 当日量能（分时累计，与上一交易日同一时刻比）；失败只少这一张图
let intraday = null
try {
  const trends = async (secid) => parseTrends(await get(`https://push2his.eastmoney.com/api/qt/stock/trends2/get?secid=${secid}&fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55,f56,f57,f58&iscr=0&ndays=2`, { headers: { referer: 'https://quote.eastmoney.com/' } }))
  intraday = intradayAmount(await trends('1.000001'), await trends('0.399106'), today)
  if (!intraday) console.log('当日分时量能不完整，跳过')
} catch (e) { console.log(`当日分时量能获取失败：${e.message}`) }

// 历史：已有记录 + 每日复盘归档种子
let history = prev?.history ?? []
try {
  const archive = JSON.parse(fs.readFileSync('public/data/daily-analysis.json', 'utf8'))
  history = mergeHistory(history, seedFromArchive(archive.snapshots ?? []))
} catch (e) { console.log(`读取每日复盘归档失败：${e.message}`) }
const hsAmountPrev = [...amountHistory].reverse().find((d) => d.date < today)?.total ?? null

const { day, latest: built, state } = buildDay({ date: today, zt, zb, dt, yzt, rows, prevState, hsAmountPrev, weight: weightData })
const latest = { ...built, intraday }
history = mergeHistory(history, [day])

const sources = [
  { id: 'pools', label: '东方财富涨停 / 炸板 / 跌停 / 昨日涨停股池', url: 'https://quote.eastmoney.com/ztb/' },
  { id: 'market', label: '新浪 A 股全市场行情（沪深京）', url: 'https://finance.sina.com.cn/' },
  { id: 'indices', label: '腾讯指数报价', url: 'https://gu.qq.com/' },
  { id: 'margin', label: '东方财富融资融券历史（沪深京）', url: 'https://data.eastmoney.com/rzrq/total.html' },
]
const out = {
  version: 1, generatedAt: new Date().toISOString(), asOf: today,
  note: '盘后统计，不是买卖建议。综合强度、连板强度、活跃股的计算方法为本站自定，口径见页面说明。',
  latest, history, amountHistory, margin, sources,
}
fs.mkdirSync(`${RAW}/days`, { recursive: true })
fs.writeFileSync(`${RAW}/days/${today}.json`, JSON.stringify(latest, null, 1))
fs.writeFileSync(`${RAW}/state.json`, JSON.stringify(saveState(stateStore, state)))
fs.writeFileSync(OUT, JSON.stringify(out))
console.log(JSON.stringify({ date: today, zt: day.zt, dt: day.dt, broken: day.broken, up: day.up, down: day.down, amount: day.amount.total, mood: day.mood, lb: day.lbStrength, composite: day.composite, retreat: day.retreat, history: history.length, margin: margin.length, amountHistory: amountHistory.length }))
