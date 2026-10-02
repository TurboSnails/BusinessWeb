import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mergeReviews, saveSyncConfig, loadSyncConfig, summarize, syncReviews, validConfig } from './cloudSync'
import type { Confirms } from './cloudSync'
import { review } from './fixtures'
import { loadReviews, loadTombstones, saveReviews, saveTombstones } from '../../utils/storage'
import type { DailyReview } from '../../types'

const config = { endpoint: 'https://site.example.com/api/pulse-sync', token: 't'.repeat(40) }
const yes: Confirms = { target: () => true, changes: () => true, shrink: () => true }
const asReview = (r: Record<string, unknown>) => r as unknown as DailyReview
const cloudResponse = (reviews: unknown[], etag = '"5"') => new Response(JSON.stringify({ schemaVersion: 1, reviews }), { headers: { etag } })
function server(reviews: unknown[], putStatus = 200, etag = '"5"') {
  const calls: Array<{ method: string; headers: Record<string, string>; body?: string }> = []
  const impl = vi.fn(async (_url: unknown, init?: RequestInit) => {
    calls.push({ method: String(init?.method), headers: init?.headers as Record<string, string>, body: init?.body as string | undefined })
    return init?.method === 'PUT' ? new Response('{}', { status: putStatus }) : cloudResponse(reviews, etag)
  })
  return { impl: impl as unknown as typeof fetch, calls }
}
beforeEach(() => localStorage.clear())
afterEach(() => localStorage.clear())

describe('复盘云同步：配置', () => {
  it('只接受 HTTPS 地址与至少 32 位 token', async () => {
    expect(validConfig(config)).toBe(true)
    for (const bad of [{ ...config, endpoint: 'http://site.example.com/api' }, { ...config, token: 'short' }, { ...config, endpoint: 'https://u:p@site.example.com/api' }, { ...config, endpoint: 'https://site.example.com/api?x=1' }, { ...config, endpoint: 'not a url' }]) {
      expect(validConfig(bad)).toBe(false)
    }
    const confirm = vi.fn(() => false)
    expect(await saveSyncConfig(config, confirm)).toBe(false)
    expect(confirm).toHaveBeenCalledWith('https://site.example.com', 0)
    expect(loadSyncConfig()).toBeNull()
    expect(await saveSyncConfig(config, () => true)).toBe(true)
    expect(loadSyncConfig()).toEqual(config)
  })
})

describe('复盘合并', () => {
  it('较新的 updatedAt 胜出，墓碑在同时间戳时胜出', () => {
    const old = review('2026-09-30', { updatedAt: '2026-09-30T08:00:00.000Z', ztCount: 1 })
    const fresh = review('2026-09-30', { updatedAt: '2026-09-30T09:00:00.000Z', ztCount: 2 })
    expect(mergeReviews([old as never], [fresh as never])[0]).toMatchObject({ ztCount: 2 })
    expect(mergeReviews([fresh as never], [old as never])[0]).toMatchObject({ ztCount: 2 })
    const tomb = { date: '2026-09-30', deleted: true as const, updatedAt: fresh.updatedAt }
    expect(mergeReviews([tomb], [fresh as never])[0]).toMatchObject({ deleted: true })
  })

  it('同一时间戳内容不同则拒绝合并', () => {
    const a = review('2026-09-30', { ztCount: 1 }); const b = review('2026-09-30', { ztCount: 2 })
    expect(() => mergeReviews([a as never], [b as never])).toThrow(/时间相同但内容不同/)
  })

  it('summarize 区分新增、更新、删除', () => {
    const cloud = [review('2026-09-29'), review('2026-09-28')] as never[]
    const merged = [review('2026-09-29', { ztCount: 99, updatedAt: '2026-10-01T00:00:00.000Z' }), { date: '2026-09-28', deleted: true, updatedAt: '2026-10-01T00:00:00.000Z' }, review('2026-09-30')] as never[]
    expect(summarize(cloud, merged)).toEqual({ added: ['2026-09-30'], updated: ['2026-09-29'], deleted: ['2026-09-28'], pulled: 0 })
  })
})

describe('复盘云同步：流程与安全', () => {
  it('未配置或配置无效时不发请求', async () => {
    const { impl } = server([])
    expect((await syncReviews(null, yes, impl)).status).toBe('not-configured')
    expect((await syncReviews({ ...config, token: 'x' }, yes, impl)).status).toBe('invalid-config')
    expect(impl).not.toHaveBeenCalled()
  })

  it('用户拒绝目标域名时不发请求', async () => {
    const { impl } = server([])
    const result = await syncReviews(config, { ...yes, target: () => false }, impl)
    expect(result.status).toBe('cancelled')
    expect(impl).not.toHaveBeenCalled()
  })

  it('本地新增：先读云端再带 If-Match 写回，并给 legacy 记录补时间戳、备份本地', async () => {
    const legacy = asReview({ ...review('2026-09-30'), updatedAt: undefined })
    saveReviews([legacy])
    const { impl, calls } = server([review('2026-09-29')])
    const result = await syncReviews(config, yes, impl)
    expect(result.status).toBe('synced')
    expect(calls.map(c => c.method)).toEqual(['GET', 'PUT'])
    expect(calls[0].headers.authorization).toBe(`Bearer ${config.token}`)
    expect(calls[1].headers['if-match']).toBe('"5"')
    const sent = JSON.parse(calls[1].body!)
    expect(sent.reviews.map((r: { date: string }) => r.date).sort()).toEqual(['2026-09-29', '2026-09-30'])
    expect(sent.reviews.find((r: { date: string }) => r.date === '2026-09-30').updatedAt).not.toBe('1970-01-01T00:00:00.000Z')
    expect(loadReviews().map(r => r.date)).toEqual(['2026-09-30', '2026-09-29'])
    expect(localStorage.getItem('pulse_reviews_backup')).toContain('2026-09-30')
  })

  it('云端比本地新的记录被拉到本地，本地没有改动时不写云端', async () => {
    saveReviews([asReview(review('2026-09-30', { updatedAt: '2026-09-30T08:00:00.000Z', ztCount: 1 }))])
    const { impl, calls } = server([review('2026-09-30', { updatedAt: '2026-09-30T09:00:00.000Z', ztCount: 2 })])
    const result = await syncReviews(config, yes, impl)
    expect(result.status).toBe('synced')
    expect(calls.map(c => c.method)).toEqual(['GET'])
    expect(loadReviews()[0].ztCount).toBe(2)
  })

  it('删除会通过墓碑传播，且必须经用户确认；拒绝则不写云端、本地不变', async () => {
    saveReviews([])
    saveTombstones([{ date: '2026-09-29', deleted: true, updatedAt: '2026-10-01T00:00:00.000Z' }])
    const declined = server([review('2026-09-29')])
    const changes = vi.fn(() => false)
    const cancelled = await syncReviews(config, { ...yes, changes }, declined.impl)
    expect(cancelled.status).toBe('cancelled')
    expect(changes).toHaveBeenCalledWith(expect.objectContaining({ deleted: ['2026-09-29'] }))
    expect(declined.calls.map(c => c.method)).toEqual(['GET'])
    expect(loadTombstones()).toHaveLength(1)

    const accepted = server([review('2026-09-29')])
    const done = await syncReviews(config, yes, accepted.impl)
    expect(done.status).toBe('synced')
    const sent = JSON.parse(accepted.calls[1].body!)
    expect(sent.reviews).toEqual([{ date: '2026-09-29', deleted: true, updatedAt: '2026-10-01T00:00:00.000Z' }])
  })

  it('已删除的日期不会被云端旧数据“复活”', async () => {
    saveReviews([])
    saveTombstones([{ date: '2026-09-29', deleted: true, updatedAt: '2026-10-01T00:00:00.000Z' }])
    const { impl } = server([review('2026-09-29', { updatedAt: '2026-09-29T10:00:00.000Z' })])
    const result = await syncReviews(config, yes, impl)
    expect(result.reviews).toEqual([])
    expect(loadReviews()).toEqual([])
  })

  it('版本冲突（409）时本地数据保持不变', async () => {
    saveReviews([asReview(review('2026-09-30'))])
    const { impl } = server([], 409)
    const result = await syncReviews(config, yes, impl)
    expect(result.status).toBe('error')
    expect(result.error).toMatch(/其他设备已更新/)
    expect(loadReviews()).toHaveLength(1)
    expect(localStorage.getItem('pulse_reviews_backup')).toBeNull()
  })

  it('服务端因记录骤减返回 422：需二次确认，确认后带 x-allow-shrink 重试', async () => {
    saveReviews([asReview(review('2026-09-30'))])
    let n = 0
    const calls: Array<Record<string, string>> = []
    const impl = vi.fn(async (_u: unknown, init?: RequestInit) => {
      if (init?.method === 'GET') return cloudResponse([review('2026-09-29')])
      calls.push(init?.headers as Record<string, string>)
      return new Response('{}', { status: n++ === 0 ? 422 : 200 })
    }) as unknown as typeof fetch
    const shrink = vi.fn(() => true)
    const result = await syncReviews(config, { ...yes, shrink }, impl)
    expect(result.status).toBe('synced')
    expect(shrink).toHaveBeenCalledOnce()
    expect(calls[0]['x-allow-shrink']).toBeUndefined()
    expect(calls[1]['x-allow-shrink']).toBe('1')
    const refused = await syncReviews(config, { ...yes, shrink: () => false }, vi.fn(async (_u: unknown, init?: RequestInit) => (init?.method === 'GET' ? cloudResponse([]) : new Response('{}', { status: 422 }))) as unknown as typeof fetch)
    expect(refused.status).toBe('cancelled')
    expect(loadReviews()).toHaveLength(2) // 第一次同步后的本地状态，拒绝后保持不变
  })

  it('token 无效、云端结构无效、缺 ETag、本地不合规：不改动本地也不上传', async () => {
    saveReviews([asReview(review('2026-09-30'))])
    const denied = vi.fn(async () => new Response('{}', { status: 401 })) as unknown as typeof fetch
    expect((await syncReviews(config, yes, denied)).error).toMatch(/token 无效/)
    const badShape = vi.fn(async () => cloudResponse([{ date: 'bad' }])) as unknown as typeof fetch
    expect((await syncReviews(config, yes, badShape)).error).toMatch(/结构无效/)
    const noEtag = vi.fn(async () => new Response(JSON.stringify({ schemaVersion: 1, reviews: [] }))) as unknown as typeof fetch
    expect((await syncReviews(config, yes, noEtag)).status).toBe('error')
    saveReviews([asReview({ ...review('2026-09-30'), inflow: 'x'.repeat(501) })])
    const never = vi.fn() as unknown as typeof fetch
    const invalid = await syncReviews(config, yes, never)
    expect(invalid.error).toMatch(/不合规/)
    expect(never).not.toHaveBeenCalled()
    expect(loadReviews()).toHaveLength(1)
  })

  it('同步期间本地被其他页面修改：不覆盖本地', async () => {
    saveReviews([asReview(review('2026-09-30'))])
    const impl = vi.fn(async (_u: unknown, init?: RequestInit) => {
      if (init?.method === 'PUT') return new Response('{}')
      saveReviews([asReview(review('2026-09-30')), asReview(review('2026-09-28'))]) // 模拟另一标签页保存
      return cloudResponse([])
    }) as unknown as typeof fetch
    const result = await syncReviews(config, yes, impl)
    expect(result.status).toBe('error')
    expect(result.error).toMatch(/同步期间本地复盘已被修改/)
    expect(loadReviews()).toHaveLength(2)
  })
})
