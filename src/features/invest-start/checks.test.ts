import { describe, expect, it } from 'vitest'
import { addDays, addMonths, completeReview, daysBetween, localToday, occurrence, reviewStatus } from './checks'
import { isAnchorDay, isDay } from './validation'
import type { ReviewSchedule } from './types'

const rv = (anchor: string, intervalMonths: 3 | 6 = 6, completedDates: string[] = []): ReviewSchedule =>
  ({ id: 'r1', anchor, intervalMonths, completedDates, calendarSequence: 0 })

describe('日期工具', () => {
  it('严格日期与锚点日号 1—28', () => {
    expect(isDay('2028-02-29')).toBe(true)
    expect(isDay('2027-02-29')).toBe(false)
    expect(isDay('2027-1-5')).toBe(false)
    expect(isAnchorDay('2027-03-28')).toBe(true)
    expect(isAnchorDay('2027-03-29')).toBe(false)
  })

  it('加月份跨年；加天跨月、闰年；天数差不受夏令时影响', () => {
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15')
    expect(addMonths('2026-12-01', 6)).toBe('2027-06-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2027-12-31', 1)).toBe('2028-01-01')
    expect(daysBetween('2027-03-01', '2027-04-01')).toBe(31)
    expect(localToday(new Date(2026, 10, 14, 23, 59))).toBe('2026-11-14')
  })

  it('每次检查日都从原锚点算，不累加', () => {
    expect([0, 1, 2, 3].map(k => occurrence(rv('2026-11-28', 3), k))).toEqual(['2026-11-28', '2027-02-28', '2027-05-28', '2027-08-28'])
  })
})

describe('reviewStatus', () => {
  it('锚点在未来：没有到期项，倒计时到锚点', () => {
    expect(reviewStatus(rv('2026-12-01'), '2026-11-14')).toEqual({ due: undefined, next: '2026-12-01', daysToNext: 17 })
  })

  it('当天即到期；逾期多个周期也只显示最近一条', () => {
    expect(reviewStatus(rv('2026-11-14'), '2026-11-14').due).toBe('2026-11-14')
    const s = reviewStatus(rv('2025-01-10', 3), '2026-11-14')
    expect(s.due).toBe('2026-10-10')
    expect(s.next).toBe('2027-01-10')
  })

  it('完成某一期后不再到期，下一期仍按原锚点', () => {
    const r = completeReview(rv('2026-05-01'), '2026-11-01')
    const s = reviewStatus(r, '2026-11-14')
    expect(s.due).toBeUndefined()
    expect(s.next).toBe('2027-05-01')
    expect(completeReview(r, '2026-11-01')).toBe(r)
  })
})
