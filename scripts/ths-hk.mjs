// 同花顺 · 港股通与AH：南向资金、AH 溢价、港股通持股、港股卖空。只用公开来源，均为带日期的数据。
// 四个数据块各自校验、各自带日期；某块失败时沿用上一份文件里的该块（页面显示它自己的日期），全部没有更新则不写文件。
// 港股交易日历取恒生 AH 溢价指数日 K 的日期，不用 A 股日历。BACKFILL=1 时补齐 HKEX 日报表存档里缺的卖空数据。
import fs from 'node:fs'
import {
  FX_SECID, HK_CLOSE_MIN, HSAHP_SECID, HSI_SECID, hkOnly, SOUTH_TYPES, ahListUrl, buildAh, buildHoldings, buildShort, buildSouth, compactShort, connectStatUrl, dayQuoteUrl,
  holdUrl, klineUrl, latestHoldDate, parseAhList, parseConnectStat, parseKline, parseQt, parseShortSelling, parseSouthHistory, qtCodesFor, qtUrl, settledKline, shortCandidates, southUrl,
} from './ths-hk-lib.mjs'

const OUT = 'public/data/ths-tab-hk.json'
const RAW = 'data-raw/ths-tab-hk'
const SHORT_DIR = `${RAW}/short`
const backfill = process.env.BACKFILL === '1'
const now = new Date()

/** 网络错误重试两次（东财接口偶发断连）；HTTP 状态交给调用方判断 */
async function fetchRaw(url, { referer = 'https://quote.eastmoney.com/', timeout = 20000 } = {}) {
  for (let i = 0; ; i++) {
    try {
      return await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0', referer }, signal: AbortSignal.timeout(timeout) })
    } catch (e) {
      if (i >= 2) throw e
      await new Promise(r => setTimeout(r, 1500 * (i + 1)))
    }
  }
}
async function getJson(url) {
  const res = await fetchRaw(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.json()
}
/** HKEX 缺页返回 404，休市日返回「公眾假期，休市一天」页面；没有 marker 时返回 null 表示「这一天没有数据」 */
async function getHkex(url, marker, encoding = 'utf-8') {
  const res = await fetchRaw(url, { referer: 'https://www.hkex.com.hk/', timeout: 60000 })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  const text = new TextDecoder(encoding).decode(await res.arrayBuffer())
  return text.includes(marker) ? text : null
}
/** 第 2..pages 页逐页取（并发时东财偶发断连） */
async function seq(pages, get) { const out = []; for (let p = 2; p <= pages; p++) out.push(await get(p)); return out }
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null } }

async function south() {
  const bodies = {}
  for (const k of Object.keys(SOUTH_TYPES)) bodies[k] = await getJson(southUrl(SOUTH_TYPES[k]))
  const history = parseSouthHistory(bodies)
  const date = history.at(-1).date
  const text = await getHkex(connectStatUrl(date), 'tabData')
  if (!text) throw new Error(`HKEX ${date} 港股通每日统计尚未发布`)
  const english = await getHkex(connectStatUrl(date, 'eng'), 'tabData').catch(() => null)
  return buildSouth(history, parseConnectStat(text, date, english))
}

async function ah(index) {
  const first = await getJson(ahListUrl(1))
  const pages = Math.ceil((first?.data?.total ?? 0) / 100)
  const rest = await seq(pages, p => getJson(ahListUrl(p)))
  const pairs = parseAhList([first, ...rest])
  const codes = qtCodesFor(pairs)
  const quotes = new Map()
  for (let i = 0; i < codes.length; i += 120) {
    const res = await fetchRaw(qtUrl(codes.slice(i, i + 120)), { referer: 'https://gu.qq.com/' })
    if (!res.ok) throw new Error(`腾讯行情 HTTP ${res.status}`)
    for (const [k, v] of parseQt(new TextDecoder('gbk').decode(await res.arrayBuffer()))) quotes.set(k, v)
  }
  const fxRows = parseKline(await getJson(klineUrl(FX_SECID, 10)))
  const fx = fxRows.at(-1)
  return buildAh(pairs, quotes, { date: fx.date, rate: fx.close }, index, now)
}

async function holdings() {
  const date = latestHoldDate(await getJson(holdUrl(null, 1, 1)))
  const first = await getJson(holdUrl(date, 1))
  const pages = Math.ceil((first?.result?.count ?? 0) / 500)
  const rest = await seq(pages, p => getJson(holdUrl(date, p)))
  return buildHoldings([first, ...rest], date)
}

/** 卖空：按港股日历拉缺的日报表（HKEX 存档约两个月），存成每日比例，再算当天排行与分位 */
async function short(calendar) {
  if (!calendar.length) throw new Error('没有港股交易日历')
  fs.mkdirSync(SHORT_DIR, { recursive: true })
  const index = readJson(`${SHORT_DIR}/index.json`) ?? { unavailable: [] }
  const have = new Set(fs.readdirSync(SHORT_DIR).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map(f => f.slice(0, 10)))
  const recent = calendar.slice(-90)
  const latest = recent.at(-1)
  const todo = recent.filter(d => !have.has(d) && (d === latest || !index.unavailable.includes(d))).reverse()
  let fetched = 0
  let latestDay = null
  for (const date of todo) {
    if (!backfill && fetched >= 3) break
    const text = await getHkex(dayQuoteUrl(date), 'short_selling', 'big5')
    fetched++
    if (!text) { if (date !== latest) index.unavailable.push(date); continue }
    let day
    try { day = parseShortSelling(text, date) } catch (e) {
      if (date === latest) throw e
      console.error(`${date} 卖空日报表跳过：${e.message}`); continue
    }
    fs.writeFileSync(`${SHORT_DIR}/${date}.json`, JSON.stringify(compactShort(day)) + '\n')
    if (date === latest) latestDay = day
    console.log(`卖空日报表已存：${date}`)
  }
  index.unavailable = [...new Set(index.unavailable)].filter(d => recent.includes(d)).sort()
  fs.writeFileSync(`${SHORT_DIR}/index.json`, JSON.stringify(index, null, 2) + '\n')
  // 只存 120 天
  for (const f of fs.readdirSync(SHORT_DIR)) if (/^\d{4}-\d{2}-\d{2}\.json$/.test(f) && !calendar.slice(-120).includes(f.slice(0, 10))) fs.rmSync(`${SHORT_DIR}/${f}`)
  if (!latestDay) {
    if (have.has(latest)) {
      // 当天已存过：重新解析需要个股名称，直接再取一次日报表
      const text = await getHkex(dayQuoteUrl(latest), 'short_selling', 'big5')
      if (text) latestDay = parseShortSelling(text, latest)
    }
    if (!latestDay) throw new Error(`HKEX ${latest} 日报表尚未发布`)
  }
  const store = fs.readdirSync(SHORT_DIR).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map(f => readJson(`${SHORT_DIR}/${f}`)).filter(Boolean)
  // 证券类型是静态属性，取腾讯行情第 63 项，用来排除 ETF 与杠杆及反向产品
  const cand = shortCandidates(latestDay)
  const types = new Map()
  for (let i = 0; i < cand.length; i += 120) {
    const res = await fetchRaw(qtUrl(cand.slice(i, i + 120).map(c => `r_hk${c}`)), { referer: 'https://gu.qq.com/' })
    if (!res.ok) throw new Error(`腾讯行情 HTTP ${res.status}`)
    for (const [k, v] of parseQt(new TextDecoder('gbk').decode(await res.arrayBuffer()))) if (v.type) types.set(k.slice(2), v.type)
  }
  return buildShort(latestDay, store, types)
}

async function main() {
  const prev = readJson(OUT)
  // 港股日历取恒生指数日 K（东财的 HSAHP 在香港假期也有 K 线，例如 2026-10-19 重阳节，因此只保留恒指也有的日期）
  let calendar = [], index = []
  try {
    calendar = settledKline(parseKline(await getJson(klineUrl(HSI_SECID, 800))), now, HK_CLOSE_MIN).map(r => r.date)
    index = hkOnly(settledKline(parseKline(await getJson(klineUrl(HSAHP_SECID, 760))), now, HK_CLOSE_MIN), calendar)
  } catch (e) { console.error(`恒指 / AH 溢价指数日 K 不可得：${e.message}`) }
  const out = { version: 1, generatedAt: now.toISOString(), south: null, ah: null, holdings: null, short: null }
  const fresh = []
  const prevShortAsOf = prev?.short?.asOf
  for (const [key, run] of [['south', south], ['ah', () => ah(index)], ['holdings', holdings], ['short', () => (prevShortAsOf === calendar.at(-1) && !backfill ? Promise.resolve(prev.short) : short(calendar))]]) {
    try {
      out[key] = await run()
      if (out[key]?.asOf !== prev?.[key]?.asOf) fresh.push(`${key}@${out[key].asOf}`)
    } catch (e) {
      console.error(`${key} 未更新：${e.message}`)
      out[key] = prev?.[key] ?? null
    }
  }
  if (!out.south && !out.ah && !out.holdings && !out.short) { console.error('四个数据块都不可用，未写入'); process.exitCode = 1; return }
  if (!fresh.length && prev && !backfill) { console.log('各数据块日期均未变化，保留现有文件'); return }
  out.asOf = [out.south?.asOf, out.ah?.asOf, out.holdings?.asOf, out.short?.asOf].filter(Boolean).sort().at(-1)
  out.sources = [
    { label: '东方财富 · 港股通成交历史', url: southUrl(SOUTH_TYPES.all) },
    { label: 'HKEX · 沪深港通每日统计（十大成交股）', url: 'https://www.hkex.com.hk/Mutual-Market/Stock-Connect/Statistics/Historical-Daily?sc_lang=zh-HK' },
    { label: '东方财富 · AH 股比价列表', url: ahListUrl(1) },
    { label: '腾讯行情 · A/H 收盘价', url: 'https://qt.gtimg.cn/' },
    { label: '东方财富 · 港元人民币中间价', url: klineUrl(FX_SECID, 10) },
    { label: '东方财富 · 恒生 AH 股溢价指数', url: klineUrl(HSAHP_SECID, 760) },
    { label: '东方财富 · 港股通持股', url: holdUrl(out.holdings?.asOf ?? null, 1) },
    { label: 'HKEX · 港股通持股披露（核对口径）', url: 'https://www3.hkexnews.hk/sdw/search/mutualmarket_c.aspx?t=hk' },
    { label: 'HKEX · 日报表（卖空成交）', url: out.short ? dayQuoteUrl(out.short.asOf) : 'https://www.hkex.com.hk/chi/stat/smstat/dayquot/qtn_c.asp' },
  ]
  fs.mkdirSync('public/data', { recursive: true })
  fs.writeFileSync(`${OUT}.tmp`, JSON.stringify(out) + '\n')
  fs.renameSync(`${OUT}.tmp`, OUT)
  console.log(`港股通与AH 已更新：${fresh.join('，')}`)
}
await main()
