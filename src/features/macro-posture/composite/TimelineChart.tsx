import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Backtest, TierId } from './types'
import {
  CHART_LEFT,
  CHART_RIGHT,
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
} from './timeline/chartMath'

const TOP = 18
const BOTTOM = 32
const BAND_AREA = 78
const OVERVIEW_HEIGHT = 96

const TIER_LABEL: Record<TierId, string> = {
  offense: '进攻',
  'lean-offense': '偏进攻',
  neutral: '中性',
  'lean-defense': '偏防守',
  defense: '防守',
}

const LEGEND_TIERS: TierId[] = ['defense', 'lean-defense', 'neutral', 'lean-offense', 'offense']
const RANGE_PRESETS = [
  { label: '全部', months: null },
  { label: '近 30 年', months: 360 },
  { label: '近 10 年', months: 120 },
  { label: '近 5 年', months: 60 },
  { label: '近 2 年', months: 24 },
]

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

function pointerDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export default function TimelineChart({ timeline }: { timeline: Backtest['timeline'] }): JSX.Element | null {
  const labelId = useId()
  const descriptionId = useId()
  const clipId = useId()
  const overviewClipId = useId()
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
  // 触控板一次只给几像素的增量，累积到至少移动一个月再生效。
  const wheelAccumRef = useRef({ zoom: 0, pan: 0 })
  const pts = useMemo(() => timeline.filter(row => row.spx > 0), [timeline])
  const [size, setSize] = useState(() => ({
    width: 640,
    height: typeof window !== 'undefined' && window.innerWidth <= 560 ? 300 : 380,
  }))
  const [range, setRange] = useState<VisibleRange>(() => recentRange(pts.length, pts.length))
  const [index, setIndex] = useState(() => Math.max(0, pts.length - 1))
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [dragging, setDragging] = useState(false)
  const [recessionKey, setRecessionKey] = useState('')
  const safeRange = normalizeRange(range, pts.length)
  const safeIndex = clamp(index, 0, Math.max(0, pts.length - 1))
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
  const visible = useMemo(() => pts.slice(rangeStart, rangeEnd + 1), [pts, rangeStart, rangeEnd])
  const shown = pts[safeIndex]
  const windows = useMemo(() => recessionWindows(pts), [pts])

  const applyRange = useCallback((next: VisibleRange, selectedRecession = ''): void => {
    const normalized = normalizeRange(next, pts.length)
    rangeRef.current = normalized
    setRange(normalized)
    setRecessionKey(selectedRecession)
    setIndex(current => clamp(current, normalized.start, normalized.end))
  }, [pts.length])

  const reset = useCallback((): void => {
    const full = recentRange(pts.length, pts.length)
    rangeRef.current = full
    setRange(full)
    setIndex(Math.max(0, pts.length - 1))
    setTooltip(null)
    setRecessionKey('')
  }, [pts.length])

  useEffect(() => {
    reset()
  }, [timeline, reset])

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
    if (!visible.length) return { min: 1, max: 2 }
    const prices = visible.map(point => point.spx)
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    return { min: Math.max(min * 0.92, 1), max: max * 1.05 }
  }, [visible])
  const yTickLimit = Math.max(3, Math.min(6, Math.floor((plotBottom - TOP) / 40)))
  const yTicks = useMemo(
    () => logTicks(priceDomain.min, priceDomain.max, yTickLimit),
    [priceDomain, yTickLimit],
  )
  const ticks = useMemo(
    () => xTicks(pts, { start: rangeStart, end: rangeEnd }, plotWidth),
    [pts, rangeStart, rangeEnd, plotWidth],
  )
  const x = useCallback((pointIndex: number): number => (
    CHART_LEFT + ((pointIndex - safeRange.start) / Math.max(1, safeRange.end - safeRange.start)) * plotWidth
  ), [safeRange.start, safeRange.end, plotWidth])
  const yPrice = useCallback((value: number): number => (
    logY(value, priceDomain.min, priceDomain.max, TOP, plotBottom)
  ), [priceDomain, plotBottom])
  const path = visible.map((point, offset) => (
    `${offset ? 'L' : 'M'}${x(safeRange.start + offset).toFixed(2)},${yPrice(point.spx).toFixed(2)}`
  )).join('')

  const overviewDomain = useMemo(() => {
    if (!pts.length) return { min: 1, max: 2 }
    const prices = pts.map(point => point.spx)
    return { min: Math.max(Math.min(...prices) * 0.92, 1), max: Math.max(...prices) * 1.05 }
  }, [pts])
  const overviewX = useCallback((pointIndex: number): number => (
    CHART_LEFT + (pointIndex / Math.max(1, pts.length - 1)) * plotWidth
  ), [pts.length, plotWidth])
  const overviewY = useCallback((value: number): number => (
    logY(value, overviewDomain.min, overviewDomain.max, 8, 43)
  ), [overviewDomain])
  const overviewPath = pts.map((point, pointIndex) => (
    `${pointIndex ? 'L' : 'M'}${overviewX(pointIndex).toFixed(2)},${overviewY(point.spx).toFixed(2)}`
  )).join('')

  const updateHover = useCallback((clientX: number, clientY: number, svg: SVGSVGElement): void => {
    const nextIndex = indexFromClientX(svg, clientX, rangeRef.current, width)
    setIndex(nextIndex)
    const chart = chartRef.current
    if (!chart) return
    const box = chart.getBoundingClientRect()
    const localX = clientX - box.left
    const localY = clientY - box.top
    setTooltip({
      index: nextIndex,
      x: localX,
      y: localY,
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
        applyRange(zoomRange(pinch.startRange, pts.length, pinch.anchorRatio, pinch.startDistance / distance))
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
      scheduleMain(() => applyRange(panRange(drag.startRange, pts.length, delta)))
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
    const next = clamp(nextIndex, 0, pts.length - 1)
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
    applyRange(zoomRange(current, pts.length, ratio, factor))
    setTooltip(null)
  }

  const onMainKeyDown = (event: React.KeyboardEvent<SVGSVGElement>): void => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      const direction = event.key === 'ArrowLeft' ? -1 : 1
      showIndex(safeIndex + direction * (event.shiftKey ? 12 : 1))
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
      showIndex(pts.length - 1)
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
        const next = panRange(current, pts.length, accum.pan)
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
      const next = zoomRange(current, pts.length, ratio, Math.exp(accum.zoom))
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
  }, [applyRange, plotWidth, pts.length])

  const startOverviewDrag = (mode: OverviewDrag['mode']) => (event: React.PointerEvent<SVGRectElement>): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    overviewDragRef.current = {
      pointerId: event.pointerId,
      mode,
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
    const center = clamp((svgX - CHART_LEFT) / plotWidth, 0, 1) * Math.max(1, pts.length - 1)
    const current = rangeRef.current
    const span = current.end - current.start
    const next = normalizeRange({ start: center - span / 2, end: center + span / 2 }, pts.length)
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
    const delta = ((currentX - startX) / plotWidth) * Math.max(1, pts.length - 1)
    const initial = drag.startRange
    const span = initial.end - initial.start
    let next = initial
    if (drag.mode === 'move') next = panRange(initial, pts.length, delta)
    if (drag.mode === 'start') next = normalizeRange({ start: initial.start + delta, end: initial.end }, pts.length)
    if (drag.mode === 'end') next = normalizeRange({ start: initial.start, end: initial.start + span + delta }, pts.length)
    scheduleOverview(() => applyRange(next))
  }

  const selectionX = overviewX(safeRange.start)
  const selectionEndX = overviewX(safeRange.end)
  const bandStep = plotWidth / Math.max(1, safeRange.end - safeRange.start)
  const overviewStep = plotWidth / Math.max(1, pts.length - 1)

  if (pts.length < 2) return null

  return (
    <figure className="mp-timeline">
      <div className="mp-timeline__controls">
        <div className="mp-timeline__presets" role="group" aria-label="时间线可见区间">
          {RANGE_PRESETS.map(preset => {
            const presetRange = preset.months === null ? recentRange(pts.length, pts.length) : recentRange(pts.length, preset.months)
            const active = safeRange.start === presetRange.start && safeRange.end === presetRange.end
            return (
              <button
                key={preset.label}
                type="button"
                aria-pressed={active}
                onClick={() => applyRange(presetRange)}
              >
                {preset.label}
              </button>
            )
          })}
        </div>
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
        <span className="mp-timeline__range-readout">
          {pts[safeRange.start].d} — {pts[safeRange.end].d} · {visible.length} 个月
        </span>
      </div>
      <p className="mp-timeline__help">滚轮或双指缩放，按住左右拖动平移，双击复位；也可拖动下方总览的选区。键盘：← → 逐月，Shift 加方向键跳一年，+ / − 缩放，0 复位。</p>
      <ul className="mp-timeline__legend" aria-label="档位色块图例">
        {LEGEND_TIERS.map(id => (
          <li key={id}>
            <span className={`mp-timeline__swatch mp-timeline__swatch--${id}`} aria-hidden="true" />
            {TIER_LABEL[id]}
          </li>
        ))}
        <li className="mp-timeline__legend-note">
          上带「最终档位」含战术修正与修复确认；下带「周期档位」只看经济周期
        </li>
        <li>
          <span className="mp-timeline__swatch mp-timeline__swatch--rec" aria-hidden="true" />
          灰色阴影为美国官方认定的衰退期（NBER）
        </li>
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
          data-visible-start={pts[safeRange.start].d}
          data-visible-end={pts[safeRange.end].d}
          data-visible-months={visible.length}
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
          <title id={labelId}>标普月均价对数走势、最终档位与周期档位</title>
          <desc id={descriptionId}>
            当前显示 {pts[safeRange.start].d} 至 {pts[safeRange.end].d}，共 {visible.length} 个月。使用方向键移动光标，加减键缩放，数字零复位。
          </desc>
          <defs>
            <clipPath id={clipId}>
              <rect x={CHART_LEFT} y={TOP} width={plotWidth} height={height - BOTTOM - TOP} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            {visible.map((point, offset) => {
              if (!point.rec) return null
              const pointIndex = safeRange.start + offset
              const x0 = x(pointIndex) - bandStep / 2
              const x1 = x(pointIndex) + bandStep / 2
              return (
                <rect
                  key={`rec-${point.d}`}
                  className="mp-timeline__recession"
                  x={x0}
                  y={TOP}
                  width={Math.max(1, x1 - x0)}
                  height={height - BOTTOM - TOP}
                />
              )
            })}
            {visible.map((point, offset) => {
              const pointIndex = safeRange.start + offset
              return (
                <React.Fragment key={`bands-${point.d}`}>
                  <rect
                    className={`mp-timeline__band${point.final ? ` mp-timeline__band--${point.final}` : ''}`}
                    x={x(pointIndex) - bandStep / 2}
                    y={finalBandY}
                    width={Math.max(1, bandStep + 0.25)}
                    height={24}
                  />
                  <rect
                    className={`mp-timeline__band${point.regime ? ` mp-timeline__band--${point.regime}` : ''}`}
                    x={x(pointIndex) - bandStep / 2}
                    y={regimeBandY}
                    width={Math.max(1, bandStep + 0.25)}
                    height={24}
                  />
                </React.Fragment>
              )
            })}
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
          <text className="mp-timeline__band-label" x={7} y={finalBandY + 16}>最终档位</text>
          <text className="mp-timeline__band-label" x={7} y={regimeBandY + 16}>周期档位</text>
          <line className="mp-timeline__cursor" x1={x(safeIndex)} x2={x(safeIndex)} y1={TOP} y2={height - BOTTOM} />
          <circle className="mp-timeline__dot" cx={x(safeIndex)} cy={yPrice(shown.spx)} r={4} />
          {ticks.map(tick => (
            <text
              key={`xt-${tick.index}`}
              className="mp-timeline__axis"
              x={x(tick.index)}
              y={height - 8}
              textAnchor={tick.index === safeRange.start ? 'start' : tick.index === safeRange.end ? 'end' : 'middle'}
            >
              {tick.label}
            </text>
          ))}
          {safeRange.end === pts.length - 1 && (() => {
            // 标签放在价格线的另一侧（点在上半部就放到底部，反之放顶部），用细线连回最新点，避免压住走势。
            const latestX = x(pts.length - 1)
            const latestY = yPrice(pts[pts.length - 1].spx)
            const upperHalf = latestY < (TOP + plotBottom) / 2
            const labelX = latestX - 46
            const labelY = upperHalf ? plotBottom - 30 : TOP + 6
            return (
              <g className="mp-timeline__latest">
                <line
                  className="mp-timeline__latest-leader"
                  x1={latestX}
                  x2={latestX}
                  y1={upperHalf ? latestY + 6 : latestY - 6}
                  y2={upperHalf ? labelY : labelY + 22}
                />
                <g transform={`translate(${labelX} ${labelY})`}>
                  <rect width={42} height={22} rx={5} />
                  <text x={21} y={15} textAnchor="middle">最新</text>
                </g>
              </g>
            )
          })()}
        </svg>
        {tooltip && (() => {
          const point = pts[tooltip.index]
          return (
            <div
              className="mp-timeline__tooltip"
              ref={tooltipRef}
              role="tooltip"
              data-testid="mp-timeline-tooltip"
            >
              <strong>{point.d}</strong>
              <dl>
                <div><dt>月均价</dt><dd>{point.spx.toLocaleString('zh-CN')}</dd></div>
                <div><dt>最终档位</dt><dd>{tierLabel(point.final)}</dd></div>
                <div><dt>周期档位</dt><dd>{tierLabel(point.regime)}</dd></div>
                <div><dt>衰退期</dt><dd>{point.rec ? '是' : '否'}</dd></div>
              </dl>
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
          <path className="mp-timeline__overview-line" d={overviewPath} fill="none" clipPath={`url(#${overviewClipId})`} />
          <g clipPath={`url(#${overviewClipId})`}>
            {pts.map((point, pointIndex) => (
              <React.Fragment key={`overview-${point.d}`}>
                <rect
                  className={`mp-timeline__band${point.final ? ` mp-timeline__band--${point.final}` : ''}`}
                  x={overviewX(pointIndex) - overviewStep / 2}
                  y={50}
                  width={Math.max(1, overviewStep + 0.2)}
                  height={12}
                />
                <rect
                  className={`mp-timeline__band${point.regime ? ` mp-timeline__band--${point.regime}` : ''}`}
                  x={overviewX(pointIndex) - overviewStep / 2}
                  y={68}
                  width={Math.max(1, overviewStep + 0.2)}
                  height={12}
                />
              </React.Fragment>
            ))}
          </g>
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
          <text className="mp-timeline__axis" x={CHART_LEFT} y={93}>{pts[0].d.slice(0, 4)}</text>
          <text className="mp-timeline__axis" x={width - CHART_RIGHT} y={93} textAnchor="end">{pts[pts.length - 1].d.slice(0, 4)}</text>
        </svg>
      </div>
      <figcaption className="mp-timeline__caption" aria-live="polite">
        <span>
          <time dateTime={shown.d}>{shown.d}</time>
          {' · 月均价 '}
          <strong>{shown.spx.toLocaleString('zh-CN')}</strong>
          {' · 最终档位 '}
          <strong>{tierLabel(shown.final)}</strong>
          {' · 周期档位 '}
          <strong>{tierLabel(shown.regime)}</strong>
          {shown.rec ? ' · 衰退期' : ' · 非衰退期'}
        </span>
      </figcaption>
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
    </figure>
  )
}
