import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadSyncMeta } from './cloud'
import { createPlanRepository, type StorageLike } from './repository'
import { createEmptyPlan, PLAN_KEYS } from './types'
import { usePlanSync } from './usePlanSync'

const NOW = '2026-11-14T12:00:00.000Z'
const TOKEN = 't'.repeat(32)

function memoryStorage(): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = {}
  return {
    data,
    getItem: k => (k in data ? data[k]! : null),
    setItem: (k, v) => {
      data[k] = v
    },
    removeItem: k => {
      delete data[k]
    },
  }
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => body,
  }
}

describe('usePlanSync P1-5 baseline / clear', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    // downloadJson 点 a
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('conflict → clear 拒绝 → resolve → clear → upload 须先 re-GET', async () => {
    const storage = memoryStorage()
    const repo = createPlanRepository({
      storage,
      clock: () => NOW,
      idFactory: () => 'local-1',
      today: () => '2026-11-14',
    })
    const local = createEmptyPlan(NOW, 'local-1')
    local.funding.emergencyMonths = 3
    await repo.create(local)
    // 旧基线 3；云端已是 5 且内容不同
    storage.setItem(
      PLAN_KEYS.sync,
      JSON.stringify({ schemaVersion: 1, planId: 'local-1', baseRevision: 3, dirty: true }),
    )

    const remote = createEmptyPlan(NOW, 'cloud-1')
    remote.funding.emergencyMonths = 9

    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (!init || init.method === 'GET' || !init.method) {
        return jsonResponse(
          { schemaVersion: 1, document: remote },
          200,
          { 'x-revision': '5' },
        )
      }
      if (init.method === 'PUT') {
        return jsonResponse({ ok: true, revision: 6 })
      }
      return jsonResponse({}, 500)
    })

    const { result } = renderHook(() =>
      usePlanSync({
        repository: repo,
        storage,
        locationOrigin: 'http://localhost:5178',
        viteApiBase: '',
        now: () => NOW,
      }),
    )

    act(() => result.current.setToken(TOKEN))

    await act(async () => {
      await result.current.readAndCompare()
    })
    expect(result.current.phase).toBe('conflict')
    expect(loadSyncMeta(storage)?.baseRevision).toBe(3) // 冲突未推进基线

    // clear 在未解决前被拒
    ;(window.confirm as ReturnType<typeof vi.fn>).mockReturnValueOnce(true)
    act(() => result.current.clearConflict())
    expect(result.current.conflict).not.toBeNull()
    expect(result.current.message).toMatch(/请先完成/)

    // 保留本机 → resolutionDone
    await act(async () => {
      await result.current.keepLocalOverwriteCloud()
    })
    expect(result.current.resolutionDone).toBe(true)
    expect(loadSyncMeta(storage)?.baseRevision).toBe(6)

    // 清除冲突档 → 基线置空
    await act(async () => {
      result.current.clearConflict()
    })
    expect(result.current.conflict).toBeNull()
    expect(loadSyncMeta(storage)?.baseRevision).toBeNull()

    // 上传被拦：须先 re-GET
    await act(async () => {
      await result.current.uploadLocal()
    })
    expect(result.current.message).toMatch(/请先「读取云端并比较」/)
  })
})
