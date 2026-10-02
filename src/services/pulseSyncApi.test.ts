import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../../api/pulse-sync'
import { review } from '../features/pulse/fixtures'

const TOKEN = 'a'.repeat(40)
const env = { SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test', PULSE_SYNC_TOKEN: TOKEN }
type Res = { statusCode: number; headers: Record<string, string>; body: unknown; setHeader(n: string, v: string): void; status(c: number): Res; json(b: unknown): void }
const response = (): Res => ({
  statusCode: 200, headers: {}, body: undefined,
  setHeader(n, v) { this.headers[n.toLowerCase()] = v }, status(c) { this.statusCode = c; return this }, json(b) { this.body = b },
})
const auth = { authorization: `Bearer ${TOKEN}` }
const payload = { schemaVersion: 1, reviews: [review('2026-09-30')] }
const call = async (req: Parameters<typeof handler>[0]) => { const res = response(); await handler(req, res); return res }

beforeEach(() => { Object.assign(process.env, env) })
afterEach(() => { vi.unstubAllGlobals(); for (const k of Object.keys(env)) delete process.env[k] })

describe('pulse-sync 接口安全', () => {
  it('只允许 GET/PUT，响应禁止缓存', async () => {
    const res = await call({ method: 'DELETE', headers: auth })
    expect(res.statusCode).toBe(405)
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('未配置、token 过短或 SUPABASE_URL 不是 supabase.co 时返回 503 且不发请求', async () => {
    const fetchImpl = vi.fn(); vi.stubGlobal('fetch', fetchImpl)
    for (const patch of [{ PULSE_SYNC_TOKEN: 'short' }, { SUPABASE_URL: 'https://evil.example.com' }, { SUPABASE_URL: 'http://abc.supabase.co' }, { SUPABASE_URL: 'https://abc.supabase.co/path' }, { SUPABASE_SECRET_KEY: '' }]) {
      Object.assign(process.env, env, patch)
      expect((await call({ method: 'GET', headers: auth })).statusCode).toBe(503)
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('token 缺失或错误返回 401，且不访问数据库', async () => {
    const fetchImpl = vi.fn(); vi.stubGlobal('fetch', fetchImpl)
    for (const headers of [{}, { authorization: 'Bearer wrong' }, { authorization: `Bearer ${'b'.repeat(40)}` }, { authorization: TOKEN }, { authorization: `bearer ${TOKEN}` }]) {
      expect((await call({ method: 'GET', headers })).statusCode).toBe(401)
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('GET 返回快照并带 ETag，上游地址与密钥头固定', async () => {
    const fetchImpl = vi.fn(async (..._args: unknown[]) => new Response(JSON.stringify([{ revision: 7, payload }])))
    vi.stubGlobal('fetch', fetchImpl)
    const res = await call({ method: 'GET', headers: auth })
    expect(res.statusCode).toBe(200)
    expect(res.headers.etag).toBe('"7"')
    expect(res.body).toEqual(payload)
    const [url, init] = fetchImpl.mock.calls[0] as [string, { headers: Record<string, string> }]
    expect(url).toBe('https://abc.supabase.co/rest/v1/businessweb_pulse_snapshot?id=eq.1&select=revision,payload')
    expect(init.headers.apikey).toBe('sb_secret_test')
    expect(init.headers.authorization).toBeUndefined()
  })

  it('legacy service_role JWT 同时带 Authorization 头', async () => {
    process.env.SUPABASE_SECRET_KEY = 'eyJ.legacy.key'
    const fetchImpl = vi.fn(async (..._args: unknown[]) => new Response(JSON.stringify([{ revision: 0, payload: { schemaVersion: 1, reviews: [] } }])))
    vi.stubGlobal('fetch', fetchImpl)
    await call({ method: 'GET', headers: auth })
    const init = fetchImpl.mock.calls[0][1] as { headers: Record<string, string> }
    expect(init.headers.authorization).toBe('Bearer eyJ.legacy.key')
  })

  it('云端数据结构无效时拒绝返回', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([{ revision: 1, payload: { schemaVersion: 1, reviews: [{ date: 'x' }] } }]))))
    expect((await call({ method: 'GET', headers: auth })).statusCode).toBe(502)
  })

  it('PUT 必须带 If-Match 版本号', async () => {
    const fetchImpl = vi.fn(); vi.stubGlobal('fetch', fetchImpl)
    for (const headers of [auth, { ...auth, 'if-match': '7' }, { ...auth, 'if-match': '"-1"' }, { ...auth, 'if-match': '"abc"' }]) {
      expect((await call({ method: 'PUT', headers, body: payload })).statusCode).toBe(428)
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('PUT 拒绝非法或超大数据，且不写库', async () => {
    const fetchImpl = vi.fn(); vi.stubGlobal('fetch', fetchImpl)
    const headers = { ...auth, 'if-match': '"1"' }
    for (const body of [{ schemaVersion: 1, reviews: [review('2026-09-30', { evil: 1 })] }, { schemaVersion: 1, reviews: [review('2026-09-30'), review('2026-09-30')] }, { schemaVersion: 2, reviews: [] }, 'not json{', null]) {
      expect((await call({ method: 'PUT', headers, body })).statusCode).toBe(400)
    }
    const huge = { schemaVersion: 1, reviews: [review('2026-09-30', { inflow: 'x'.repeat(2_000_000) })] }
    expect((await call({ method: 'PUT', headers, body: huge })).statusCode).toBe(413)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('PUT 成功 / 版本冲突 / 骤减拦截 / 显式允许', async () => {
    const answers: string[] = ['ok', 'conflict', 'shrink', 'ok']
    const fetchImpl = vi.fn(async (..._args: unknown[]) => new Response(JSON.stringify(answers.shift())))
    vi.stubGlobal('fetch', fetchImpl)
    const headers = { ...auth, 'if-match': '"3"' }
    expect((await call({ method: 'PUT', headers, body: payload })).statusCode).toBe(200)
    expect((await call({ method: 'PUT', headers, body: payload })).statusCode).toBe(409)
    expect((await call({ method: 'PUT', headers, body: payload })).statusCode).toBe(422)
    expect((await call({ method: 'PUT', headers: { ...headers, 'x-allow-shrink': '1' }, body: payload })).statusCode).toBe(200)
    const bodies = fetchImpl.mock.calls.map(c => JSON.parse((c[1] as { body: string }).body))
    expect(bodies[0]).toMatchObject({ expected_revision: 3, allow_shrink: false })
    expect(bodies[3]).toMatchObject({ expected_revision: 3, allow_shrink: true })
    expect((fetchImpl.mock.calls[0] as [string])[0]).toBe('https://abc.supabase.co/rest/v1/rpc/businessweb_put_pulse_snapshot')
  })

  it('上游异常不泄露细节', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('secret detail', { status: 500 })))
    const res = await call({ method: 'GET', headers: auth })
    expect(res.statusCode).toBe(502)
    expect(JSON.stringify(res.body)).not.toContain('secret')
    expect(JSON.stringify(res.body)).not.toContain('sb_secret')
  })
})
