// 五个只读数据接口、Vercel Cron 派发与候选池提醒邮件共用一个函数部署（Hobby 函数数量有限），保留原有公开 URL。
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
  // Vercel Cron 专用：候选池每日提醒邮件，需 CRON_SECRET；?dryRun=1 只返回 JSON 不发信；?weekly=1 为每周变化摘要（周一 00:00 UTC）。
  // 按需加载：它引用 src 下的 TypeScript（Vercel 构建时编译），其他路由与本地 node --test 不必加载
  ['candidate-alerts-digest', (req, res) => import('../../server/functions/candidate-alerts-digest.js').then(m => m.default(req, res))],
])

export default function handler(req, res) {
  const route = req.query?.marketRoute
  const selected = typeof route === 'string' ? handlers.get(route) : undefined
  if (!selected) return res.status(404).json({ error: '接口不存在' })
  return selected(req, res)
}
