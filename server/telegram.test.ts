import { describe, expect, it, vi } from 'vitest'
import { sendTelegram, telegramConfigured } from './telegram'

const ENV = { TELEGRAM_BOT_TOKEN: 'T0KEN', TELEGRAM_CHAT_ID: '42' }

describe('telegram', () => {
  it('缺任一变量不发也不请求', async () => {
    const f = vi.fn()
    expect(telegramConfigured({ TELEGRAM_BOT_TOKEN: 'x' })).toBe(false)
    expect(await sendTelegram({ TELEGRAM_CHAT_ID: '42' }, 'hi', f as never)).toBe(false)
    expect(f).not.toHaveBeenCalled()
  })
  it('按 sendMessage 接口发送纯文本，超长截断到 4096', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200 }))
    expect(await sendTelegram(ENV, 'a'.repeat(5000), f as never)).toBe(true)
    const [url, init] = f.mock.calls[0] as unknown as [string, { body: string }]
    expect(url).toBe('https://api.telegram.org/botT0KEN/sendMessage')
    const sent = JSON.parse(init.body) as { chat_id: string; text: string }
    expect(sent.chat_id).toBe('42')
    expect(sent.text.length).toBe(4096)
  })
  it('HTTP 失败抛错且错误里不含 token', async () => {
    const f = vi.fn(async () => ({ ok: false, status: 401 }))
    await expect(sendTelegram(ENV, 'hi', f as never)).rejects.toThrow('Telegram HTTP 401')
    await expect(sendTelegram(ENV, 'hi', f as never)).rejects.not.toThrow(/T0KEN/)
  })
})
