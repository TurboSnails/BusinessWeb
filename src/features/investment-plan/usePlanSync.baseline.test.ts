import { describe, expect, it } from 'vitest'
import { documentsDiffer } from './cloud'
import { createEmptyPlan } from './types'

const NOW = '2026-11-14T12:00:00.000Z'

describe('P1-5 / P2-5 sync compare helpers', () => {
  it('documentsDiffer 忽略 id，避免 adopt 后假冲突', () => {
    const a = createEmptyPlan(NOW, 'local-id')
    const b = { ...createEmptyPlan(NOW, 'cloud-id'), wizard: { ...a.wizard } }
    // 业务内容相同、仅 id 不同
    expect(documentsDiffer(a, { ...a, id: 'other' })).toBe(false)
    b.funding.emergencyMonths = 6
    expect(documentsDiffer(a, b)).toBe(true)
  })
})
