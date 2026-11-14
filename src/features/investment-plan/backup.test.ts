import { describe, expect, it } from 'vitest'
import {
  BACKUP_FILENAME,
  buildBackup,
  parseBackupPayload,
  readDocumentRaw,
  restoreFromBackup,
  serializeBackup,
} from './backup'
import { PLAN_KEYS } from './types'
import { createPlanRepository, type StorageLike } from './repository'
import { createEmptyPlan } from './types'

const NOW = '2026-11-14T12:00:00.000Z'

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial }
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

describe('backup', () => {
  it('固定文件名与包装；不含 sync/conflict/token', () => {
    expect(BACKUP_FILENAME).toBe('investment-plan-backup.json')
    const doc = createEmptyPlan(NOW, 'p1')
    const text = serializeBackup(buildBackup(doc, NOW))
    expect(text).toContain('businessweb-investment-plan')
    expect(text).not.toContain('token')
    expect(text).not.toContain('investment-plan:sync')
  })

  it('坏 JSON / 高版本不覆盖', async () => {
    const s = memoryStorage()
    const repo = createPlanRepository({ storage: s, clock: () => NOW, idFactory: () => 'p1' })
    await repo.create(createEmptyPlan(NOW, 'p1'))
    const before = s.data['businessweb:investment-plan:v1']
    expect(parseBackupPayload('{bad').ok).toBe(false)
    expect(parseBackupPayload(JSON.stringify({ format: 'businessweb-investment-plan', version: 99, exportedAt: NOW, document: createEmptyPlan(NOW, 'x') })).ok).toBe(false)
    const r = await restoreFromBackup('{bad', repo, {
      confirmed: true,
      expectedLocalRevision: 1,
      existingDownloadedOrConflictSaved: true,
    })
    expect(r.ok).toBe(false)
    expect(s.data['businessweb:investment-plan:v1']).toBe(before)
  })

  it('readDocumentRaw 只读 corrupt 原文，不写回', () => {
    const s = memoryStorage({ [PLAN_KEYS.document]: '{not-json' })
    expect(readDocumentRaw(s)).toBe('{not-json')
    expect(s.data[PLAN_KEYS.document]).toBe('{not-json')
  })

  it('取消无写入；确认后 replace', async () => {
    const s = memoryStorage()
    const repo = createPlanRepository({ storage: s, clock: () => NOW, idFactory: () => 'p1' })
    await repo.create(createEmptyPlan(NOW, 'p1'))
    const other = createEmptyPlan(NOW, 'other-id')
    other.wizard.nextStep = 3
    const raw = serializeBackup(buildBackup(other, NOW))
    const cancelled = await restoreFromBackup(raw, repo, {
      confirmed: false,
      expectedLocalRevision: 1,
      existingDownloadedOrConflictSaved: true,
    })
    expect(cancelled.ok).toBe(false)

    const ok = await restoreFromBackup(raw, repo, {
      confirmed: true,
      expectedLocalRevision: 1,
      existingDownloadedOrConflictSaved: true,
    })
    expect(ok.ok).toBe(true)
    if (!ok.ok) return
    expect(ok.document.id).toBe('p1') // 保留本机 id
    expect(ok.document.wizard.nextStep).toBe(3)
    expect(ok.document.localRevision).toBe(2)
  })
})
