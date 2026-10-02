import { databaseConfig, isFresh, readHistory, validPayload, writeHistory } from '../server/sectorHistory.js'
// Vercel Serverless Function - 代理财联社板块涨跌分析（供「板块轮动」「每日板块涨停」使用，替代已失效的公共 CORS 代理）
// 访问：/api/cls-plate?date=20260930&up_limit=0

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Expose-Headers', 'X-Sector-Cache, X-Sector-Fetched-At')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS')
    return res.status(405).json({ error: '只支持 GET 请求' })
  }

  const { date, up_limit: upLimit = '0' } = req.query
  if (typeof date !== 'string' || !/^\d{8}$/.test(date) || (upLimit !== '0' && upLimit !== '1')) {
    return res.status(400).json({ error: 'date 须为 YYYYMMDD，up_limit 须为 0 或 1' })
  }

  const tradeDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`
  if (!Number.isFinite(Date.parse(`${tradeDate}T00:00:00Z`)) || new Date(`${tradeDate}T00:00:00Z`).toISOString().slice(0, 10) !== tradeDate) {
    return res.status(400).json({ error: '日期无效' })
  }
  const config = databaseConfig()
  let cacheStatus = config ? 'stored' : 'unconfigured'
  let previous = null
  if (config) {
    try {
      previous = await readHistory(config, tradeDate, upLimit)
      if (isFresh(previous, tradeDate)) {
        res.setHeader('X-Sector-Cache', 'database')
        res.setHeader('X-Sector-Fetched-At', previous.fetched_at)
        return res.status(200).json(previous.payload)
      }
    } catch { cacheStatus = 'unavailable' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8_000)
  try {
    const response = await fetch(`https://x-quote.cls.cn/v2/quote/a/plate/up_down_analysis?up_limit=${upLimit}&date=${date}`, {
      signal: controller.signal,
      redirect: 'error',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', Referer: 'https://www.cls.cn/' },
    })
    if (!response.ok) return res.status(502).json({ error: '数据源暂时不可用' })
    const body = await response.json()
    if (!validPayload(body, tradeDate)) return res.status(502).json({ error: '数据源返回无效数据或日期不匹配' })
    const fetchedAt = new Date().toISOString()
    if (config) {
      try { await writeHistory(config, tradeDate, upLimit, body); cacheStatus = 'stored' }
      catch { cacheStatus = 'unavailable' }
    }
    res.setHeader('X-Sector-Cache', cacheStatus)
    res.setHeader('X-Sector-Fetched-At', fetchedAt)
    return res.status(200).json(body)
  } catch {
    return res.status(controller.signal.aborted ? 504 : 502).json({ error: '代理请求失败' })
  } finally {
    clearTimeout(timer)
  }
}
