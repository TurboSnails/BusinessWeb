import { isTradingDay } from '../trading-calendar.mjs'

const weekday = date => date.getUTCDay()
const dateAt = (year, month, day) => new Date(Date.UTC(year, month - 1, day))
const nthWeekday = (year, month, day, nth) => 1 + (day - weekday(dateAt(year, month, 1)) + 7) % 7 + 7 * (nth - 1)
const observed = (year, month, day) => {
  const dow = weekday(dateAt(year, month, day))
  return day + (dow === 0 ? 1 : dow === 6 ? -1 : 0)
}

// Gregorian Easter, using the Meeus/Jones/Butcher calculation.
function goodFriday(year) {
  const century = Math.floor(year / 100)
  const cycle = year % 19
  const correction = century - Math.floor(century / 4) - Math.floor((century - Math.floor((century + 8) / 25) + 1) / 3)
  const moon = (19 * cycle + correction + 15) % 30
  const sunday = (32 + 2 * (century % 4) + 2 * Math.floor((year % 100) / 4) - moon - (year % 100) % 4) % 7
  const offset = moon + sunday - 7 * Math.floor((cycle + 11 * moon + 22 * sunday) / 451) + 114
  return dateAt(year, Math.floor(offset / 31), offset % 31 - 1)
}

export function remainingSessions(lastClose, monthEnd) {
  const [year, month] = monthEnd.split('-').map(Number)
  const friday = goodFriday(year)
  // Standard full-day closures. Short sessions still contribute one close.
  // https://www.nyse.com/trade/hours-calendars
  const closedDays = {
    1: [observed(year, 1, 1), nthWeekday(year, 1, 1, 3)],
    2: [nthWeekday(year, 2, 1, 3)],
    5: [31 - (weekday(dateAt(year, 5, 31)) + 6) % 7],
    6: year >= 2022 ? [observed(year, 6, 19)] : [],
    7: [observed(year, 7, 4)],
    9: [nthWeekday(year, 9, 1, 1)],
    11: [nthWeekday(year, 11, 4, 4)],
    12: [observed(year, 12, 25)],
  }[month] ?? []
  if (friday.getUTCMonth() + 1 === month) closedDays.push(friday.getUTCDate())

  let remaining = 0
  for (let day = Number(lastClose.slice(-2)) + 1; day <= Number(monthEnd.slice(-2)); day += 1) {
    const iso = dateAt(year, month, day).toISOString().slice(0, 10)
    if (isTradingDay('us', iso) && !closedDays.includes(day)) remaining += 1
  }
  return remaining
}
