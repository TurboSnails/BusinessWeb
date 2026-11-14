import { describe, expect, it } from 'vitest'
import { buildPlanIcs, planPageUrl } from './calendar'
import type { PlanReview } from './types'

const review: PlanReview = {
  id: 'rev-abc',
  anchor: '2027-03-15',
  intervalMonths: 6,
  completedDates: [],
  calendarSequence: 2,
  mode: 'calendar-check-band-act',
}

describe('investment-plan calendar', () => {
  it('回链 invest/my-plan；ics 无金额/答案/mode/token', () => {
    expect(planPageUrl('https://canon.test', '/', 'https://canon.test')).toBe('https://canon.test/invest/my-plan')
    const ics = buildPlanIcs({
      review,
      today: '2026-11-14',
      now: new Date('2026-11-14T12:00:00.000Z'),
      pageUrl: 'https://canon.test/invest/my-plan',
    })
    expect(ics).toContain('UID:rev-abc@invest-start.live')
    expect(ics).toContain('DTSTART;VALUE=DATE:20270315')
    expect(ics).toContain('TRIGGER;RELATED=START:PT9H')
    expect(ics).toContain('URL:https://canon.test/invest/my-plan')
    expect(ics).not.toMatch(/calendar-check-band-act|CNY|amount|token|answer/i)
  })

  it('localhost 回正式站 my-plan', () => {
    expect(planPageUrl('http://localhost:5173', '/', 'https://canon.test')).toBe('https://canon.test/invest/my-plan')
  })
})
