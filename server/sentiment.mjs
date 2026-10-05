// 情绪工具数据：「2026 投资计划 → 情绪工具」一键并行获取。Vercel 函数与本地开发服务共用。
// 来源：CBOE 日度期权统计（官方 JSON）、SqueezeMetrics DIX.csv（GEX）、雅虎财经（VIX、VIX3M、金银期货）。
// 各源并行请求，单项失败只记提示，不影响其他项。
const TIMEOUT_MS = 10000
const CBOE = date => `https://cdn.cboe.com/data/us/options/market_statistics/daily/${date}_daily_options`
const GEX_CSV = 'https://squeezemetrics.com/monitor/static/DIX.csv'
const YAHOO = symbol => `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`
const HEADERS = { 'User-Agent': 'Mozilla/5.0' }

const round = (x, n = 2) => Math.round(x * 10 ** n) / 10 ** n

/** CBOE 日度统计：个股 P/C 与 SPX（含周期权）P/C */
export function parseCboe(body) {
  const find = name => {
    const v = Number(body?.ratios?.find(r => r.name === name)?.value)
    return Number.isFinite(v) ? v : null
  }
  return { equityPC: find('EQUITY PUT/CALL RATIO'), spxPC: find('SPX + SPXW PUT/CALL RATIO') }
}

/** SqueezeMetrics DIX.csv：最后一行的 GEX（美元），换算为十亿美元 */
export function parseGexCsv(text) {
  const rows = text.trim().split('\n').slice(1).map(l => l.split(',')).filter(r => r.length >= 4 && Number.isFinite(Number(r[3])))
  if (!rows.length) return null
  const [date, , , gex] = rows[rows.length - 1]
  return { date, gexBn: round(Number(gex) / 1e9, 2) }
}

/** 美东时间的最近 n 个自然日（含今天），倒序；CBOE 休市日无文件，用来逐日回退 */
export function recentDates(now = new Date(), n = 6) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
  return Array.from({ length: n }, (_, i) => fmt.format(new Date(now.getTime() - i * 86400000)))
}

const nyDate = seconds => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(seconds * 1000))

export async function buildSentiment(fetchImpl = fetch, now = new Date()) {
  const get = url => fetchImpl(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) })
  const warnings = []

  // CBOE：最近几天同时请求，取最新一个存在的交易日
  const cboe = (async () => {
    const dates = recentDates(now)
    const results = await Promise.allSettled(dates.map(async d => {
      const res = await get(CBOE(d))
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return { date: d, ...parseCboe(await res.json()) }
    }))
    const hit = results.find(r => r.status === 'fulfilled' && r.value.equityPC !== null)
    if (!hit) throw new Error('近几日均无数据')
    return hit.value
  })()
  const gex = (async () => {
    const res = await get(GEX_CSV)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const parsed = parseGexCsv(await res.text())
    if (!parsed) throw new Error('无数据')
    return parsed
  })()
  const quote = async symbol => {
    const res = await get(YAHOO(symbol))
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const meta = (await res.json())?.chart?.result?.[0]?.meta
    if (!Number.isFinite(meta?.regularMarketPrice)) throw new Error('无报价')
    return { price: meta.regularMarketPrice, date: meta.regularMarketTime ? nyDate(meta.regularMarketTime) : null }
  }

  const [pc, gx, vix, vix3m, gold, silver] = await Promise.allSettled([cboe, gex, quote('^VIX'), quote('^VIX3M'), quote('GC=F'), quote('SI=F')])
  const ok = (r, label) => {
    if (r.status === 'fulfilled') return r.value
    warnings.push(`${label}：${r.reason?.message || '获取失败'}`)
    return null
  }
  const p = ok(pc, 'CBOE P/C')
  const g = ok(gx, 'GEX')
  const v = ok(vix, 'VIX')
  const v3 = ok(vix3m, 'VIX3M')
  const au = ok(gold, '黄金期货')
  const ag = ok(silver, '白银期货')

  return {
    equityPC: p?.equityPC ?? null,
    spxPC: p?.spxPC ?? null,
    pcDate: p?.date ?? null,
    vix: v?.price ?? null,
    vix3m: v3?.price ?? null,
    vixDate: v?.date ?? v3?.date ?? null,
    gexBn: g?.gexBn ?? null,
    gexDate: g?.date ?? null,
    goldSilver: au && ag && ag.price > 0 ? round(au.price / ag.price, 2) : null,
    goldSilverDate: au?.date ?? null,
    warnings,
  }
}

export async function sentimentMiddleware(req, res, next) {
  if (!req.url?.startsWith('/api/sentiment')) return next()
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  try {
    res.end(JSON.stringify(await buildSentiment()))
  } catch {
    res.statusCode = 502
    res.end(JSON.stringify({ error: '数据源暂时不可用' }))
  }
}
