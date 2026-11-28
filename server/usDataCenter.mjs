const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0',
  Accept: 'application/json, text/plain, */*',
  Origin: 'https://finance.yahoo.com',
  Referer: 'https://finance.yahoo.com/',
}
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json, text/html, text/csv, */*',
}
// 旧地址 /us/options/market_statistics/daily/ 现 302 跳到此处；直接请求新地址省一次跳转
const CBOE_DAILY = 'https://www.cboe.com/markets/us/options/market-statistics/daily/'
const CBOE_DAYS = 20
const CBOE_CONCURRENCY = 5
const NASDAQ_IPO = 'https://api.nasdaq.com/api/ipo/calendar'
const MIN_MARKET_CAP = 300_000_000
const MIN_PRICE = 2
const responseCache = new Map()
let yahooAuth = null

const ETF_UNIVERSE = [
  { symbol: 'SPY', name: '标普 500', group: 'benchmark' },
  { symbol: 'XLK', name: '信息技术', group: 'sector' },
  { symbol: 'XLF', name: '金融', group: 'sector' },
  { symbol: 'XLV', name: '医疗保健', group: 'sector' },
  { symbol: 'XLE', name: '能源', group: 'sector' },
  { symbol: 'XLI', name: '工业', group: 'sector' },
  { symbol: 'XLY', name: '非必需消费', group: 'sector' },
  { symbol: 'XLP', name: '必需消费', group: 'sector' },
  { symbol: 'XLU', name: '公用事业', group: 'sector' },
  { symbol: 'XLB', name: '原材料', group: 'sector' },
  { symbol: 'XLRE', name: '房地产', group: 'sector' },
  { symbol: 'XLC', name: '通信服务', group: 'sector' },
  { symbol: 'SMH', name: '半导体', group: 'theme' },
  { symbol: 'IGV', name: '软件', group: 'theme' },
  { symbol: 'XBI', name: '生物科技', group: 'theme' },
  { symbol: 'ITA', name: '航空航天与国防', group: 'theme' },
  { symbol: 'URA', name: '铀与核能', group: 'theme' },
  { symbol: 'TAN', name: '太阳能', group: 'theme' },
  { symbol: 'KRE', name: '区域银行', group: 'theme' },
]

async function upstream(url, options = {}, timeoutMs = 15_000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, redirect: 'follow' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response
  } finally {
    clearTimeout(timer)
  }
}

async function upstreamJson(url, options = {}, timeoutMs) {
  return (await upstream(url, options, timeoutMs)).json()
}

async function mapPool(items, concurrency, fn) {
  const output = new Array(items.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      output[index] = await fn(items[index], index)
    }
  }))
  return output
}

function finite(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function isoDate(date) {
  return date.toISOString().slice(0, 10)
}

function shiftMonth(date, months) {
  const result = new Date(`${date}T00:00:00Z`)
  const day = result.getUTCDate()
  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() + months)
  result.setUTCDate(Math.min(day, new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate()))
  return isoDate(result)
}

export function parseYahooMovers(payload, mode = 'gainers') {
  const quotes = payload?.finance?.result?.[0]?.quotes
  if (!Array.isArray(quotes)) return { rows: [], asOf: null, delayedBy: null }
  const rows = []
  let latest = 0
  let delayedBy = 0
  for (const quote of quotes) {
    const symbol = typeof quote?.symbol === 'string' ? quote.symbol.toUpperCase() : ''
    const price = finite(quote?.regularMarketPrice)
    const marketCap = finite(quote?.marketCap)
    const changePct = finite(quote?.regularMarketChangePercent)
    const volume = finite(quote?.regularMarketVolume)
    const averageVolume = finite(quote?.averageDailyVolume3Month)
    // 场外交易（OTC / 粉单）报价时间与交易所不同、流动性差，不进榜
    if (quote?.exchange === 'PNK' || /\bOTC\b/i.test(String(quote?.fullExchangeName ?? ''))) continue
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol) || price === null || marketCap === null || changePct === null || volume === null) continue
    if (marketCap < MIN_MARKET_CAP || price < MIN_PRICE) continue
    const volumeRatio = averageVolume && averageVolume > 0 ? volume / averageVolume : null
    if (mode === 'surge' && (volumeRatio === null || volumeRatio < 3)) continue
    const time = finite(quote?.regularMarketTime)
    if (time) latest = Math.max(latest, time)
    delayedBy = Math.max(delayedBy, finite(quote?.exchangeDataDelayedBy) ?? 0)
    rows.push({
      symbol,
      name: String(quote?.longName || quote?.shortName || symbol),
      price,
      changePct,
      volume,
      volumeRatio: volumeRatio === null ? null : Math.round(volumeRatio * 100) / 100,
      marketCap,
    })
  }
  const sorters = {
    gainers: (a, b) => b.changePct - a.changePct,
    losers: (a, b) => a.changePct - b.changePct,
    active: (a, b) => b.volume - a.volume,
    surge: (a, b) => (b.volumeRatio ?? 0) - (a.volumeRatio ?? 0),
  }
  rows.sort(sorters[mode] || sorters.gainers)
  return {
    rows: rows.slice(0, 50),
    asOf: latest ? new Date(latest * 1000).toISOString() : null,
    delayedBy: delayedBy || null,
  }
}

async function getYahooAuth() {
  if (yahooAuth && Date.now() - yahooAuth.at < 55 * 60_000) return yahooAuth
  const response = await fetch('https://fc.yahoo.com', {
    headers: YAHOO_HEADERS, redirect: 'manual', signal: AbortSignal.timeout(15_000),
  })
  const cookie = (response.headers.getSetCookie?.() ?? []).map(value => value.split(';')[0]).join('; ')
  const crumb = await (await upstream('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { ...YAHOO_HEADERS, cookie },
  })).text()
  if (!crumb || crumb.startsWith('{') || /too many requests/i.test(crumb)) throw new Error('Yahoo authentication failed')
  yahooAuth = { cookie, crumb, at: Date.now() }
  return yahooAuth
}

export function mergeQuotePayloads(payloads) {
  const bySymbol = new Map()
  for (const payload of payloads) {
    const quotes = payload?.finance?.result?.[0]?.quotes
    if (!Array.isArray(quotes)) continue
    for (const quote of quotes) {
      const symbol = typeof quote?.symbol === 'string' ? quote.symbol.toUpperCase() : ''
      if (symbol && !bySymbol.has(symbol)) bySymbol.set(symbol, quote)
    }
  }
  return { finance: { result: [{ quotes: [...bySymbol.values()] }] } }
}

async function surgeScreener() {
  const auth = await getYahooAuth()
  const body = {
    offset: 0,
    size: 250,
    sortField: 'dayvolume',
    sortType: 'DESC',
    quoteType: 'EQUITY',
    query: {
      operator: 'AND',
      operands: [
        { operator: 'EQ', operands: ['region', 'us'] },
        { operator: 'GT', operands: ['intradaymarketcap', MIN_MARKET_CAP] },
        { operator: 'GT', operands: ['lastprice', MIN_PRICE] },
      ],
    },
    userId: '',
    userIdType: 'guid',
  }
  return upstreamJson(`https://query1.finance.yahoo.com/v1/finance/screener?crumb=${encodeURIComponent(auth.crumb)}`, {
    method: 'POST',
    headers: { ...YAHOO_HEADERS, cookie: auth.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function handleMovers(list) {
  const mode = list || 'gainers'
  if (!['gainers', 'losers', 'active', 'surge'].includes(mode)) {
    return { status: 400, body: { error: '榜单类型无效', reason: 'bad-request' }, cache: 0 }
  }
  const predefined = async scrId => upstreamJson(`https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?${new URLSearchParams({ scrIds: scrId, count: '100', start: '0' })}`, { headers: YAHOO_HEADERS })
  let payload
  let partial = false
  if (mode === 'surge') {
    // 量比无法直接在筛选器里排序：取当日成交量前 250 名，再并入涨幅榜、跌幅榜，合并后按量比 ≥ 3 倍筛选
    const settled = await Promise.allSettled([surgeScreener(), predefined('day_gainers'), predefined('day_losers')])
    const payloads = settled.filter(item => item.status === 'fulfilled').map(item => item.value)
    if (!payloads.length) throw new Error('Yahoo screeners unavailable')
    payload = mergeQuotePayloads(payloads)
    partial = payloads.length < settled.length
  } else {
    const screeners = { gainers: 'day_gainers', losers: 'day_losers', active: 'most_actives' }
    payload = await predefined(screeners[mode])
  }
  return {
    status: 200,
    body: { ...parseYahooMovers(payload, mode), mode, partial, source: 'Yahoo Finance', fetchedAt: new Date().toISOString() },
    cache: 60,
  }
}

function nasdaqNumber(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const cleaned = String(value).replace(/[$,\s]/g, '')
  if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null
  return finite(cleaned)
}

function nasdaqDate(value) {
  const match = typeof value === 'string' ? /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value) : null
  return match ? `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}` : null
}

function parseIpoRows(rows, kind) {
  if (!Array.isArray(rows)) return []
  return rows.flatMap(row => {
    if (!row || typeof row !== 'object') return []
    const company = typeof row.companyName === 'string' ? row.companyName.trim() : ''
    if (!company) return []
    const dateValue = kind === 'upcoming' ? (row.expectedPriceDate || row.pricedDate)
      : kind === 'priced' ? row.pricedDate
        : kind === 'filed' ? row.filedDate : row.withdrawDate
    return [{
      symbol: typeof row.proposedTickerSymbol === 'string' && row.proposedTickerSymbol.trim() ? row.proposedTickerSymbol.trim().toUpperCase() : null,
      company,
      exchange: typeof row.proposedExchange === 'string' ? row.proposedExchange : null,
      date: nasdaqDate(dateValue),
      filedDate: nasdaqDate(row.filedDate),
      price: row.proposedSharePrice == null ? null : String(row.proposedSharePrice),
      shares: nasdaqNumber(row.sharesOffered),
      amount: nasdaqNumber(row.dollarValueOfSharesOffered),
      status: typeof row.dealStatus === 'string' ? row.dealStatus : null,
    }]
  })
}

export function parseNasdaqIpo(payload, month) {
  const data = payload?.data || {}
  return {
    month,
    groups: {
      upcoming: parseIpoRows(data?.upcoming?.upcomingTable?.rows, 'upcoming'),
      priced: parseIpoRows(data?.priced?.rows, 'priced'),
      filed: parseIpoRows(data?.filed?.rows, 'filed'),
      withdrawn: parseIpoRows(data?.withdrawn?.rows, 'withdrawn'),
    },
    sourceUpdated: typeof data?.upcoming?.lastUpdatedTime === 'string' ? data.upcoming.lastUpdatedTime : null,
    source: 'Nasdaq IPO Calendar',
    sourceUrl: 'https://www.nasdaq.com/market-activity/ipos',
    fetchedAt: new Date().toISOString(),
  }
}

async function handleIpo(month, now = new Date()) {
  const selected = month || new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit',
  }).format(now)
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(selected)) {
    return { status: 400, body: { error: '月份无效', reason: 'bad-request' }, cache: 0 }
  }
  const payload = await upstreamJson(`${NASDAQ_IPO}?${new URLSearchParams({ date: selected })}`, { headers: BROWSER_HEADERS })
  if (!payload?.data) throw new Error('Nasdaq response has no data')
  return { status: 200, body: parseNasdaqIpo(payload, selected), cache: 3600 }
}

export function parseYahooDailyHistory(payload) {
  const result = payload?.chart?.result?.[0]
  const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : []
  const closes = result?.indicators?.quote?.[0]?.close || []
  const timeZone = result?.meta?.exchangeTimezoneName || 'America/New_York'
  const points = []
  timestamps.forEach((timestamp, index) => {
    const close = finite(closes[index])
    if (!Number.isFinite(timestamp) || close === null || close <= 0) return
    let date
    try { date = new Date(timestamp * 1000).toLocaleDateString('sv-SE', { timeZone }) } catch { date = isoDate(new Date(timestamp * 1000)) }
    points.push({ date, close })
  })
  return {
    points,
    time: finite(result?.meta?.regularMarketTime),
    delayedBy: finite(result?.meta?.exchangeDataDelayedBy),
  }
}

export function calculatePeriodReturns(points) {
  if (!Array.isArray(points) || !points.length) return { day: null, week: null, month: null, quarter: null, ytd: null }
  const latest = points.at(-1)
  const pct = baseline => baseline && baseline.close > 0
    ? Math.round(((latest.close / baseline.close - 1) * 100) * 100) / 100
    : null
  const onOrBefore = date => {
    for (let index = points.length - 1; index >= 0; index--) if (points[index].date <= date) return points[index]
    return null
  }
  const priorYear = points.filter(point => point.date < `${latest.date.slice(0, 4)}-01-01`).at(-1)
  return {
    day: pct(points.at(-2)),
    week: pct(onOrBefore(isoDate(new Date(Date.parse(`${latest.date}T00:00:00Z`) - 7 * 86_400_000)))),
    month: pct(onOrBefore(shiftMonth(latest.date, -1))),
    quarter: pct(onOrBefore(shiftMonth(latest.date, -3))),
    ytd: pct(priorYear),
  }
}

async function handleSectors() {
  const rows = await mapPool(ETF_UNIVERSE, 5, async definition => {
    const query = new URLSearchParams({ range: '1y', interval: '1d', events: 'split' })
    const payload = await upstreamJson(`https://query1.finance.yahoo.com/v8/finance/chart/${definition.symbol}?${query}`, { headers: YAHOO_HEADERS })
    const history = parseYahooDailyHistory(payload)
    if (!history.points.length) throw new Error(`${definition.symbol}: no history`)
    return {
      ...definition,
      returns: calculatePeriodReturns(history.points),
      date: history.points.at(-1).date,
      time: history.time ? new Date(history.time * 1000).toISOString() : null,
      delayedBy: history.delayedBy,
    }
  })
  return {
    status: 200,
    body: { rows, source: 'Yahoo Finance', fetchedAt: new Date().toISOString() },
    cache: 60,
  }
}

function escapedRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function cboeRatio(html, name) {
  const pattern = new RegExp(`\\\\?"name\\\\?":\\\\?"${escapedRegExp(name)}\\\\?",\\\\?"value\\\\?":\\\\?"([0-9.]+)`)
  return finite(html.match(pattern)?.[1])
}

function cboeVolume(html, name) {
  const pattern = new RegExp(`\\\\?"${escapedRegExp(name)}\\\\?":\\[\\{\\\\?"name\\\\?":\\\\?"VOLUME\\\\?",\\\\?"call\\\\?":(\\d+),\\\\?"put\\\\?":(\\d+)`)
  const match = html.match(pattern)
  return match ? { callVolume: Number(match[1]), putVolume: Number(match[2]) } : null
}

export function parseCboeDaily(html) {
  const date = html.match(/\\?"selectedDate\\?":\\?"(\d{4}-\d{2}-\d{2})/)?.[1]
  if (!date || typeof html !== 'string') return null
  const definitions = [
    ['total', 'TOTAL PUT/CALL RATIO', 'SUM OF ALL PRODUCTS'],
    ['equity', 'EQUITY PUT/CALL RATIO', 'EQUITY OPTIONS'],
    ['index', 'INDEX PUT/CALL RATIO', 'INDEX OPTIONS'],
  ]
  const output = { date }
  for (const [key, ratioName, volumeName] of definitions) {
    const ratio = cboeRatio(html, ratioName)
    const volume = cboeVolume(html, volumeName)
    if (ratio === null || !volume || volume.callVolume <= 0 || Math.abs(ratio - volume.putVolume / volume.callVolume) > 0.011) {
      throw new Error(`Cboe ${key} data is invalid`)
    }
    output[key] = { ratio, ...volume }
  }
  return output
}

function recentWeekdays(count, now = new Date()) {
  const ny = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
  const dates = []
  for (let time = Date.parse(`${ny}T00:00:00Z`); dates.length < count; time -= 86_400_000) {
    const date = new Date(time)
    if (![0, 6].includes(date.getUTCDay())) dates.push(isoDate(date))
  }
  return dates
}

async function handlePutCall() {
  const dates = recentWeekdays(CBOE_DAYS)
  const cboePromise = mapPool(dates, CBOE_CONCURRENCY, async date => {
    try {
      const html = await (await upstream(`${CBOE_DAILY}?dt=${date}`, { headers: BROWSER_HEADERS }, 12_000)).text()
      return parseCboeDaily(html)
    } catch {
      return null
    }
  })
  const spyPromise = upstreamJson(`https://query1.finance.yahoo.com/v8/finance/chart/SPY?${new URLSearchParams({ range: '3mo', interval: '1d', events: 'split' })}`, { headers: YAHOO_HEADERS })
  const [cboeRows, spyPayload] = await Promise.all([cboePromise, spyPromise])
  const byDate = new Map()
  for (const row of cboeRows) if (row && !byDate.has(row.date)) byDate.set(row.date, row)
  const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-CBOE_DAYS)
  if (rows.length < 5) throw new Error('Cboe history is insufficient')
  const spy = parseYahooDailyHistory(spyPayload).points
  return {
    status: 200,
    body: {
      rows,
      spy,
      asOf: rows.at(-1).date,
      source: 'Cboe Daily Market Statistics',
      sourceUrl: CBOE_DAILY,
      fetchedAt: new Date().toISOString(),
      requestedDays: dates.length,
      missingDays: dates.length - cboeRows.filter(Boolean).length,
    },
    cache: 3600,
  }
}

export async function handleUsDataCenter(kind, query) {
  switch (kind) {
    case 'usdc-movers': return handleMovers(query.list)
    case 'usdc-ipo': return handleIpo(query.month)
    case 'usdc-sectors': return handleSectors()
    case 'usdc-putcall': return handlePutCall()
    default: return { status: 400, body: { error: '未知的美股数据类型', reason: 'bad-request' }, cache: 0 }
  }
}

function sendJson(res, status, body, cache = 0) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', `public, max-age=0, s-maxage=${cache}`)
  return res.status(status).json(body)
}

export async function dispatchUsDataCenter(req, res) {
  const kind = req.query?.kind
  const cacheKey = JSON.stringify([kind, req.query?.list, req.query?.month])
  const cached = responseCache.get(cacheKey)
  if (cached && cached.expires > Date.now()) return sendJson(res, cached.result.status, cached.result.body, cached.result.cache)
  try {
    const result = await handleUsDataCenter(kind, req.query || {})
    if (result.status === 200 && result.cache > 0) responseCache.set(cacheKey, { result, expires: Date.now() + result.cache * 1000 })
    return sendJson(res, result.status, result.body, result.cache)
  } catch {
    return sendJson(res, 502, { error: '公开数据源暂时不可用，请稍后重试', reason: 'upstream' }, 0)
  }
}

export function clearUsDataCenterCache() {
  responseCache.clear()
  yahooAuth = null
}
