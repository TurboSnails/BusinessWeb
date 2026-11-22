import { percentileOf } from './explain'
import type { Point, Reading } from './model'
import { nyseSessionsOnOrBefore } from './tradingCalendar'

const DAY = 86_400_000

export const COPPER_PENDING = '数据将在下次更新后显示'

export const COPPER_NOTE =
  '铜用于建筑、电网、制造，价格常随全球（尤其中国）工业需求起落，所以被称为“铜博士”。铜金比上升通常对应增长预期改善、长期利率上行，下降对应避险。但它不是可靠的领先指标：供给中断、关税和中国需求都会让铜价偏离美国经济；2024 年以来铜金比与美债收益率的同步性明显变弱；2025 年起 COMEX 铜价受美国关税预期影响，相对伦敦价格出现过大幅溢价。这里只作背景参考，不参与本页判断。'

export const REFRESH_FAILED_PREFIX = '最近一次更新失败，显示的是上次读数'

/** @deprecated Prefer nyseSessionsOnOrBefore from tradingCalendar. */
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
 * Stale when the observation lags the latest completed NYSE session on/before asOf
 * by more than two trading days (lag ≥ 3). Holidays + 16:40 ET aware.
 */
export function isCopperStale(dataDate: string, asOf: string, now: Date = new Date()): boolean {
  if (!dataDate || !asOf || dataDate > asOf) return false
  const sessions = nyseSessionsOnOrBefore(asOf, 8, now)
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

export interface CopperMetric {
  date: string
  value: number
  stale: boolean
  refreshFailed: boolean
  yearChange?: number
  percentile10y?: number
}

export interface CopperSnapshot {
  copper?: CopperMetric
  gold?: CopperMetric
  ratio?: CopperMetric
  /** @deprecated Prefer per-metric dates; kept as newest available date among items. */
  asOfDate?: string
  /** True when every present metric is stale (legacy aggregate). */
  stale: boolean
  chart: { dates: string[]; ratio: number[]; yield: number[] }
  copperHistory: Point[]
  /** Ready when at least one of copper / gold / ratio is available. */
  ready: boolean
}

function metricFrom(
  history: readonly Point[],
  asOf: string,
  reading: Reading | undefined,
  now: Date,
  extras?: { yearChange?: number; percentile10y?: number },
): CopperMetric | undefined {
  const last = history.at(-1)
  if (!last || !Number.isFinite(last[1])) return undefined
  return {
    date: last[0],
    value: last[1],
    stale: isCopperStale(last[0], asOf, now),
    refreshFailed: Boolean(reading?.refreshError),
    ...extras,
  }
}

export function refreshFailedCopy(date: string): string {
  return `${REFRESH_FAILED_PREFIX}（截至 ${date}）`
}

export function buildCopperSnapshot(
  series: Record<string, Reading | undefined> | undefined,
  asOf: string,
  now: Date = new Date(),
): CopperSnapshot {
  const copperHist = series?.copperDaily?.history ?? []
  const goldHist = series?.goldDaily?.history ?? []
  const ratioHist = series?.copperGold?.history ?? []
  const tenYear = series?.tenYearDaily?.history ?? []

  const copper = metricFrom(copperHist, asOf, series?.copperDaily, now, {
    yearChange: yearChange(copperHist),
    percentile10y: (() => {
      const last = copperHist.at(-1)
      return last ? historyPercentile(trailingYears(copperHist, 10), last[1]) : undefined
    })(),
  })
  const gold = metricFrom(goldHist, asOf, series?.goldDaily, now, {
    yearChange: yearChange(goldHist),
    percentile10y: (() => {
      const last = goldHist.at(-1)
      return last ? historyPercentile(trailingYears(goldHist, 10), last[1]) : undefined
    })(),
  })
  const ratio = metricFrom(ratioHist, asOf, series?.copperGold, now, {
    percentile10y: (() => {
      const last = ratioHist.at(-1)
      return last ? historyPercentile(trailingYears(ratioHist, 10), last[1]) : undefined
    })(),
  })

  const dates = [copper?.date, gold?.date, ratio?.date].filter((d): d is string => Boolean(d))
  const asOfDate = dates.sort().at(-1)
  const present = [copper, gold, ratio].filter(Boolean) as CopperMetric[]
  const chart = alignSeries(ratioHist, tenYear, 5)

  return {
    copper,
    gold,
    ratio,
    asOfDate,
    stale: present.length > 0 && present.every(m => m.stale),
    chart: { dates: chart.dates, ratio: chart.left, yield: chart.right },
    copperHistory: trailingYears(copperHist, 5),
    ready: present.length > 0,
  }
}
