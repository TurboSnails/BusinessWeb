// 五个只读数据接口与 Vercel Cron 派发共用一个函数部署（Hobby 函数数量有限），保留原有公开 URL。
import macro from '../../server/functions/macro.js'
import indexes from '../../server/functions/indexes.js'
import sentiment from '../../server/functions/sentiment.js'
import dailyAnalysis from '../../server/functions/daily-analysis.js'
import aiTokenEconomics from '../../server/functions/ai-token-economics.js'
import cronDispatch from '../../server/functions/cron-dispatch.js'

const handlers = new Map([
  ['macro', macro], ['indexes', indexes],
  ['sentiment', sentiment], ['daily-analysis', dailyAnalysis],
  ['ai-token-economics', aiTokenEconomics],
  // Vercel Cron 专用：/api/market-data/cron-dispatch?workflow=<file>.yml，需 CRON_SECRET
  ['cron-dispatch', cronDispatch],
])

export default function handler(req, res) {
  const route = req.query?.marketRoute
  const selected = typeof route === 'string' ? handlers.get(route) : undefined
  if (!selected) return res.status(404).json({ error: '接口不存在' })
  return selected(req, res)
}
