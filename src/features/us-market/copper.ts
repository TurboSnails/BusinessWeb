import { percentileOf } from './explain'
import type { Point, Reading } from './model'

const DAY = 86_400_000

export const COPPER_PENDING = '数据将在下次更新后显示'

export const COPPER_NOTE =
  '铜用于建筑、电网、制造，价格常随全球（尤其中国）工业需求起落，所以被称为“铜博士”。铜金比上升通常对应增长预期改善、长期利率上行，下降对应避险。但它不是可靠的领先指标：供给中断、关税和中国需求都会让铜价偏离美国经济；2024 年以来铜金比与美债收益率的同步性明显变弱；2025 年起 COMEX 铜价受美国关税预期影响，相对伦敦价格出现过大幅溢价。这里只作背景参考，不参与本页判断。'

/** Weekday sessions on/before asOf (holidays ignored). Newest last. */
export function weekdaySessionsOnOrBefore(asOf: string, count: number): string[] {
  const out: string[] = []
  const cursor = new Date(`${asOf}T12:00:00Z`)
  while (out.length < count) {
    const day = cursor.getUTCDay()
    if (day !== 0 && day !== 6) out.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return out.reverse()
}

/**
 * Stale when the observation lags the latest weekday on/before asOf by more than
 * two trading days (lag ≥ 3).
 */
export function isCopperStale(dataDate: string, asOf: string): boolean {
  if (!dataDate || !asOf || dataDate > asOf) return false
  const sessions = weekdaySessionsOnOrBefore(asOf, 8)
  if (sessions.length < 3) return false
  const cutoff = sessions.at(-3)!
  return dataDate < cutoff
}

export function historyPercentile(history: readonly Point[], value: number): number | undefined {
  const values = history.map(([, v]) => v).filter(Number.isFinite)
  if (values.length < 2 || !Number.isFinite(value)) return undefined
  return percentileOf(values, value)
}

/** Closest observation on or before `target` (inclusive). */
export function pointOnOrBefore(history: readonly Point[], target: string): Point | undefined {
  let best: Point | undefined
  for (const point of history) {
    if (point[0] > target) break
    best = point
  }
  return best
}

/** Calendar-year change ending at the latest point; requires a baseline ≈ 365 days earlier. */
export function yearChange(history: readonly Point[]): number | undefined {
  const last = history.at(-1)
  if (!last || !(last[1] > 0)) return undefined
  const target = new Date(Date.parse(last[0]) - 365 * DAY).toISOString().slice(0, 10)
  const base = pointOnOrBefore(history, target)
  if (!base || !(base[1] > 0)) return undefined
  const age = (Date.parse(last[0]) - Date.parse(base[0])) / DAY
  if (age < 300 || age > 430) return undefined
  return (last[1] / base[1] - 1) * 100
}

/** Keep points inside [end − years, end]. */
export function trailingYears(history: readonly Point[], years: number): Point[] {
  const end = history.at(-1)?.[0]
  if (!end) return []
  const startMs = Date.parse(end) - years * 365.25 * DAY
  return history.filter(([day]) => Date.parse(day) >= startMs)
}

/** Align two series on shared dates within the trailing window (years). */
export function alignSeries(
  left: readonly Point[],
  right: readonly Point[],
  years = 5,
): { dates: string[]; left: number[]; right: number[] } {
  const end = [left.at(-1)?.[0], right.at(-1)?.[0]].filter(Boolean).sort().at(-1)
  if (!end) return { dates: [], left: [], right: [] }
  const startMs = Date.parse(end) - years * 365.25 * DAY
  const rightByDay = new Map(right)
  const dates: string[] = []
  const leftVals: number[] = []
  const rightVals: number[] = []
  for (const [day, value] of left) {
    if (Date.parse(day) < startMs || day > end) continue
    const other = rightByDay.get(day)
    if (!Number.isFinite(value) || !Number.isFinite(other)) continue
    dates.push(day)
    leftVals.push(value)
    rightVals.push(other as number)
  }
  return { dates, left: leftVals, right: rightVals }
}

export interface CopperSnapshot {
  copper?: { date: string; value: number; yearChange?: number; percentile10y?: number }
  ratio?: { date: string; value: number; percentile10y?: number }
  asOfDate?: string
  stale: boolean
  chart: { dates: string[]; ratio: number[]; yield: number[] }
  copperHistory: Point[]
  ready: boolean
}

export function buildCopperSnapshot(
  series: Record<string, Reading | undefined> | undefined,
  asOf: string,
): CopperSnapshot {
  const copper = series?.copperDaily?.history ?? []
  const ratio = series?.copperGold?.history ?? []
  const tenYear = series?.tenYearDaily?.history ?? []
  const lastCopper = copper.at(-1)
  const lastRatio = ratio.at(-1)
  const asOfDate = lastCopper?.[0] ?? lastRatio?.[0]
  const chart = alignSeries(ratio, tenYear, 5)
  return {
    copper: lastCopper && Number.isFinite(lastCopper[1])
      ? {
        date: lastCopper[0],
        value: lastCopper[1],
        yearChange: yearChange(copper),
        percentile10y: historyPercentile(trailingYears(copper, 10), lastCopper[1]),
      }
      : undefined,
    ratio: lastRatio && Number.isFinite(lastRatio[1])
      ? {
        date: lastRatio[0],
        value: lastRatio[1],
        percentile10y: historyPercentile(trailingYears(ratio, 10), lastRatio[1]),
      }
      : undefined,
    asOfDate,
    stale: asOfDate ? isCopperStale(asOfDate, asOf) : false,
    chart: { dates: chart.dates, ratio: chart.left, yield: chart.right },
    copperHistory: trailingYears(copper, 5),
    ready: Boolean(lastCopper && lastRatio),
  }
}
