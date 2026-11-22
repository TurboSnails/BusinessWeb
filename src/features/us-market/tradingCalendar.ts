/** NYSE session calendar helpers for freshness (shared by advDec + copper). */

/** NYSE regular-session data is not expected before 16:40 America/New_York. */
export const NYSE_DATA_CUTOFF = { hour: 16, minute: 40 } as const

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function formatNyDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** Hour/minute in America/New_York for `now`. */
export function nyTimeParts(now: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now)
  const hour = Number(parts.find(p => p.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find(p => p.type === 'minute')?.value ?? 0)
  return { hour, minute }
}

type DataCutoff = { hour: number; minute: number }

const NYSE_SHORT_DATA_CUTOFF = { hour: 13, minute: 40 }

export function isPastNyseDataCutoff(now: Date = new Date(), cutoff?: DataCutoff): boolean {
  const expected = cutoff ?? (isNyseEarlyClose(formatNyDate(now)) ? NYSE_SHORT_DATA_CUTOFF : NYSE_DATA_CUTOFF)
  const { hour, minute } = nyTimeParts(now)
  return hour * 60 + minute >= expected.hour * 60 + expected.minute
}

function shiftIsoDate(iso: string, deltaDays: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toISOString().slice(0, 10)
}

/** Western Easter Sunday (Anonymous Gregorian algorithm). */
export function easterSunday(year: number): string {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): string {
  // weekday: 0=Sun … 6=Sat; month 1–12
  const first = new Date(Date.UTC(year, month - 1, 1, 12))
  const firstWd = first.getUTCDay()
  const day = 1 + ((weekday - firstWd + 7) % 7) + (n - 1) * 7
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): string {
  const last = new Date(Date.UTC(year, month, 0, 12)) // day 0 of next month
  const lastWd = last.getUTCDay()
  const day = last.getUTCDate() - ((lastWd - weekday + 7) % 7)
  return `${year}-${pad2(month)}-${pad2(day)}`
}

/** Observed date when a fixed holiday falls on a weekend (Sat→Fri, Sun→Mon). */
export function observeFixedHoliday(year: number, month: number, day: number): string {
  const iso = `${year}-${pad2(month)}-${pad2(day)}`
  const wd = new Date(`${iso}T12:00:00Z`).getUTCDay()
  if (wd === 6) return shiftIsoDate(iso, -1)
  if (wd === 0) return shiftIsoDate(iso, 1)
  return iso
}

/** Full set of NYSE full-day holidays for a calendar year (fixed + floating). */
export function nyseHolidaysForYear(year: number): Set<string> {
  const set = new Set<string>()
  set.add(observeFixedHoliday(year, 1, 1)) // New Year's Day
  set.add(nthWeekdayOfMonth(year, 1, 1, 3)) // MLK Day
  set.add(nthWeekdayOfMonth(year, 2, 1, 3)) // Presidents' Day
  set.add(shiftIsoDate(easterSunday(year), -2)) // Good Friday
  set.add(lastWeekdayOfMonth(year, 5, 1)) // Memorial Day
  set.add(observeFixedHoliday(year, 6, 19)) // Juneteenth
  set.add(observeFixedHoliday(year, 7, 4)) // Independence Day
  set.add(nthWeekdayOfMonth(year, 9, 1, 1)) // Labor Day
  set.add(nthWeekdayOfMonth(year, 11, 4, 4)) // Thanksgiving
  set.add(observeFixedHoliday(year, 12, 25)) // Christmas
  return set
}

const holidayCache = new Map<number, Set<string>>()

function holidaysCached(year: number): Set<string> {
  let set = holidayCache.get(year)
  if (!set) {
    set = nyseHolidaysForYear(year)
    holidayCache.set(year, set)
  }
  return set
}

export function isNyseHoliday(isoDate: string): boolean {
  const year = Number(isoDate.slice(0, 4))
  if (!Number.isFinite(year)) return false
  return holidaysCached(year).has(isoDate)
}

export function isNyseSession(isoDate: string): boolean {
  const wd = new Date(`${isoDate}T12:00:00Z`).getUTCDay()
  if (wd === 0 || wd === 6) return false
  return !isNyseHoliday(isoDate)
}

/** NYSE closes early the day after Thanksgiving and on July 3 or Dec 24 when open. */
function isNyseEarlyClose(day: string): boolean {
  if (!isNyseSession(day)) return false
  const year = Number(day.slice(0, 4))
  return day.endsWith('-07-03') || day.endsWith('-12-24')
    || day === shiftIsoDate(nthWeekdayOfMonth(year, 11, 4, 4), 1)
}

/** Use the prior calendar day when today's session data is not due yet. */
export function effectiveAsOfForData(asOf: string, now: Date = new Date(), cutoff?: DataCutoff): string {
  if (!asOf) return asOf
  const todayNy = formatNyDate(now)
  if (asOf === todayNy && !isPastNyseDataCutoff(now, cutoff)) return shiftIsoDate(asOf, -1)
  return asOf
}

/**
 * NYSE sessions on/before asOf (after applying the data cutoff). Newest last.
 * Covers at least 2025–2027 via the holiday generators.
 */
export function nyseSessionsOnOrBefore(
  asOf: string,
  count: number,
  now: Date = new Date(),
  cutoff?: DataCutoff,
): string[] {
  const out: string[] = []
  if (!(count > 0) || !asOf) return out
  let cursor = effectiveAsOfForData(asOf, now, cutoff)
  // Walk back far enough for holidays + weekends.
  let guard = 0
  while (out.length < count && guard < count * 4 + 40) {
    if (isNyseSession(cursor)) out.push(cursor)
    cursor = shiftIsoDate(cursor, -1)
    guard++
  }
  return out.reverse()
}

/** Latest completed NYSE session on/before asOf. */
export function latestCompletedNyseSession(asOf: string, now: Date = new Date()): string | undefined {
  return nyseSessionsOnOrBefore(asOf, 1, now).at(-1)
}
