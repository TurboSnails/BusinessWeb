import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../../api/grid-sync'

function response() {
  return {
    statusCode: 200, headers: {} as Record<string, string>, body: undefined as unknown,
    setHeader(name: string, value: string) { this.headers[name.toLowerCase()] = value },
    status(code: number) { this.statusCode = code; return this },
    json(body: unknown) { this.body = body; return this },
    end() { return this },
  }
}
const token = 'businessweb-test-token-at-least-32-characters'
const request = (method = 'GET', extra = {}) => ({ method, headers: { authorization: `Bearer ${token}` }, ...extra })
beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://businessweb-test.supabase.co')
  vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_test-only')
  vi.stubEnv('GRID_SYNC_TOKEN', token)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('private Supabase grid sync API', () => {
  it('fails closed without configuration and does not contact the database', async () => {
    vi.stubEnv('SUPABASE_SECRET_KEY', '')
    const fetchImpl = vi.fn(); vi.stubGlobal('fetch', fetchImpl)
    const res = response(); await handler(request(), res)
    expect(res.statusCode).toBe(503); expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('rejects invalid tokens and methods before database access', async () => {
    const fetchImpl = vi.fn(); vi.stubGlobal('fetch', fetchImpl)
    const res = response(); await handler(request('GET', { headers: { authorization: 'Bearer wrong' } }), res)
    expect(res.statusCode).toBe(401)
    const post = response(); await handler(request('POST'), post)
    expect(post.statusCode).toBe(405); expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('returns the snapshot revision without exposing service credentials', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([{ revision: 7, payload: { schemaVersion: 1, records: [] } }])))
    vi.stubGlobal('fetch', fetchImpl)
    const res = response(); await handler(request(), res)
    expect(res.body).toEqual({ schemaVersion: 1, records: [] })
    expect(res.headers.etag).toBe('"7"'); expect(res.headers['cache-control']).toBe('no-store')
    expect(new Headers(fetchImpl.mock.calls[0][1].headers).get('apikey')).toBe('sb_secret_test-only')
    expect(new URL(fetchImpl.mock.calls[0][0]).pathname).toBe('/rest/v1/businessweb_grid_snapshot')
  })
  it('requires a revision and rejects malformed records without writing', async () => {
    const fetchImpl = vi.fn(); vi.stubGlobal('fetch', fetchImpl)
    const noRevision = response(); await handler(request('PUT', { body: { schemaVersion: 1, records: [] } }), noRevision)
    expect(noRevision.statusCode).toBe(428)
    const invalid = response(); await handler(request('PUT', { headers: { authorization: `Bearer ${token}`, 'if-match': '"7"' }, body: { schemaVersion: 1, records: [null] } }), invalid)
    expect(invalid.statusCode).toBe(400); expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('writes a valid snapshot through the atomic compare-and-set RPC', async () => {
    const fetchImpl = vi.fn(async () => new Response('true')); vi.stubGlobal('fetch', fetchImpl)
    const payload = { schemaVersion: 1, records: [{ id: 'deleted-record', deleted: true, updatedAt: '2026-10-02T00:00:00Z' }] }
    const res = response(); await handler(request('PUT', { headers: { authorization: `Bearer ${token}`, 'if-match': '"7"' }, body: payload }), res)
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ expected_revision: 7, next_payload: payload })
    expect(new URL(fetchImpl.mock.calls[0][0]).pathname).toBe('/rest/v1/rpc/businessweb_put_grid_snapshot')
  })
  it('reports a concurrent write as 409 rather than success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('false')))
    const res = response(); await handler(request('PUT', { headers: { authorization: `Bearer ${token}`, 'if-match': '"7"' }, body: { schemaVersion: 1, records: [] } }), res)
    expect(res.statusCode).toBe(409)
  })
  it('does not expose database errors or secrets', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('sb_secret_test-only', { status: 500 })))
    const res = response(); await handler(request(), res)
    expect(res.statusCode).toBe(502); expect(JSON.stringify(res.body)).not.toContain('sb_secret')
  })
  it('rejects oversized payloads and duplicate record IDs', async () => {
    const fetchImpl = vi.fn(); vi.stubGlobal('fetch', fetchImpl)
    const headers = { authorization: `Bearer ${token}`, 'if-match': '"7"' }
    const oversized = response(); await handler(request('PUT', { headers, body: ' '.repeat(3_000_001) }), oversized)
    expect(oversized.statusCode).toBe(413)
    const tombstone = { id: 'duplicate', deleted: true, updatedAt: '2026-10-02T00:00:00Z' }
    const duplicates = response(); await handler(request('PUT', { headers, body: { schemaVersion: 1, records: [tombstone, tombstone] } }), duplicates)
    expect(duplicates.statusCode).toBe(400); expect(fetchImpl).not.toHaveBeenCalled()
  })
})
