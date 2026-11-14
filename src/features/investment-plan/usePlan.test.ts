import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createPlanRepository, type StorageLike } from './repository'
import { createEmptyPlan } from './types'
import { usePlan } from './usePlan'

const NOW = '2026-11-14T12:00:00.000Z'

function memoryStorage(): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = {}
  return {
    data,
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v
    },
    removeItem: k => {
      delete data[k]
    },
  }
}

afterEach(() => cleanup())

describe('usePlan', () => {
  it('订阅 create 后快照更新；不直接碰 storage', async () => {
    const s = memoryStorage()
    const repo = createPlanRepository({ storage: s, clock: () => NOW, idFactory: () => 'p1' })
    const { result } = renderHook(() => usePlan(repo))
    expect(result.current.snapshot.mode).toBe('empty')
    await act(async () => {
      await result.current.create(createEmptyPlan(NOW, 'p1'))
    })
    expect(result.current.snapshot.mode).toBe('ready')
    expect(result.current.snapshot.document?.id).toBe('p1')
  })
})
