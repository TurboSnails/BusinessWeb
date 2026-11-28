// 个股查询前端取数：走 /api/grid-market?kind=lookup-*，逐字段校验。
import type {
  AnalystAction,
  AnalystData,
  AtsWeek,
  Bar,
  BarsPage,
  LookupError,
  NewsItem,
  NewsPage,
  NewsSentiment,
  NewsTopic,
  OffExchangeData,
  Quote,
  RatingAction,
  RecommendationMonth,
  Session,
  ShortVolumeDay,
  StockLookupApi,
  SymbolHit,
  Timeframe,
} from './types'
import { NEWS_TOPICS, TIMEFRAMES } from './types'

const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

const TOPICS = new Set<string>(NEWS_TOPICS)
const SENTIMENTS = new Set<string>(['利好', '中性', '利空', '未评级'])
const SESSIONS = new Set<string>(['pre', 'regular', 'post', 'closed'])
const MARKETS = new Set<string>(['us', 'hk', 'cn'])
const ACTIONS = new Set<string>(['up', 'down', 'main', 'init', 'reit', 'other'])
const TFS = new Set<string>(TIMEFRAMES)

function url(kind: string, params: Record<string, string | undefined>): string {
  const q = new URLSearchParams({ kind })
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') q.set(k, v)
  return `${API_BASE}/api/grid-market?${q}`
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function isStr(v: unknown): v is string {
  return typeof v === 'string'
}

async function getJson(href: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(href, { signal })
  let body: unknown = null
  try { body = await res.json() } catch { body = null }
  if (!res.ok) {
    const err = body as LookupError | null
    if (err && typeof err.error === 'string' && typeof err.reason === 'string') {
      throw new Error(err.error)
    }
    throw new Error(res.status === 400 ? '请求参数无效' : res.status === 404 ? '未找到该代码' : '行情服务暂时不可用')
  }
  return body
}

function parseHit(raw: unknown): SymbolHit | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (!isStr(o.symbol) || !isStr(o.name) || !isStr(o.market) || !MARKETS.has(o.market)) return null
  return {
    symbol: o.symbol,
    name: o.name,
    market: o.market as SymbolHit['market'],
    exchange: isStr(o.exchange) ? o.exchange : undefined,
    type: isStr(o.type) ? o.type : undefined,
  }
}

function parseQuote(raw: unknown): Quote {
  if (!raw || typeof raw !== 'object') throw new Error('行情数据格式错误')
  const o = raw as Record<string, unknown>
  if (!isStr(o.symbol) || !isStr(o.name) || !isStr(o.market) || !MARKETS.has(o.market)) throw new Error('行情数据格式错误')
  if (!isStr(o.currency) || !isNum(o.price) || !isNum(o.change) || !isNum(o.changePct) || !isNum(o.prevClose)) {
    throw new Error('行情数据格式错误')
  }
  if (!isStr(o.session) || !SESSIONS.has(o.session) || !isStr(o.time) || !isStr(o.timezone)) {
    throw new Error('行情数据格式错误')
  }
  const quote: Quote = {
    symbol: o.symbol,
    name: o.name,
    market: o.market as Quote['market'],
    currency: o.currency,
    price: o.price,
    change: o.change,
    changePct: o.changePct,
    prevClose: o.prevClose,
    session: o.session as Session,
    time: o.time,
    timezone: o.timezone,
  }
  if (o.extended && typeof o.extended === 'object') {
    const e = o.extended as Record<string, unknown>
    if ((e.session === 'pre' || e.session === 'post') && isNum(e.price) && isNum(e.change) && isNum(e.changePct) && isStr(e.time)) {
      quote.extended = { session: e.session, price: e.price, change: e.change, changePct: e.changePct, time: e.time }
    }
  }
  return quote
}

function parseBar(raw: unknown): Bar | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const t = o.t, open = o.o, high = o.h, low = o.l, close = o.c
  if (!isNum(t) || !isNum(open) || !isNum(high) || !isNum(low) || !isNum(close)) return null
  if (!(open > 0 && high > 0 && low > 0 && close > 0)) return null
  const bar: Bar = { t, o: open, h: high, l: low, c: close, v: isNum(o.v) ? o.v : 0 }
  if (o.ext === true) bar.ext = true
  return bar
}

function parseBarsPage(raw: unknown): BarsPage {
  if (!raw || typeof raw !== 'object') throw new Error('K 线数据格式错误')
  const o = raw as Record<string, unknown>
  if (!isStr(o.symbol) || !isStr(o.tf) || !TFS.has(o.tf) || !isStr(o.timezone)) throw new Error('K 线数据格式错误')
  if (o.adjustment !== 'split' && o.adjustment !== 'qfq' && o.adjustment !== 'none') throw new Error('K 线数据格式错误')
  if (o.source !== 'yahoo' && o.source !== 'tencent') throw new Error('K 线数据格式错误')
  if (typeof o.hasMore !== 'boolean' || !Array.isArray(o.bars)) throw new Error('K 线数据格式错误')
  const bars: Bar[] = []
  for (const row of o.bars) {
    const b = parseBar(row)
    if (b) bars.push(b)
  }
  return {
    symbol: o.symbol,
    tf: o.tf as Timeframe,
    bars,
    hasMore: o.hasMore,
    timezone: o.timezone,
    adjustment: o.adjustment,
    source: o.source,
  }
}

function parseNewsItem(raw: unknown): NewsItem | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (!isStr(o.id) || !isStr(o.time) || !isStr(o.title) || !isStr(o.url) || !isStr(o.publisher)) return null
  if (!isStr(o.topic) || !TOPICS.has(o.topic)) return null
  if (!isStr(o.sentiment) || !SENTIMENTS.has(o.sentiment)) return null
  if (o.lang !== 'en' && o.lang !== 'zh') return null
  return {
    id: o.id,
    time: o.time,
    title: o.title,
    url: o.url,
    publisher: o.publisher,
    summary: isStr(o.summary) ? o.summary : undefined,
    topic: o.topic as NewsTopic,
    sentiment: o.sentiment as NewsSentiment,
    lang: o.lang,
  }
}

function parseNewsPage(raw: unknown): NewsPage {
  if (!raw || typeof raw !== 'object') throw new Error('新闻数据格式错误')
  const o = raw as Record<string, unknown>
  if (!isStr(o.symbol) || !isStr(o.start) || !isStr(o.end) || !isStr(o.source) || !Array.isArray(o.items)) {
    throw new Error('新闻数据格式错误')
  }
  const items: NewsItem[] = []
  for (const row of o.items) {
    const n = parseNewsItem(row)
    if (n) items.push(n)
  }
  return { symbol: o.symbol, items, start: o.start, end: o.end, source: o.source }
}

function parseAction(raw: unknown): AnalystAction | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (!isStr(o.date) || !isStr(o.firm) || !isStr(o.action) || !ACTIONS.has(o.action)) return null
  return {
    date: o.date,
    firm: o.firm,
    action: o.action as RatingAction,
    fromGrade: isStr(o.fromGrade) ? o.fromGrade : undefined,
    toGrade: isStr(o.toGrade) ? o.toGrade : undefined,
    priorTarget: isNum(o.priorTarget) ? o.priorTarget : undefined,
    target: isNum(o.target) ? o.target : undefined,
  }
}

function parseTrend(raw: unknown): RecommendationMonth | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (!isStr(o.period)) return null
  const strongBuy = o.strongBuy, buy = o.buy, hold = o.hold, sell = o.sell, strongSell = o.strongSell
  if (!isNum(strongBuy) || !isNum(buy) || !isNum(hold) || !isNum(sell) || !isNum(strongSell)) return null
  return { period: o.period, strongBuy, buy, hold, sell, strongSell }
}

function parseAnalysts(raw: unknown): AnalystData {
  if (!raw || typeof raw !== 'object') throw new Error('分析师数据格式错误')
  const o = raw as Record<string, unknown>
  if (!isStr(o.symbol) || !isStr(o.source) || !Array.isArray(o.actions) || !Array.isArray(o.trend)) {
    throw new Error('分析师数据格式错误')
  }
  const actions: AnalystAction[] = []
  for (const row of o.actions) {
    const a = parseAction(row)
    if (a) actions.push(a)
  }
  const trend: RecommendationMonth[] = []
  for (const row of o.trend) {
    const t = parseTrend(row)
    if (t) trend.push(t)
  }
  let target: AnalystData['target']
  if (o.target && typeof o.target === 'object') {
    const t = o.target as Record<string, unknown>
    target = {}
    if (isNum(t.mean)) target.mean = t.mean
    if (isNum(t.median)) target.median = t.median
    if (isNum(t.high)) target.high = t.high
    if (isNum(t.low)) target.low = t.low
    if (isNum(t.count)) target.count = t.count
    if (isNum(t.current)) target.current = t.current
    if (!Object.keys(target).length) target = undefined
  }
  return { symbol: o.symbol, actions, trend, target, source: o.source }
}

function parseShortDay(raw: unknown): ShortVolumeDay | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const shortVolume = o.shortVolume, shortExemptVolume = o.shortExemptVolume, totalVolume = o.totalVolume
  if (!isStr(o.date) || !isNum(shortVolume) || !isNum(shortExemptVolume) || !isNum(totalVolume)) return null
  return { date: o.date, shortVolume, shortExemptVolume, totalVolume }
}

function parseAts(raw: unknown): AtsWeek | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (!isStr(o.weekStart) || !isNum(o.shares) || !isNum(o.trades)) return null
  return { weekStart: o.weekStart, shares: o.shares, trades: o.trades }
}

function parseOffExchange(raw: unknown): OffExchangeData {
  if (!raw || typeof raw !== 'object') throw new Error('场外成交数据格式错误')
  const o = raw as Record<string, unknown>
  if (!isStr(o.symbol) || !isStr(o.source) || !isStr(o.note) || !Array.isArray(o.daily) || !Array.isArray(o.ats)) {
    throw new Error('场外成交数据格式错误')
  }
  const daily: ShortVolumeDay[] = []
  for (const row of o.daily) {
    const d = parseShortDay(row)
    if (d) daily.push(d)
  }
  const ats: AtsWeek[] = []
  for (const row of o.ats) {
    const a = parseAts(row)
    if (a) ats.push(a)
  }
  return { symbol: o.symbol, daily, ats, source: o.source, note: o.note }
}

export const stockLookupApi: StockLookupApi = {
  async search(q, signal) {
    const body = await getJson(url('lookup-search', { q }), signal)
    if (!Array.isArray(body)) throw new Error('搜索结果格式错误')
    const hits: SymbolHit[] = []
    for (const row of body) {
      const h = parseHit(row)
      if (h) hits.push(h)
    }
    return hits
  },
  async quote(symbol, signal) {
    return parseQuote(await getJson(url('lookup-quote', { symbol }), signal))
  },
  async bars(symbol, tf, before, signal) {
    return parseBarsPage(await getJson(url('lookup-bars', {
      symbol,
      tf,
      before: before != null ? String(before) : undefined,
    }), signal))
  },
  async news(symbol, range, signal) {
    return parseNewsPage(await getJson(url('lookup-news', {
      symbol,
      start: range?.start,
      end: range?.end,
    }), signal))
  },
  async analysts(symbol, signal) {
    return parseAnalysts(await getJson(url('lookup-analysts', { symbol }), signal))
  },
  async offExchange(symbol, signal) {
    return parseOffExchange(await getJson(url('lookup-offexchange', { symbol }), signal))
  },
}

/** 测试用：导出校验函数 */
export const __test = {
  parseHit, parseQuote, parseBar, parseBarsPage, parseNewsItem, parseNewsPage,
  parseAnalysts, parseOffExchange, url,
}
