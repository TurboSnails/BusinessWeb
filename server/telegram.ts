// Telegram 通知（可选通道）：配置了 TELEGRAM_BOT_TOKEN 与 TELEGRAM_CHAT_ID 才发，缺任一变量就跳过。
// 只做「附加」：调用方在邮件发送成功后调用，失败只记 warn，不影响邮件与去重。token 不写进日志与错误。
type Env = Record<string, string | undefined>
type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number }>

const LIMIT = 4096 // Telegram 单条消息上限

export const telegramConfigured = (env: Env): boolean => !!env.TELEGRAM_BOT_TOKEN && !!env.TELEGRAM_CHAT_ID

/** 发一条纯文本消息；返回是否已发送。未配置返回 false；HTTP 失败抛出只含状态码的错误。 */
export async function sendTelegram(env: Env, text: string, fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike): Promise<boolean> {
  if (!telegramConfigured(env)) return false
  const body = text.length > LIMIT ? `${text.slice(0, LIMIT - 1)}…` : text
  const res = await fetchImpl(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: body, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Telegram HTTP ${res.status}`)
  return true
}
