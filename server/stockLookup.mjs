// 个股查询：经 /api/grid-market?kind=lookup-* 分派。数据源：Yahoo / 腾讯 / FINRA / 东方财富。
// 契约见 src/features/stock-lookup/types.ts。纯函数尽量导出，供 node --test 不联网测。

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; BusinessWeb/1.0)' }
const YAHOO_UA = { 'User-Agent': 'Mozilla/5.0' }
const TIMEFRAMES = new Set(['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1mo'])
const PAGE_BARS = 400

/** @typedef {'us'|'hk'|'cn'} LookupMarket */
/** @typedef {'1m'|'5m'|'15m'|'30m'|'1h'|'4h'|'1d'|'1w'|'1mo'} Timeframe */

// ─── 错误 / HTTP ─────────────────────────────────────────────

export function lookupError(reason, error) {
  return { error: error || reasonMessage(reason), reason }
}

function reasonMessage(reason) {
  return ({
    unsupported: '该市场暂不支持此数据',
    'not-found': '未找到该代码',
    upstream: '上游数据源暂时不可用',
    'bad-request': '请求参数无效',
  })[reason] || '查询失败'
}

function sendJson(res, status, body, cacheSec) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (cacheSec != null) res.setHeader('Cache-Control', `public, max-age=0, s-maxage=${cacheSec}`)
  return res.status(status).json(body)
}

function httpStatusFor(reason) {
  if (reason === 'bad-request') return 400
  if (reason === 'not-found' || reason === 'unsupported') return 404
  return 502
}

/** Yahoo 429 冷却：不重试风暴，短时直接 upstream */
let yahooCooldownUntil = 0

export function markYahooRateLimit(retryAfterHeader) {
  const parsed = Number(retryAfterHeader)
  const sec = Number.isFinite(parsed) && parsed > 0 ? parsed : 60
  yahooCooldownUntil = Date.now() + Math.min(Math.max(sec, 30), 120) * 1000
}

export function isYahooRateLimited(now = Date.now()) {
  return now < yahooCooldownUntil
}

/** 测试用：重置冷却 */
export function resetYahooRateLimit() {
  yahooCooldownUntil = 0
}

/** 统一上游失败：429 → upstream + 60s 缓存，绝不自动重试 */
export function upstreamFail(fetchResult) {
  if (fetchResult?.status === 429) {
    markYahooRateLimit(fetchResult.headers?.get?.('retry-after'))
    return { status: 502, body: lookupError('upstream', '行情源限流，请稍后重试'), cache: 60 }
  }
  return { status: 502, body: lookupError('upstream'), cache: 0 }
}

function yahooCooldownResponse() {
  return { status: 502, body: lookupError('upstream', '行情源限流，请稍后重试'), cache: 60 }
}

async function fetchText(url, opts = {}, timeoutMs = 10_000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const upstream = await fetch(url, { ...opts, signal: controller.signal, redirect: opts.redirect ?? 'follow' })
    const text = await upstream.text()
    return { ok: upstream.ok, status: upstream.status, text, headers: upstream.headers }
  } finally {
    clearTimeout(timer)
  }
}

async function fetchJson(url, opts = {}, timeoutMs = 10_000) {
  const r = await fetchText(url, opts, timeoutMs)
  if (r.status === 429) markYahooRateLimit(r.headers?.get?.('retry-after'))
  if (!r.ok) return { ...r, json: null }
  try { return { ...r, json: JSON.parse(r.text) } } catch { return { ...r, json: null, ok: false } }
}

// ─── 代码解析 ────────────────────────────────────────────────

/** 把用户输入规范成本站 symbol；无效返回 null */
export function normalizeSymbol(raw) {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  if (!s || s.length > 24) return null
  const lower = s.toLowerCase()
  if (/^(sh|sz)\d{6}$/.test(lower)) return lower
  if (/^hk\d{1,5}$/.test(lower)) return `hk${lower.slice(2).padStart(5, '0')}`
  if (/^\d{6}$/.test(s)) {
    if (/^[69]/.test(s)) return `sh${s}`
    if (/^[023]/.test(s)) return `sz${s}`
    return null
  }
  if (/^\d{1,5}$/.test(s)) return `hk${s.padStart(5, '0')}`
  // 美股：允许 AAPL / BRK.B / BRK-B
  const us = s.toUpperCase().replace(/-/g, '.')
  if (/^[A-Z][A-Z0-9.]{0,9}$/.test(us) && !/[.]{2}|[.]$/.test(us)) return us
  return null
}

export function marketOf(symbol) {
  if (/^(sh|sz)\d{6}$/.test(symbol)) return 'cn'
  if (/^hk\d{5}$/.test(symbol)) return 'hk'
  return 'us'
}

/** Yahoo 代码：BRK.B → BRK-B */
export function yahooSymbolOf(symbol) {
  if (marketOf(symbol) !== 'us') return null
  return symbol.replace(/\./g, '-')
}

/** 腾讯行情代码 */
export function tencentSymbolOf(symbol) {
  const m = marketOf(symbol)
  if (m === 'cn' || m === 'hk') return symbol
  return null
}

// ─── 时间 / 会话 ─────────────────────────────────────────────

export function isoFromUnix(sec, timeZone = 'UTC') {
  const d = new Date(sec * 1000)
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
      timeZoneName: 'longOffset',
    }).formatToParts(d)
    const g = t => parts.find(p => p.type === t)?.value
    const rawOff = g('timeZoneName') || 'GMT'
    const offset = rawOff === 'GMT' ? 'Z' : rawOff.replace(/^GMT/, '')
    return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}:${g('second')}${offset}`
  } catch {
    return d.toISOString()
  }
}

/** 美东墙钟字段（不含 DST 判定，靠 Intl） */
export function etParts(unixSec) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    weekday: 'short', hourCycle: 'h23',
  }).formatToParts(new Date(unixSec * 1000))
  const g = t => parts.find(p => p.type === t)?.value
  return {
    y: +g('year'), mo: +g('month'), d: +g('day'),
    h: +g('hour'), mi: +g('minute'), s: +g('second'),
    wd: g('weekday'),
  }
}

/** 分钟数自美东 0:00 */
function etMinutes(unixSec) {
  const p = etParts(unixSec)
  return p.h * 60 + p.mi
}

/**
 * 4h 聚合（美股）：按美东 09:30 起每 4 小时一桶。
 * 桶起点分钟：9:30, 13:30, 17:30, 21:30, 1:30, 5:30（对 1440 取模）。
 * 输入应为已按 t 升序的 1h bars；输出桶的 t = 桶起点（该日对应 ET 时刻的 unix 秒，取桶内第一根的对齐值）。
 */
export function aggregateUs4h(bars1h) {
  if (!Array.isArray(bars1h) || !bars1h.length) return []
  const bucketStartMin = (mins) => {
    // 相对 09:30 的偏移
    const rel = ((mins - (9 * 60 + 30)) % 1440 + 1440) % 1440
    const aligned = mins - (rel % (4 * 60))
    return ((aligned % 1440) + 1440) % 1440
  }
  const keyOf = (t) => {
    const p = etParts(t)
    const day = `${p.y}-${p.mo}-${p.d}`
    return `${day}|${bucketStartMin(p.h * 60 + p.mi)}`
  }
  /** @type {Map<string, any>} */
  const map = new Map()
  for (const b of bars1h) {
    if (!b || !Number.isFinite(b.t)) continue
    const k = keyOf(b.t)
    const cur = map.get(k)
    if (!cur) {
      map.set(k, { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v || 0, ext: b.ext })
    } else {
      cur.h = Math.max(cur.h, b.h)
      cur.l = Math.min(cur.l, b.l)
      cur.c = b.c
      cur.v += b.v || 0
      if (b.ext) cur.ext = true
    }
  }
  return [...map.values()].sort((a, b) => a.t - b.t)
}

/**
 * 沪深港 4h：用 60 分钟线，按交易时段切。
 * A 股：上午 09:30–11:30、下午 13:00–15:00 各一桶。
 * 港股：上午 09:30–12:00、下午 13:00–16:00 各一桶。
 */
export function aggregateCnHk4h(bars1h, market) {
  if (!Array.isArray(bars1h) || !bars1h.length) return []
  const tz = market === 'hk' ? 'Asia/Hong_Kong' : 'Asia/Shanghai'
  const sessionOf = (unixSec) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(unixSec * 1000))
    const g = t => +parts.find(p => p.type === t).value
    const day = `${g('year')}-${String(g('month')).padStart(2, '0')}-${String(g('day')).padStart(2, '0')}`
    const mins = g('hour') * 60 + g('minute')
    if (market === 'hk') {
      if (mins >= 9 * 60 + 30 && mins <= 12 * 60) return `${day}|am`
      if (mins >= 13 * 60 && mins <= 16 * 60) return `${day}|pm`
    } else {
      if (mins >= 9 * 60 + 30 && mins <= 11 * 60 + 30) return `${day}|am`
      if (mins >= 13 * 60 && mins <= 15 * 60) return `${day}|pm`
    }
    return null
  }
  const map = new Map()
  for (const b of bars1h) {
    const k = sessionOf(b.t)
    if (!k) continue
    const cur = map.get(k)
    if (!cur) map.set(k, { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v || 0 })
    else {
      cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v || 0
    }
  }
  return [...map.values()].sort((a, b) => a.t - b.t)
}

/** 从分钟线聚合成 N 分钟 */
export function aggregateMinutes(bars, minutes) {
  if (!Array.isArray(bars) || !bars.length) return []
  const map = new Map()
  for (const b of bars) {
    const bucket = Math.floor(b.t / (minutes * 60)) * (minutes * 60)
    const cur = map.get(bucket)
    if (!cur) map.set(bucket, { t: bucket, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v || 0, ...(b.ext ? { ext: true } : {}) })
    else {
      cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v || 0
      if (b.ext) cur.ext = true
    }
  }
  return [...map.values()].sort((a, b) => a.t - b.t)
}

// ─── 新闻关键词分类 ──────────────────────────────────────────

const TOPIC_RULES_EN = [
  ['业绩财报', /\b(earnings|eps|revenue|guidance|quarterly results|beats estimates|misses estimates|profit|outlook)\b/i],
  ['机构评级', /\b(upgrade|downgrade|initiates? coverage|price target|overweight|underweight|outperform|analyst)\b/i],
  ['内部交易', /\b(insider|form 4|10b5-1|sold shares|bought shares)\b/i],
  ['并购重组', /\b(acquisition|acquire[ds]?|acquiring|merger|takeover|buyout|deal to (buy|sell)|spin-?offs?)\b/i],
  ['资本回报', /\b(dividend|buyback|repurchase|share repurchase|special dividend)\b/i],
  ['管理变动', /\b(ceo|cfo|resigns?|appoints?|steps down|executive)\b/i],
  ['产品进展', /\b(launch|product|chip|semiconductor|fda|approval|unveil)\b/i],
  ['监管法律', /\b(sec |lawsuit|probe|investigation|antitrust|regulator|fine|settlement)\b/i],
  ['市场情绪', /\b(rally|selloff|volatility|sentiment|bullish|bearish|surge|plunge)\b/i],
  ['宏观动态', /\b(fed |inflation|rates? hike|cpi|macro|treasury|recession)\b/i],
]

const TOPIC_RULES_ZH = [
  ['业绩财报', /(财报|业绩|营收|净利润|指引|超预期|不及预期|季报|年报)/],
  // 内部交易优先于机构评级，避免「减持」被券商评级词抢走
  ['内部交易', /(高管增减持|内部人|董监高|减持公告|增持公告)/],
  ['机构评级', /(评级|目标价|买入|增持|减持|卖出|券商|上调|下调)/],
  ['并购重组', /(并购|收购|收购购|重组|要约收购|分拆)/],
  ['资本回报', /(分红|派息|回购|股息|红利)/],
  ['管理变动', /(总裁|董事长|总经理|辞职|任命|卸任|高管变动)/],
  ['产品进展', /(发布|新品|获批|临床|芯片|产品)/],
  ['监管法律', /(监管|立案|调查|处罚|诉讼|证监会|反垄断)/],
  ['市场情绪', /(大涨|大跌|暴涨|暴跌|情绪|热度|资金涌入)/],
  ['宏观动态', /(央行|降准|降息|加息|通胀|宏观|美联储|GDP)/],
]

const SENT_POS_EN = /\b(beat|beats|surge|surges|rally|record high|outperform|upgrade|growth|bullish|soar)\b/i
const SENT_NEG_EN = /\b(miss|misses|plunge|plunges|downgrade|lawsuit|probe|fraud|bearish|cut|slump|fall)\b/i
const SENT_POS_ZH = /(超预期|大涨|上涨|利好|扭亏|增持|上调|创新高|回购)/
const SENT_NEG_ZH = /(不及预期|大跌|下跌|利空|亏损|减持|下调|立案|处罚|暴跌)/

export function classifyNewsTopic(title, lang = 'en') {
  const rules = lang === 'zh' ? TOPIC_RULES_ZH : TOPIC_RULES_EN
  const text = String(title || '')
  for (const [topic, re] of rules) if (re.test(text)) return topic
  return '未分类'
}

export function classifyNewsSentiment(title, lang = 'en') {
  const text = String(title || '')
  const pos = lang === 'zh' ? SENT_POS_ZH : SENT_POS_EN
  const neg = lang === 'zh' ? SENT_NEG_ZH : SENT_NEG_EN
  const p = pos.test(text), n = neg.test(text)
  if (p && !n) return '利好'
  if (n && !p) return '利空'
  if (p && n) return '中性'
  return '未评级'
}

export function classifyNews(title, lang = 'en') {
  return { topic: classifyNewsTopic(title, lang), sentiment: classifyNewsSentiment(title, lang) }
}

// ─── Yahoo session (cookie + crumb) ──────────────────────────

let yahooAuth = null // { cookie, crumb, at }

async function getYahooAuth(force = false) {
  if (!force && yahooAuth && Date.now() - yahooAuth.at < 55 * 60_000) return yahooAuth
  const r = await fetch('https://fc.yahoo.com', { headers: YAHOO_UA, redirect: 'manual' })
  const cookie = (r.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).join('; ')
  const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { ...YAHOO_UA, cookie },
  })
  if (!crumbRes.ok) throw new Error(`crumb HTTP ${crumbRes.status}`)
  const crumb = await crumbRes.text()
  if (!crumb || crumb.startsWith('{')) throw new Error('invalid crumb')
  yahooAuth = { cookie, crumb, at: Date.now() }
  return yahooAuth
}

async function yahooFetchJson(url, retry = true) {
  if (isYahooRateLimited()) return { ok: false, status: 429, text: '', headers: new Headers(), json: null }
  const auth = await getYahooAuth(false)
  const r = await fetchJson(url.includes('crumb=') ? url : `${url}${url.includes('?') ? '&' : '?'}crumb=${encodeURIComponent(auth.crumb)}`, {
    headers: { ...YAHOO_UA, cookie: auth.cookie },
  }, 12_000)
  // 429 不重试；仅 cookie/crumb 失效时重取一次
  if (r.status === 429) return r
  if ((r.status === 401 || r.status === 403) && retry) {
    await getYahooAuth(true)
    return yahooFetchJson(url, false)
  }
  return r
}

// ─── Yahoo chart / search parsers ────────────────────────────

export function parseYahooSearchQuotes(json) {
  const quotes = Array.isArray(json?.quotes) ? json.quotes : []
  const out = []
  for (const q of quotes) {
    if (!q || typeof q.symbol !== 'string') continue
    const qt = String(q.quoteType || q.typeDisp || '').toUpperCase()
    if (qt === 'OPTION') continue
    const sym = q.symbol
    // 港股 0700.HK / 沪深 600519.SS / 000858.SZ
    if (/\.HK$/i.test(sym)) {
      const code = sym.replace(/\.HK$/i, '').replace(/^0+/, '') || '0'
      out.push({
        symbol: `hk${code.padStart(5, '0')}`,
        name: q.shortname || q.longname || sym,
        market: 'hk',
        exchange: q.exchDisp || q.exchange,
        type: q.quoteType || q.typeDisp,
      })
      continue
    }
    if (/\.SS$/i.test(sym)) {
      out.push({
        symbol: `sh${sym.replace(/\.SS$/i, '')}`,
        name: q.shortname || q.longname || sym,
        market: 'cn',
        exchange: q.exchDisp || q.exchange,
        type: q.quoteType || q.typeDisp,
      })
      continue
    }
    if (/\.SZ$/i.test(sym)) {
      out.push({
        symbol: `sz${sym.replace(/\.SZ$/i, '')}`,
        name: q.shortname || q.longname || sym,
        market: 'cn',
        exchange: q.exchDisp || q.exchange,
        type: q.quoteType || q.typeDisp,
      })
      continue
    }
    if (/[.=]/.test(sym) && !/^[A-Z]+(\.[A-Z])?$/i.test(sym)) continue // 跳过其他市场
    const us = normalizeSymbol(sym.replace(/-/g, '.'))
    if (!us || marketOf(us) !== 'us') continue
    out.push({
      symbol: us,
      name: q.shortname || q.longname || us,
      market: 'us',
      exchange: q.exchDisp || q.exchange,
      type: q.quoteType || q.typeDisp,
    })
  }
  return out
}

/** 本地补全：纯数字 / 前缀 → SymbolHit（无名称时用代码） */
export function localSymbolHits(q) {
  const sym = normalizeSymbol(q)
  if (!sym) return []
  const market = marketOf(sym)
  if (market === 'us' && !/^\d/.test(q.trim()) && !/^(sh|sz|hk)/i.test(q.trim())) {
    // 纯美股代码搜索交给 Yahoo；这里只处理明确的沪深港形态
    if (!/^(sh|sz|hk|\d)/i.test(q.trim())) return []
  }
  if (market === 'cn' || market === 'hk') {
    return [{ symbol: sym, name: sym, market }]
  }
  return []
}

export function parseYahooChartBars(json, { includeExt = false, regularStart, regularEnd } = {}) {
  const result = json?.chart?.result?.[0]
  if (!result) return { meta: null, bars: [] }
  const meta = result.meta || {}
  const ts = Array.isArray(result.timestamp) ? result.timestamp : []
  const q = result.indicators?.quote?.[0] || {}
  const reg = meta.currentTradingPeriod?.regular
  const r0 = Number.isFinite(regularStart) ? regularStart : reg?.start
  const r1 = Number.isFinite(regularEnd) ? regularEnd : reg?.end
  const bars = []
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i]
    const o = Number(q.open?.[i]), h = Number(q.high?.[i]), l = Number(q.low?.[i]), c = Number(q.close?.[i])
    const v = Number(q.volume?.[i])
    if (![t, o, h, l, c].every(Number.isFinite)) continue
    if (!(o > 0 && h > 0 && l > 0 && c > 0)) continue
    const bar = { t, o, h: Math.max(h, o, c), l: Math.min(l, o, c), c, v: Number.isFinite(v) && v > 0 ? v : 0 }
    if (includeExt && Number.isFinite(r0) && Number.isFinite(r1)) {
      // 跨日：用当日 tradingPeriods 更准；退化用 currentTradingPeriod + 同刻钟判断
      const mins = etMinutes(t)
      const inRegularClock = mins >= 9 * 60 + 30 && mins < 16 * 60
      // 也对照 meta 时段（同一交易日）
      const inRegularMeta = t >= r0 && t < r1
      if (!(inRegularClock || inRegularMeta)) bar.ext = true
    }
    bars.push(bar)
  }
  return { meta, bars }
}

export function sessionFromYahooMeta(meta, nowSec = Math.floor(Date.now() / 1000)) {
  const ctp = meta?.currentTradingPeriod
  if (!ctp) return 'closed'
  const { pre, regular, post } = ctp
  if (pre && nowSec >= pre.start && nowSec < pre.end) return 'pre'
  if (regular && nowSec >= regular.start && nowSec < regular.end) return 'regular'
  if (post && nowSec >= post.start && nowSec < post.end) return 'post'
  return 'closed'
}

export function quoteFromYahooMeta(symbol, meta, bars = []) {
  const tz = meta.exchangeTimezoneName || 'America/New_York'
  const price = Number(meta.regularMarketPrice)
  const prev = Number(meta.previousClose ?? meta.chartPreviousClose)
  const change = Number.isFinite(price) && Number.isFinite(prev) ? price - prev : NaN
  const changePct = Number.isFinite(change) && prev ? (change / prev) * 100 : Number(meta.regularMarketChangePercent)
  const timeSec = Number(meta.regularMarketTime) || Math.floor(Date.now() / 1000)
  const session = sessionFromYahooMeta(meta, Math.floor(Date.now() / 1000))
  /** @type {any} */
  const quote = {
    symbol,
    name: meta.longName || meta.shortName || symbol,
    market: 'us',
    currency: meta.currency || 'USD',
    price,
    change: Number.isFinite(change) ? change : 0,
    changePct: Number.isFinite(changePct) ? changePct : 0,
    prevClose: Number.isFinite(prev) ? prev : price,
    session,
    time: isoFromUnix(timeSec, tz),
    timezone: tz,
  }
  // 盘前盘后：优先 meta 字段；否则从 includePrePost bars 取
  const preP = Number(meta.preMarketPrice)
  const postP = Number(meta.postMarketPrice)
  if (session === 'pre' && Number.isFinite(preP)) {
    const ch = preP - price
    quote.extended = { session: 'pre', price: preP, change: ch, changePct: price ? (ch / price) * 100 : 0, time: isoFromUnix(Number(meta.preMarketTime) || timeSec, tz) }
  } else if ((session === 'post' || session === 'closed') && Number.isFinite(postP)) {
    const ch = postP - price
    quote.extended = { session: 'post', price: postP, change: ch, changePct: price ? (ch / price) * 100 : 0, time: isoFromUnix(Number(meta.postMarketTime) || timeSec, tz) }
  } else if (bars.length) {
    const last = bars[bars.length - 1]
    if (last?.ext && Number.isFinite(last.c)) {
      const extSession = etMinutes(last.t) < 9 * 60 + 30 ? 'pre' : 'post'
      const ch = last.c - price
      quote.extended = { session: extSession, price: last.c, change: ch, changePct: price ? (ch / price) * 100 : 0, time: isoFromUnix(last.t, tz) }
    }
  }
  return quote
}

/** Yahoo interval / range 限制与翻页窗口（秒） */
export function yahooBarsPlan(tf) {
  // 单次最多跨度、总可得跨度、yahoo interval
  const day = 86_400
  const map = {
    '1m': { interval: '1m', pageSpan: 7 * day, maxSpan: 30 * day },
    '5m': { interval: '5m', pageSpan: 60 * day, maxSpan: 60 * day },
    '15m': { interval: '15m', pageSpan: 60 * day, maxSpan: 60 * day },
    '30m': { interval: '30m', pageSpan: 60 * day, maxSpan: 60 * day },
    '1h': { interval: '1h', pageSpan: 730 * day, maxSpan: 730 * day },
    '4h': { interval: '1h', pageSpan: 730 * day, maxSpan: 730 * day },
    '1d': { interval: '1d', pageSpan: 3650 * day, maxSpan: Infinity },
    '1w': { interval: '1wk', pageSpan: 3650 * day, maxSpan: Infinity },
    '1mo': { interval: '1mo', pageSpan: 3650 * day, maxSpan: Infinity },
  }
  return map[tf]
}

export function computeHasMore(tf, oldestT, firstTradeDate) {
  if (!Number.isFinite(oldestT)) return false
  const plan = yahooBarsPlan(tf)
  if (!plan) return false
  const floor = Number.isFinite(firstTradeDate) ? firstTradeDate : 0
  const maxBack = plan.maxSpan === Infinity ? floor : Math.max(floor, Math.floor(Date.now() / 1000) - plan.maxSpan)
  return oldestT > maxBack + 86_400
}

// ─── 腾讯解析 ────────────────────────────────────────────────

/** qt.gtimg.cn GBK 文本 → Quote */
export function parseTencentQuote(rawText, symbol) {
  const text = String(rawText || '')
  const key = `v_${symbol}=`
  const idx = text.indexOf(key)
  if (idx < 0) return null
  const start = text.indexOf('"', idx)
  const end = text.indexOf('"', start + 1)
  if (start < 0 || end < 0) return null
  const fields = text.slice(start + 1, end).split('~')
  // 通用：1名称 2代码 3现价 4昨收 5今开 30时间 31涨跌 32涨跌幅 … 币种靠后
  const name = fields[1] || symbol
  const price = Number(fields[3])
  const prevClose = Number(fields[4])
  const change = Number(fields[31])
  const changePct = Number(fields[32])
  const timeRaw = fields[30] || ''
  const market = marketOf(symbol)
  const tz = market === 'hk' ? 'Asia/Hong_Kong' : 'Asia/Shanghai'
  const currency = market === 'hk' ? 'HKD' : (fields.find(f => f === 'CNY' || f === 'HKD') || (market === 'hk' ? 'HKD' : 'CNY'))
  let time
  // 沪深：20261127161454；港股：2026/11/27 16:09:04
  if (/^\d{14}$/.test(timeRaw)) {
    const y = timeRaw.slice(0, 4), mo = timeRaw.slice(4, 6), d = timeRaw.slice(6, 8)
    const hh = timeRaw.slice(8, 10), mi = timeRaw.slice(10, 12), ss = timeRaw.slice(12, 14)
    time = `${y}-${mo}-${d}T${hh}:${mi}:${ss}${market === 'hk' ? '+08:00' : '+08:00'}`
  } else if (/^\d{4}\/\d{2}\/\d{2}/.test(timeRaw)) {
    const [date, hm] = timeRaw.split(/\s+/)
    const [y, mo, d] = date.split('/')
    const [hh = '00', mi = '00', ss = '00'] = (hm || '').split(':')
    time = `${y}-${mo}-${d}T${hh.padStart(2, '0')}:${mi.padStart(2, '0')}:${(ss || '00').padStart(2, '0')}+08:00`
  } else {
    time = new Date().toISOString()
  }
  // 粗判 session：按本地钟点
  const hm = Number((time.match(/T(\d{2}):(\d{2})/) || [])[1]) * 60 + Number((time.match(/T(\d{2}):(\d{2})/) || [])[2] || 0)
  let session = 'closed'
  if (market === 'cn') {
    if ((hm >= 9 * 60 + 30 && hm < 11 * 60 + 30) || (hm >= 13 * 60 && hm < 15 * 60)) session = 'regular'
  } else if ((hm >= 9 * 60 + 30 && hm < 12 * 60) || (hm >= 13 * 60 && hm < 16 * 60)) session = 'regular'
  if (![price, prevClose].every(Number.isFinite)) return null
  return {
    symbol, name, market, currency,
    price, change: Number.isFinite(change) ? change : price - prevClose,
    changePct: Number.isFinite(changePct) ? changePct : prevClose ? ((price - prevClose) / prevClose) * 100 : 0,
    prevClose, session, time, timezone: tz,
  }
}

/** 腾讯日/周/月 fqkline 行 → Bar（日线 t = 交易所当日 00:00 的 UTC 秒） */
export function parseTencentDayRows(rows, timeZone = 'Asia/Shanghai') {
  const out = []
  for (const row of rows || []) {
    if (!Array.isArray(row) || row.length < 6) continue
    const [date, o, c, h, l, v] = row
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const nums = [o, h, l, c, v].map(Number)
    if (!nums.slice(0, 4).every(n => Number.isFinite(n) && n > 0)) continue
    // 用该日 00:00 在交易所时区对应的 UTC 秒
    const guess = Date.parse(`${date}T00:00:00+08:00`) / 1000
    let t = guess
    try {
      // 校正：找一个 unix 使当地日期为 date 且 00:00
      for (let adj = -2; adj <= 2; adj++) {
        const cand = guess + adj * 3600
        const local = new Date(cand * 1000).toLocaleDateString('sv-SE', { timeZone })
        const hm = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(cand * 1000))
        if (local === date && hm.startsWith('00:00')) { t = cand; break }
      }
    } catch { /* keep guess */ }
    out.push({ t, o: nums[0], h: Math.max(nums[1], nums[0], nums[3]), l: Math.min(nums[2], nums[0], nums[3]), c: nums[3], v: Number.isFinite(nums[4]) ? nums[4] : 0 })
  }
  return out.sort((a, b) => a.t - b.t)
}

/** mkline 行 ["202611271325", o, c, h, l, v, ...] */
export function parseTencentMklineRows(rows, _timeZone = 'Asia/Shanghai') {
  const out = []
  for (const row of rows || []) {
    if (!Array.isArray(row) || row.length < 6) continue
    const stamp = String(row[0])
    if (!/^\d{12}$/.test(stamp)) continue
    const y = stamp.slice(0, 4), mo = stamp.slice(4, 6), d = stamp.slice(6, 8)
    const hh = stamp.slice(8, 10), mi = stamp.slice(10, 12)
    const o = Number(row[1]), c = Number(row[2]), h = Number(row[3]), l = Number(row[4]), v = Number(row[5])
    if (![o, h, l, c].every(n => Number.isFinite(n) && n > 0)) continue
    const t = Math.floor(Date.parse(`${y}-${mo}-${d}T${hh}:${mi}:00+08:00`) / 1000)
    if (!Number.isFinite(t)) continue
    out.push({ t, o, h: Math.max(h, o, c), l: Math.min(l, o, c), c, v: Number.isFinite(v) ? v : 0 })
  }
  return out.sort((a, b) => a.t - b.t)
}

/** day/query 分时：累计成交量，需差分 */
export function parseTencentIntradayDays(days, _timeZone = 'Asia/Shanghai') {
  const out = []
  for (const day of days || []) {
    const date = String(day.date || '')
    if (!/^\d{8}$/.test(date)) continue
    const y = date.slice(0, 4), mo = date.slice(4, 6), d = date.slice(6, 8)
    let prevVol = 0
    let prevPrice = NaN
    for (const line of day.data || []) {
      const parts = String(line).trim().split(/\s+/)
      if (parts.length < 3) continue
      const hm = parts[0]
      if (!/^\d{4}$/.test(hm)) continue
      const price = Number(parts[1])
      const cumVol = Number(parts[2])
      if (!Number.isFinite(price) || price <= 0) continue
      const vol = Number.isFinite(cumVol) ? Math.max(0, cumVol - (Number.isFinite(prevVol) ? prevVol : 0)) : 0
      prevVol = Number.isFinite(cumVol) ? cumVol : prevVol
      const t = Math.floor(Date.parse(`${y}-${mo}-${d}T${hm.slice(0, 2)}:${hm.slice(2, 4)}:00+08:00`) / 1000)
      const o = Number.isFinite(prevPrice) ? prevPrice : price
      out.push({ t, o, h: Math.max(o, price), l: Math.min(o, price), c: price, v: vol })
      prevPrice = price
    }
  }
  return out.sort((a, b) => a.t - b.t)
}

// ─── FINRA ───────────────────────────────────────────────────

export function parseRegShoText(text, symbol) {
  const lines = String(text || '').trim().split(/\r?\n/)
  const out = []
  for (const line of lines) {
    if (!line || /^Date\|/i.test(line) || /^Date,/i.test(line)) continue
    const parts = line.includes('|') ? line.split('|') : line.split(',')
    if (parts.length < 5) continue
    const [dateRaw, sym, shortV, shortEx, totalV] = parts
    if (String(sym).toUpperCase() !== symbol.toUpperCase()) continue
    const date = /^\d{8}$/.test(dateRaw)
      ? `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`
      : dateRaw
    const shortVolume = Number(shortV), shortExemptVolume = Number(shortEx), totalVolume = Number(totalV)
    if (![shortVolume, shortExemptVolume, totalVolume].every(n => Number.isFinite(n))) continue
    out.push({ date, shortVolume, shortExemptVolume, totalVolume })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

export function parseFinraAtsRows(rows, symbol) {
  const out = []
  for (const r of rows || []) {
    if (!r) continue
    const sym = r.issueSymbolIdentifier || r.symbol
    if (sym && String(sym).toUpperCase() !== symbol.toUpperCase()) continue
    const weekStart = r.weekStartDate || r.weekStart
    const shares = Number(r.totalWeeklyShareQuantity ?? r.shares)
    const trades = Number(r.totalWeeklyTradeCount ?? r.trades)
    if (typeof weekStart !== 'string' || ![shares, trades].every(Number.isFinite)) continue
    out.push({ weekStart, shares, trades })
  }
  return out.sort((a, b) => a.weekStart.localeCompare(b.weekStart))
}

async function mapPool(items, concurrency, fn) {
  const ret = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      ret[idx] = await fn(items[idx], idx)
    }
  }))
  return ret
}

const regShoCache = new Map() // date -> text | null

async function fetchRegShoDay(yyyymmdd) {
  if (regShoCache.has(yyyymmdd)) return regShoCache.get(yyyymmdd)
  const url = `https://cdn.finra.org/equity/regsho/daily/CNMSshvol${yyyymmdd}.txt`
  try {
    const r = await fetchText(url, {
      headers: { ...UA, Accept: 'text/plain,*/*', 'Accept-Language': 'en-US,en;q=0.9' },
      redirect: 'follow',
    }, 3_000)
    if (!r.ok || /Temporary Redirect|error\.waf/i.test(r.text)) {
      // fallback API
      const iso = `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`
      const api = await fetchText('https://api.finra.org/data/group/otcMarket/name/regShoDaily', {
        method: 'POST',
        headers: { ...UA, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: 1,
          compareFilters: [
            { fieldName: 'tradeReportDate', compareType: 'EQUAL', fieldValue: iso },
            { fieldName: 'securitiesInformationProcessorSymbolIdentifier', compareType: 'EQUAL', fieldValue: 'AAPL' },
          ],
        }),
      }, 3_000)
      if (!api.ok) { regShoCache.set(yyyymmdd, null); return null }
      // API 单日单票需要按 symbol 再查；这里 CDN 失败时在上层改走 API 批量
      regShoCache.set(yyyymmdd, null)
      return null
    }
    regShoCache.set(yyyymmdd, r.text)
    return r.text
  } catch {
    regShoCache.set(yyyymmdd, null)
    return null
  }
}

async function fetchRegShoViaApi(symbol, datesIso) {
  const out = []
  // 限流：每次 1 日
  for (const iso of datesIso) {
    try {
      const r = await fetchText('https://api.finra.org/data/group/otcMarket/name/regShoDaily', {
        method: 'POST',
        headers: { ...UA, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: 5,
          compareFilters: [
            { fieldName: 'tradeReportDate', compareType: 'EQUAL', fieldValue: iso },
            { fieldName: 'securitiesInformationProcessorSymbolIdentifier', compareType: 'EQUAL', fieldValue: symbol },
          ],
        }),
      }, 3_000)
      if (!r.ok) continue
      const rows = JSON.parse(r.text)
      if (!Array.isArray(rows)) continue
      for (const row of rows) {
        const shortVolume = Number(row.shortParQuantity ?? row.shortVolume)
        const shortExemptVolume = Number(row.shortExemptParQuantity ?? row.shortExemptVolume ?? 0)
        const totalVolume = Number(row.totalParQuantity ?? row.totalVolume)
        const date = row.tradeReportDate || iso
        if ([shortVolume, totalVolume].every(Number.isFinite)) {
          out.push({ date, shortVolume, shortExemptVolume: Number.isFinite(shortExemptVolume) ? shortExemptVolume : 0, totalVolume })
        }
      }
    } catch { /* skip day */ }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

async function fetchAtsWeeks(symbol) {
  const end = new Date()
  const start = new Date(end.getTime() - 26 * 7 * 86_400_000)
  const body = {
    limit: 100,
    compareFilters: [
      { fieldName: 'issueSymbolIdentifier', compareType: 'EQUAL', fieldValue: symbol },
      { fieldName: 'summaryTypeCode', compareType: 'EQUAL', fieldValue: 'ATS_W_SMBL' },
    ],
    dateRangeFilters: [{
      fieldName: 'weekStartDate',
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    }],
  }
  const r = await fetchText('https://api.finra.org/data/group/otcMarket/name/weeklySummary', {
    method: 'POST',
    headers: { ...UA, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, 3_000)
  if (!r.ok) throw new Error(`ATS HTTP ${r.status}`)
  const rows = JSON.parse(r.text)
  return parseFinraAtsRows(Array.isArray(rows) ? rows : [], symbol)
}

// ─── handlers ────────────────────────────────────────────────

async function handleSearch(q) {
  if (typeof q !== 'string' || !q.trim() || q.length > 48) {
    return { status: 400, body: lookupError('bad-request', '搜索词无效'), cache: 0 }
  }
  const local = localSymbolHits(q.trim())
  // 纯数字 / 前缀：优先本地沪深港
  if (/^(\d{1,6}|(sh|sz)\d{0,6}|hk\d{0,5})$/i.test(q.trim()) && local.length) {
    return { status: 200, body: local, cache: 60 }
  }
  if (isYahooRateLimited()) return yahooCooldownResponse()
  const url = `https://query1.finance.yahoo.com/v1/finance/search?${new URLSearchParams({ q: q.trim(), quotesCount: '12', newsCount: '0' })}`
  const r = await fetchJson(url, { headers: YAHOO_UA })
  if (!r.ok || !r.json) return upstreamFail(r)
  const hits = parseYahooSearchQuotes(r.json)
  // 合并本地命中（去重）
  const seen = new Set(hits.map(h => h.symbol))
  for (const h of local) if (!seen.has(h.symbol)) hits.unshift(h)
  return { status: 200, body: hits, cache: 60 }
}

async function handleQuote(symbolRaw) {
  const symbol = normalizeSymbol(symbolRaw)
  if (!symbol) return { status: 400, body: lookupError('bad-request', '代码无效'), cache: 0 }
  const market = marketOf(symbol)
  if (market === 'us') {
    if (isYahooRateLimited()) return yahooCooldownResponse()
    const ysym = yahooSymbolOf(symbol)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ysym)}?${new URLSearchParams({
      range: '1d', interval: '1m', includePrePost: 'true',
    })}`
    const r = await fetchJson(url, { headers: YAHOO_UA })
    if (r.status === 404) return { status: 404, body: lookupError('not-found'), cache: 30 }
    if (!r.ok || !r.json?.chart?.result?.[0]) return upstreamFail(r)
    const { meta, bars } = parseYahooChartBars(r.json, { includeExt: true })
    const quote = quoteFromYahooMeta(symbol, meta, bars)
    if (!Number.isFinite(quote.price)) return { status: 404, body: lookupError('not-found'), cache: 30 }
    return { status: 200, body: quote, cache: 30 }
  }
  const tsym = tencentSymbolOf(symbol)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8_000)
  let text = ''
  try {
    const upstream = await fetch(`https://qt.gtimg.cn/q=${tsym}`, { signal: controller.signal })
    if (!upstream.ok) return { status: 502, body: lookupError('upstream'), cache: 0 }
    text = new TextDecoder('gb18030').decode(await upstream.arrayBuffer())
  } catch {
    return { status: 502, body: lookupError('upstream'), cache: 0 }
  } finally {
    clearTimeout(timer)
  }
  const quote = parseTencentQuote(text, symbol)
  if (!quote) return { status: 404, body: lookupError('not-found'), cache: 30 }
  return { status: 200, body: quote, cache: 15 }
}

async function handleBarsUs(symbol, tf, before) {
  const plan = yahooBarsPlan(tf)
  if (!plan) return { status: 400, body: lookupError('bad-request', '周期无效'), cache: 0 }
  if (isYahooRateLimited()) return yahooCooldownResponse()
  const ysym = yahooSymbolOf(symbol)
  const period2 = Number.isFinite(before) ? before : Math.floor(Date.now() / 1000)
  const period1 = Math.max(0, period2 - plan.pageSpan)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ysym)}?${new URLSearchParams({
    period1: String(period1),
    period2: String(period2),
    interval: plan.interval,
    includePrePost: 'true',
    events: 'split',
  })}`
  const r = await fetchJson(url, { headers: YAHOO_UA })
  if (r.status === 404) return { status: 404, body: lookupError('not-found'), cache: 30 }
  if (!r.ok || !r.json?.chart?.result?.[0]) return upstreamFail(r)
  const minute = ['1m', '5m', '15m', '30m', '1h', '4h'].includes(tf)
  const parsedYahoo = parseYahooChartBars(r.json, { includeExt: minute })
  const meta = parsedYahoo.meta
  let bars = parsedYahoo.bars
  if (tf === '4h') bars = aggregateUs4h(bars)
  // 翻页：只要 before 之前的
  if (Number.isFinite(before)) bars = bars.filter(b => b.t < before)
  // 截到约 PAGE_BARS
  if (bars.length > PAGE_BARS) bars = bars.slice(-PAGE_BARS)
  const oldest = bars[0]?.t
  const firstTrade = Number(meta.firstTradeDate)
  const hasMore = computeHasMore(tf === '4h' ? '1h' : tf, oldest, firstTrade)
  return {
    status: 200,
    body: {
      symbol, tf, bars, hasMore,
      timezone: meta.exchangeTimezoneName || 'America/New_York',
      adjustment: 'split',
      source: 'yahoo',
    },
    cache: 30,
  }
}

async function handleBarsCnHk(symbol, tf, before) {
  const market = marketOf(symbol)
  const tz = market === 'hk' ? 'Asia/Hong_Kong' : 'Asia/Shanghai'
  const tsym = symbol

  if (['1d', '1w', '1mo'].includes(tf)) {
    const period = tf === '1d' ? 'day' : tf === '1w' ? 'week' : 'month'
    const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?${new URLSearchParams({
      param: `${tsym},${period},,,640,qfq`,
    })}`
    const r = await fetchJson(url, { headers: UA })
    if (!r.ok || !r.json) return { status: 502, body: lookupError('upstream'), cache: 0 }
    const node = r.json.data?.[tsym] || {}
    const rows = node[`qfq${period}`] || node[period] || node.qfqday || node.day || []
    let bars = parseTencentDayRows(rows, tz)
    if (Number.isFinite(before)) bars = bars.filter(b => b.t < before)
    if (bars.length > PAGE_BARS) bars = bars.slice(-PAGE_BARS)
    const hasMore = bars.length >= 600 // 腾讯单次上限约 640，满页则可能还有
    return { status: 200, body: { symbol, tf, bars, hasMore: hasMore && bars.length > 0, timezone: tz, adjustment: 'qfq', source: 'tencent' }, cache: 60 }
  }

  // 分钟 / 小时 / 4h
  const want = tf === '4h' ? '1h' : tf
  let bars = []

  if (market === 'cn' && ['1m', '5m', '15m', '30m', '1h'].includes(want)) {
    const mkey = ({ '1m': 'm1', '5m': 'm5', '15m': 'm15', '30m': 'm30', '1h': 'm60' })[want]
    const url = `https://ifzq.gtimg.cn/appstock/app/kline/mkline?param=${tsym},${mkey},,320`
    const r = await fetchJson(url, { headers: UA })
    if (!r.ok || !r.json) return { status: 502, body: lookupError('upstream'), cache: 0 }
    const rows = r.json.data?.[tsym]?.[mkey] || []
    bars = parseTencentMklineRows(rows, tz)
  } else {
    // 港股分钟或兜底：day/query 近几日 1m，再聚合
    const r = await fetchJson(`https://web.ifzq.gtimg.cn/appstock/app/day/query?code=${tsym}`, { headers: UA })
    if (!r.ok || !r.json) return { status: 502, body: lookupError('upstream'), cache: 0 }
    const days = r.json.data?.[tsym]?.data || []
    bars = parseTencentIntradayDays(days, tz)
    const mins = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60 }[want]
    if (mins && mins > 1) bars = aggregateMinutes(bars, mins)
  }

  if (tf === '4h') bars = aggregateCnHk4h(bars, market)
  if (Number.isFinite(before)) bars = bars.filter(b => b.t < before)
  if (bars.length > PAGE_BARS) bars = bars.slice(-PAGE_BARS)
  // 腾讯分钟深度有限
  const hasMore = false
  return { status: 200, body: { symbol, tf, bars, hasMore, timezone: tz, adjustment: 'qfq', source: 'tencent' }, cache: 30 }
}

async function handleBars(symbolRaw, tf, beforeRaw) {
  const symbol = normalizeSymbol(symbolRaw)
  if (!symbol) return { status: 400, body: lookupError('bad-request', '代码无效'), cache: 0 }
  if (!TIMEFRAMES.has(tf)) return { status: 400, body: lookupError('bad-request', '周期无效'), cache: 0 }
  const before = beforeRaw != null && beforeRaw !== '' ? Number(beforeRaw) : undefined
  if (beforeRaw != null && beforeRaw !== '' && !Number.isFinite(before)) {
    return { status: 400, body: lookupError('bad-request', 'before 无效'), cache: 0 }
  }
  return marketOf(symbol) === 'us' ? handleBarsUs(symbol, tf, before) : handleBarsCnHk(symbol, tf, before)
}

async function handleNews(symbolRaw, start, end) {
  const symbol = normalizeSymbol(symbolRaw)
  if (!symbol) return { status: 400, body: lookupError('bad-request', '代码无效'), cache: 0 }
  const market = marketOf(symbol)
  const endMs = end ? Date.parse(end) : Date.now()
  const startMs = start ? Date.parse(start) : endMs - 30 * 86_400_000
  if (![startMs, endMs].every(Number.isFinite) || startMs > endMs) {
    return { status: 400, body: lookupError('bad-request', '时间范围无效'), cache: 0 }
  }
  const startIso = new Date(startMs).toISOString()
  const endIso = new Date(endMs).toISOString()

  if (market === 'us') {
    if (isYahooRateLimited()) return yahooCooldownResponse()
    const url = `https://query1.finance.yahoo.com/v1/finance/search?${new URLSearchParams({
      q: symbol, quotesCount: '0', newsCount: '50',
    })}`
    const r = await fetchJson(url, { headers: YAHOO_UA })
    if (!r.ok || !r.json) return upstreamFail(r)
    const items = []
    for (const n of r.json.news || []) {
      const t = Number(n.providerPublishTime) * 1000
      if (!Number.isFinite(t) || t < startMs || t > endMs) continue
      const title = String(n.title || '')
      const { topic, sentiment } = classifyNews(title, 'en')
      items.push({
        id: String(n.uuid || n.link || `${t}`),
        time: new Date(t).toISOString(),
        title,
        url: String(n.link || ''),
        publisher: String(n.publisher || ''),
        summary: typeof n.summary === 'string' ? n.summary : undefined,
        topic, sentiment, lang: 'en',
      })
    }
    return {
      status: 200,
      body: {
        symbol, items, start: startIso, end: endIso,
        source: 'Yahoo Finance 新闻搜索（最多 50 条，通常覆盖最近几周）',
      },
      // 雅虎偶尔对单个代码返回空列表：空结果只缓存 30 秒，避免把「没取到」缓存成「没有新闻」
      cache: items.length > 0 ? 300 : 30,
    }
  }

  // 沪深港：东方财富搜索
  const code = market === 'hk' ? symbol.slice(2).replace(/^0+/, '') : symbol.slice(2)
  const keyword = market === 'hk' ? code : code
  try {
    const param = JSON.stringify({
      keyword, type: ['cmsArticleWebOld'], client: 'web', clientType: 'web', clientVersion: 'curr',
      param: { cmsArticleWebOld: { searchScope: 'default', sort: 'default', pageIndex: 1, pageSize: 20, preTag: '', postTag: '' } },
    })
    const url = `https://search-api-web.eastmoney.com/search/jsonp?cb=j&param=${encodeURIComponent(param)}`
    const r = await fetchText(url, { headers: UA })
    if (!r.ok) {
      return { status: 200, body: { symbol, items: [], start: startIso, end: endIso, source: '东方财富搜索不可用，已返回空列表' }, cache: 300 }
    }
    const m = r.text.match(/^j\(([\s\S]*)\)$/)
    const json = m ? JSON.parse(m[1]) : null
    const rows = json?.result?.cmsArticleWebOld || []
    const items = []
    for (const row of rows) {
      const t = Date.parse(String(row.date || '').replace(/-/g, '/'))
      if (!Number.isFinite(t) || t < startMs || t > endMs) continue
      const title = String(row.title || '').replace(/<[^>]+>/g, '')
      const { topic, sentiment } = classifyNews(title, 'zh')
      items.push({
        id: String(row.code || row.url || `${t}`),
        time: new Date(t).toISOString(),
        title,
        url: String(row.url || ''),
        publisher: String(row.mediaName || '东方财富'),
        summary: typeof row.content === 'string' ? row.content.replace(/<[^>]+>/g, '').slice(0, 240) : undefined,
        topic, sentiment, lang: 'zh',
      })
    }
    return {
      status: 200,
      body: { symbol, items, start: startIso, end: endIso, source: '东方财富搜索 cmsArticleWebOld' },
      cache: 300,
    }
  } catch {
    return { status: 200, body: { symbol, items: [], start: startIso, end: endIso, source: '东方财富搜索失败，已返回空列表' }, cache: 300 }
  }
}

export function parseAnalystData(symbol, quoteSummaryResult) {
  const r = quoteSummaryResult || {}
  const hist = r.upgradeDowngradeHistory?.history || []
  const actions = []
  for (const h of hist) {
    if (!h) continue
    const epoch = Number(h.epochGradeDate)
    if (!Number.isFinite(epoch)) continue
    const actionRaw = String(h.action || 'other').toLowerCase()
    const action = ['up', 'down', 'main', 'init', 'reit'].includes(actionRaw) ? actionRaw : 'other'
    actions.push({
      date: new Date(epoch * 1000).toISOString().slice(0, 10),
      firm: String(h.firm || ''),
      action,
      fromGrade: h.fromGrade || undefined,
      toGrade: h.toGrade || undefined,
      priorTarget: Number.isFinite(Number(h.priorPriceTarget)) ? Number(h.priorPriceTarget) : undefined,
      target: Number.isFinite(Number(h.currentPriceTarget)) ? Number(h.currentPriceTarget) : undefined,
    })
  }
  const trend = (r.recommendationTrend?.trend || []).map(t => ({
    period: String(t.period),
    strongBuy: Number(t.strongBuy) || 0,
    buy: Number(t.buy) || 0,
    hold: Number(t.hold) || 0,
    sell: Number(t.sell) || 0,
    strongSell: Number(t.strongSell) || 0,
  }))
  const fd = r.financialData || {}
  const raw = (x) => (x && typeof x === 'object' && 'raw' in x ? Number(x.raw) : Number(x))
  const target = {
    mean: raw(fd.targetMeanPrice),
    median: raw(fd.targetMedianPrice),
    high: raw(fd.targetHighPrice),
    low: raw(fd.targetLowPrice),
    count: raw(fd.numberOfAnalystOpinions),
    current: raw(fd.currentPrice),
  }
  for (const k of Object.keys(target)) if (!Number.isFinite(target[k])) delete target[k]
  return {
    symbol,
    actions,
    trend,
    target: Object.keys(target).length ? target : undefined,
    source: 'Yahoo Finance 分析师数据（评级变动、月度评级分布、目标价）',
  }
}

async function handleAnalysts(symbolRaw) {
  const symbol = normalizeSymbol(symbolRaw)
  if (!symbol) return { status: 400, body: lookupError('bad-request', '代码无效'), cache: 0 }
  if (marketOf(symbol) !== 'us') {
    return { status: 404, body: lookupError('unsupported', '沪深港暂不支持分析师评级'), cache: 3600 }
  }
  if (isYahooRateLimited()) return yahooCooldownResponse()
  const ysym = yahooSymbolOf(symbol)
  try {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ysym)}?modules=upgradeDowngradeHistory,recommendationTrend,financialData`
    const r = await yahooFetchJson(url)
    if (!r.ok || !r.json?.quoteSummary?.result?.[0]) return upstreamFail(r)
    const data = parseAnalystData(symbol, r.json.quoteSummary.result[0])
    return { status: 200, body: data, cache: 3600 }
  } catch {
    return { status: 502, body: lookupError('upstream'), cache: 0 }
  }
}

async function handleOffExchange(symbolRaw) {
  const symbol = normalizeSymbol(symbolRaw)
  if (!symbol) return { status: 400, body: lookupError('bad-request', '代码无效'), cache: 0 }
  if (marketOf(symbol) !== 'us') {
    return { status: 404, body: lookupError('unsupported', '沪深港暂不支持场外成交数据'), cache: 3600 }
  }

  // 近 60 个日历日里的交易日（跳过周末）
  const dates = []
  for (let i = 1; i <= 90 && dates.length < 60; i++) {
    const d = new Date(Date.now() - i * 86_400_000)
    const wd = d.getUTCDay()
    if (wd === 0 || wd === 6) continue
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    dates.push({ ymd: `${y}${m}${day}`, iso: `${y}-${m}-${day}` })
  }

  let daily = []
  const noteParts = []
  // CDN：先探 1 日，WAF 则跳过批量；否则并发限流拉近 40 日
  const probe = await fetchRegShoDay(dates[0].ymd)
  if (probe) {
    daily.push(...parseRegShoText(probe, symbol))
    const texts = await mapPool(dates.slice(1, 40), 4, async (d) => ({ d, text: await fetchRegShoDay(d.ymd) }))
    for (const { text } of texts) {
      if (!text) continue
      daily.push(...parseRegShoText(text, symbol))
    }
  } else {
    // API 退路：先探 1 日，失败则不再批量
    const probeApi = await fetchRegShoViaApi(symbol, dates.slice(0, 1).map(d => d.iso))
    if (probeApi.length) {
      daily = probeApi
      const more = await fetchRegShoViaApi(symbol, dates.slice(1, 10).map(d => d.iso))
      daily = [...daily, ...more].sort((a, b) => a.date.localeCompare(b.date))
      noteParts.push('Reg SHO 改走 api.finra.org，仅近 10 个交易日')
    } else {
      noteParts.push('Reg SHO（cdn.finra.org 与 api.finra.org）本环境均不可达（疑似 WAF），每日做空成交为空')
    }
  }

  let ats = []
  try {
    ats = await fetchAtsWeeks(symbol)
  } catch {
    noteParts.push('ATS weeklySummary 不可达')
  }

  const note = [
    'FINRA Reg SHO 每日做空成交量（场外与 TRF 报告，不是全市场持仓）；ATS 为暗池周度成交，公布通常有 2–4 周延迟。',
    ...noteParts,
  ].join(' ')

  if (!daily.length && !ats.length) {
    return { status: 502, body: lookupError('upstream', 'FINRA 数据源暂时不可用'), cache: 0 }
  }

  return {
    status: 200,
    body: {
      symbol,
      daily,
      ats,
      source: 'FINRA Reg SHO daily + OTC Transparency weeklySummary (ATS)',
      note,
    },
    cache: 3600,
  }
}

/** 供 handleMarket 调用 */
export async function handleStockLookup(kind, query) {
  switch (kind) {
    case 'lookup-search': return handleSearch(query.q)
    case 'lookup-quote': return handleQuote(query.symbol)
    case 'lookup-bars': return handleBars(query.symbol, query.tf, query.before)
    case 'lookup-news': return handleNews(query.symbol, query.start, query.end)
    case 'lookup-analysts': return handleAnalysts(query.symbol)
    case 'lookup-offexchange': return handleOffExchange(query.symbol)
    default: return { status: 400, body: lookupError('bad-request', '未知 kind'), cache: 0 }
  }
}

export async function dispatchLookup(req, res) {
  const kind = req.query?.kind
  try {
    const result = await handleStockLookup(kind, req.query || {})
    const status = result.status
    if (status >= 400 && result.body?.reason) {
      return sendJson(res, status || httpStatusFor(result.body.reason), result.body, result.cache || 0)
    }
    return sendJson(res, status, result.body, result.cache)
  } catch {
    return sendJson(res, 502, lookupError('upstream'), 0)
  }
}
