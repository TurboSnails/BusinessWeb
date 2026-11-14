import { afterEach, describe, expect, it, vi } from 'vitest'
// @ts-ignore 未带类型声明的 JS 函数入口
import handler from '../../api/china-stock.js'
// @ts-ignore 未带类型声明的服务端模块
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
  it('成交额历史只允许沪深综合指数，转发包含实际成交额的腾讯接口', async () => {
    const fetchImpl = vi.fn(async (_url: string) => new Response(JSON.stringify({ data: {} })))
    vi.stubGlobal('fetch', fetchImpl)
    for (const symbol of ['sh000001', 'sz399106']) {
      for (const period of ['day', 'week', 'month']) {
        const res = response()
        await handleMarket({ method: 'GET', query: { kind: 'index-amount-history', symbol, period } }, res)
        expect(res.statusCode).toBe(200)
        const url = new URL(fetchImpl.mock.calls[fetchImpl.mock.calls.length - 1][0])
        expect(url.pathname).toBe('/appstock/app/newfqkline/get')
        expect(url.searchParams.get('param')).toBe(`${symbol},${period},,,${period === 'month' ? 800 : 640},qfq`)
      }
    }
    fetchImpl.mockClear()
    for (const query of [
      { kind: 'index-amount-history', symbol: 'sh000300', period: 'day' },
      { kind: 'index-amount-history', symbol: 'sh000001', period: 'year' },
      { kind: 'index-amount-history', symbol: ['sh000001'], period: 'day' },
    ]) {
      const res = response()
      await handleMarket({ method: 'GET', query }, res)
      expect(res.statusCode).toBe(400)
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('提供白名单指数的日周月历史，拒绝其他证券及任意周期', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string) => new Response(JSON.stringify({ data: {} }))))
    const accepted = response()
    await handleMarket({ method: 'GET', query: { kind: 'index-history', symbol: 'sh000852', period: 'month' } }, accepted)
    expect(accepted.statusCode).toBe(200)
    for (const symbol of ['sz399001', 'sz399006']) {
      const ok = response(); await handleMarket({ method: 'GET', query: { kind: 'index-history', symbol, period: 'day' } }, ok)
      expect(ok.statusCode).toBe(200)
    }
    for (const query of [
      { kind: 'index-history', symbol: 'sh600000', period: 'day' },
      { kind: 'index-history', symbol: 'sh000300', period: 'year' },
      { kind: 'index-history', symbol: 'sh000300', period: ['day'] },
    ]) {
      const rejected = response(); await handleMarket({ method: 'GET', query }, rejected)
      expect(rejected.statusCode).toBe(400)
    }
  })
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
    vi.stubGlobal('fetch', vi.fn(async (_url: string) => new Response(new Uint8Array([0xbb, 0xa6, 0xc9, 0xee]))))
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
    const fetchImpl = vi.fn(async (_url: string) => new Response(bytes)); vi.stubGlobal('fetch', fetchImpl)
    const res = response(); await handleMarket({ method: 'GET', query: { kind: 'quotes', symbols: 'sh510300,sz159915' } }, res)
    expect(new Uint8Array(res.body as Buffer)).toEqual(bytes)
    expect(fetchImpl.mock.calls[0][0]).toBe('https://qt.gtimg.cn/q=sh510300,sz159915')
    expect(res.headers['cache-control']).toContain('s-maxage=30')
  })
  it('returns candle JSON from the fixed history host', async () => {
    const data = { data: { sh510300: { qfqday: [] } } }
    const fetchImpl = vi.fn(async (_url: string) => new Response(JSON.stringify(data))); vi.stubGlobal('fetch', fetchImpl)
    const res = response(); await handleMarket({ method: 'GET', query: { kind: 'candles', symbol: 'sh510300', begin: '2020-01-01', end: '2026-10-02' } }, res)
    expect(res.body).toEqual(data)
    const url = new URL(fetchImpl.mock.calls[0][0])
    expect(url.hostname).toBe('web.ifzq.gtimg.cn')
    expect(url.searchParams.get('param')).toBe('sh510300,day,2020-01-01,2026-10-02,640,qfq')
  })
  it('允许港股即时报价，拒绝注入参数', async () => {
    const f = vi.fn(async (_url: string) => new Response('v_r_hk00700=""')); vi.stubGlobal('fetch', f)
    const res = response()
    await handleMarket({ method: 'GET', query: { kind: 'quotes', symbols: 'r_hk00700,r_hk00005' } }, res)
    expect(res.statusCode).toBe(200)
    expect(f.mock.calls[0][0]).toBe('https://qt.gtimg.cn/q=r_hk00700,r_hk00005')
    const rejected = response(); await handleMarket({ method: 'GET', query: { kind: 'quotes', symbols: 'r_hk00700&x=1' } }, rejected)
    expect(rejected.statusCode).toBe(400)
  })
  it('港股日线：只接受 hk + 五位代码，转发腾讯前复权日线并缓存 5 分钟', async () => {
    const data = { code: 0, data: { hk00700: { day: [['2026-10-02', '422.000', '421.200', '425.000', '419.800', '19108045.000', { cqr: '2026-10-02' }]] } } }
    const f = vi.fn(async (_url: string) => new Response(JSON.stringify(data))); vi.stubGlobal('fetch', f)
    const res = response(); await handleMarket({ method: 'GET', query: { kind: 'candles', symbol: 'hk00700', begin: '2023-11-14', end: '2026-11-14' } }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual(data)
    expect(res.headers['cache-control']).toBe('public, max-age=0, s-maxage=300')
    const url = new URL(f.mock.calls[0][0])
    expect(url.hostname).toBe('web.ifzq.gtimg.cn')
    expect(url.searchParams.get('param')).toBe('hk00700,day,2023-11-14,2026-11-14,640,qfq')
    f.mockClear()
    for (const symbol of ['hk0700', 'hk000700', 'r_hk00700', 'HK00700', 'hk00700,sh600519', 'hk00700&x=1', 'hkABCDE']) {
      const rejected = response(); await handleMarket({ method: 'GET', query: { kind: 'candles', symbol, begin: '2026-01-01', end: '2026-10-02' } }, rejected)
      expect(rejected.statusCode, symbol).toBe(400)
    }
    expect(f).not.toHaveBeenCalled()
  })
  it('美股日线：us + 代码（^[A-Z.-]{1,10}$），请求 Yahoo chart 并整理成腾讯同形结构', async () => {
    const yahoo = { chart: { result: [{
      meta: { currency: 'USD', exchangeTimezoneName: 'America/New_York' },
      // 2026-11-12 / 2026-11-13 美东 09:30 开盘；中间一行缺值应丢弃；最后一行 high 低于 close（浮点误差）应夹紧
      timestamp: [1794493800, 1794500000, 1794580200],
      indicators: { quote: [{ open: [351.35, null, 357.96], close: [354.88, null, 356.27], high: [356.1, null, 356.0], low: [349.33, null, 355.75], volume: [100, null, 200] }] },
    }], error: null } }
    const f = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(yahoo))); vi.stubGlobal('fetch', f)
    const res = response(); await handleMarket({ method: 'GET', query: { kind: 'candles', symbol: 'usBRK.B', begin: '2023-11-14', end: '2026-11-14' } }, res)
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe('public, max-age=0, s-maxage=300')
    const url = new URL(f.mock.calls[0][0])
    expect(url.hostname).toBe('query1.finance.yahoo.com')
    expect(url.pathname).toBe('/v8/finance/chart/BRK-B')
    expect(url.searchParams.get('interval')).toBe('1d')
    expect(url.searchParams.get('period1')).toBe(String(Date.parse('2023-11-14') / 1000))
    expect(url.searchParams.get('period2')).toBe(String(Date.parse('2026-11-14') / 1000 + 86400))
    expect((f.mock.calls[0][1]?.headers as Record<string, string>)['User-Agent']).toBeTruthy()
    expect(res.body).toEqual({ code: 0, source: 'yahoo', adjustment: 'split', currency: 'USD', data: { 'usBRK.B': { day: [
      ['2026-11-12', 351.35, 354.88, 356.1, 349.33, 100],
      ['2026-11-13', 357.96, 356.27, 357.96, 355.75, 200],
    ] } } })
    f.mockClear()
    for (const symbol of ['usaapl', 'us', 'usAAPL1', 'usTOOLONGTICKER', 'us.AAPL', 'usBRK..B', 'usBRK.', 'usAAPL/../x', 'usAAPL?x=1', 'AAPL']) {
      const rejected = response(); await handleMarket({ method: 'GET', query: { kind: 'candles', symbol, begin: '2026-01-01', end: '2026-10-02' } }, rejected)
      expect(rejected.statusCode, symbol).toBe(400)
    }
    expect(f).not.toHaveBeenCalled()
  })
  it('美股日线：Yahoo 404（代码不存在）返回空日线；其它错误 502', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"chart":{"result":null,"error":{"code":"Not Found"}}}', { status: 404 })))
    const res = response(); await handleMarket({ method: 'GET', query: { kind: 'candles', symbol: 'usZZZZ', begin: '2026-01-01', end: '2026-10-02' } }, res)
    expect(res.statusCode).toBe(200)
    expect((res.body as { data: Record<string, { day: unknown[] }> }).data.usZZZZ.day).toEqual([])
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429 })))
    const failed = response(); await handleMarket({ method: 'GET', query: { kind: 'candles', symbol: 'usAAPL', begin: '2026-01-01', end: '2026-10-02' } }, failed)
    expect(failed.statusCode).toBe(502)
  })
  it('reports upstream failures without exposing exception details', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('secret upstream detail') }))
    const res = response(); await handleMarket({ method: 'GET', query: { kind: 'quotes', symbols: 'sh510300' } }, res)
    expect(res.statusCode).toBe(502)
    expect(JSON.stringify(res.body)).not.toContain('secret')
  })
  it('returns 502 for upstream HTTP errors and 504 for a timed-out request', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string) => new Response('', { status: 429 })))
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
