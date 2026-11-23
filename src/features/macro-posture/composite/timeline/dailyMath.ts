import type { DailyFile, TierCode, TierId } from '../types'
import { normalizeRange, type VisibleRange, type XTick } from './chartMath'

/** 图上统一使用的点：月度时间线与每日行都转换成这个形状。 */
export type ChartPoint = {
  d: string
  spx: number
  final: TierId | null
  regime: TierId | null
  rec: 0 | 1
  /** 只在每日数据里有：1 = 月末正式定档，0 = 月中预估 */
  official?: 0 | 1
}

export type DailyChange = DailyFile['changes'][number]

/** 与 TierCode 顺序一致：0 进攻 … 4 防守 */
export const TIER_BY_CODE: readonly TierId[] = ['offense', 'lean-offense', 'neutral', 'lean-defense', 'defense']

export function tierFromCode(code: TierCode | number | null | undefined): TierId | null {
  if (code == null || code < 0) return null
  return TIER_BY_CODE[code] ?? null
}

/** 每日行 → 图上的点；收盘价缺失或非正的行跳过（对数轴画不了）。 */
export function toDailyPoints(rows: DailyFile['rows']): ChartPoint[] {
  const points: ChartPoint[] = []
  for (const [d, close, regime, final, official, rec] of rows) {
    if (!(close > 0)) continue
    points.push({
      d,
      spx: close,
      regime: tierFromCode(regime),
      final: tierFromCode(final),
      official: official ? 1 : 0,
      rec: rec ? 1 : 0,
    })
  }
  return points
}

export function changesByDate(changes: DailyChange[]): Map<string, DailyChange[]> {
  const map = new Map<string, DailyChange[]>()
  for (const change of changes) {
    const list = map.get(change.d)
    if (list) list.push(change)
    else map.set(change.d, [change])
  }
  return map
}

/** 第一个日期 ≥ target 的下标（二分查找）；全部更早时返回 length。 */
export function lowerBoundDate(points: readonly { d: string }[], target: string): number {
  let lo = 0
  let hi = points.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (points[mid].d < target) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** 不晚于 target 的最近一个交易日（周末、节假日退回到前一个交易日）；早于首日时返回 0。 */
export function indexAtOrBefore(points: readonly { d: string }[], target: string): number {
  if (!points.length) return 0
  const lower = lowerBoundDate(points, target)
  if (lower < points.length && points[lower].d === target) return lower
  return Math.max(0, lower - 1)
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** 日期（YYYY-MM-DD）按自然月平移，月底日期收在目标月最后一天。 */
export function shiftMonths(date: string, months: number): string {
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  const day = Number(date.slice(8, 10)) || 1
  const total = year * 12 + (month - 1) + months
  const nextYear = Math.floor(total / 12)
  const nextMonth = (total % 12 + 12) % 12 + 1
  const nextDay = Math.min(day, daysInMonth(nextYear, nextMonth))
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`
}

/**
 * 键盘「一个月 / 一年」跳转：按日历平移后找最近的交易日。
 * 往回跳取不晚于目标日的交易日，往前跳取不早于目标日的交易日，保证至少移动一格。
 */
export function stepByMonths(points: readonly { d: string }[], index: number, months: number): number {
  if (!points.length) return 0
  const target = shiftMonths(points[index].d, months)
  const next = months < 0
    ? indexAtOrBefore(points, target)
    : Math.min(points.length - 1, lowerBoundDate(points, target))
  if (next === index && months !== 0) return Math.max(0, Math.min(points.length - 1, index + Math.sign(months)))
  return next
}

export const DAILY_MIN_SPAN = 4

/** 最近 N 个自然月：从「最新日往前 N 个月」当天或之后的第一个交易日到最新日。 */
export function recentMonthsRange(points: readonly { d: string }[], months: number | null, minSpan = DAILY_MIN_SPAN): VisibleRange {
  const total = points.length
  if (total < 2) return { start: 0, end: Math.max(0, total - 1) }
  if (months === null) return normalizeRange({ start: 0, end: total - 1 }, total, minSpan)
  const start = lowerBoundDate(points, shiftMonths(points[total - 1].d, -months))
  return normalizeRange({ start, end: total - 1 }, total, minSpan)
}

/** 本月：最新日所在自然月的第一个交易日到最新日（月初只有几天时按最小跨度补足）。 */
export function currentMonthRange(points: readonly { d: string }[], minSpan = DAILY_MIN_SPAN): VisibleRange {
  const total = points.length
  if (total < 2) return { start: 0, end: Math.max(0, total - 1) }
  const start = lowerBoundDate(points, `${points[total - 1].d.slice(0, 7)}-01`)
  return normalizeRange({ start, end: total - 1 }, total, minSpan)
}

export type Segment<T> = { start: number; end: number; value: T }

/** 连续相同取值合并成区段，图上一个区段只画一个矩形。 */
export function mergeRuns<T>(points: readonly ChartPoint[], pick: (point: ChartPoint) => T): Segment<T>[] {
  const segments: Segment<T>[] = []
  for (let index = 0; index < points.length; index += 1) {
    const value = pick(points[index])
    const last = segments[segments.length - 1]
    if (last && last.value === value && last.end === index - 1) last.end = index
    else segments.push({ start: index, end: index, value })
  }
  return segments
}

/** 可见区间内的区段（二分找到第一个与区间相交的区段）。 */
export function segmentsInRange<T>(segments: readonly Segment<T>[], range: VisibleRange): Segment<T>[] {
  let lo = 0
  let hi = segments.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (segments[mid].end < range.start) lo = mid + 1
    else hi = mid
  }
  const out: Segment<T>[] = []
  for (let index = lo; index < segments.length && segments[index].start <= range.end; index += 1) {
    out.push(segments[index])
  }
  return out
}

/**
 * 按像素抽稀：可见点数超过「两倍像素列数」时，每一列只保留该列的最高点与最低点（按时间顺序），
 * 首尾两点总是保留。这样缩小时线的包络（包括每次急跌的最低点）不丢，点数与宽度成正比。
 */
export function decimateMinMax(values: ArrayLike<number>, range: VisibleRange, columns: number): number[] {
  const { start, end } = range
  const count = end - start + 1
  const buckets = Math.max(1, Math.floor(columns))
  if (count <= 0) return []
  if (count <= buckets * 2) {
    return Array.from({ length: count }, (_, offset) => start + offset)
  }
  const out: number[] = [start]
  const perBucket = count / buckets
  for (let bucket = 0; bucket < buckets; bucket += 1) {
    const from = start + Math.floor(bucket * perBucket)
    const to = Math.min(end, start + Math.floor((bucket + 1) * perBucket) - 1)
    if (to < from) continue
    let minIndex = from
    let maxIndex = from
    for (let index = from + 1; index <= to; index += 1) {
      if (values[index] < values[minIndex]) minIndex = index
      if (values[index] > values[maxIndex]) maxIndex = index
    }
    const first = Math.min(minIndex, maxIndex)
    const second = Math.max(minIndex, maxIndex)
    if (first !== out[out.length - 1]) out.push(first)
    if (second !== first) out.push(second)
  }
  if (out[out.length - 1] !== end) out.push(end)
  return out
}

/** 每个自然月第一个交易日的下标，用于横轴刻度。 */
export function monthStartIndices(points: readonly { d: string }[]): number[] {
  const out: number[] = []
  for (let index = 0; index < points.length; index += 1) {
    if (index === 0 || points[index].d.slice(0, 7) !== points[index - 1].d.slice(0, 7)) out.push(index)
  }
  return out
}

type DailyTickStep = { kind: 'day' | 'month'; step: number; width: number }

const DAILY_TICK_STEPS: DailyTickStep[] = [
  { kind: 'day', step: 1, width: 40 },
  { kind: 'day', step: 2, width: 40 },
  { kind: 'day', step: 5, width: 40 },
  { kind: 'day', step: 10, width: 40 },
  { kind: 'month', step: 1, width: 56 },
  { kind: 'month', step: 3, width: 56 },
  { kind: 'month', step: 6, width: 56 },
  { kind: 'month', step: 12, width: 32 },
  { kind: 'month', step: 24, width: 32 },
  { kind: 'month', step: 60, width: 32 },
  { kind: 'month', step: 120, width: 32 },
  { kind: 'month', step: 240, width: 32 },
  { kind: 'month', step: 480, width: 32 },
]

/** 平均每月约 21 个交易日，用于估算月度刻度的像素间距。 */
const TRADING_DAYS_PER_MONTH = 21

/**
 * 每日横轴刻度：从最细（逐日）到最粗（40 年）挑第一个文字不重叠的步长。
 * 逐日档按交易日下标对齐（平移时刻度不跳动）、标「月-日」；月度档对齐到自然月（季度对齐 1、4、7、10 月）。
 */
export function dailyXTicks(
  points: readonly { d: string }[],
  monthStarts: readonly number[],
  range: VisibleRange,
  plotWidth: number,
): XTick[] {
  if (points.length < 2 || range.end <= range.start) return []
  const pxPerDay = plotWidth / (range.end - range.start)
  const choice = DAILY_TICK_STEPS.find(candidate => {
    const spacing = candidate.kind === 'day'
      ? candidate.step * pxPerDay
      : candidate.step * TRADING_DAYS_PER_MONTH * pxPerDay
    return spacing >= candidate.width + 16
  }) ?? DAILY_TICK_STEPS[DAILY_TICK_STEPS.length - 1]
  const mode: XTick['mode'] = choice.kind === 'day' ? 'day' : choice.step >= 12 ? 'year' : 'month'
  const interiorLabel = (index: number): string => {
    const d = points[index].d
    if (mode === 'day') return d.slice(5)
    if (mode === 'month') return d.slice(0, 7)
    return d.slice(0, 4)
  }
  // 首尾端点：逐日与月度档写完整日期；年度档在跨度不足 10 年时写到月，避免与内部年份刻度重名。
  const longSpan = Number(points[range.end].d.slice(0, 4)) - Number(points[range.start].d.slice(0, 4)) >= 10
  const endpointLabel = (index: number): string => {
    const d = points[index].d
    if (mode === 'day' || mode === 'month') return d
    return longSpan ? d.slice(0, 4) : d.slice(0, 7)
  }
  const endpointWidth = mode === 'year' ? (longSpan ? 32 : 56) : 76
  const endpointGap = (endpointWidth + choice.width / 2 + 8) / pxPerDay
  const startLabel = endpointLabel(range.start)
  const endLabel = endpointLabel(range.end)
  const interior: XTick[] = []
  const keep = (index: number): boolean => {
    if (index - range.start < endpointGap || range.end - index < endpointGap) return false
    const label = interiorLabel(index)
    return label !== startLabel && label !== endLabel
  }
  if (choice.kind === 'day') {
    const first = Math.ceil(range.start / choice.step) * choice.step
    for (let index = first; index <= range.end; index += choice.step) {
      if (keep(index)) interior.push({ index, label: interiorLabel(index), mode })
    }
  } else {
    let lo = 0
    let hi = monthStarts.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (monthStarts[mid] < range.start) lo = mid + 1
      else hi = mid
    }
    for (let k = lo; k < monthStarts.length && monthStarts[k] <= range.end; k += 1) {
      const index = monthStarts[k]
      const d = points[index].d
      const monthNumber = Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)) - 1
      if (monthNumber % choice.step !== 0) continue
      if (keep(index)) interior.push({ index, label: interiorLabel(index), mode })
    }
  }
  return [
    { index: range.start, label: startLabel, mode },
    ...interior,
    { index: range.end, label: endLabel, mode },
  ]
}

/** 每日数据的衰退下拉：衰退起点前 24 个月到结束后 12 个月。 */
export function dailyRecessionWindows(points: readonly ChartPoint[], minSpan = DAILY_MIN_SPAN): { key: string; label: string; range: VisibleRange }[] {
  const total = points.length
  return mergeRuns(points, point => point.rec)
    .filter(segment => segment.value === 1)
    .map(segment => {
      const first = points[segment.start].d
      const last = points[segment.end].d
      const from = lowerBoundDate(points, shiftMonths(first, -24))
      const to = Math.max(from, indexAtOrBefore(points, shiftMonths(last, 12)))
      return {
        key: `${first}_${last}`,
        label: `${first.slice(0, 7)} — ${last.slice(0, 7)}`,
        range: normalizeRange({ start: from, end: Math.min(total - 1, to) }, total, minSpan),
      }
    })
}

/** 「最新 · 11 月 20 日」 */
export function latestDayLabel(date: string): string {
  const month = Number(date.slice(5, 7))
  const day = Number(date.slice(8, 10))
  return `最新 · ${month} 月 ${day} 日`
}

/** SVG 文字近似宽度：汉字按 12px、其余按 7px。 */
export function approxTextWidth(text: string): number {
  let width = 0
  for (const char of text) width += char.charCodeAt(0) > 0x2e80 ? 12 : 7
  return width
}
