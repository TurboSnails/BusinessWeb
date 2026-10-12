// AI 试问：Google / GitHub 登录（Supabase Auth）后，每人每天 DAILY_LIMIT 次。
// 模型 key 只存在服务端环境变量里，浏览器拿不到。
import { createHash } from 'node:crypto'

type Request = { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown }
type Response = {
  setHeader(name: string, value: string): unknown
  status(code: number): Response
  json(body: unknown): unknown
}

const DAILY_LIMIT = 2
// 同一 IP 每天上限（防多账号刷）与全站每天总上限（封顶月成本）；可用环境变量调整。
const IP_LIMIT = Number(process.env.ASK_IP_LIMIT) || 6
const GLOBAL_LIMIT = Number(process.env.ASK_GLOBAL_LIMIT) || 300
const MAX_QUESTION = 500
const MAX_TOKENS = 700
const DEFAULT_MODEL_BASE = 'https://api.minimaxi.com/anthropic'
const DEFAULT_MODEL = 'MiniMax-M2'
const SYSTEM_PROMPT = [
  '你是「AI 实验室」的研究方法助手，只回答与投资研究方法、AI 工具使用、Skill 与提示词设计相关的问题。',
  '与此无关的问题，礼貌说明范围并拒绝。回答用中文，简洁，不超过 400 字。',
  '不给出具体的买入、卖出或仓位建议；涉及股票时只讲分析方法，并在末尾注明「以上仅为研究方法，不构成投资建议」。',
  '不要编造数据或来源；不确定时直接说明。',
].join('\n')

const first = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] : value) ?? ''
const httpsOrigin = (value: string | undefined, suffix?: string): string | null => {
  try {
    const url = new URL(value ?? '')
    if (url.protocol !== 'https:' || url.username || url.password || (suffix && !url.hostname.endsWith(suffix))) return null
    return url.origin + url.pathname.replace(/\/$/, '')
  } catch {
    return null
  }
}

export default async function handler(req: Request, res: Response): Promise<unknown> {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: '只支持 POST 请求' })
  }
  const { SUPABASE_URL, SUPABASE_SECRET_KEY: secret, SUPABASE_ANON_KEY: anon, MINIMAX_API_KEY: modelKey } = process.env
  const supabase = httpsOrigin(SUPABASE_URL, '.supabase.co')
  const modelBase = httpsOrigin(process.env.MINIMAX_BASE_URL || DEFAULT_MODEL_BASE)
  if (!supabase || !secret || !anon || !modelKey || !modelBase) return res.status(503).json({ error: 'AI 试问尚未配置' })

  const auth = first(req.headers.authorization)
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return res.status(401).json({ error: '请先登录' })

  let body = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = null } }
  const question = body && typeof body === 'object' && 'question' in body ? String((body as { question: unknown }).question).trim() : ''
  if (question.length < 2 || question.length > MAX_QUESTION) return res.status(400).json({ error: `问题长度需在 2–${MAX_QUESTION} 字之间` })

  const forwarded = first(req.headers['x-forwarded-for']).split(',')[0].trim() || first(req.headers['x-real-ip']).trim()
  const ip = createHash('sha256').update(`ask:${forwarded || 'unknown'}:${secret}`).digest('hex')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25_000)
  const service = { apikey: secret, 'content-type': 'application/json', ...(secret.startsWith('sb_secret_') ? {} : { authorization: `Bearer ${secret}` }) }
  const rpc = (name: string, args: Record<string, unknown>) =>
    fetch(`${supabase}/rest/v1/rpc/${name}`, { method: 'POST', headers: service, body: JSON.stringify(args), signal: controller.signal, redirect: 'error' })

  try {
    // 用用户自己的 token 向 Supabase 确认身份，不信任前端传来的任何 user id。
    const who = await fetch(`${supabase}/auth/v1/user`, { headers: { apikey: anon, authorization: `Bearer ${token}` }, signal: controller.signal, redirect: 'error' })
    if (!who.ok) return res.status(401).json({ error: '登录已过期，请重新登录' })
    const user = (await who.json()) as { id?: string }
    if (!user.id) return res.status(401).json({ error: '登录已过期，请重新登录' })

    const consumed = await rpc('businessweb_consume_ask', { p_user: user.id, p_ip: ip, p_user_limit: DAILY_LIMIT, p_ip_limit: IP_LIMIT, p_global_limit: GLOBAL_LIMIT })
    if (!consumed.ok) return res.status(502).json({ error: '计次服务暂时不可用' })
    const verdict = await consumed.json()
    if (verdict === 'global') return res.status(429).json({ error: '今天的试问名额已被抢完，明天再来' })
    if (verdict === 'ip') return res.status(429).json({ error: '当前网络今天的试问次数已用完，明天再来' })
    if (verdict === 'user') return res.status(429).json({ error: `今天的 ${DAILY_LIMIT} 次试问已用完，明天再来` })
    if (verdict !== 'ok') return res.status(502).json({ error: '计次服务暂时不可用' })

    const refund = () => rpc('businessweb_refund_ask', { p_user: user.id, p_ip: ip }).catch(() => undefined)
    let reply = ''
    try {
      const model = await fetch(`${modelBase}/v1/messages`, {
        method: 'POST',
        headers: { 'x-api-key': modelKey, authorization: `Bearer ${modelKey}`, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: process.env.MINIMAX_MODEL || DEFAULT_MODEL, max_tokens: MAX_TOKENS, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: question }] }),
        signal: controller.signal,
        redirect: 'error',
      })
      if (!model.ok) throw new Error('model')
      const data = (await model.json()) as { content?: { type: string; text?: string }[] }
      reply = (data.content ?? []).filter(part => part.type === 'text').map(part => part.text ?? '').join('').trim()
      if (!reply) throw new Error('empty')
    } catch {
      await refund()
      return res.status(502).json({ error: 'AI 暂时无法回答，这次不扣次数' })
    }
    return res.status(200).json({ answer: reply, limit: DAILY_LIMIT })
  } catch {
    return res.status(502).json({ error: '服务暂时不可用' })
  } finally {
    clearTimeout(timer)
  }
}
