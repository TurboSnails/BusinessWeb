import { afterEach, describe, expect, it, vi } from 'vitest'
import handler from '../../api/china-stock.js'
import { handleMarket } from '../../server/market.mjs'

function response() {
  return {
    statusCode: 200, headers: {} as Record<string, string>, body: undefined as unknown,
    setHeader(name: string, value: string) { this.headers[name.toLowerCase()] = value },
    status(code: number) { this.statusCode = code; return this },
    json(body: unknown) { this.body = body; return this },
    send(body: unknown) { this.body = body; return this },
    end(body?: unknown) { this.body = body; return this },
  }
}
afterEach(() => vi.unstubAllGlobals())
describe('restricted market APIs', () => {
  it('rejects unsupported methods and invalid symbols before fetching', async () => {
    const fetchImpl = vi.fn(); vi.stubGlobal('fetch', fetchImpl)
    for (const query of [{ symbol: 'http://localhost' }, { symbol: ['sh000001'] }, { symbol: 'sh000001&list=sz000001' }]) {
      const res = response(); await handler({ method: 'GET', query }, res)
      expect(res.statusCode).toBe(400)
    }
    const res = response(); await handler({ method: 'POST', query: { symbol: 'sh000001' } }, res)
    expect(res.statusCode).toBe(405)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('decodes Sina GBK bytes into UTF-8 text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([0xbb, 0xa6, 0xc9, 0xee]))))
    const res = response(); await handler({ method: 'GET', query: { symbol: 'sh000001' } }, res)
    expect(res.body).toBe('沪深')
  })
  it('restricts Tencent query inputs and never accepts an arbitrary upstream URL', async () => {
    const fetchImpl = vi.fn(); vi.stubGlobal('fetch', fetchImpl)
    for (const query of [
      { kind: 'unknown' }, { kind: 'quotes', symbols: 'http://localhost' },
      { kind: 'candles', symbol: 'sh510300', begin: '2026-02-30', end: '2026-03-01' },
      { kind: 'candles', symbol: 'sh510300', begin: '2026-03-02', end: '2026-03-01' },
    ]) {
      const res = response(); await handleMarket({ method: 'GET', query }, res)
      expect(res.statusCode).toBe(400)
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('preserves Tencent GBK quote bytes and targets the fixed quote host', async () => {
    const bytes = new Uint8Array([0xbb, 0xa6, 0xc9, 0xee])
    const fetchImpl = vi.fn(async () => new Response(bytes)); vi.stubGlobal('fetch', fetchImpl)
    const res = response(); await handleMarket({ method: 'GET', query: { kind: 'quotes', symbols: 'sh510300,sz159915' } }, res)
    expect(new Uint8Array(res.body as Buffer)).toEqual(bytes)
    expect(fetchImpl.mock.calls[0][0]).toBe('https://qt.gtimg.cn/q=sh510300,sz159915')
    expect(res.headers['cache-control']).toContain('s-maxage=30')
  })
  it('returns candle JSON from the fixed history host', async () => {
    const data = { data: { sh510300: { qfqday: [] } } }
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(data))); vi.stubGlobal('fetch', fetchImpl)
    const res = response(); await handleMarket({ method: 'GET', query: { kind: 'candles', symbol: 'sh510300', begin: '2020-01-01', end: '2026-10-02' } }, res)
    expect(res.body).toEqual(data)
    const url = new URL(fetchImpl.mock.calls[0][0])
    expect(url.hostname).toBe('web.ifzq.gtimg.cn')
    expect(url.searchParams.get('param')).toBe('sh510300,day,2020-01-01,2026-10-02,640,qfq')
  })
  it('reports upstream failures without exposing exception details', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('secret upstream detail') }))
    const res = response(); await handleMarket({ method: 'GET', query: { kind: 'quotes', symbols: 'sh510300' } }, res)
    expect(res.statusCode).toBe(502)
    expect(JSON.stringify(res.body)).not.toContain('secret')
  })
  it('returns 502 for upstream HTTP errors and 504 for a timed-out request', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429 })))
    const res = response(); await handleMarket({ method: 'GET', query: { kind: 'quotes', symbols: 'sh510300' } }, res)
    expect(res.statusCode).toBe(502)
    vi.useFakeTimers()
    try {
      vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))))))
      const timed = response()
      const pending = handleMarket({ method: 'GET', query: { kind: 'quotes', symbols: 'sh510300' } }, timed)
      await vi.advanceTimersByTimeAsync(7_001)
      await pending
      expect(timed.statusCode).toBe(504)
    } finally { vi.useRealTimers() }
  })
})
