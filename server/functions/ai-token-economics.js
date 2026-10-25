// Vercel 函数：实时抓取 Ramp AI Index 最新一期，供「AI 降价与利润」页手动刷新。
import { fetchRampAiIndex } from '../ramp-ai-index.mjs'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS')
    return res.status(405).json({ error: '只支持 GET 请求' })
  }
  try {
    // 数据按周更新：CDN 缓存 1 小时，避免频繁刷新打到 Ramp
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    return res.status(200).json(await fetchRampAiIndex())
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store')
    return res.status(502).json({ error: '数据源暂时不可用' })
  }
}
