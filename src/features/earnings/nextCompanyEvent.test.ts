import { describe, expect, it } from 'vitest'
import { calendar, item } from './fixtures'
import { nextCompanyEvent } from './nextCompanyEvent'

const now = new Date('2026-11-21T01:00:00Z')

describe('公司页财报日程', () => {
  it('跨市场午夜按交易所当地日期筛选，即使日历快照已经落后', () => {
    const us = item({ date: '2026-11-20' })
    const hk = item({ market: 'hk', code: '00700', date: '2026-11-20' })
    const later = { ...hk, date: '2026-11-23', confirmed: false }
    const cal = calendar({ items: [later, item({ date: '2026-11-17' }), hk, us] })
    expect(nextCompanyEvent(cal, 'ndx', 'NVDA', now)).toEqual(us)
    expect(nextCompanyEvent(cal, 'hk', '0700', now)).toEqual(later)
  })

  it('交易日当天的上季营收不能证明本期已披露', () => {
    const result = calendar().items.find(e => e.result)!.result!
    const event = item({ date: '2026-11-20', periodEnd: '2026-09-30', result: {
      ...result, epsActual: null, revenuePeriodEnd: '2026-06-30',
    } })
    expect(nextCompanyEvent(calendar({ items: [event] }), 'us', 'NVDA', now)).toEqual(event)
    const published = { ...event, result: { ...event.result!, revenuePeriodEnd: event.periodEnd } }
    expect(nextCompanyEvent(calendar({ items: [published] }), 'us', 'NVDA', now)).toBeNull()
  })

  it('略过已公布结果或已实际披露的日程，旧快照耗尽时返回空', () => {
    const reported = calendar().items.find(e => e.result)!.result
    const cal = calendar({ items: [
      item({ date: '2026-11-20', result: reported }),
      item({ date: '2026-11-20', appoint: { actual: '2026-11-20', changes: 0, first: '2026-11-20' } }),
      item({ date: '2026-11-19' }),
    ] })
    expect(nextCompanyEvent(cal, 'us', 'NVDA', now)).toBeNull()
    expect(nextCompanyEvent(null, 'us', 'NVDA', now)).toBeNull()
  })
})
