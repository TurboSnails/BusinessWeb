import { describe, expect, it } from 'vitest'
import { validDate, validPulsePayload, validReviewItem } from './validation'
import { review } from './fixtures'

describe('复盘同步数据校验', () => {
  it('接受完整记录与墓碑', () => {
    expect(validReviewItem(review('2026-09-30'))).toBe(true)
    expect(validReviewItem({ date: '2026-09-30', deleted: true, updatedAt: '2026-09-30T10:00:00.000Z' })).toBe(true)
    expect(validPulsePayload({ schemaVersion: 1, reviews: [review('2026-09-30'), review('2026-09-29')] })).toBe(true)
  })

  it('拒绝非法日期、未知字段、越界和非有限数值', () => {
    expect(validDate('2026-02-30')).toBe(false)
    expect(validDate('2026-9-30')).toBe(false)
    for (const bad of [
      review('2026-13-01'), review('2026-09-30', { evil: 1 }), review('2026-09-30', { ztCount: -1 }), review('2026-09-30', { ztCount: 1.5 }),
      review('2026-09-30', { volume: Number.NaN }), review('2026-09-30', { volume: 1e12 }), review('2026-09-30', { inflow: 'x'.repeat(501) }),
      review('2026-09-30', { weekday: 'x'.repeat(51) }), review('2026-09-30', { updatedAt: 'yesterday' }), review('2026-09-30', { ztCount: '50' }),
      { date: '2026-09-30', deleted: true, updatedAt: '2026-09-30T10:00:00.000Z', ztCount: 1 }, { date: '2026-09-30', deleted: false, updatedAt: '2026-09-30T10:00:00.000Z' },
    ]) expect(validReviewItem(bad)).toBe(false)
  })

  it('拒绝重复日期、超过 500 条、错误版本和多余顶层字段', () => {
    expect(validPulsePayload({ schemaVersion: 1, reviews: [review('2026-09-30'), review('2026-09-30')] })).toBe(false)
    const many = Array.from({ length: 501 }, (_, i) => review(new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10)))
    expect(validPulsePayload({ schemaVersion: 1, reviews: many })).toBe(false)
    expect(validPulsePayload({ schemaVersion: 2, reviews: [] })).toBe(false)
    expect(validPulsePayload({ schemaVersion: 1, reviews: [], extra: true })).toBe(false)
    expect(validPulsePayload(null)).toBe(false)
    expect(validPulsePayload({ schemaVersion: 1, reviews: {} })).toBe(false)
  })
})
