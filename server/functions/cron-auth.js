// Vercel Cron 路由共用的鉴权：Vercel 调用 cron 时自动带 `Authorization: Bearer <CRON_SECRET>`。
// 只接受 GET；CRON_SECRET 未配置时 503（并在日志里说明），不一致时 401。常量时间比较，响应一律不缓存。
import { timingSafeEqual } from 'node:crypto'

export function safeEqual(a, b) {
  const x = Buffer.from(String(a))
  const y = Buffer.from(String(b))
  return x.length === y.length && timingSafeEqual(x, y)
}

/**
 * 通过返回 true；否则已写好响应（405 / 503 / 401）并返回 false。
 * @param {string} tag 日志前缀，如 'cron-dispatch'
 */
export function requireCron(req, res, { env = process.env, log = console, tag = 'cron' } = {}) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.status(405).json({ ok: false, error: '只支持 GET（Vercel Cron 以 GET 调用）' })
    return false
  }
  const secret = env.CRON_SECRET
  if (!secret) {
    log.error(`[${tag}] CRON_SECRET 未配置：在 Vercel 项目 Production 环境变量中设置后重新部署`)
    res.status(503).json({ ok: false, error: 'CRON_SECRET 未配置' })
    return false
  }
  const auth = req.headers?.authorization ?? req.headers?.Authorization ?? ''
  if (!safeEqual(auth, `Bearer ${secret}`)) {
    res.status(401).json({ ok: false, error: '未授权' })
    return false
  }
  return true
}
