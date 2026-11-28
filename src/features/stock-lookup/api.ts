// 个股查询前端取数：走 /api/grid-market?kind=lookup-*，逐字段校验。
import type {
  AnalystAction,
  AnalystData,
  AtsWeek,
  Bar,
  EarningsData,
  EarningsEstimate,
  EarningsQuarter,
  EstimatePeriod,
  EstimateRange,
  InsiderData,
  InsiderHolder,
  InsiderSummary,
  InsiderTransaction,
  InsiderTxType,
  OptionContract,
  OptionSideTotal,
  OptionsData,
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
  ShortInterestData,
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

// ─── 内部人交易 / 做空 / 财报预期 / 期权 ───

const INSIDER_TYPES = new Set<string>(['buy', 'sell', 'exercise', 'award', 'gift', 'other'])
const OWNERSHIPS = new Set<string>(['direct', 'indirect', 'both'])
const PERIODS = new Set<string>(['0q', '+1q', '0y', '+1y'])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isDate(v: unknown): v is string {
  return isStr(v) && DATE_RE.test(v)
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null
}

/** 只挑出给定键里的有限数字 */
function pickNums<K extends string>(raw: unknown, keys: readonly K[]): Partial<Record<K, number>> {
  const o = obj(raw)
  const out: Partial<Record<K, number>> = {}
  if (!o) return out
  for (const k of keys) if (isNum(o[k])) out[k] = o[k] as number
  return out
}

function parseInsiderTx(raw: unknown): InsiderTransaction | null {
  const o = obj(raw)
  if (!o || !isDate(o.date) || !isStr(o.name) || !isStr(o.role) || !isStr(o.type) || !INSIDER_TYPES.has(o.type) || !isNum(o.shares)) return null
  const tx: InsiderTransaction = { date: o.date, name: o.name, role: o.role, type: o.type as InsiderTxType, shares: o.shares }
  Object.assign(tx, pickNums(o, ['value', 'priceLow', 'priceHigh'] as const))
  if (isStr(o.ownership) && OWNERSHIPS.has(o.ownership)) tx.ownership = o.ownership as InsiderTransaction['ownership']
  return tx
}

function parseInsiderHolder(raw: unknown): InsiderHolder | null {
  const o = obj(raw)
  if (!o || !isStr(o.name) || !isStr(o.role)) return null
  const h: InsiderHolder = { name: o.name, role: o.role, ...pickNums(o, ['sharesDirect', 'sharesIndirect'] as const) }
  if (isDate(o.latestDate)) h.latestDate = o.latestDate
  if (isStr(o.latestType) && INSIDER_TYPES.has(o.latestType)) h.latestType = o.latestType as InsiderTxType
  return h
}

function parseInsider(raw: unknown): InsiderData {
  const o = obj(raw)
  const sm = obj(o?.summary)
  if (!o || !isStr(o.symbol) || !isStr(o.source) || !Array.isArray(o.transactions) || !Array.isArray(o.holders) || !sm || !isDate(sm.since)) {
    throw new Error('内部人交易数据格式错误')
  }
  const nums = pickNums(sm, ['months', 'buyCount', 'buyShares', 'buyValue', 'sellCount', 'sellShares', 'sellValue', 'netShares'] as const)
  if (Object.keys(nums).length !== 8) throw new Error('内部人交易数据格式错误')
  const summary = { ...nums, since: sm.since } as InsiderSummary
  const transactions = o.transactions.map(parseInsiderTx).filter((t): t is InsiderTransaction => !!t)
  const holders = o.holders.map(parseInsiderHolder).filter((h): h is InsiderHolder => !!h)
  const reported = pickNums(o.reported, ['buyCount', 'buyShares', 'sellCount', 'sellShares', 'netCount', 'netShares', 'totalInsiderShares'] as const)
  return {
    symbol: o.symbol,
    transactions,
    holders,
    summary,
    ...(Object.keys(reported).length ? { reported } : {}),
    source: o.source,
  }
}

function parseShortInterest(raw: unknown): ShortInterestData {
  const o = obj(raw)
  if (!o || !isStr(o.symbol) || !isStr(o.source)) throw new Error('做空数据格式错误')
  const out: ShortInterestData = {
    symbol: o.symbol,
    source: o.source,
    ...pickNums(o, ['sharesShort', 'sharesShortPrior', 'pctFloat', 'pctOutstanding', 'daysToCover', 'floatShares'] as const),
  }
  if (isDate(o.settleDate)) out.settleDate = o.settleDate
  if (isDate(o.priorSettleDate)) out.priorSettleDate = o.priorSettleDate
  return out
}

const RANGE_KEYS = ['avg', 'low', 'high', 'analysts'] as const

function parseEstimate(raw: unknown): EarningsEstimate | null {
  const o = obj(raw)
  if (!o || !isStr(o.period) || !PERIODS.has(o.period)) return null
  const est: EarningsEstimate = {
    period: o.period as EstimatePeriod,
    eps: pickNums(o.eps, RANGE_KEYS) as EstimateRange,
    revenue: pickNums(o.revenue, RANGE_KEYS) as EstimateRange,
    epsTrend: pickNums(o.epsTrend, ['current', 'd7', 'd30', 'd60', 'd90'] as const),
    revisions: pickNums(o.revisions, ['up7', 'up30', 'down7', 'down30'] as const),
    ...pickNums(o, ['yearAgoEps', 'yearAgoRevenue'] as const),
  }
  if (isDate(o.endDate)) est.endDate = o.endDate
  return est
}

function parseQuarter(raw: unknown): EarningsQuarter | null {
  const o = obj(raw)
  if (!o || !isDate(o.periodEnd)) return null
  const q: EarningsQuarter = { periodEnd: o.periodEnd, ...pickNums(o, ['epsActual', 'epsEstimate', 'surprisePct', 'revenueActual'] as const) }
  if (isDate(o.reported)) q.reported = o.reported
  if (isStr(o.fiscalQuarter) && /^[1-4]Q\d{4}$/.test(o.fiscalQuarter)) q.fiscalQuarter = o.fiscalQuarter
  return q
}

function parseEarnings(raw: unknown): EarningsData {
  const o = obj(raw)
  if (!o || !isStr(o.symbol) || !isStr(o.source) || !Array.isArray(o.estimates) || !Array.isArray(o.history)) {
    throw new Error('财报预期数据格式错误')
  }
  const out: EarningsData = {
    symbol: o.symbol,
    estimates: o.estimates.map(parseEstimate).filter((e): e is EarningsEstimate => !!e),
    history: o.history.map(parseQuarter).filter((q): q is EarningsQuarter => !!q),
    source: o.source,
  }
  const ne = obj(o.nextEarnings)
  if (ne && Array.isArray(ne.dates)) {
    const dates = ne.dates.filter(isDate)
    if (dates.length) out.nextEarnings = { dates, estimated: ne.estimated === true }
  }
  if (isStr(o.currency)) out.currency = o.currency
  return out
}

function parseOptionContract(raw: unknown): OptionContract | null {
  const o = obj(raw)
  if (!o || !isStr(o.contract) || (o.type !== 'call' && o.type !== 'put') || !isNum(o.strike) || !isNum(o.volume) || !isNum(o.openInterest)) return null
  const c: OptionContract = {
    contract: o.contract,
    type: o.type,
    strike: o.strike,
    volume: o.volume,
    openInterest: o.openInterest,
    ...pickNums(o, ['lastPrice', 'iv'] as const),
  }
  if (isStr(o.lastTrade)) c.lastTrade = o.lastTrade
  if (typeof o.inTheMoney === 'boolean') c.inTheMoney = o.inTheMoney
  return c
}

function parseSideTotal(raw: unknown): OptionSideTotal | null {
  const t = pickNums(raw, ['count', 'volume', 'openInterest'] as const)
  return t.count != null && t.volume != null && t.openInterest != null ? t as OptionSideTotal : null
}

function parseOptions(raw: unknown): OptionsData {
  const o = obj(raw)
  const calls = parseSideTotal(o?.calls), puts = parseSideTotal(o?.puts)
  if (!o || !isStr(o.symbol) || !isStr(o.source) || !isStr(o.note) || !Array.isArray(o.expirations) || !Array.isArray(o.top) || !calls || !puts) {
    throw new Error('期权数据格式错误')
  }
  const out: OptionsData = {
    symbol: o.symbol,
    expirations: o.expirations.filter(isDate),
    calls,
    puts,
    top: o.top.map(parseOptionContract).filter((c): c is OptionContract => !!c),
    source: o.source,
    note: o.note,
    ...pickNums(o, ['underlyingPrice'] as const),
  }
  if (isDate(o.expiration)) out.expiration = o.expiration
  if (isStr(o.quoteTime)) out.quoteTime = o.quoteTime
  return out
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
  async insider(symbol, signal) {
    return parseInsider(await getJson(url('lookup-insider', { symbol }), signal))
  },
  async shortInterest(symbol, signal) {
    return parseShortInterest(await getJson(url('lookup-short', { symbol }), signal))
  },
  async earnings(symbol, signal) {
    return parseEarnings(await getJson(url('lookup-earnings', { symbol }), signal))
  },
  async options(symbol, expiration, signal) {
    return parseOptions(await getJson(url('lookup-options', { symbol, date: expiration }), signal))
  },
}

/** 测试用：导出校验函数 */
export const __test = {
  parseHit, parseQuote, parseBar, parseBarsPage, parseNewsItem, parseNewsPage,
  parseAnalysts, parseOffExchange, url,
  parseInsider, parseShortInterest, parseEarnings, parseOptions,
}
