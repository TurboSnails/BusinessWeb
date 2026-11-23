import type { Backtest } from '../types'

export type TimelinePoint = Backtest['timeline'][number]
export type VisibleRange = { start: number; end: number }

export const CHART_LEFT = 64
export const CHART_RIGHT = 18
export const MIN_RANGE_SPAN = 11

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function normalizeRange(range: VisibleRange, total: number): VisibleRange {
  if (total <= 1) return { start: 0, end: Math.max(0, total - 1) }
  const minSpan = Math.min(MIN_RANGE_SPAN, total - 1)
  const span = clamp(Math.round(range.end - range.start), minSpan, total - 1)
  const start = clamp(Math.round(range.start), 0, total - 1 - span)
  return { start, end: start + span }
}

export function recentRange(total: number, months: number): VisibleRange {
  return normalizeRange({ start: total - months, end: total - 1 }, total)
}

export function panRange(range: VisibleRange, total: number, deltaMonths: number): VisibleRange {
  const span = range.end - range.start
  return normalizeRange({ start: range.start + deltaMonths, end: range.start + deltaMonths + span }, total)
}

export function zoomRange(
  range: VisibleRange,
  total: number,
  anchorRatio: number,
  factor: number,
): VisibleRange {
  const current = normalizeRange(range, total)
  const span = current.end - current.start
  const minSpan = Math.min(MIN_RANGE_SPAN, total - 1)
  const nextSpan = clamp(Math.round(span * factor), minSpan, total - 1)
  const ratio = clamp(anchorRatio, 0, 1)
  const anchor = current.start + ratio * span
  return normalizeRange({ start: anchor - ratio * nextSpan, end: anchor + (1 - ratio) * nextSpan }, total)
}

export function clientXToSvgX(svg: SVGSVGElement, clientX: number): number {
  const matrix = svg.getScreenCTM?.()
  if (matrix && typeof svg.createSVGPoint === 'function') {
    const point = svg.createSVGPoint()
    point.x = clientX
    point.y = 0
    return point.matrixTransform(matrix.inverse()).x
  }
  const box = svg.getBoundingClientRect()
  const viewBox = svg.viewBox.baseVal
  if (!box.width) return viewBox.x
  return viewBox.x + ((clientX - box.left) / box.width) * (viewBox.width || box.width)
}

export function indexFromClientX(
  svg: SVGSVGElement,
  clientX: number,
  range: VisibleRange,
  width: number,
): number {
  const svgX = clientXToSvgX(svg, clientX)
  const ratio = clamp((svgX - CHART_LEFT) / Math.max(1, width - CHART_LEFT - CHART_RIGHT), 0, 1)
  return Math.round(range.start + ratio * (range.end - range.start))
}

export function recessionWindows(pts: TimelinePoint[]): { key: string; label: string; range: VisibleRange }[] {
  const windows: { key: string; label: string; range: VisibleRange }[] = []
  let start = -1
  const append = (end: number): void => {
    if (start < 0 || end < start) return
    const from = Math.max(0, start - 24)
    const to = Math.min(pts.length - 1, end + 12)
    const range = normalizeRange({ start: from, end: to }, pts.length)
    windows.push({
      key: `${pts[start].d}_${pts[end].d}`,
      label: `${pts[start].d} — ${pts[end].d}`,
      range,
    })
  }
  pts.forEach((point, index) => {
    if (point.rec && start < 0) start = index
    if (!point.rec && start >= 0) {
      append(index - 1)
      start = -1
    }
  })
  append(pts.length - 1)
  return windows
}

export function logY(value: number, min: number, max: number, top: number, bottom: number): number {
  const lo = Math.log(min)
  const hi = Math.log(max)
  const ratio = (Math.log(value) - lo) / (hi - lo || 1)
  return top + (1 - ratio) * (bottom - top)
}

function niceStep(raw: number): number {
  const power = Math.pow(10, Math.floor(Math.log10(raw)))
  const unit = raw / power
  const nice = unit < 1.5 ? 1 : unit < 2.25 ? 2 : unit < 3.5 ? 2.5 : unit < 7.5 ? 5 : 10
  return nice * power
}

function thin(values: number[], maxTicks: number): number[] {
  if (values.length <= maxTicks) return values
  const step = Math.ceil(values.length / maxTicks)
  return values.filter((_, index) => index % step === 0)
}

/**
 * 对数纵轴刻度：跨度大时用 1-2-5 序列（100、200、500、1000…），
 * 跨度窄（如近几年）时退回等距整数刻度（4000、5000、6000…），保证都是整数且落在可见范围内。
 */
export function logTicks(min: number, max: number, maxTicks = 4): number[] {
  if (!(min > 0) || !(max > min)) return []
  const lo = min * 1.02
  const hi = max * 0.98
  const sequence: number[] = []
  for (let exponent = -2; exponent <= 7; exponent += 1) {
    for (const mantissa of [1, 2, 5]) sequence.push(mantissa * Math.pow(10, exponent))
  }
  const inside = sequence.filter(value => value > lo && value < hi)
  if (inside.length >= 3) return thin(inside, maxTicks)
  const step = niceStep((hi - lo) / Math.max(2, maxTicks - 1))
  const linear: number[] = []
  for (let value = Math.ceil(lo / step) * step; value < hi; value += step) {
    linear.push(Math.round(value * 100) / 100)
  }
  return thin(linear, maxTicks)
}

export type XTick = { index: number; label: string; mode: 'decade' | 'year' | 'quarter' }

const TICK_STEPS: Record<XTick['mode'], number[]> = {
  decade: [120, 240, 480],
  year: [12, 24, 60, 120],
  quarter: [3, 6, 12, 24],
}

/**
 * 横轴刻度：按可见跨度选年代 / 年 / 季度，再在该档里挑最小的、不会让文字重叠的步长；
 * 刻度对齐日历（年代对齐到 1980、1990…，季度对齐到 1、4、7、10 月），首尾端点总是标出。
 */
export function xTicks(pts: TimelinePoint[], range: VisibleRange, plotWidth: number): XTick[] {
  if (pts.length < 2 || range.end <= range.start) return []
  const span = range.end - range.start + 1
  const mode: XTick['mode'] = span > 240 ? 'decade' : span > 72 ? 'year' : 'quarter'
  const pxPerMonth = plotWidth / (range.end - range.start)
  const labelOf = (index: number, step: number): string => (
    step < 12 || mode === 'quarter' ? pts[index].d : pts[index].d.slice(0, 4)
  )
  const steps = TICK_STEPS[mode]
  const labelWidth = (step: number): number => (step < 12 || mode === 'quarter' ? 52 : 30)
  const step = steps.find(candidate => candidate * pxPerMonth >= labelWidth(candidate) + 16) ?? steps[steps.length - 1]
  const width = labelWidth(step)
  const endpointGap = (width * 1.5 + 8) / pxPerMonth
  const interior: XTick[] = []
  for (let index = range.start; index <= range.end; index += 1) {
    const year = Number(pts[index].d.slice(0, 4))
    const month = Number(pts[index].d.slice(5, 7))
    if ((year * 12 + month - 1) % step !== 0) continue
    if (index - range.start < endpointGap || range.end - index < endpointGap) continue
    interior.push({ index, label: labelOf(index, step), mode })
  }
  const endpoint = (index: number): XTick => ({ index, label: labelOf(index, step), mode })
  return [endpoint(range.start), ...interior, endpoint(range.end)]
}

export type TooltipPlacement = { left: number; top: number }

/**
 * 提示卡放在指针旁边、整个卡片留在图内，并且不盖住指针：
 * 依次尝试右下、左下、右上、左上；水平放不下时居中并放到指针上方或下方。
 */
export function placeTooltip(
  pointer: { x: number; y: number },
  card: { width: number; height: number },
  box: { width: number; height: number },
  gap = 14,
): TooltipPlacement {
  const fitsX = (left: number) => left >= 4 && left + card.width <= box.width - 4
  const fitsY = (top: number) => top >= 4 && top + card.height <= box.height - 4
  const right = pointer.x + gap
  const left = pointer.x - gap - card.width
  const below = pointer.y + gap
  const above = pointer.y - gap - card.height
  for (const [x, y] of [[right, below], [left, below], [right, above], [left, above]]) {
    if (fitsX(x) && fitsY(y)) return { left: x, top: y }
  }
  const sideX = fitsX(right) ? right : fitsX(left) ? left : null
  if (sideX !== null) {
    return { left: sideX, top: clamp(pointer.y - card.height / 2, 4, Math.max(4, box.height - card.height - 4)) }
  }
  const centeredX = clamp(pointer.x - card.width / 2, 4, Math.max(4, box.width - card.width - 4))
  const y = fitsY(above) ? above : fitsY(below) ? below : clamp(above, 4, Math.max(4, box.height - card.height - 4))
  return { left: centeredX, top: y }
}
