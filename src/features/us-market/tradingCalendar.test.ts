import { describe, expect, it } from 'vitest'
import {
  easterSunday,
  effectiveAsOfForData,
  isNyseHoliday,
  isNyseSession,
  isPastNyseDataCutoff,
  nyseHolidaysForYear,
  nyseSessionsOnOrBefore,
  observeFixedHoliday,
} from './tradingCalendar'

describe('NYSE holidays 2025–2027', () => {
  it('covers fixed and floating holidays with weekend observation', () => {
    expect(easterSunday(2025)).toBe('2025-04-20')
    expect(easterSunday(2026)).toBe('2026-04-05')
    expect(easterSunday(2027)).toBe('2027-03-28')

    // New Year's 2027 is Friday; 2022 Sat → Fri observe pattern via helper
    expect(observeFixedHoliday(2022, 1, 1)).toBe('2021-12-31')
    expect(observeFixedHoliday(2023, 1, 1)).toBe('2023-01-02')

    const y2026 = nyseHolidaysForYear(2026)
    expect(y2026.has('2026-01-01')).toBe(true) // New Year's
    expect(y2026.has('2026-01-19')).toBe(true) // MLK
    expect(y2026.has('2026-02-16')).toBe(true) // Presidents'
    expect(y2026.has('2026-04-03')).toBe(true) // Good Friday
    expect(y2026.has('2026-05-25')).toBe(true) // Memorial Day
    expect(y2026.has('2026-06-19')).toBe(true) // Juneteenth
    expect(y2026.has('2026-07-03')).toBe(true) // Independence observed (Sat 4th → Fri 3rd)
    expect(y2026.has('2026-09-07')).toBe(true) // Labor Day
    expect(y2026.has('2026-11-26')).toBe(true) // Thanksgiving
    expect(y2026.has('2026-12-25')).toBe(true) // Christmas

    expect(isNyseHoliday('2026-11-26')).toBe(true)
    expect(isNyseSession('2026-11-26')).toBe(false)
    expect(isNyseSession('2026-11-25')).toBe(true)
    expect(isNyseSession('2026-11-27')).toBe(true)
  })
})

describe('Thanksgiving week freshness sessions', () => {
  it('skips Thanksgiving so Wed is only one session behind Fri', () => {
    // asOf Fri 2026-11-27 after cutoff: sessions … Wed 25, Fri 27 (Thu holiday)
    const now = new Date('2026-11-27T22:00:00Z') // 17:00 ET
    const sessions = nyseSessionsOnOrBefore('2026-11-27', 4, now)
    expect(sessions).toEqual(['2026-11-20', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-27'].slice(-4))
    expect(sessions.at(-1)).toBe('2026-11-27')
    expect(sessions.at(-2)).toBe('2026-11-25')
    expect(sessions.includes('2026-11-26')).toBe(false)
  })

  it('before 16:40 ET does not treat today as an expected session', () => {
    // Friday 2026-11-27 15:00 ET = 20:00 UTC (EST)
    const before = new Date('2026-11-27T20:00:00Z')
    expect(isPastNyseDataCutoff(before)).toBe(false)
    expect(effectiveAsOfForData('2026-11-27', before)).toBe('2026-11-26')
    const sessions = nyseSessionsOnOrBefore('2026-11-27', 3, before)
    expect(sessions.at(-1)).toBe('2026-11-25') // Thu holiday → Wed

    const after = new Date('2026-11-27T21:45:00Z') // 16:45 ET
    expect(isPastNyseDataCutoff(after)).toBe(true)
    expect(effectiveAsOfForData('2026-11-27', after)).toBe('2026-11-27')
    expect(nyseSessionsOnOrBefore('2026-11-27', 1, after).at(-1)).toBe('2026-11-27')
  })
})
