import { describe, expect, it } from 'vitest'
import { contributionDue, contributionNext, planReviewStatus, rollingOccurrences } from './schedule'
import type { Contribution, PlanReview } from './types'

describe('planReviewStatus', () => {
  const base: PlanReview = {
    id: 'r1',
    anchor: '2024-01-15',
    intervalMonths: 6,
    completedDates: [],
    calendarSequence: 0,
    mode: 'calendar-check-band-act',
  }

  it('季/半年/跨年', () => {
    expect(planReviewStatus(base, '2024-07-15').due).toBe('2024-07-15')
    expect(planReviewStatus(base, '2024-07-14').due).toBe('2024-01-15')
    expect(planReviewStatus({ ...base, intervalMonths: 3 }, '2024-04-15').due).toBe('2024-04-15')
  })

  it('逾期一条；完成后原锚点推进；暂缓不推进靠 completedDates', () => {
    const due = planReviewStatus(base, '2025-01-20')
    expect(due.due).toBe('2025-01-15')
    const done = planReviewStatus({ ...base, completedDates: ['2025-01-15'] }, '2025-01-20')
    expect(done.due).toBeUndefined()
    expect(done.next).toBe('2025-07-15')
  })

  it('闰年锚点 02-28', () => {
    const r: PlanReview = { ...base, anchor: '2024-02-28', intervalMonths: 3 }
    expect(planReviewStatus(r, '2024-05-28').due).toBe('2024-05-28')
  })
})

describe('contribution', () => {
  const c: Contribution = {
    id: 'c1',
    label: '月投',
    amount: { currency: 'CNY', amount: '1000.00' },
    intervalMonths: 1,
    anchor: '2026-01-10',
    enabled: true,
    acknowledgedDates: [],
  }

  it('月季不倍补；最近一期未 ack 才 1 条', () => {
    expect(contributionDue(c, '2026-03-10')).toBe('2026-03-10')
    expect(contributionDue({ ...c, acknowledgedDates: ['2026-03-10'] }, '2026-03-10')).toBeUndefined()
    expect(contributionNext({ ...c, acknowledgedDates: ['2026-03-10'] }, '2026-03-10')).toBe('2026-04-10')
  })

  it('滚动窗口含今天', () => {
    const days = rollingOccurrences('2026-11-14', 6, '2026-11-14', 2)
    expect(days[0]).toBe('2026-11-14')
    expect(days[1]).toBe('2027-05-14')
  })
})
