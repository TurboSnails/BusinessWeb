import type { Breadth, Point } from './model'
import { percentileOf } from './explain'

/** [date, advancers, decliners, unchanged, covered] */
export type AdvDecRow = [string, number, number, number, number]

export type AdvDecUniverse = 'spx' | 'ndx'

export interface TodayReading {
  date: string
  advancers: number
  decliners: number
  unchanged: number | undefined
  covered: number
  total?: number
  net: number
  advanceShare: number | undefined
  /** true when only highsLows one-day snapshot is available */
  fallback: boolean
}

export interface AdvDecMetrics {
  today: TodayReading
  /** 10-session mean of advance share (0–1). */
  avg10Share: number | undefined
  /** Percentile of avg10Share within the one-year series of 10-day means (0–100). */
  avg10Percentile: number | undefined
  /** Latest McClellan oscillator; undefined during warmup or missing data. */
  mcclellan: number | undefined
  mcclellanPercentile: number | undefined
  mcclellanWarmup: boolean
  cumulative: Point[]
  dailyNet: Point[]
  ranaSeries: Point[]
  mcclellanSeries: Array<[string, number | null]>
  readings: string[]
  asOfDate: string
  stale: boolean
  historyReady: boolean
}

const DAY = 86_400_000
const MCCLELLAN_FAST = 19
const MCCLELLAN_SLOW = 39
const AVG_WINDOW = 10
const DIVERGENCE_LOOKBACK = 20

/** RANA = (adv − dec) ÷ (adv + dec) × 1000. */
export function rana(advancers: number, decliners: number): number | undefined {
  const den = advancers + decliners
  if (!(den > 0) || !Number.isFinite(advancers) || !Number.isFinite(decliners)) return undefined
  return ((advancers - decliners) / den) * 1000
}

export function advanceShare(advancers: number, decliners: number): number | undefined {
  const den = advancers + decliners
  if (!(den > 0) || !Number.isFinite(advancers) || !Number.isFinite(decliners)) return undefined
  return advancers / den
}

/** EMA seeded with the first observation; coefficient k = 2/(n+1). */
export function ema(values: readonly number[], period: number): number[] {
  if (period < 1 || values.length === 0) return []
  const k = 2 / (period + 1)
  const out: number[] = [values[0]]
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k))
  }
  return out
}

/**
 * Ratio-adjusted McClellan oscillator = EMA19(RANA) − EMA39(RANA).
 * First `MCCLELLAN_SLOW` points are warmup (null); index 0..38.
 */
export function mcclellanOscillator(ranaValues: readonly number[]): Array<number | null> {
  if (ranaValues.length === 0) return []
  const fast = ema(ranaValues, MCCLELLAN_FAST)
  const slow = ema(ranaValues, MCCLELLAN_SLOW)
  return ranaValues.map((_, i) => (i < MCCLELLAN_SLOW ? null : fast[i]! - slow[i]!))
}

export function rollingMean(values: readonly number[], window: number): Array<number | undefined> {
  if (window < 1) return values.map(() => undefined)
  return values.map((_, i) => {
    if (i + 1 < window) return undefined
    let sum = 0
    for (let j = i - window + 1; j <= i; j++) sum += values[j]!
    return sum / window
  })
}

export function cumulativeNet(rows: readonly AdvDecRow[]): Point[] {
  let sum = 0
  return rows.map(([date, adv, dec]) => {
    sum += adv - dec
    return [date, sum]
  })
}

export function dailyNetPoints(rows: readonly AdvDecRow[]): Point[] {
  return rows.map(([date, adv, dec]) => [date, adv - dec])
}

/** Index and AD line both at series highs (same direction). */
export function bothAtHighs(adLine: readonly Point[], index: readonly Point[]): boolean {
  if (adLine.length < 2 || index.length < 2) return false
  const adLast = adLine.at(-1)![1]
  const ixLast = index.at(-1)![1]
  const adHi = Math.max(...adLine.map(([, v]) => v))
  const ixHi = Math.max(...index.map(([, v]) => v))
  return adLast >= adHi && ixLast >= ixHi
}

/** Index at a 20-session high while AD line is not. */
export function narrowingDivergence(adLine: readonly Point[], index: readonly Point[], lookback = DIVERGENCE_LOOKBACK): boolean {
  if (adLine.length < 2 || index.length < 2) return false
  const n = Math.min(lookback, index.length, adLine.length)
  const ixWindow = index.slice(-n)
  const adWindow = adLine.slice(-n)
  const ixLast = ixWindow.at(-1)![1]
  const adLast = adWindow.at(-1)![1]
  const ixHi = Math.max(...ixWindow.map(([, v]) => v))
  const adHi = Math.max(...adWindow.map(([, v]) => v))
  return ixLast >= ixHi && adLast < adHi
}

export function interpretBreadth(opts: {
  adLine: readonly Point[]
  index: readonly Point[] | undefined
  avg10Share: number | undefined
  avg10Percentile: number | undefined
  historyReady: boolean
}): string[] {
  const out: string[] = []
  if (!opts.historyReady) return out
  if (opts.index?.length) {
    if (bothAtHighs(opts.adLine, opts.index)) out.push('参与度广，上涨有多数股票跟随。')
    else if (narrowingDivergence(opts.adLine, opts.index)) out.push('指数靠少数股票拉动，参与度在变窄。')
  }
  if (opts.avg10Percentile !== undefined) {
    if (opts.avg10Percentile >= 90) out.push('短期普涨，热度偏高。')
    else if (opts.avg10Percentile <= 10) out.push('短期普跌，情绪偏冷。')
  }
  return out
}

/** Weekday sessions on/before asOf (America/New_York calendar date). Holidays ignored. */
export function weekdaySessionsOnOrBefore(asOf: string, count: number): string[] {
  const out: string[] = []
  const cursor = new Date(`${asOf}T12:00:00Z`)
  while (out.length < count) {
    const day = cursor.getUTCDay()
    if (day !== 0 && day !== 6) out.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return out
}

/**
 * Stale when data lags the latest session on/before asOf by more than one trading day.
 * Uses weekdays (holidays ignored). Optional `calendar` may only tighten the prior-session
 * cutoff when it already reaches the latest weekday on/before asOf.
 */
export function isStale(dataDate: string, asOf: string, calendar?: readonly string[]): boolean {
  if (!dataDate || !asOf || dataDate > asOf) return false
  const weekdays = weekdaySessionsOnOrBefore(asOf, 10).reverse()
  if (!weekdays.length) return false
  const latestWeekday = weekdays.at(-1)!
  const cal = calendar?.length
    ? [...calendar].filter(d => d <= asOf).sort((a, b) => a.localeCompare(b))
    : []
  // Prefer calendar only when it already knows the latest weekday (complete through asOf).
  const sessions = cal.at(-1) === latestWeekday ? cal : weekdays
  const prior = sessions.length >= 2 ? sessions.at(-2)! : sessions.at(-1)!
  // Fresh if data is latest or the immediately prior session.
  return dataDate < prior
}

export function parseAdvDec(rows: Breadth['advDec']): AdvDecRow[] {
  if (!rows?.length) return []
  return [...rows]
    .filter((row): row is AdvDecRow =>
      Array.isArray(row) && row.length >= 5
      && typeof row[0] === 'string'
      && [row[1], row[2], row[3], row[4]].every(n => Number.isFinite(n)))
    .sort((a, b) => a[0].localeCompare(b[0]))
}

function alignIndex(index: readonly Point[] | undefined, dates: readonly string[]): Point[] | undefined {
  if (!index?.length || !dates.length) return undefined
  const map = new Map(index.filter(([, v]) => Number.isFinite(v) && v > 0))
  const aligned: Point[] = []
  for (const d of dates) {
    const v = map.get(d)
    if (v !== undefined) aligned.push([d, v])
  }
  return aligned.length ? aligned : undefined
}

function todayFromHighsLows(row: Breadth): TodayReading | undefined {
  const hl = row.highsLows
  if (!hl || !Number.isFinite(hl.advancers) || !Number.isFinite(hl.decliners)) return undefined
  return {
    date: hl.date || row.date,
    advancers: hl.advancers,
    decliners: hl.decliners,
    unchanged: undefined,
    covered: hl.covered,
    total: row.total,
    net: hl.advancers - hl.decliners,
    advanceShare: advanceShare(hl.advancers, hl.decliners),
    fallback: true,
  }
}

function todayFromRow(row: AdvDecRow, total?: number): TodayReading {
  const [date, adv, dec, unch, covered] = row
  return {
    date, advancers: adv, decliners: dec, unchanged: unch, covered, total,
    net: adv - dec,
    advanceShare: advanceShare(adv, dec),
    fallback: false,
  }
}

/** Build display metrics for one universe; returns undefined when neither advDec nor highsLows exists. */
export function buildAdvDecMetrics(
  breadth: Breadth | undefined,
  indexHistory: readonly Point[] | undefined,
  asOf: string,
): AdvDecMetrics | undefined {
  if (!breadth) return undefined
  const rows = parseAdvDec(breadth.advDec)
  const historyReady = rows.length > 0
  const today = historyReady
    ? todayFromRow(rows.at(-1)!, breadth.total)
    : todayFromHighsLows(breadth)
  if (!today) return undefined

  // Only rows with defined advance share participate in the 10-day mean series.
  const definedShares = rows.flatMap(row => {
    const s = advanceShare(row[1], row[2])
    return s === undefined ? [] : [{ date: row[0], share: s }]
  })
  const shareSeries = definedShares.map(r => r.share)
  const means = rollingMean(shareSeries, AVG_WINDOW)
  const definedMeans = means.flatMap((m, i) => m === undefined ? [] : [{ date: definedShares[i]!.date, value: m }])
  const avg10Share = definedMeans.at(-1)?.value
  const avg10Percentile = avg10Share === undefined || definedMeans.length < 2
    ? undefined
    : percentileOf(definedMeans.map(m => m.value), avg10Share)

  const ranaPts: Point[] = []
  const ranaVals: number[] = []
  for (const [date, adv, dec] of rows) {
    const r = rana(adv, dec)
    if (r === undefined) continue
    ranaPts.push([date, r])
    ranaVals.push(r)
  }
  const osc = mcclellanOscillator(ranaVals)
  const mcclellanSeries: Array<[string, number | null]> = ranaPts.map(([date], i) => [date, osc[i] ?? null])
  const lastOsc = mcclellanSeries.at(-1)
  const mcclellanWarmup = !!lastOsc && lastOsc[1] === null
  const mcclellan = lastOsc && lastOsc[1] !== null ? lastOsc[1] : undefined
  const readyOsc = mcclellanSeries.filter(([, v]) => v !== null).map(([, v]) => v as number)
  const mcclellanPercentile = mcclellan === undefined || readyOsc.length < 2
    ? undefined
    : percentileOf(readyOsc, mcclellan)

  const cumulative = historyReady ? cumulativeNet(rows) : []
  const dailyNet = historyReady ? dailyNetPoints(rows) : []
  const dates = rows.map(([d]) => d)
  const index = alignIndex(indexHistory, dates)
  // For divergence, rebase index to the AD cumulative date span (aligned already).
  const readings = interpretBreadth({
    adLine: cumulative,
    index,
    avg10Share,
    avg10Percentile,
    historyReady,
  })

  const calendar = indexHistory?.map(([d]) => d)
  const stale = isStale(today.date, asOf, calendar)

  return {
    today,
    avg10Share,
    avg10Percentile,
    mcclellan,
    mcclellanPercentile,
    mcclellanWarmup,
    cumulative,
    dailyNet,
    ranaSeries: ranaPts,
    mcclellanSeries,
    readings,
    asOfDate: today.date,
    stale,
    historyReady,
  }
}

export const ADV_DEC_FOOTNOTE = '按当前成分股回算，含幸存者偏差；以收盘价计算，每个交易日收盘后更新。'
export const ADV_DEC_HISTORY_PENDING = '历史数据下次更新后显示'
export const MCCLELLAN_WARMUP_DAYS = MCCLELLAN_SLOW

/** Age in calendar days (for tests / diagnostics). */
export function calendarAgeDays(dataDate: string, asOf: string): number {
  return (Date.parse(asOf) - Date.parse(dataDate)) / DAY
}
