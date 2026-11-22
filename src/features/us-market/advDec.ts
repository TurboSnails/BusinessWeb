import type { Breadth, Point } from './model'
import { percentileOf } from './explain'
import { nyseSessionsOnOrBefore } from './tradingCalendar'

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
  /** True when ≥ AVG10_SAMPLE_MIN continuous 10-day means exist for percentile / 普涨普跌. */
  avg10SampleReady: boolean
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
/** Minimum valid continuous 10-day means before percentile / 短期普涨普跌. */
export const AVG10_SAMPLE_MIN = 120
/** Days with covered/total below this are treated as missing in breadth history. */
export const COVERAGE_MIN = 0.95

export const BOTH_AT_HIGHS_READING = '指数与涨跌线同步创新高，上涨参与度较广。'
export const NARROWING_READING = '指数近 20 日创新高，但涨跌线没有同步创新高，参与度在变窄。'
export const SAMPLE_INSUFFICIENT = '历史样本不足，暂不判读'
export const AVG10_INCOMPLETE = '最近 10 个交易日数据不完整，暂不判读'

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

/**
 * 10-day means that only use windows where every NYSE session in the window has data.
 * Does not stitch across missing days.
 */
export function continuousRollingMeans(
  points: readonly { date: string; share: number }[],
  window: number = AVG_WINDOW,
  now: Date = new Date(),
): Array<{ date: string; value: number }> {
  if (window < 1 || points.length < window) return []
  const byDate = new Map(points.map(p => [p.date, p.share]))
  const out: Array<{ date: string; value: number }> = []
  for (const { date } of points) {
    const sessions = nyseSessionsOnOrBefore(date, window, now)
    if (sessions.length < window || sessions.at(-1) !== date) continue
    let sum = 0
    let ok = true
    for (const d of sessions) {
      const s = byDate.get(d)
      if (s === undefined) { ok = false; break }
      sum += s
    }
    if (ok) out.push({ date, value: sum / window })
  }
  return out
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

/** Pair AD line with index on shared dates; undefined if latest AD date lacks index. */
export function commonSeries(
  adLine: readonly Point[],
  index: readonly Point[] | undefined,
): { ad: Point[]; index: Point[] } | undefined {
  if (!adLine.length || !index?.length) return undefined
  const map = new Map(index.filter(([, v]) => Number.isFinite(v) && v > 0))
  const ad: Point[] = []
  const ix: Point[] = []
  for (const [date, value] of adLine) {
    const iv = map.get(date)
    if (iv === undefined) continue
    ad.push([date, value])
    ix.push([date, iv])
  }
  if (!ad.length) return undefined
  // Latest breadth day must have a matching index print — otherwise disable signals.
  if (ad.at(-1)![0] !== adLine.at(-1)![0]) return undefined
  return { ad, index: ix }
}

/** Index and AD line both at series highs (same direction), on common dates. */
export function bothAtHighs(adLine: readonly Point[], index: readonly Point[]): boolean {
  const paired = commonSeries(adLine, index)
  if (!paired || paired.ad.length < 2) return false
  const adLast = paired.ad.at(-1)![1]
  const ixLast = paired.index.at(-1)![1]
  const adHi = Math.max(...paired.ad.map(([, v]) => v))
  const ixHi = Math.max(...paired.index.map(([, v]) => v))
  return adLast >= adHi && ixLast >= ixHi
}

/** Index at a 20-session high while AD line is not (common dates, same anchor). */
export function narrowingDivergence(
  adLine: readonly Point[],
  index: readonly Point[],
  lookback = DIVERGENCE_LOOKBACK,
): boolean {
  const paired = commonSeries(adLine, index)
  if (!paired || paired.ad.length < lookback) return false
  const n = lookback
  const ixWindow = paired.index.slice(-n)
  const adWindow = paired.ad.slice(-n)
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
  avg10SampleReady: boolean
  historyReady: boolean
}): string[] {
  const out: string[] = []
  if (!opts.historyReady) return out
  if (opts.index?.length) {
    if (bothAtHighs(opts.adLine, opts.index)) out.push(BOTH_AT_HIGHS_READING)
    else if (narrowingDivergence(opts.adLine, opts.index)) out.push(NARROWING_READING)
  }
  if (opts.avg10SampleReady && opts.avg10Percentile !== undefined && opts.avg10Share !== undefined) {
    if (opts.avg10Percentile >= 90) {
      out.push(opts.avg10Share >= 0.55 - Number.EPSILON ? '短期普涨，热度偏高。' : '相对过去一年偏强。')
    } else if (opts.avg10Percentile <= 10) {
      out.push(opts.avg10Share <= 0.45 + Number.EPSILON ? '短期普跌，情绪偏冷。' : '相对过去一年偏弱。')
    }
  }
  return out
}

/** @deprecated Prefer nyseSessionsOnOrBefore — kept for callers/tests that only need weekdays. */
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
 * Stale when data lags the latest completed NYSE session on/before asOf by more
 * than one trading day. Uses NYSE holidays and the session-specific ET cutoff.
 */
export function isStale(dataDate: string, asOf: string, now: Date = new Date()): boolean {
  if (!dataDate || !asOf || dataDate > asOf) return false
  const sessions = nyseSessionsOnOrBefore(asOf, 8, now)
  if (!sessions.length) return false
  const prior = sessions.length >= 2 ? sessions.at(-2)! : sessions.at(-1)!
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

function rowCoverageOk(covered: number, total: number | undefined): boolean {
  if (total === undefined || !(total > 0)) return true
  return covered / total >= COVERAGE_MIN
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
  now: Date = new Date(),
): AdvDecMetrics | undefined {
  if (!breadth) return undefined
  const observations = parseAdvDec(breadth.advDec)
  const latestRowDate = observations.at(-1)?.[0] ?? ''
  const latestObservation = breadth.date && breadth.date > latestRowDate ? breadth.date : latestRowDate
  const rows = observations.filter(row => rowCoverageOk(row[4], breadth.total))
  const historyReady = rows.length > 0
  const today = historyReady
    ? todayFromRow(rows.at(-1)!, breadth.total)
    : todayFromHighsLows(breadth)
  if (!today) return undefined

  const definedShares = rows.flatMap(row => {
    const s = advanceShare(row[1], row[2])
    return s === undefined ? [] : [{ date: row[0], share: s }]
  })
  const yearAgo = new Date(`${latestObservation}T00:00:00Z`)
  yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1)
  const definedMeans = continuousRollingMeans(definedShares, AVG_WINDOW, now)
    .filter(mean => Date.parse(mean.date) >= yearAgo.getTime())
  const latestMean = definedMeans.at(-1)
  const avg10Share = latestMean?.date === latestObservation ? latestMean.value : undefined
  const avg10SampleReady = avg10Share !== undefined && definedMeans.length >= AVG10_SAMPLE_MIN
  const avg10Percentile = !avg10SampleReady || avg10Share === undefined
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
  const paired = commonSeries(cumulative, index)
  const readings = interpretBreadth({
    adLine: cumulative,
    index: paired?.index,
    avg10Share,
    avg10Percentile,
    avg10SampleReady,
    historyReady,
  })

  const stale = isStale(today.date, asOf, now)

  return {
    today,
    avg10Share,
    avg10Percentile,
    avg10SampleReady,
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
