import { describe, expect, it } from 'vitest'
import { createEmptyPlan } from './types'
import { planWeeklyFacts } from './weekly'

describe('planWeeklyFacts', () => {
  const base = createEmptyPlan('2026-11-14T00:00:00.000Z', 'p1')

  it('无 review → null', () => {
    expect(planWeeklyFacts(base, '2026-11-14')).toBeNull()
  })

  it('due 优先；未来 7 天边界含今天与 +6', () => {
    const withReview = {
      ...base,
      review: {
        id: 'r1',
        anchor: '2026-11-14',
        intervalMonths: 3 as const,
        completedDates: [] as string[],
        calendarSequence: 0,
        mode: 'calendar-check-band-act' as const,
      },
    }
    const due = planWeeklyFacts(withReview, '2026-11-14')
    expect(due?.dueDate).toBe('2026-11-14')
    expect(due?.upcomingDate).toBeNull()

    const future = {
      ...base,
      review: {
        id: 'r1',
        anchor: '2026-11-20',
        intervalMonths: 3 as const,
        completedDates: [],
        calendarSequence: 0,
        mode: 'calendar-check-band-act' as const,
      },
    }
    expect(planWeeklyFacts(future, '2026-11-14')?.upcomingDate).toBe('2026-11-20')
    expect(planWeeklyFacts(future, '2026-11-14')?.dueDate).toBeNull()

    const edge = {
      ...base,
      review: {
        id: 'r1',
        anchor: '2026-11-20',
        intervalMonths: 3 as const,
        completedDates: [],
        calendarSequence: 0,
        mode: 'calendar-check-band-act' as const,
      },
    }
    expect(planWeeklyFacts(edge, '2026-11-14')?.upcomingDate).toBe('2026-11-20') // today+6
    expect(planWeeklyFacts(edge, '2026-11-13')).toBeNull() // +7 超出窗口
  })

  it('deferred 仅当 due 最新记录为 deferred', () => {
    const doc = {
      ...base,
      review: {
        id: 'r1',
        anchor: '2026-11-01',
        intervalMonths: 3 as const,
        completedDates: [] as string[],
        calendarSequence: 0,
        mode: 'calendar-check-band-act' as const,
      },
      history: [
        {
          id: 'h1',
          scheduleId: 'r1',
          scheduledDate: '2026-11-01',
          checkedAt: '2026-11-02T00:00:00.000Z',
          asOf: '2026-11-01',
          outcome: 'deferred' as const,
          note: '',
          snapshot: {
            funding: base.funding.budgets,
            core: [],
            coreTotalOnly: null,
            research: [],
            researchTotalOnly: null,
            reserve: base.funding.reserveActual,
          },
        },
      ],
    }
    expect(planWeeklyFacts(doc, '2026-11-14')?.deferred).toBe(true)
  })
})
