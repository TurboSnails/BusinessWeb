import { afterEach, describe, expect, it, vi } from 'vitest'
import handler from '../../api/cls-plate.js'
import { clsProxy } from './clsProxy'

function response() {
  return {
    statusCode: 200, headers: {} as Record<string, string>, body: undefined as unknown,
    setHeader(name: string, value: string) { this.headers[name.toLowerCase()] = value },
    status(code: number) { this.statusCode = code; return this },
    json(body: unknown) { this.body = body; return this },
    end(body?: unknown) { this.body = body; return this },
  }
}
afterEach(() => vi.unstubAllGlobals())

describe('cls-plate 代理', () => {
  it('拒绝非法参数与非 GET，且不发起外部请求', async () => {
    const fetchImpl = vi.fn(); vi.stubGlobal('fetch', fetchImpl)
    for (const query of [{}, { date: '2026-09-30' }, { date: '20260930', up_limit: '2' }, { date: ['20260930'] }, { date: '20260930&x=1' }]) {
      const res = response(); await handler({ method: 'GET', query }, res)
      expect(res.statusCode).toBe(400)
    }
    const res = response(); await handler({ method: 'POST', query: { date: '20260930' } }, res)
    expect(res.statusCode).toBe(405)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('只请求财联社固定地址并回传 JSON', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ code: 200, data: { plate_stock: [] } })))
    vi.stubGlobal('fetch', fetchImpl)
    const res = response(); await handler({ method: 'GET', query: { date: '20260930', up_limit: '1' } }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ code: 200, data: { plate_stock: [] } })
    expect(fetchImpl.mock.calls[0][0]).toBe('https://x-quote.cls.cn/v2/quote/a/plate/up_down_analysis?up_limit=1&date=20260930')
  })

  it('上游失败返回 502', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 500 })))
    const res = response(); await handler({ method: 'GET', query: { date: '20260930' } }, res)
    expect(res.statusCode).toBe(502)
  })

  it('前端把财联社 URL 转成同源代理地址', () => {
    expect(clsProxy('https://x-quote.cls.cn/v2/quote/a/plate/up_down_analysis?up_limit=0&date=20260930')).toBe('/api/cls-plate?date=20260930&up_limit=0')
  })
})
