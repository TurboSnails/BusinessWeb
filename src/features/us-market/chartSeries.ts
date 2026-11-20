import type { Point } from './model'

/** Price-chart history windows; metric charts omit this and plot their readings as given. */
export type PriceRange = '1y' | '5y' | '10y' | 'all'

const DAY = 86_400_000
const YEAR = 365.25 * DAY
const RANGE_YEARS: Record<Exclude<PriceRange, 'all'>, number> = { '1y': 1, '5y': 5, '10y': 10 }

/** Keep points within `range` years of the latest reading, which may sit mid-year. Mirrors withinYears. */
export function withinPriceRange(points: Point[], range: PriceRange): Point[] {
  if (range === 'all' || !points.length) return points
  const end = Date.parse(points[points.length - 1][0])
  return points.filter(([date]) => end - Date.parse(date) <= RANGE_YEARS[range] * YEAR)
}

/** Monday of the ISO week containing `date` (YYYY-MM-DD), used as a stable weekly bucket. */
export function weekStart(date: string): string {
  const time = Date.parse(date)
  const shift = (new Date(time).getUTCDay() + 6) % 7 // Monday = 0 … Sunday = 6, in UTC
  return new Date(time - shift * DAY).toISOString().slice(0, 10)
}

export interface WeeklySeries {
  /** Last available close of each week, kept on its actual trading day. */
  points: Point[]
  /** Latest reading's date when it falls Monday–Thursday; the week may be shortened or in progress. */
  latestWeekAsOf?: string
}

/**
 * Collapse readings to the last available close per ISO week. Handles mixed daily/weekly
 * input and holiday gaps: a week with a single reading contributes that reading, a week
 * with none contributes nothing.
 */
export function weeklyCloses(points: Point[]): WeeklySeries {
  const byWeek = new Map<string, Point>()
  for (const point of points) byWeek.set(weekStart(point[0]), point)
  const sampled = [...byWeek.values()].sort(([a], [b]) => a.localeCompare(b))
  const last = sampled[sampled.length - 1]
  const day = last ? new Date(Date.parse(last[0])).getUTCDay() : -1
  return { points: sampled, latestWeekAsOf: day >= 1 && day <= 4 ? last[0] : undefined }
}

/** Index of the point closest in time to `time`; `points` must be sorted by date. */
export function nearestIndex(points: Point[], time: number): number {
  let lo = 0
  let hi = points.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (Date.parse(points[mid][0]) <= time) lo = mid
    else hi = mid
  }
  return time - Date.parse(points[lo][0]) <= Date.parse(points[hi][0]) - time ? lo : hi
}
