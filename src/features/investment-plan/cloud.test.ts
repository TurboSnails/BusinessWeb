import { describe, expect, it, vi } from 'vitest'
import {
  cloudGet,
  documentsDiffer,
  loadSyncMeta,
  resolvePlanSyncEndpoint,
  writeConflictRecord,
  writeSyncMeta,
} from './cloud'
import { createEmptyPlan, PLAN_KEYS } from './types'

function memory() {
  const data: Record<string, string> = {}
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v
    },
    removeItem: (k: string) => {
      delete data[k]
    },
  }
}

describe('cloud helpers', () => {
  it('跨域 Pages 禁同步；受信同源可用', () => {
    expect(resolvePlanSyncEndpoint('https://turbosnails.github.io', 'https://business-web-black.vercel.app')).toEqual({
      endpoint: null,
      reason: 'cross-origin-pages',
    })
    expect(resolvePlanSyncEndpoint('https://business-web-black.vercel.app', '')).toEqual({
      endpoint: 'https://business-web-black.vercel.app/api/market-data/plan-sync',
    })
  })

  it('token 路径：401；GET 成功；documentsDiffer', async () => {
    const fetch401 = vi.fn(async () => ({ ok: false, status: 401, headers: new Headers(), json: async () => ({}) }))
    const r1 = await cloudGet('https://example.test/api', 'x'.repeat(32), fetch401 as unknown as typeof fetch)
    expect(r1).toEqual({ ok: false, status: 401, error: '同步 token 无效' })

    const a = createEmptyPlan('2026-11-14T00:00:00.000Z', 'a')
    const b = { ...a, funding: { ...a.funding, emergencyMonths: 8 } }
    expect(documentsDiffer(a, b)).toBe(true)
    expect(documentsDiffer(a, { ...a, localRevision: 9, updatedAt: '2026-11-15T00:00:00.000Z' })).toBe(false)
    expect(documentsDiffer(a, { ...a, id: 'other-id', localRevision: 9 })).toBe(false)
  })

  it('sync meta / conflict 持久化；冲突写失败可检测', () => {
    const s = memory()
    expect(
      writeSyncMeta(s, { schemaVersion: 1, planId: 'p', baseRevision: 3, dirty: true }),
    ).toBe(true)
    expect(loadSyncMeta(s)?.baseRevision).toBe(3)

    const local = createEmptyPlan('2026-11-14T00:00:00.000Z', 'p')
    const remote = { ...local, id: 'cloud' }
    expect(
      writeConflictRecord(s, {
        schemaVersion: 1,
        reason: 'cloud',
        local,
        remote,
        remoteRevision: 4,
        at: '2026-11-14T00:00:00.000Z',
      }),
    ).toBe(true)
    expect(s.data[PLAN_KEYS.conflict]).toBeTruthy()

    const fail = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => undefined,
    }
    expect(
      writeConflictRecord(fail, {
        schemaVersion: 1,
        reason: 'cloud',
        local,
        remote,
        remoteRevision: 4,
        at: '2026-11-14T00:00:00.000Z',
      }),
    ).toBe(false)
  })
})
