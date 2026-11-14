import { describe, expect, it, vi } from 'vitest'
import { createPlanSyncHandler } from './plan-sync'
import { createEmptyPlan } from '../src/features/investment-plan/types'

const TOKEN = 'a'.repeat(32)
const ENV = {
  SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_test_key',
  PLAN_SYNC_TOKEN: TOKEN,
  PLAN_SYNC_ORIGIN: 'https://business-web-black.vercel.app',
}

const doc = createEmptyPlan('2026-11-14T00:00:00.000Z', 'plan-test-1')

function res() {
  return {
    code: 0,
    body: null as unknown,
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) {
      this.headers[k.toLowerCase()] = v
      return this
    },
    status(n: number) {
      this.code = n
      return this
    },
    json(b: unknown) {
      this.body = b
      return this
    },
  }
}

function req(over: {
  method?: string
  headers?: Record<string, string>
  body?: unknown
} = {}) {
  return {
    method: over.method ?? 'GET',
    headers: {
      authorization: `Bearer ${TOKEN}`,
      ...(over.headers ?? {}),
    },
    body: over.body,
  }
}

describe('plan-sync', () => {
  it('405 / 503 / 未鉴权零 DB / no-store', async () => {
    const fetchImpl = vi.fn()
    const h = createPlanSyncHandler({ env: ENV, fetch: fetchImpl as unknown as typeof fetch })
    const r1 = res()
    await h(req({ method: 'POST' }), r1)
    expect(r1.code).toBe(405)
    expect(r1.headers['cache-control']).toBe('no-store')
    expect(r1.headers['access-control-allow-origin']).toBeUndefined()
    expect(fetchImpl).not.toHaveBeenCalled()

    const h2 = createPlanSyncHandler({
      env: { ...ENV, PLAN_SYNC_TOKEN: '' },
      fetch: fetchImpl as unknown as typeof fetch,
    })
    const r2 = res()
    await h2(req(), r2)
    expect(r2.code).toBe(503)
    expect(fetchImpl).not.toHaveBeenCalled()

    const r3 = res()
    await h(req({ headers: { authorization: 'Bearer wrong' } }), r3)
    expect(r3.code).toBe(401)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('403 非受信 Origin；无 Origin 的 CLI 允许', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => [{ revision: 0, payload: null }],
    }))
    const h = createPlanSyncHandler({ env: ENV, fetch: fetchImpl as unknown as typeof fetch })
    const bad = res()
    await h(req({ headers: { origin: 'https://evil.example.com' } }), bad)
    expect(bad.code).toBe(403)
    expect(fetchImpl).not.toHaveBeenCalled()

    const ok = res()
    await h(req(), ok)
    expect(ok.code).toBe(200)
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('GET 空云 revision0；成功带 ETag', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => [{ revision: 0, payload: null }],
    }))
    const h = createPlanSyncHandler({ env: ENV, fetch: fetchImpl as unknown as typeof fetch })
    const r = res()
    await h(req({ headers: { origin: ENV.PLAN_SYNC_ORIGIN } }), r)
    expect(r.code).toBe(200)
    expect(r.body).toEqual({ schemaVersion: 1, document: null })
    expect(r.headers.etag).toBe('"0"')
    expect(r.headers['x-revision']).toBe('0')
  })

  it('PUT 428/415/400/413；成功新 ETag；409 仅 latestRevision', async () => {
    const fetchImpl = vi.fn()
    const h = createPlanSyncHandler({ env: ENV, fetch: fetchImpl as unknown as typeof fetch })

    const noMatch = res()
    await h(
      req({
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: { schemaVersion: 1, document: doc },
      }),
      noMatch,
    )
    expect(noMatch.code).toBe(428)
    expect(fetchImpl).not.toHaveBeenCalled()

    const badCt = res()
    await h(
      req({
        method: 'PUT',
        headers: { 'content-type': 'text/plain', 'if-match': '"0"' },
        body: { schemaVersion: 1, document: doc },
      }),
      badCt,
    )
    expect(badCt.code).toBe(415)

    const badDoc = res()
    await h(
      req({
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'if-match': '"0"' },
        body: { schemaVersion: 1, document: { schemaVersion: 1 } },
      }),
      badDoc,
    )
    expect(badDoc.code).toBe(400)

    fetchImpl.mockImplementationOnce(async () => ({ ok: true, json: async () => 1 }))
    const ok = res()
    await h(
      req({
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'if-match': '"0"' },
        body: { schemaVersion: 1, document: doc },
      }),
      ok,
    )
    expect(ok.code).toBe(200)
    expect(ok.body).toEqual({ ok: true, revision: 1 })
    expect(ok.headers.etag).toBe('"1"')

    fetchImpl
      .mockImplementationOnce(async () => ({ ok: true, json: async () => null }))
      .mockImplementationOnce(async () => ({ ok: true, json: async () => [{ revision: 7 }] }))
    const conflict = res()
    await h(
      req({
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'if-match': '"0"' },
        body: { schemaVersion: 1, document: doc },
      }),
      conflict,
    )
    expect(conflict.code).toBe(409)
    expect(conflict.body).toEqual({ error: '云端版本已变化，请重新读取后比较', latestRevision: 7 })
    expect(JSON.stringify(conflict.body)).not.toMatch(/amount|fen|token|Bearer/i)
  })

  it('DB 坏 schema → 502；超时 → 504', async () => {
    const bad = vi.fn(async () => ({
      ok: true,
      json: async () => [{ revision: 1, payload: { nope: true } }],
    }))
    const h = createPlanSyncHandler({ env: ENV, fetch: bad as unknown as typeof fetch })
    const r = res()
    await h(req(), r)
    expect(r.code).toBe(502)

    vi.useFakeTimers()
    const slow = vi.fn((_u: string, init?: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      }),
    )
    const h3 = createPlanSyncHandler({ env: ENV, fetch: slow as unknown as typeof fetch })
    const out = res()
    const p2 = h3(req(), out)
    await vi.advanceTimersByTimeAsync(6001)
    await p2
    expect(out.code).toBe(504)
    vi.useRealTimers()
  })

  it('错误响应不含 payload / token', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ secret: TOKEN }) }))
    const h = createPlanSyncHandler({ env: ENV, fetch: fetchImpl as unknown as typeof fetch })
    const r = res()
    await h(req(), r)
    expect(r.code).toBe(502)
    expect(JSON.stringify(r.body)).not.toContain(TOKEN)
    expect(JSON.stringify(r.body)).not.toContain('secret')
  })
})
