// 「同花顺」页数据：每个交易日收盘后运行（.github/workflows/ths-mood.yml），生成 public/data/ths-mood.json。
// 来源：东财涨停/炸板/跌停/昨日涨停股池（只能查当天）、新浪全市场分页行情（含开盘价）、东财指数日 K（上证综指、深证综指）。
// 不调用同花顺自己的接口。历史：data-raw/ths-mood/days/<日期>.json 存每日完整记录；首次运行用每日复盘归档补出早期历史与涨停代码。
// 用法：node scripts/ths-mood.mjs
//   FORCE=1          跳过收盘时间检查，只用于排查数据结构（未收盘时生成的数据不要提交）
//   DATE=YYYY-MM-DD  补跑刚结束的交易日：只允许在该日 15:10 之后、下一个交易日 9:15 之前，且指数日 K 最后一根正是该日
import fs from 'node:fs'
import { mergeHistory } from './market-mood-lib.mjs'
import { buildDay, hsAmounts, mergeZtStore, parseKline, parsePoolFull, parseQuote, pickPrevFcb, saveState, saveZtCodes, seedFromArchive, trendSeries, TEN_DAYS } from './ths-mood-lib.mjs'

const OUT = 'public/data/ths-mood.json'
const RAW = 'data-raw/ths-mood'
const POOL_TOKEN = '7eea3edcaed734bea9cbfc24409ed989' // 东财公开页面使用的固定参数（与 server/daily-analysis.mjs 相同）
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
      await sleep(2000 * (attempt + 1))
    }
  }
}
const readJson = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null)

const bj = new Date(Date.now() + 8 * 3600_000)
const bjDate = bj.toISOString().slice(0, 10)
const minutes = bj.getUTCHours() * 60 + bj.getUTCMinutes()
const override = process.env.DATE
let today = bjDate
if (override) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(override)) { console.error(`DATE 格式不对：${override}`); process.exit(1) }
  const sameDayAfterClose = override === bjDate && minutes >= 15 * 60 + 10
  const nextMorning = override < bjDate && minutes < 9 * 60 + 15 && (Date.parse(bjDate) - Date.parse(override)) / 86400_000 <= 4
  if (!sameDayAfterClose && !nextMorning) { console.error(`DATE=${override} 只能在该日收盘后、下一交易日开盘前补跑`); process.exit(1) }
  today = override
} else {
  if ([0, 6].includes(bj.getUTCDay())) { console.log(`${today} 周末，跳过`); process.exit(0) }
  if (minutes < 15 * 60 + 10 && process.env.FORCE !== '1') { console.log(`${today} 未收盘（北京 ${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}），跳过`); process.exit(0) }
}

const poolUrl = (ep, sort) => `https://push2ex.eastmoney.com/${ep}?${new URLSearchParams({ ut: POOL_TOKEN, dpt: 'wz.ztzt', Pageindex: '0', pagesize: '10000', sort, date: today.replaceAll('-', '') })}`
async function pool(ep, sort) { return parsePoolFull(await get(poolUrl(ep, sort), { headers: { referer: 'https://quote.eastmoney.com/' } }), today) }

let zt
try { zt = await pool('getTopicZTPool', 'fbt:asc') } catch (e) { console.log(`${today} 没有当日涨停池（休市或尚未更新）：${e.message}`); process.exit(0) }
const [zb, dt, yzt] = [await pool('getTopicZBPool', 'fbt:asc'), await pool('getTopicDTPool', 'fund:asc'), await pool('getYesterdayZTPool', 'zs:desc')]

// 指数日 K：上证综指（收盘、成交额）+ 深证综指（成交额）。补跑时必须拿到该日日 K，用来确认行情还停在该日
const kline = async (secid) => parseKline(await get(`https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3&fields2=f51,f53,f57&klt=101&fqt=0&end=20500101&lmt=260`, { headers: { referer: 'https://quote.eastmoney.com/' } }))
let sh = null, sz = null
try { [sh, sz] = [await kline('1.000001'), await kline('0.399106')] } catch (e) { console.log(`指数日 K 获取失败：${e.message}`) }
if (override && sh?.at(-1)?.date !== today) { console.error(`补跑 ${today}：指数日 K 最后一根是 ${sh?.at(-1)?.date ?? '无'}，行情可能已不是该日，放弃`); process.exit(1) }

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
      out[p] = body.map(parseQuote)
    }
  }))
  const rows = out.flat()
  if ((await count()) !== total || new Set(rows.map((r) => r.code)).size !== total) throw new Error('新浪全市场总数变化或证券重复')
  return rows
}
const rows = await sinaMarket()

const prev = readJson(OUT)
const stateStore = readJson(`${RAW}/state.json`)
let ztStore = readJson(`${RAW}/zt-codes.json`)
const amounts = sh && sz ? hsAmounts(sh, sz) : prev?.amountHistory ?? []
const trend = sh ? trendSeries(sh) : prev?.trendHistory ?? []

// 历史：已有记录 + 每日复盘归档种子（种子永远让位给真实记录）
let history = prev?.history ?? []
try {
  const archive = JSON.parse(fs.readFileSync('public/data/daily-analysis.json', 'utf8'))
  const seed = seedFromArchive(archive.snapshots ?? [], amounts)
  history = mergeHistory(history, seed.days)
  ztStore = mergeZtStore(ztStore, seed.ztStore)
} catch (e) { console.log(`读取每日复盘归档失败：${e.message}`) }
ztStore = saveZtCodes(ztStore, today, zt)

// 最近 10 个交易日：指数日 K 的日期（含今天）；没有日 K 时退回涨停代码库里的日期
const calendar = [...new Set([...(sh ?? []).map((r) => r.date), today])].filter((d) => d <= today).sort()
const tradeDates = (calendar.length >= TEN_DAYS ? calendar : Object.keys(ztStore.days).sort()).slice(-TEN_DAYS)

const { day, latest, state } = buildDay({ date: today, zt, zb, dt, yzt, rows, amounts, trend, history, prevFcb: pickPrevFcb(stateStore, today), ztStore, tradeDates })
history = mergeHistory(history, [day])

const sources = [
  { id: 'pools', label: '东方财富涨停 / 炸板 / 跌停 / 昨日涨停股池', url: 'https://quote.eastmoney.com/ztb/' },
  { id: 'market', label: '新浪 A 股全市场行情（沪深京，含开盘价）', url: 'https://finance.sina.com.cn/' },
  { id: 'kline', label: '东方财富指数日 K（上证综指、深证综指）', url: 'https://quote.eastmoney.com/zs000001.html' },
]
const out = {
  version: 1, generatedAt: new Date().toISOString(), asOf: today,
  note: '盘后统计，不是买卖建议。情绪指数、情绪状态、盘面评分、强弱指数的计算方法为本站自定，口径见页面说明。',
  latest, history,
  trendHistory: trend.slice(-250).map(({ checks, ...r }) => r),
  amountHistory: amounts.slice(-250),
  sources,
}
fs.mkdirSync(`${RAW}/days`, { recursive: true })
fs.writeFileSync(`${RAW}/days/${today}.json`, JSON.stringify(latest, null, 1))
fs.writeFileSync(`${RAW}/state.json`, JSON.stringify(saveState(stateStore, state)))
fs.writeFileSync(`${RAW}/zt-codes.json`, JSON.stringify(ztStore))
fs.writeFileSync(OUT, JSON.stringify(out))
console.log(JSON.stringify({ date: today, zt: day.zt, dt: day.dt, broken: day.broken, up: day.up, down: day.down, amount: day.amount, volRatio: day.volRatio, emotion: day.emotion, zone: latest.emotionInfo.zone, state: latest.emotionInfo.state, trend: latest.trend?.level, rsi: latest.trend?.rsi, hotOpen: latest.vane.avgOpen, ten: latest.ten.covered, history: history.length, trendHistory: out.trendHistory.length }))
