import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../../../api/candidates-sync'

const TOKEN = 't'.repeat(32)
const res = () => { const r = { code: 200, body: null as unknown, headers: {} as Record<string, string>, setHeader(k: string, v: string) { r.headers[k] = v }, status(c: number) { r.code = c; return r }, json(b: unknown) { r.body = b; return r } }; return r }
const item = { market: 'us', code: 'AAPL', addedAt: '2026-10-02T00:00:00.000Z' }

const KEYS = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'PULSE_SYNC_TOKEN'] as const
const saved: Record<string, string | undefined> = {}

describe('api/candidates-sync', () => {
  beforeEach(() => { for (const k of KEYS) saved[k] = process.env[k]; process.env.SUPABASE_URL = 'https://abc.supabase.co'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_x'; process.env.PULSE_SYNC_TOKEN = TOKEN })
  afterEach(() => { vi.unstubAllGlobals(); for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] } })

  it('rejects wrong token, bad payload and missing If-Match', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f)
    let r = res(); await handler({ method: 'GET', headers: { authorization: 'Bearer nope' } }, r); expect(r.code).toBe(401)
    r = res(); await handler({ method: 'PUT', headers: { authorization: `Bearer ${TOKEN}` }, body: { schemaVersion: 1, items: [] } }, r); expect(r.code).toBe(428)
    r = res(); await handler({ method: 'PUT', headers: { authorization: `Bearer ${TOKEN}`, 'if-match': '"0"' }, body: { schemaVersion: 1, items: [item, item] } }, r); expect(r.code).toBe(400)
    expect(f).not.toHaveBeenCalled()
  })
  it('reads snapshot with ETag and maps conflict to 409', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([{ revision: 2, payload: { schemaVersion: 1, items: [item] } }]), { status: 200 })))
    let r = res(); await handler({ method: 'GET', headers: { authorization: `Bearer ${TOKEN}` } }, r)
    expect(r.code).toBe(200); expect(r.headers.ETag).toBe('"2"')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('"conflict"', { status: 200 })))
    r = res(); await handler({ method: 'PUT', headers: { authorization: `Bearer ${TOKEN}`, 'if-match': '"1"' }, body: { schemaVersion: 1, items: [item] } }, r)
    expect(r.code).toBe(409)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('"ok"', { status: 200 })))
    r = res(); await handler({ method: 'PUT', headers: { authorization: `Bearer ${TOKEN}`, 'if-match': '"2"' }, body: { schemaVersion: 1, items: [item] } }, r)
    expect(r.code).toBe(200)
  })
})
