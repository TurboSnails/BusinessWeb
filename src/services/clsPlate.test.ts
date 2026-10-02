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
    const fetchImpl = vi.fn(async (_url: string) => new Response(JSON.stringify({ code: 200, data: { plate_stock: [] } })))
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

describe('板块数据库缓存', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })
  const payload = { code: 200, data: { plate_stock: [{ secu_name: '机器人', stock_list: [{ time: '2026-09-30 10:00:00' }] }] } }
  function configure() {
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_test')
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-02T04:00:00Z'))
  }
  it('已收盘历史数据直接读数据库，不请求上游', async () => {
    configure()
    const fetchImpl = vi.fn(async (_url: string) => Response.json([{ payload, fetched_at: '2026-09-30T08:00:00Z' }]))
    vi.stubGlobal('fetch', fetchImpl)
    const res = response(); await handler({ method: 'GET', query: { date: '20260930' } }, res)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0][0]).toContain('/rest/v1/businessweb_sector_history?')
    expect(res.body).toEqual(payload)
    expect(res.headers['x-sector-cache']).toBe('database')
  })
  it('缺失历史先获取上游，再按日期和模式写库', async () => {
    configure()
    const fetchImpl = vi.fn(async (url: string, options?: RequestInit) => url.includes('supabase.co')
      ? options?.method === 'POST' ? new Response(null, { status: 201 }) : Response.json([])
      : Response.json(payload))
    vi.stubGlobal('fetch', fetchImpl)
    const res = response(); await handler({ method: 'GET', query: { date: '20260930', up_limit: '1' } }, res)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(JSON.parse(String(fetchImpl.mock.calls[2][1]?.body))).toMatchObject({ trade_date: '2026-09-30', up_limit: 1, payload })
    expect(res.headers['x-sector-cache']).toBe('stored')
  })
  it('上游忽略日期时不写入错误历史', async () => {
    configure()
    const fetchImpl = vi.fn(async (url: string) => url.includes('supabase.co') ? Response.json([]) : Response.json(payload))
    vi.stubGlobal('fetch', fetchImpl)
    const res = response(); await handler({ method: 'GET', query: { date: '20260929' } }, res)
    expect(res.statusCode).toBe(502)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
  it('当日缓存超过30秒才刷新，盘中历史快照不能永久冻结', async () => {
    configure()
    const fetchImpl = vi.fn(async (url: string, options?: RequestInit) => url.includes('supabase.co')
      ? options?.method === 'POST' ? new Response(null, { status: 201 }) : Response.json([{ payload, fetched_at: '2026-09-30T04:00:00Z' }])
      : Response.json(payload))
    vi.stubGlobal('fetch', fetchImpl)
    await handler({ method: 'GET', query: { date: '20260930' } }, response())
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })
  it('数据库故障仍返回上游，明确标记未持久化', async () => {
    configure()
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('supabase.co') ? new Response(null, { status: 503 }) : Response.json(payload)))
    const res = response(); await handler({ method: 'GET', query: { date: '20260930' } }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual(payload)
    expect(res.headers['x-sector-cache']).toBe('unavailable')
  })
})
