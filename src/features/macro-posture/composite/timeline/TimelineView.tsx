import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { TierId } from '../types'
import {
  CHART_LEFT,
  CHART_RIGHT,
  MIN_RANGE_SPAN,
  clamp,
  clientXToSvgX,
  indexFromClientX,
  logTicks,
  logY,
  normalizeRange,
  panRange,
  placeTooltip,
  recentRange,
  recessionWindows,
  xTicks,
  zoomRange,
  type VisibleRange,
} from './chartMath'
import {
  DAILY_MIN_SPAN,
  approxTextWidth,
  currentMonthRange,
  dailyRecessionWindows,
  dailyXTicks,
  decimateMinMax,
  indexAtOrBefore,
  latestDayLabel,
  lowerBoundDate,
  mergeRuns,
  monthStartIndices,
  recentMonthsRange,
  segmentsInRange,
  stepByMonths,
  tierFromCode,
  type ChartPoint,
  type DailyChange,
  type Segment,
} from './dailyMath'

const TOP = 18
const BOTTOM = 32
const BAND_AREA = 78
const BAND_HEIGHT = 24
const OVERVIEW_HEIGHT = 96

const TIER_LABEL: Record<TierId, string> = {
  offense: '进攻',
  'lean-offense': '偏进攻',
  neutral: '中性',
  'lean-defense': '偏防守',
  defense: '防守',
}

const LEGEND_TIERS: TierId[] = ['defense', 'lean-defense', 'neutral', 'lean-offense', 'offense']

export type TimelineMode = 'day' | 'month'

type Preset = { label: string; months: number | null | 'this-month' }

const MONTH_PRESETS: Preset[] = [
  { label: '全部', months: null },
  { label: '近 30 年', months: 360 },
  { label: '近 10 年', months: 120 },
  { label: '近 5 年', months: 60 },
  { label: '近 2 年', months: 24 },
]

const DAY_PRESETS: Preset[] = [
  { label: '全部', months: null },
  { label: '近 30 年', months: 360 },
  { label: '近 10 年', months: 120 },
  { label: '近 5 年', months: 60 },
  { label: '近 3 年', months: 36 },
  { label: '近 2 年', months: 24 },
  { label: '近 1 年', months: 12 },
  { label: '近 3 个月', months: 3 },
  { label: '本月', months: 'this-month' },
]

const DEFAULT_PRESET: Record<TimelineMode, string> = { day: '近 3 年', month: '全部' }
const NO_CHANGES: DailyChange[] = []

type TooltipState = {
  index: number
  x: number
  y: number
  boxWidth: number
  boxHeight: number
}

type MainDrag = {
  pointerId: number
  startClientX: number
  startRange: VisibleRange
  moved: boolean
}

type PinchState = {
  startDistance: number
  startRange: VisibleRange
  anchorRatio: number
}

type OverviewDrag = {
  pointerId: number
  mode: 'move' | 'start' | 'end'
  startClientX: number
  startRange: VisibleRange
}

function tierLabel(tier: TierId | null): string {
  return tier ? TIER_LABEL[tier] : '证据不足'
}

function changeTierLabel(code: number): string {
  return tierLabel(tierFromCode(code))
}

function pointerDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function formatPrice(value: number, mode: TimelineMode): string {
  return mode === 'day'
    ? value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : value.toLocaleString('zh-CN')
}

function presetRange(preset: Preset, points: readonly ChartPoint[], mode: TimelineMode): VisibleRange {
  const total = points.length
  if (mode === 'month') {
    return recentRange(total, typeof preset.months === 'number' ? preset.months : total)
  }
  if (preset.months === 'this-month') return currentMonthRange(points)
  return recentMonthsRange(points, preset.months)
}

/**
 * 图上文案。上带画 point.final，下带画 point.regime；不传时沿用宏观攻守的默认文案。
 * recession 为 null 时不画衰退图例与「衰退前后」选择（数据里没有衰退信息时用）。
 */
export type TimelineLabels = {
  /** SVG 标题（读屏） */
  title: string
  /** 上带名称（色带左侧标注、说明文字） */
  top: string
  /** 下带名称 */
  bottom: string
  /** 图例里的色带说明 */
  legendNote: string
  /** 提示卡与读数里上带的名称 */
  tooltipTop: string
  /** 提示卡与读数里下带的名称 */
  tooltipBottom: string
  /** 衰退阴影图例；null = 没有衰退数据，不画图例与衰退选择 */
  recession: string | null
}

/** 提示卡与读数里追加的一行（放在档位之后、衰退期之前）。 */
export type TimelineDetailRow = {
  label: string
  value: string
  /** 写进图下方读数的短句；不传则读数里不出现 */
  caption?: string
}

function defaultLabels(mode: TimelineMode): TimelineLabels {
  const isDay = mode === 'day'
  return {
    title: isDay ? '标普每日收盘对数走势、每日最终档位与周期档位' : '标普月均价对数走势、最终档位与周期档位',
    top: '最终档位',
    bottom: '周期档位',
    legendNote: isDay
      ? '上带「最终档位」含战术修正与修复确认；下带「周期档位」只看经济周期。每天按当天已发布的数据定档，月中为预估、月末为正式定档；色带上方的小三角是档位变化日'
      : '上带「最终档位」含战术修正与修复确认；下带「周期档位」只看经济周期',
    tooltipTop: '最终档位',
    tooltipBottom: '周期档位',
    recession: '灰色阴影为美国官方认定的衰退期（NBER）',
  }
}

function changeText(change: DailyChange, labels: TimelineLabels): string {
  const layer = change.layer === 'final' ? labels.tooltipTop : labels.tooltipBottom
  return `${layer}：${changeTierLabel(change.from)} → ${changeTierLabel(change.to)}。${change.reason}`
}

const NO_DETAILS = (): TimelineDetailRow[] => []

type Props = {
  mode: TimelineMode
  points: ChartPoint[]
  /** 每日模式：档位变化日 → 变化原因 */
  changes?: DailyChange[]
  /** 自定义文案；未传的键沿用默认 */
  labels?: Partial<TimelineLabels>
  /** 默认区间按钮名称（如「近 10 年」）；不传时每日「近 3 年」、月度「全部」 */
  defaultPreset?: string
  /** 提示卡与读数里追加的行 */
  details?: (point: ChartPoint) => TimelineDetailRow[]
}

export default function TimelineView({
  mode,
  points: rawPoints,
  changes = NO_CHANGES,
  labels: labelOverrides,
  defaultPreset,
  details = NO_DETAILS,
}: Props): JSX.Element | null {
  const isDay = mode === 'day'
  const minSpan = isDay ? DAILY_MIN_SPAN : MIN_RANGE_SPAN
  const presets = isDay ? DAY_PRESETS : MONTH_PRESETS
  const labels: TimelineLabels = { ...defaultLabels(mode), ...labelOverrides }
  const defaultPresetLabel = defaultPreset ?? DEFAULT_PRESET[mode]
  const labelId = useId()
  const descriptionId = useId()
  const clipId = useId()
  const overviewClipId = useId()
  const dateHintId = useId()
  const dateInputId = useId()
  const chartRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const overviewRef = useRef<SVGSVGElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const mainFrameRef = useRef<number | null>(null)
  const mainPendingRef = useRef<(() => void) | null>(null)
  const overviewFrameRef = useRef<number | null>(null)
  const overviewPendingRef = useRef<(() => void) | null>(null)
  const mainDragRef = useRef<MainDrag | null>(null)
  const overviewDragRef = useRef<OverviewDrag | null>(null)
  const touchPointersRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = useRef<PinchState | null>(null)
  // 触控板一次只给几像素的增量，累积到至少移动一格再生效。
  const wheelAccumRef = useRef({ zoom: 0, pan: 0 })
  const pts = useMemo(() => rawPoints.filter(row => row.spx > 0), [rawPoints])
  const total = pts.length
  const prices = useMemo(() => Float64Array.from(pts, point => point.spx), [pts])
  const defaultRange = useMemo(() => {
    const preset = presets.find(item => item.label === defaultPresetLabel) ?? presets[0]
    return presetRange(preset, pts, mode)
  }, [presets, pts, mode, defaultPresetLabel])
  const [size, setSize] = useState(() => ({
    width: 640,
    height: typeof window !== 'undefined' && window.innerWidth <= 560 ? 300 : 380,
  }))
  const [range, setRange] = useState<VisibleRange>(defaultRange)
  const [index, setIndex] = useState(() => Math.max(0, total - 1))
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [dragging, setDragging] = useState(false)
  const [recessionKey, setRecessionKey] = useState('')
  const [dateDraft, setDateDraft] = useState<string | null>(null)
  const safeRange = normalizeRange(range, total, minSpan)
  const safeIndex = clamp(index, 0, Math.max(0, total - 1))
  const rangeRef = useRef(safeRange)
  rangeRef.current = safeRange
  const width = size.width
  const height = size.height
  const plotWidth = Math.max(1, width - CHART_LEFT - CHART_RIGHT)
  const plotBottom = height - BOTTOM - BAND_AREA
  const finalBandY = plotBottom + 8
  const regimeBandY = finalBandY + 32
  const rangeStart = safeRange.start
  const rangeEnd = safeRange.end
  const visibleCount = Math.max(0, rangeEnd - rangeStart + 1)
  const shown = pts[safeIndex] as ChartPoint | undefined
  const windows = useMemo(
    () => (isDay ? dailyRecessionWindows(pts) : recessionWindows(pts)),
    [isDay, pts],
  )
  const monthStarts = useMemo(() => (isDay ? monthStartIndices(pts) : []), [isDay, pts])
  const changeMap = useMemo(() => {
    const map = new Map<string, DailyChange[]>()
    for (const change of changes) {
      const list = map.get(change.d)
      if (list) list.push(change)
      else map.set(change.d, [change])
    }
    return map
  }, [changes])
  const changeMarks = useMemo(() => {
    const marks: { index: number; layer: DailyChange['layer'] }[] = []
    for (const change of changes) {
      const at = lowerBoundDate(pts, change.d)
      if (at < pts.length && pts[at].d === change.d) marks.push({ index: at, layer: change.layer })
    }
    return marks.sort((a, b) => a.index - b.index)
  }, [changes, pts])
  const finalSegments = useMemo(() => mergeRuns(pts, point => point.final), [pts])
  const regimeSegments = useMemo(() => mergeRuns(pts, point => point.regime), [pts])
  const recessionSegments = useMemo(
    () => mergeRuns(pts, point => point.rec).filter(segment => segment.value === 1),
    [pts],
  )

  const applyRange = useCallback((next: VisibleRange, selectedRecession = ''): void => {
    const normalized = normalizeRange(next, total, minSpan)
    rangeRef.current = normalized
    setRange(normalized)
    setRecessionKey(selectedRecession)
    setIndex(current => clamp(current, normalized.start, normalized.end))
  }, [total, minSpan])

  const reset = useCallback((): void => {
    rangeRef.current = defaultRange
    setRange(defaultRange)
    setIndex(Math.max(0, total - 1))
    setTooltip(null)
    setRecessionKey('')
    setDateDraft(null)
  }, [defaultRange, total])

  useEffect(() => {
    reset()
  }, [pts, reset])

  useEffect(() => {
    const element = chartRef.current
    if (!element) return
    const measure = (): void => {
      const measured = element.clientWidth || element.getBoundingClientRect().width
      if (measured <= 0) return
      const nextWidth = Math.round(measured)
      setSize(current => {
        const nextHeight = nextWidth <= 560 ? 300 : 380
        return current.width === nextWidth && current.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight }
      })
    }
    measure()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    observer?.observe(element)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  // 提示卡位置用 ref 写入（站内禁止 JSX 内联样式）。
  useLayoutEffect(() => {
    const element = tooltipRef.current
    if (!element || !tooltip) return
    const placement = placeTooltip(
      { x: tooltip.x, y: tooltip.y },
      { width: element.offsetWidth, height: element.offsetHeight },
      { width: tooltip.boxWidth, height: tooltip.boxHeight },
    )
    element.style.left = `${placement.left}px`
    element.style.top = `${placement.top}px`
  }, [tooltip])

  useEffect(() => () => {
    if (mainFrameRef.current !== null) cancelAnimationFrame(mainFrameRef.current)
    if (overviewFrameRef.current !== null) cancelAnimationFrame(overviewFrameRef.current)
  }, [])

  const scheduleMain = useCallback((work: () => void): void => {
    mainPendingRef.current = work
    if (mainFrameRef.current !== null) return
    mainFrameRef.current = requestAnimationFrame(() => {
      mainFrameRef.current = null
      const pending = mainPendingRef.current
      mainPendingRef.current = null
      pending?.()
    })
  }, [])

  const scheduleOverview = useCallback((work: () => void): void => {
    overviewPendingRef.current = work
    if (overviewFrameRef.current !== null) return
    overviewFrameRef.current = requestAnimationFrame(() => {
      overviewFrameRef.current = null
      const pending = overviewPendingRef.current
      overviewPendingRef.current = null
      pending?.()
    })
  }, [])

  const priceDomain = useMemo(() => {
    if (visibleCount <= 0) return { min: 1, max: 2 }
    let min = Infinity
    let max = -Infinity
    for (let i = rangeStart; i <= rangeEnd; i += 1) {
      const value = prices[i]
      if (value < min) min = value
      if (value > max) max = value
    }
    return { min: Math.max(min * 0.92, 1e-6), max: max * 1.05 }
  }, [prices, rangeStart, rangeEnd, visibleCount])
  const yTickLimit = Math.max(3, Math.min(6, Math.floor((plotBottom - TOP) / 40)))
  const yTicks = useMemo(
    () => logTicks(priceDomain.min, priceDomain.max, yTickLimit),
    [priceDomain, yTickLimit],
  )
  const ticks = useMemo(
    () => (isDay
      ? dailyXTicks(pts, monthStarts, { start: rangeStart, end: rangeEnd }, plotWidth)
      : xTicks(pts, { start: rangeStart, end: rangeEnd }, plotWidth)),
    [isDay, pts, monthStarts, rangeStart, rangeEnd, plotWidth],
  )
  const spanDenominator = Math.max(1, rangeEnd - rangeStart)
  const x = useCallback((pointIndex: number): number => (
    CHART_LEFT + ((pointIndex - rangeStart) / spanDenominator) * plotWidth
  ), [rangeStart, spanDenominator, plotWidth])
  const yPrice = useCallback((value: number): number => (
    logY(value, priceDomain.min, priceDomain.max, TOP, plotBottom)
  ), [priceDomain, plotBottom])

  // 价格线：可见点多于像素列的两倍时按列抽稀（每列保留最高与最低）。
  const linePoints = useMemo(
    () => decimateMinMax(prices, { start: rangeStart, end: rangeEnd }, plotWidth),
    [prices, rangeStart, rangeEnd, plotWidth],
  )
  const path = useMemo(() => linePoints.map((pointIndex, offset) => (
    `${offset ? 'L' : 'M'}${x(pointIndex).toFixed(2)},${yPrice(prices[pointIndex]).toFixed(2)}`
  )).join(''), [linePoints, x, yPrice, prices])

  const bandStep = plotWidth / spanDenominator
  const segmentRect = useCallback((segment: Segment<unknown>): { x: number; width: number } => {
    const x0 = x(segment.start) - bandStep / 2
    const x1 = x(segment.end) + bandStep / 2
    return { x: x0, width: Math.max(0.5, x1 - x0 + 0.25) }
  }, [x, bandStep])

  const visibleFinal = useMemo(
    () => segmentsInRange(finalSegments, { start: rangeStart, end: rangeEnd }),
    [finalSegments, rangeStart, rangeEnd],
  )
  const visibleRegime = useMemo(
    () => segmentsInRange(regimeSegments, { start: rangeStart, end: rangeEnd }),
    [regimeSegments, rangeStart, rangeEnd],
  )
  const plotLayer = useMemo(() => (
    <>
      {segmentsInRange(recessionSegments, { start: rangeStart, end: rangeEnd }).map(segment => {
        const rect = segmentRect(segment)
        return (
          <rect
            key={`rec-${segment.start}`}
            className="mp-timeline__recession"
            x={rect.x}
            y={TOP}
            width={Math.max(1, rect.width)}
            height={height - BOTTOM - TOP}
          />
        )
      })}
      {visibleFinal.map(segment => {
        const rect = segmentRect(segment)
        return (
          <rect
            key={`final-${segment.start}`}
            className={`mp-timeline__band${segment.value ? ` mp-timeline__band--${segment.value}` : ''}`}
            data-band="final"
            x={rect.x}
            y={finalBandY}
            width={rect.width}
            height={BAND_HEIGHT}
          />
        )
      })}
      {visibleRegime.map(segment => {
        const rect = segmentRect(segment)
        return (
          <rect
            key={`regime-${segment.start}`}
            className={`mp-timeline__band${segment.value ? ` mp-timeline__band--${segment.value}` : ''}`}
            data-band="regime"
            x={rect.x}
            y={regimeBandY}
            width={rect.width}
            height={BAND_HEIGHT}
          />
        )
      })}
    </>
  ), [recessionSegments, visibleFinal, visibleRegime, rangeStart, rangeEnd, segmentRect, height, finalBandY, regimeBandY])

  // 档位变化日：色带上方的小三角，同一像素只画一个；每层最近一次变化加重显示。
  const changeTicks = useMemo(() => {
    if (!isDay || !changeMarks.length) return []
    const lastByLayer = new Map<DailyChange['layer'], number>()
    for (const mark of changeMarks) lastByLayer.set(mark.layer, mark.index)
    const lastX = new Map<DailyChange['layer'], number>()
    const out: { key: string; x: number; y: number; layer: DailyChange['layer']; latest: boolean }[] = []
    for (const mark of changeMarks) {
      if (mark.index < rangeStart || mark.index > rangeEnd) continue
      const markX = x(mark.index)
      const latest = lastByLayer.get(mark.layer) === mark.index
      const previous = lastX.get(mark.layer)
      if (!latest && previous !== undefined && Math.abs(markX - previous) < 3) continue
      lastX.set(mark.layer, markX)
      out.push({
        key: `${mark.layer}-${mark.index}`,
        x: markX,
        y: mark.layer === 'final' ? finalBandY : regimeBandY,
        layer: mark.layer,
        latest,
      })
    }
    return out
  }, [isDay, changeMarks, rangeStart, rangeEnd, x, finalBandY, regimeBandY])

  const overviewDomain = useMemo(() => {
    if (!total) return { min: 1, max: 2 }
    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < total; i += 1) {
      if (prices[i] < min) min = prices[i]
      if (prices[i] > max) max = prices[i]
    }
    return { min: Math.max(min * 0.92, 1e-6), max: max * 1.05 }
  }, [prices, total])
  const overviewX = useCallback((pointIndex: number): number => (
    CHART_LEFT + (pointIndex / Math.max(1, total - 1)) * plotWidth
  ), [total, plotWidth])
  const overviewY = useCallback((value: number): number => (
    logY(value, overviewDomain.min, overviewDomain.max, 8, 43)
  ), [overviewDomain])
  const overviewStep = plotWidth / Math.max(1, total - 1)
  const overviewLayer = useMemo(() => {
    if (total < 2) return null
    const indices = decimateMinMax(prices, { start: 0, end: total - 1 }, plotWidth)
    const d = indices.map((pointIndex, offset) => (
      `${offset ? 'L' : 'M'}${overviewX(pointIndex).toFixed(2)},${overviewY(prices[pointIndex]).toFixed(2)}`
    )).join('')
    const band = (segment: Segment<TierId | null>, y: number, layer: string) => {
      const x0 = overviewX(segment.start) - overviewStep / 2
      const x1 = overviewX(segment.end) + overviewStep / 2
      return (
        <rect
          key={`overview-${layer}-${segment.start}`}
          className={`mp-timeline__band${segment.value ? ` mp-timeline__band--${segment.value}` : ''}`}
          x={x0}
          y={y}
          width={Math.max(0.5, x1 - x0 + 0.2)}
          height={12}
        />
      )
    }
    return (
      <>
        <path className="mp-timeline__overview-line" d={d} fill="none" clipPath={`url(#${overviewClipId})`} />
        <g clipPath={`url(#${overviewClipId})`}>
          {finalSegments.map(segment => band(segment, 50, 'final'))}
          {regimeSegments.map(segment => band(segment, 68, 'regime'))}
        </g>
      </>
    )
  }, [total, prices, plotWidth, overviewX, overviewY, overviewStep, finalSegments, regimeSegments, overviewClipId])

  const updateHover = useCallback((clientX: number, clientY: number, svg: SVGSVGElement): void => {
    const nextIndex = indexFromClientX(svg, clientX, rangeRef.current, width)
    setIndex(nextIndex)
    const chart = chartRef.current
    if (!chart) return
    const box = chart.getBoundingClientRect()
    setTooltip({
      index: nextIndex,
      x: clientX - box.left,
      y: clientY - box.top,
      boxWidth: box.width,
      boxHeight: box.height,
    })
  }, [width])

  const beginPinch = useCallback((svg: SVGSVGElement): void => {
    const pointers = [...touchPointersRef.current.values()]
    if (pointers.length < 2) return
    const midpoint = (pointers[0].x + pointers[1].x) / 2
    const svgX = clientXToSvgX(svg, midpoint)
    pinchRef.current = {
      startDistance: Math.max(1, pointerDistance(pointers[0], pointers[1])),
      startRange: rangeRef.current,
      anchorRatio: clamp((svgX - CHART_LEFT) / plotWidth, 0, 1),
    }
    mainDragRef.current = null
    setTooltip(null)
  }, [plotWidth])

  const onMainPointerDown = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const svg = event.currentTarget
    const clientX = event.clientX
    const clientY = event.clientY
    svg.focus({ preventScroll: true })
    svg.setPointerCapture?.(event.pointerId)
    if (event.pointerType === 'touch') {
      touchPointersRef.current.set(event.pointerId, { x: clientX, y: clientY })
      if (touchPointersRef.current.size >= 2) {
        beginPinch(svg)
        setDragging(true)
        return
      }
    }
    mainDragRef.current = {
      pointerId: event.pointerId,
      startClientX: clientX,
      startRange: rangeRef.current,
      moved: false,
    }
    setDragging(true)
    setTooltip(null)
    scheduleMain(() => updateHover(clientX, clientY, svg))
  }

  const onMainPointerMove = (event: React.PointerEvent<SVGSVGElement>): void => {
    const svg = event.currentTarget
    const clientX = event.clientX
    const clientY = event.clientY
    if (event.pointerType === 'touch' && touchPointersRef.current.has(event.pointerId)) {
      touchPointersRef.current.set(event.pointerId, { x: clientX, y: clientY })
    }
    if (pinchRef.current && touchPointersRef.current.size >= 2) {
      const pointers = [...touchPointersRef.current.values()]
      const pinch = pinchRef.current
      const distance = Math.max(1, pointerDistance(pointers[0], pointers[1]))
      scheduleMain(() => {
        applyRange(zoomRange(pinch.startRange, total, pinch.anchorRatio, pinch.startDistance / distance, minSpan))
      })
      return
    }
    const drag = mainDragRef.current
    if (drag && drag.pointerId === event.pointerId) {
      const startX = clientXToSvgX(svg, drag.startClientX)
      const currentX = clientXToSvgX(svg, clientX)
      const span = drag.startRange.end - drag.startRange.start
      if (!drag.moved && Math.abs(currentX - startX) < 4) return
      drag.moved = true
      const delta = -((currentX - startX) / plotWidth) * span
      setTooltip(null)
      scheduleMain(() => applyRange(panRange(drag.startRange, total, delta, minSpan)))
      return
    }
    scheduleMain(() => updateHover(clientX, clientY, svg))
  }

  const endMainPointer = (event: React.PointerEvent<SVGSVGElement>): void => {
    touchPointersRef.current.delete(event.pointerId)
    const endedDrag = mainDragRef.current?.pointerId === event.pointerId ? mainDragRef.current : null
    if (endedDrag) mainDragRef.current = null
    if (touchPointersRef.current.size < 2) pinchRef.current = null
    if (touchPointersRef.current.size === 1) {
      const [pointerId, point] = [...touchPointersRef.current.entries()][0]
      mainDragRef.current = { pointerId, startClientX: point.x, startRange: rangeRef.current, moved: true }
    }
    setDragging(false)
    // 触屏轻点（未拖动）保留提示卡；拖动或双指缩放结束后收起。
    if (event.pointerType === 'touch' && (!endedDrag || endedDrag.moved || event.type === 'pointercancel')) {
      setTooltip(null)
    }
  }

  const showIndex = (nextIndex: number): void => {
    const next = clamp(nextIndex, 0, total - 1)
    const current = rangeRef.current
    const span = current.end - current.start
    if (next < current.start) applyRange({ start: next, end: next + span })
    if (next > current.end) applyRange({ start: next - span, end: next })
    setIndex(next)
    setTooltip(null)
  }

  const zoomAtIndex = (factor: number): void => {
    const current = rangeRef.current
    const ratio = (safeIndex - current.start) / Math.max(1, current.end - current.start)
    applyRange(zoomRange(current, total, ratio, factor, minSpan))
    setTooltip(null)
  }

  const onMainKeyDown = (event: React.KeyboardEvent<SVGSVGElement>): void => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      const direction = event.key === 'ArrowLeft' ? -1 : 1
      if (isDay && (event.altKey || event.shiftKey)) {
        showIndex(stepByMonths(pts, safeIndex, direction * (event.altKey ? 12 : 1)))
      } else {
        showIndex(safeIndex + direction * (event.shiftKey || event.altKey ? 12 : 1))
      }
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault()
      zoomAtIndex(2 / 3)
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault()
      zoomAtIndex(1.5)
    } else if (event.key === 'Home') {
      event.preventDefault()
      showIndex(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      showIndex(total - 1)
    } else if (event.key === '0') {
      event.preventDefault()
      reset()
    }
  }

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (event: WheelEvent): void => {
      if (!event.deltaY && !event.deltaX) return
      event.preventDefault()
      const current = rangeRef.current
      const accum = wheelAccumRef.current
      const scale = event.deltaMode === 1 ? 16 : 1
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        const span = current.end - current.start
        accum.pan += (event.deltaX * scale / plotWidth) * span
        const next = panRange(current, total, accum.pan, minSpan)
        if (next.start !== current.start) {
          accum.pan = 0
          applyRange(next)
          setTooltip(null)
        }
        return
      }
      const svgX = clientXToSvgX(svg, event.clientX)
      const ratio = clamp((svgX - CHART_LEFT) / plotWidth, 0, 1)
      // 触控板双指捏合会以 ctrlKey 滚轮事件送达，增量更小，放大系数相应提高。
      accum.zoom += event.deltaY * scale * (event.ctrlKey ? 0.01 : 0.0015)
      const next = zoomRange(current, total, ratio, Math.exp(accum.zoom), minSpan)
      if (next.start !== current.start || next.end !== current.end) {
        accum.zoom = 0
        applyRange(next)
        setTooltip(null)
      } else if (Math.abs(accum.zoom) > 0.5) {
        accum.zoom = 0
      }
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [applyRange, plotWidth, total, minSpan])

  const startOverviewDrag = (dragMode: OverviewDrag['mode']) => (event: React.PointerEvent<SVGRectElement>): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    overviewDragRef.current = {
      pointerId: event.pointerId,
      mode: dragMode,
      startClientX: event.clientX,
      startRange: rangeRef.current,
    }
    setTooltip(null)
  }

  const onOverviewBackgroundDown = (event: React.PointerEvent<SVGRectElement>): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const svg = overviewRef.current
    if (!svg) return
    const svgX = clientXToSvgX(svg, event.clientX)
    const center = clamp((svgX - CHART_LEFT) / plotWidth, 0, 1) * Math.max(1, total - 1)
    const current = rangeRef.current
    const span = current.end - current.start
    const next = normalizeRange({ start: center - span / 2, end: center + span / 2 }, total, minSpan)
    applyRange(next)
    event.currentTarget.setPointerCapture?.(event.pointerId)
    overviewDragRef.current = {
      pointerId: event.pointerId,
      mode: 'move',
      startClientX: event.clientX,
      startRange: next,
    }
    setTooltip(null)
  }

  const onOverviewPointerMove = (event: React.PointerEvent<SVGSVGElement>): void => {
    const drag = overviewDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const startX = clientXToSvgX(event.currentTarget, drag.startClientX)
    const currentX = clientXToSvgX(event.currentTarget, event.clientX)
    const delta = ((currentX - startX) / plotWidth) * Math.max(1, total - 1)
    const initial = drag.startRange
    const span = initial.end - initial.start
    let next = initial
    if (drag.mode === 'move') next = panRange(initial, total, delta, minSpan)
    if (drag.mode === 'start') next = normalizeRange({ start: initial.start + delta, end: initial.end }, total, minSpan)
    if (drag.mode === 'end') next = normalizeRange({ start: initial.start, end: initial.start + span + delta }, total, minSpan)
    scheduleOverview(() => applyRange(next))
  }

  if (total < 2 || !shown) return null

  const selectionX = overviewX(rangeStart)
  const selectionEndX = overviewX(rangeEnd)
  const first = pts[0]
  const last = pts[total - 1]
  const unit = isDay ? '个交易日' : '个月'
  const shownChanges = isDay ? changeMap.get(shown.d) ?? [] : []
  const officialText = (point: ChartPoint): string => (point.official ? '月末正式定档' : '月中预估')
  const captionDetails = details(shown).map(row => (row.caption ? ` · ${row.caption}` : '')).join('')
  const recessionCaption = labels.recession === null ? '' : shown.rec ? ' · 衰退期' : ' · 非衰退期'

  return (
    <figure className="mp-timeline" data-granularity={mode}>
      <div className="mp-timeline__controls">
        <div className="mp-timeline__presets" role="group" aria-label="时间线可见区间">
          {presets.map(preset => {
            const target = presetRange(preset, pts, mode)
            const active = rangeStart === target.start && rangeEnd === target.end
            return (
              <button
                key={preset.label}
                type="button"
                aria-pressed={active}
                onClick={() => applyRange(target)}
              >
                {preset.label}
              </button>
            )
          })}
        </div>
        {labels.recession !== null ? (
        <label className="mp-timeline__recession-select">
          <span className="visually-hidden">查看一次衰退的前后区间</span>
          <select
            aria-label="衰退前后区间"
            value={recessionKey}
            onChange={event => {
              const selected = windows.find(window => window.key === event.target.value)
              if (selected) applyRange(selected.range, selected.key)
            }}
          >
            <option value="">衰退前后…</option>
            {windows.map(window => <option key={window.key} value={window.key}>{window.label}</option>)}
          </select>
        </label>
        ) : null}
        <span className="mp-timeline__range-readout">
          {pts[rangeStart].d} — {pts[rangeEnd].d} · {visibleCount} {unit}
        </span>
      </div>
      <p className="mp-timeline__help">
        {isDay
          ? '滚轮或双指缩放，按住左右拖动平移，双击复位；也可拖动下方总览的选区。键盘：← → 逐日，Shift 加方向键跳一个月，Alt 加方向键跳一年，+ / − 缩放，0 复位。'
          : '滚轮或双指缩放，按住左右拖动平移，双击复位；也可拖动下方总览的选区。键盘：← → 逐月，Shift 加方向键跳一年，+ / − 缩放，0 复位。'}
      </p>
      <ul className="mp-timeline__legend" aria-label="档位色块图例">
        {LEGEND_TIERS.map(id => (
          <li key={id}>
            <span className={`mp-timeline__swatch mp-timeline__swatch--${id}`} aria-hidden="true" />
            {TIER_LABEL[id]}
          </li>
        ))}
        <li className="mp-timeline__legend-note">{labels.legendNote}</li>
        {labels.recession !== null ? (
          <li>
            <span className="mp-timeline__swatch mp-timeline__swatch--rec" aria-hidden="true" />
            {labels.recession}
          </li>
        ) : null}
      </ul>
      <div className="mp-timeline__chart" ref={chartRef}>
        <svg
          ref={svgRef}
          className={`mp-timeline__svg${dragging ? ' is-dragging' : ''}`}
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-labelledby={`${labelId} ${descriptionId}`}
          tabIndex={0}
          data-testid="mp-timeline-chart"
          data-visible-start={pts[rangeStart].d}
          data-visible-end={pts[rangeEnd].d}
          data-visible-count={visibleCount}
          {...(isDay ? { 'data-visible-days': visibleCount } : { 'data-visible-months': visibleCount })}
          data-line-points={linePoints.length}
          data-y-ticks={yTicks.join(',')}
          onPointerDown={onMainPointerDown}
          onPointerMove={onMainPointerMove}
          onPointerUp={endMainPointer}
          onPointerCancel={endMainPointer}
          onPointerLeave={() => {
            if (!mainDragRef.current && !pinchRef.current) setTooltip(null)
          }}
          onDoubleClick={reset}
          onKeyDown={onMainKeyDown}
        >
          <title id={labelId}>{labels.title}</title>
          <desc id={descriptionId}>
            当前显示 {pts[rangeStart].d} 至 {pts[rangeEnd].d}，共 {visibleCount} {unit}。使用方向键移动光标，加减键缩放，数字零复位。
          </desc>
          <defs>
            <clipPath id={clipId}>
              <rect x={CHART_LEFT} y={TOP - 8} width={plotWidth} height={height - BOTTOM - TOP + 8} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            {plotLayer}
            {changeTicks.map(tick => (
              <path
                key={tick.key}
                className={`mp-timeline__change-tick mp-timeline__change-tick--${tick.layer}${tick.latest ? ' is-latest' : ''}`}
                data-change-layer={tick.layer}
                d={`M${(tick.x - 3.5).toFixed(2)},${tick.y - 7}h7l-3.5,5.5z`}
              />
            ))}
          </g>
          {yTicks.map(tick => (
            <g key={`yt-${tick}`} className="mp-timeline__y-tick">
              <line
                className="mp-timeline__grid"
                x1={CHART_LEFT}
                x2={width - CHART_RIGHT}
                y1={yPrice(tick)}
                y2={yPrice(tick)}
              />
              <text className="mp-timeline__axis" x={6} y={yPrice(tick) + 4}>{tick.toLocaleString('zh-CN')}</text>
            </g>
          ))}
          <path className="mp-timeline__line" d={path} fill="none" clipPath={`url(#${clipId})`} />
          <text className="mp-timeline__band-label" x={7} y={finalBandY + 16}>{labels.top}</text>
          <text className="mp-timeline__band-label" x={7} y={regimeBandY + 16}>{labels.bottom}</text>
          <line className="mp-timeline__cursor" x1={x(safeIndex)} x2={x(safeIndex)} y1={TOP} y2={height - BOTTOM} />
          <circle className="mp-timeline__dot" cx={x(safeIndex)} cy={yPrice(shown.spx)} r={4} />
          {ticks.map(tick => (
            <text
              key={`xt-${tick.index}`}
              className="mp-timeline__axis"
              x={x(tick.index)}
              y={height - 8}
              textAnchor={tick.index === rangeStart ? 'start' : tick.index === rangeEnd ? 'end' : 'middle'}
            >
              {tick.label}
            </text>
          ))}
          {rangeEnd === total - 1 && (() => {
            // 标签放在价格线的另一侧（点在上半部就放到底部，反之放顶部），用细线连回最新点，避免压住走势。
            const text = isDay ? latestDayLabel(last.d) : '最新'
            const boxWidth = approxTextWidth(text) + 16
            const latestX = x(total - 1)
            const latestY = yPrice(last.spx)
            const upperHalf = latestY < (TOP + plotBottom) / 2
            const labelX = Math.max(CHART_LEFT + 2, latestX - boxWidth - 4)
            const labelY = upperHalf ? plotBottom - 30 : TOP + 6
            return (
              <g className="mp-timeline__latest" data-testid="mp-timeline-latest">
                <line
                  className="mp-timeline__latest-leader"
                  x1={latestX}
                  x2={latestX}
                  y1={upperHalf ? latestY + 6 : latestY - 6}
                  y2={upperHalf ? labelY : labelY + 22}
                />
                <g transform={`translate(${labelX} ${labelY})`}>
                  <rect width={boxWidth} height={22} rx={5} />
                  <text x={boxWidth / 2} y={15} textAnchor="middle">{text}</text>
                </g>
              </g>
            )
          })()}
        </svg>
        {tooltip && pts[tooltip.index] && (() => {
          const point = pts[tooltip.index]
          const pointChanges = isDay ? changeMap.get(point.d) ?? [] : []
          const pointDetails = details(point)
          return (
            <div
              className={`mp-timeline__tooltip${pointChanges.length ? ' mp-timeline__tooltip--wide' : ''}`}
              ref={tooltipRef}
              role="tooltip"
              data-testid="mp-timeline-tooltip"
            >
              <strong>{point.d}</strong>
              <dl>
                <div><dt>{isDay ? '收盘' : '月均价'}</dt><dd>{formatPrice(point.spx, mode)}</dd></div>
                {isDay ? (
                  <>
                    <div><dt>{labels.tooltipBottom}</dt><dd>{tierLabel(point.regime)}</dd></div>
                    <div><dt>{labels.tooltipTop}</dt><dd>{tierLabel(point.final)}</dd></div>
                    <div><dt>定档</dt><dd>{officialText(point)}</dd></div>
                  </>
                ) : (
                  <>
                    <div><dt>{labels.tooltipTop}</dt><dd>{tierLabel(point.final)}</dd></div>
                    <div><dt>{labels.tooltipBottom}</dt><dd>{tierLabel(point.regime)}</dd></div>
                  </>
                )}
                {pointDetails.map(row => (
                  <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>
                ))}
                {labels.recession !== null ? (
                  <div><dt>衰退期</dt><dd>{point.rec ? '是' : '否'}</dd></div>
                ) : null}
              </dl>
              {pointChanges.length ? (
                <div className="mp-timeline__tooltip-change" data-testid="mp-timeline-tooltip-change">
                  <span>当天档位变化</span>
                  {pointChanges.map(change => <p key={`${change.layer}-${change.d}`}>{changeText(change, labels)}</p>)}
                </div>
              ) : null}
            </div>
          )
        })()}
      </div>
      <div className="mp-timeline__overview-wrap">
        <svg
          ref={overviewRef}
          className="mp-timeline__overview"
          viewBox={`0 0 ${width} ${OVERVIEW_HEIGHT}`}
          width={width}
          height={OVERVIEW_HEIGHT}
          role="img"
          aria-label="全历史总览：拖动选区平移，拖动选区两端调整区间"
          data-testid="mp-timeline-overview"
          onPointerMove={onOverviewPointerMove}
          onPointerUp={() => { overviewDragRef.current = null }}
          onPointerCancel={() => { overviewDragRef.current = null }}
        >
          <defs>
            <clipPath id={overviewClipId}>
              <rect x={CHART_LEFT} y={2} width={plotWidth} height={80} />
            </clipPath>
          </defs>
          <rect
            className="mp-timeline__overview-hit"
            x={CHART_LEFT}
            y={2}
            width={plotWidth}
            height={80}
            data-testid="mp-timeline-overview-track"
            onPointerDown={onOverviewBackgroundDown}
          />
          {overviewLayer}
          <rect
            className="mp-timeline__selection"
            x={selectionX}
            y={2}
            width={Math.max(2, selectionEndX - selectionX)}
            height={80}
            onPointerDown={startOverviewDrag('move')}
          />
          <rect
            className="mp-timeline__selection-handle"
            x={selectionX - 6}
            y={2}
            width={12}
            height={80}
            onPointerDown={startOverviewDrag('start')}
          />
          <rect
            className="mp-timeline__selection-handle"
            x={selectionEndX - 6}
            y={2}
            width={12}
            height={80}
            onPointerDown={startOverviewDrag('end')}
          />
          <text className="mp-timeline__axis" x={CHART_LEFT} y={93}>{first.d.slice(0, 4)}</text>
          <text className="mp-timeline__axis" x={width - CHART_RIGHT} y={93} textAnchor="end">{last.d.slice(0, 4)}</text>
        </svg>
      </div>
      <figcaption className="mp-timeline__caption" aria-live="polite">
        {isDay ? (
          <span>
            <time dateTime={shown.d}>{shown.d}</time>
            {' · 收盘 '}
            <strong>{formatPrice(shown.spx, mode)}</strong>
            {` · ${labels.tooltipTop} `}
            <strong>{tierLabel(shown.final)}</strong>
            {`（${officialText(shown)}）`}
            {` · ${labels.tooltipBottom} `}
            <strong>{tierLabel(shown.regime)}</strong>
            {captionDetails || null}
            {recessionCaption}
            {shownChanges.length ? ` · 当天档位变化：${shownChanges.map(change => changeText(change, labels)).join('；')}` : ''}
          </span>
        ) : (
          <span>
            <time dateTime={shown.d}>{shown.d}</time>
            {' · 月均价 '}
            <strong>{formatPrice(shown.spx, mode)}</strong>
            {` · ${labels.tooltipTop} `}
            <strong>{tierLabel(shown.final)}</strong>
            {` · ${labels.tooltipBottom} `}
            <strong>{tierLabel(shown.regime)}</strong>
            {captionDetails || null}
            {recessionCaption}
          </span>
        )}
      </figcaption>
      {isDay ? (
        <div className="mp-timeline__date">
          <label className="mp-timeline__date-label" htmlFor={dateInputId}>按日期查看档位</label>
          <input
            id={dateInputId}
            type="date"
            min={first.d}
            max={last.d}
            value={dateDraft ?? shown.d}
            aria-describedby={dateHintId}
            onChange={event => {
              const value = event.target.value
              if (/^\d{4}-\d{2}-\d{2}$/.test(value) && value >= first.d && value <= last.d) {
                setDateDraft(null)
                showIndex(indexAtOrBefore(pts, value))
              } else {
                setDateDraft(value)
              }
            }}
            onBlur={() => setDateDraft(null)}
          />
          <span className="mp-timeline__date-hint" id={dateHintId}>
            可选 {first.d} 至 {last.d}；选到休市日时显示此前最近一个交易日。
          </span>
        </div>
      ) : (
        <label className="mp-timeline__select">
          <span className="visually-hidden">按月份查看档位</span>
          <select
            value={String(safeIndex)}
            onChange={event => showIndex(Number(event.target.value))}
            aria-label="按月份查看档位"
          >
            {pts.map((point, pointIndex) => (
              <option key={point.d} value={pointIndex}>
                {point.d}
                {' · '}
                {tierLabel(point.final)}
              </option>
            ))}
          </select>
        </label>
      )}
    </figure>
  )
}
