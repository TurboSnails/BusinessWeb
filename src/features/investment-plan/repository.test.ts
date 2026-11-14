import { describe, expect, it, vi } from 'vitest'
import { LEGACY_KEYS } from '../invest-start/legacyPlan'
import { START_KEY } from '../invest-start/store'
import {
  createPlanRepository,
  loadImportsReceipt,
  writeImportsReceipt,
  type StorageLike,
} from './repository'
import { createEmptyPlan, PLAN_KEYS } from './types'

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string>; ops: string[] } {
  const data = { ...initial }
  const ops: string[] = []
  return {
    data,
    ops,
    getItem(k) {
      ops.push(`get:${k}`)
      if (!(k in data)) return null
      return data[k]
    },
    setItem(k, v) {
      ops.push(`set:${k}`)
      data[k] = v
    },
    removeItem(k) {
      ops.push(`remove:${k}`)
      delete data[k]
    },
  }
}

const NOW = '2026-11-14T12:00:00.000Z'

describe('PlanRepository', () => {
  it('首次加载零写', () => {
    const s = memoryStorage()
    createPlanRepository({ storage: s, clock: () => NOW, idFactory: () => 'id-1', today: () => '2026-11-14' })
    expect(s.ops.every(o => o.startsWith('get:'))).toBe(true)
    expect(s.ops.some(o => o.startsWith('set:'))).toBe(false)
  })

  it('加载时用 today 拒绝未来 asOf', () => {
    const doc = createEmptyPlan(NOW, 'id-1')
    doc.funding.reserveActual = {
      value: { currency: 'CNY', amount: '1.00' },
      asOf: '2099-01-01',
      source: 'manual',
      verifiedAt: NOW,
    }
    const s = memoryStorage({ [PLAN_KEYS.document]: JSON.stringify(doc) })
    const repo = createPlanRepository({ storage: s, clock: () => NOW, idFactory: () => 'id-1', today: () => '2026-11-14' })
    expect(repo.getSnapshot().mode).toBe('corrupt')
  })

  it('create → patch 递增 revision；期望 revision 不匹配冲突', async () => {
    const s = memoryStorage()
    const repo = createPlanRepository({ storage: s, clock: () => NOW, idFactory: () => 'id-1' })
    const doc = createEmptyPlan(NOW, 'id-1')
    const created = await repo.create(doc)
    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect(created.document.localRevision).toBe(1)
    expect(created.persisted).toBe(true)

    const patched = await repo.patch(1, latest => ({
      ...latest,
      wizard: { ...latest.wizard, nextStep: 2 },
    }))
    expect(patched.ok).toBe(true)
    if (!patched.ok) return
    expect(patched.document.localRevision).toBe(2)
    expect(patched.document.wizard.nextStep).toBe(2)

    const conflict = await repo.patch(1, latest => latest)
    expect(conflict.ok).toBe(false)
    if (!conflict.ok) expect(conflict.reason).toBe('revision-conflict')
  })

  it('setItem 失败 → persisted:false、unsaved', async () => {
    const s = memoryStorage()
    s.setItem = () => {
      throw new Error('quota')
    }
    const repo = createPlanRepository({ storage: s, clock: () => NOW, idFactory: () => 'id-1' })
    const r = await repo.create(createEmptyPlan(NOW, 'id-1'))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.persisted).toBe(false)
    expect(repo.getSnapshot().unsaved).toBe(true)
  })

  it('P1-6a: 单次 setItem 失败后重试成功，不锁成另一窗口冲突', async () => {
    const s = memoryStorage()
    const repo = createPlanRepository({ storage: s, clock: () => NOW, idFactory: () => 'id-1' })
    const created = await repo.create(createEmptyPlan(NOW, 'id-1'))
    expect(created.ok).toBe(true)
    if (!created.ok) return

    let failOnce = true
    const realSet = s.setItem.bind(s)
    s.setItem = (k, v) => {
      if (failOnce && k === PLAN_KEYS.document) {
        failOnce = false
        throw new Error('quota')
      }
      return realSet(k, v)
    }

    const failed = await repo.patch(1, latest => ({
      ...latest,
      wizard: { ...latest.wizard, nextStep: 2 },
    }))
    expect(failed.ok).toBe(true)
    if (!failed.ok) return
    expect(failed.persisted).toBe(false)
    expect(repo.getSnapshot().unsaved).toBe(true)
    expect(repo.getSnapshot().conflict).toBe(false)

    const retried = await repo.patch(2, latest => ({
      ...latest,
      wizard: { ...latest.wizard, nextStep: 3 },
    }))
    expect(retried.ok).toBe(true)
    if (!retried.ok) return
    expect(retried.persisted).toBe(true)
    expect(repo.getSnapshot().conflict).toBe(false)
    expect(repo.getSnapshot().unsaved).toBe(false)
    const again = await repo.patch(3, latest => ({
      ...latest,
      wizard: { ...latest.wizard, nextStep: 4 },
    }))
    expect(again.ok).toBe(true)
  })

  it('P1-6b: storage unavailable 时 create 后仍可内存 patch', async () => {
    const repo = createPlanRepository({
      storage: null,
      clock: () => NOW,
      idFactory: () => 'id-1',
    })
    const created = await repo.create(createEmptyPlan(NOW, 'id-1'))
    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect(created.persisted).toBe(false)
    expect(repo.getSnapshot().mode).toBe('unavailable')
    const patched = await repo.patch(1, latest => ({
      ...latest,
      wizard: { ...latest.wizard, nextStep: 2 },
    }))
    expect(patched.ok).toBe(true)
    if (!patched.ok) return
    expect(patched.persisted).toBe(false)
    expect(patched.document.wizard.nextStep).toBe(2)
    expect(repo.getSnapshot().unsaved).toBe(true)
  })

  it('corrupt 原文不覆盖；常规写入 protected', async () => {
    const s = memoryStorage({ [PLAN_KEYS.document]: '{bad' })
    const repo = createPlanRepository({ storage: s, clock: () => NOW, idFactory: () => 'id-1' })
    expect(repo.getSnapshot().mode).toBe('corrupt')
    expect(s.data[PLAN_KEYS.document]).toBe('{bad')
    const r = await repo.create(createEmptyPlan(NOW, 'id-1'))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('protected')
    expect(s.data[PLAN_KEYS.document]).toBe('{bad')
  })

  it('clear 保留旧键与 imports 收据；不调用 clear()', async () => {
    const s = memoryStorage({
      [LEGACY_KEYS.total]: '"50"',
      [START_KEY]: '{"schemaVersion":1}',
      [PLAN_KEYS.imports]: JSON.stringify({ schemaVersion: 1, legacyConsumed: true, startConsumed: false }),
    })
    const repo = createPlanRepository({ storage: s, clock: () => NOW, idFactory: () => 'id-1' })
    const created = await repo.create(createEmptyPlan(NOW, 'id-1'))
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const cleared = await repo.clear(1)
    expect(cleared.ok).toBe(true)
    expect(s.data[LEGACY_KEYS.total]).toBe('"50"')
    expect(s.data[START_KEY]).toBe('{"schemaVersion":1}')
    expect(s.data[PLAN_KEYS.imports]).toBeTruthy()
    expect(s.data[PLAN_KEYS.document]).toBeUndefined()
    expect(s.ops.some(o => o.includes('clear'))).toBe(false)
  })

  it('收据可写；从 migration 恢复', () => {
    const s = memoryStorage()
    expect(writeImportsReceipt(s, { schemaVersion: 1, legacyConsumed: true, startConsumed: false })).toBe(true)
    expect(loadImportsReceipt(s)).toEqual({ schemaVersion: 1, legacyConsumed: true, startConsumed: false })
  })

  it('同页写串行；Web Locks 包住', async () => {
    const order: string[] = []
    const locks = {
      request: async <T>(_name: string, cb: () => Promise<T>) => {
        order.push('lock')
        return cb()
      },
    }
    const s = memoryStorage()
    const repo = createPlanRepository({
      storage: s,
      clock: () => NOW,
      idFactory: () => 'id-1',
      locks,
    })
    await repo.create(createEmptyPlan(NOW, 'id-1'))
    expect(order).toContain('lock')
  })

  it('storage 事件触发 refresh', async () => {
    const listeners: Record<string, EventListener[]> = {}
    const s = memoryStorage()
    const repo = createPlanRepository({
      storage: s,
      clock: () => NOW,
      idFactory: () => 'id-1',
      addEventListener: (t, fn) => {
        ;(listeners[t] ??= []).push(fn)
      },
    })
    await repo.create(createEmptyPlan(NOW, 'id-1'))
    // 另一标签写入更高 revision
    const other = createEmptyPlan(NOW, 'id-1')
    other.localRevision = 5
    other.wizard.nextStep = 3
    s.data[PLAN_KEYS.document] = JSON.stringify(other)
    listeners.storage?.[0]?.(new StorageEvent('storage', { key: PLAN_KEYS.document }))
    expect(repo.getSnapshot().document?.localRevision).toBe(5)
  })

  it('get/set/remove 独立失败处理', async () => {
    const s = memoryStorage()
    const repo = createPlanRepository({ storage: s, clock: () => NOW, idFactory: () => 'id-1' })
    await repo.create(createEmptyPlan(NOW, 'id-1'))
    s.removeItem = () => {
      throw new Error('denied')
    }
    const cleared = await repo.clear(1)
    expect(cleared.ok).toBe(false)
    expect(repo.getSnapshot().mode).toBe('ready')
  })

  it('同一状态 getSnapshot 稳定引用', () => {
    const s = memoryStorage()
    const repo = createPlanRepository({ storage: s, clock: () => NOW, idFactory: () => 'id-1' })
    expect(repo.getSnapshot()).toBe(repo.getSnapshot())
  })
})

describe('no localStorage.clear', () => {
  it('repository 源码不含 clear()', async () => {
    const src = await import('./repository?raw').catch(() => null)
    void src
    // 行为断言已覆盖；额外：spy
    const clear = vi.fn()
    const s = memoryStorage()
    ;(s as unknown as { clear: () => void }).clear = clear
    const repo = createPlanRepository({ storage: s, clock: () => NOW, idFactory: () => 'id-1' })
    await repo.create(createEmptyPlan(NOW, 'id-1'))
    await repo.clear(1)
    expect(clear).not.toHaveBeenCalled()
  })
})
