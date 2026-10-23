import type { LifeMessage } from './model'

export class LifeReplyError extends Error {
  constructor(message: string, public status: number, public remaining: number | null = null) { super(message) }
}

export async function lifeReply(
  token: string,
  messages: LifeMessage[],
  action: 'interview' | 'report',
  signal: AbortSignal,
  onText: (text: string) => void,
): Promise<number | null> {
  const base = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')
  const response = await fetch(`${base}/api/ask`, {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ mode: 'human3', action, messages }),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { error?: string; remaining?: number }
    throw new LifeReplyError(data.error || '服务暂时不可用，请稍后再试', response.status, typeof data.remaining === 'number' ? data.remaining : null)
  }
  if (!response.body || !(response.headers.get('content-type') || '').includes('ndjson')) throw new Error('服务响应格式不正确')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = '', text = '', finished = false
  let remaining: number | null = null
  const handle = (line: string) => {
    if (!line.trim()) return
    const event = JSON.parse(line) as { type: string; text?: unknown; error?: unknown; remaining?: unknown }
    if (event.type === 'error') throw new Error(typeof event.error === 'string' ? event.error : '回答中断，请重试')
    if (event.type === 'delta' && typeof event.text === 'string') {
      text += event.text
      onText(text)
    }
    if (event.type === 'done') {
      finished = true
      if (typeof event.remaining === 'number') remaining = event.remaining
    }
  }
  try {
    for (;;) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      lines.forEach(handle)
      if (done) { handle(buffer); break }
    }
    if (!finished || !text.trim()) throw new Error('连接中断，未保存半截回答；你的草稿仍保留，请稍后重试')
    return remaining
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
