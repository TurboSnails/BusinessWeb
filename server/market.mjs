// 个股日线：沪深 sh/sz 六位、港股 hk 五位（腾讯前复权日线）；美股 us + 代码（Yahoo chart 日线，拆股调整）
const symbolPattern = /^(?:(sh|sz)\d{6}|hk\d{5})$/
const usCandlePattern = /^us([A-Z][A-Z.-]{0,9})$/
const quoteSymbolPattern = /^(?:(sh|sz)\d{6}|r_hk\d{5}|us[A-Z0-9.]{1,10})$/
/** 美股代码 → Yahoo 代码（BRK.B → BRK-B）；不合规返回 null。代码本身限定 ^[A-Z.-]{1,10}$ 且首字母 */
export function yahooTickerOf(symbol) {
  const m = typeof symbol === 'string' ? usCandlePattern.exec(symbol) : null
  if (!m || /[.-]{2}|[.-]$/.test(m[1])) return null
  return m[1].replace(/\./g, '-')
}

const round4 = n => Math.round(n * 10_000) / 10_000

/** Yahoo v8 chart（interval=1d）→ 腾讯 fqkline 同形结构 { data: { [symbol]: { day: [[date, open, close, high, low, volume]] } } }。
 * 日期按交易所时区取当地交易日；缺值的行丢弃；高低价夹到开收价之外（Yahoo 拆股调整后偶有浮点误差）。 */
export function parseYahooCandles(json, symbol) {
  const result = json?.chart?.result?.[0]
  const meta = result?.meta ?? {}
  const ts = Array.isArray(result?.timestamp) ? result.timestamp : []
  const q = result?.indicators?.quote?.[0] ?? {}
  const timeZone = typeof meta.exchangeTimezoneName === 'string' ? meta.exchangeTimezoneName : 'America/New_York'
  const rows = new Map()
  ts.forEach((t, i) => {
    const [open, close, high, low, volume] = ['open', 'close', 'high', 'low', 'volume'].map(k => Number(q[k]?.[i] ?? NaN))
    if (!Number.isFinite(t) || ![open, close, high, low].every(v => Number.isFinite(v) && v > 0)) return
    let date
    try { date = new Date(t * 1000).toLocaleDateString('sv-SE', { timeZone }) } catch { date = new Date(t * 1000).toISOString().slice(0, 10) }
    rows.set(date, [date, round4(open), round4(close), round4(Math.max(high, open, close)), round4(Math.min(low, open, close)), Number.isFinite(volume) && volume > 0 ? volume : 0])
  })
  return {
    code: 0,
    source: 'yahoo',
    adjustment: 'split',
    currency: typeof meta.currency === 'string' ? meta.currency : null,
    data: { [symbol]: { day: [...rows.values()].sort((a, b) => a[0].localeCompare(b[0])) } },
  }
}

const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value

export async function handleMarket(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: '只支持 GET 请求' })
  }
  const { kind, symbol, symbols, begin, end, period } = req.query
  let url
  let yahoo = false
  if (kind === 'quotes' && typeof symbols === 'string' && symbols.length <= 899
    && symbols.split(',').length <= 100 && symbols.split(',').every(s => quoteSymbolPattern.test(s))) {
    url = `https://qt.gtimg.cn/q=${symbols}`
  } else if (kind === 'candles' && typeof symbol === 'string' && symbolPattern.test(symbol)
    && validDate(begin) && validDate(end) && begin <= end) {
    url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?${new URLSearchParams({ param: `${symbol},day,${begin},${end},640,qfq` })}`
  } else if (kind === 'candles' && yahooTickerOf(symbol) && validDate(begin) && validDate(end) && begin <= end) {
    const period1 = Math.floor(Date.parse(begin) / 1000), period2 = Math.floor(Date.parse(end) / 1000) + 86_400
    url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTickerOf(symbol))}?${new URLSearchParams({ period1: String(period1), period2: String(period2), interval: '1d', events: 'split' })}`
    yahoo = true
  } else if (kind === 'index-history' && ['sh000300', 'sh000852', 'sh000001', 'sz399106', 'sz399001', 'sz399006'].includes(symbol)
    && ['day', 'week', 'month'].includes(period)) {
    url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?${new URLSearchParams({ param: `${symbol},${period},,,${period === 'month' ? 800 : 640},qfq` })}`
  } else if (kind === 'index-amount-history' && ['sh000001', 'sz399106'].includes(symbol)
    && ['day', 'week', 'month'].includes(period)) {
    url = `https://web.ifzq.gtimg.cn/appstock/app/newfqkline/get?${new URLSearchParams({ param: `${symbol},${period},,,${period === 'month' ? 800 : 640},qfq` })}`
  } else {
    return res.status(400).json({ error: '行情查询参数无效' })
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 7_000)
  try {
    // Yahoo 不带浏览器 UA 会直接 429
    const upstream = await fetch(url, { signal: controller.signal, redirect: 'error', ...(yahoo ? { headers: { 'User-Agent': 'Mozilla/5.0' } } : {}) })
    if (yahoo && upstream.status === 404) {
      // 代码不存在 / 已退市：返回空日线，由页面显示空状态
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300')
      return res.status(200).json(parseYahooCandles(null, symbol))
    }
    if (!upstream.ok) return res.status(502).json({ error: '行情源暂时不可用' })
    if (kind === 'quotes') {
      const bytes = Buffer.from(await upstream.arrayBuffer())
      res.setHeader('Content-Type', 'text/plain; charset=gbk')
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30')
      return res.status(200).send(bytes)
    }
    const payload = yahoo ? parseYahooCandles(await upstream.json(), symbol) : await upstream.json()
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300')
    return res.status(200).json(payload)
  } catch {
    return res.status(controller.signal.aborted ? 504 : 502).json({ error: controller.signal.aborted ? '行情源请求超时' : '行情源暂时不可用' })
  } finally {
    clearTimeout(timer)
  }
}

export function marketMiddleware(req, res, next) {
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname !== '/api/grid-market') return next()
  const query = Object.fromEntries(url.searchParams)
  for (const key of url.searchParams.keys()) if (url.searchParams.getAll(key).length > 1) query[key] = undefined
  const adapter = {
    setHeader: (key, value) => res.setHeader(key, value),
    status(code) { res.statusCode = code; return this },
    json(payload) { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(payload)) },
    send(payload) { res.end(payload) },
  }
  void handleMarket({ method: req.method, query }, adapter)
}
