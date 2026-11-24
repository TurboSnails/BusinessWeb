import React, { useEffect, useMemo, useRef, useState } from 'react'
import { clientXToSvgX } from '../macro-posture/composite/timeline/chartMath'
import ZoomChartDialog from './ZoomChart'
import { niceTicks, tickLabel } from './ZoomChart'
import { sparkFormatter } from './MiniSparkline'
import type { RadarIndicator, RadarThreshold } from './types'

type RangePreset = '1y' | '5y' | '10y' | 'all'

const PRESETS: { id: RangePreset; label: string; years: number | null }[] = [
  { id: '1y', label: '近 1 年', years: 1 },
  { id: '5y', label: '近 5 年', years: 5 },
  { id: '10y', label: '近 10 年', years: 10 },
  { id: 'all', label: '全部', years: null },
]

const PAD_L = 52
const PAD_R = 48
const PAD_T = 18
const PAD_B = 32
const FONT = 12
const THR_GAP = 16
const THR_LABEL_PAD = 6

function parseDate(d: string): number {
  return Date.parse(d.length === 7 ? `${d}-28` : d)
}

export function sliceByYears(history: [string, number][], years: number | null): [string, number][] {
  if (years == null || history.length < 2) return history
  const end = parseDate(history[history.length - 1][0])
  if (!Number.isFinite(end)) return history
  const cutoff = end - years * 365.25 * 86_400_000
  const sliced = history.filter(([d]) => {
    const t = parseDate(d)
    return Number.isFinite(t) && t >= cutoff
  })
  return sliced.length >= 2 ? sliced : history
}

function thresholdClass(kind: RadarThreshold['kind']): string {
  if (kind === 'minus') return 'mr-hist__thr--minus'
  if (kind === 'plus') return 'mr-hist__thr--plus'
  return 'mr-hist__thr--ref'
}

function xTickLabels(dates: string[], count = 5): { index: number; label: string }[] {
  if (dates.length < 2) return dates[0] ? [{ index: 0, label: axisDate(dates[0]) }] : []
  const n = Math.min(count, dates.length)
  const out: { index: number; label: string }[] = []
  for (let i = 0; i < n; i++) {
    const index = Math.round((i / (n - 1)) * (dates.length - 1))
    out.push({ index, label: axisDate(dates[index]) })
  }
  return out
}

function axisDate(d: string): string {
  if (d.length >= 7) {
    const y = d.slice(0, 4)
    const m = d.slice(5, 7)
    return m === '01' || m === '1' ? y : `${y}-${m}`
  }
  return d
}

function formatPercentileSince(raw: string | null): string {
  if (!raw) return '—'
  const m = raw.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/)
  if (!m) return raw
  return `${Number(m[1])} 年 ${Number(m[2])} 月起`
}

export function sourceHost(source: string): string {
  try {
    if (/^https?:\/\//i.test(source)) return new URL(source).hostname.replace(/^www\./, '')
  } catch { /* ignore */ }
  return source
}

/** 估算标签像素宽（中文≈字号，其余≈0.62 字号） */
export function estimateLabelWidth(label: string, fontSize = FONT): number {
  let w = 0
  for (const ch of label) {
    w += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? fontSize : fontSize * 0.62
  }
  return Math.ceil(w) + THR_LABEL_PAD * 2
}

/** 纵轴至少 3 个刻度，覆盖 [lo, hi] */
export function yAxisTicks(lo: number, hi: number, target = 4): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return []
  if (hi === lo) {
    const pad = Math.abs(lo) * 0.08 || 1
    return [lo - pad, lo, lo + pad]
  }
  // 整齐步长落在区间内的刻度不足 3 个时，逐步加密步长，而不是退回到不整齐的首尾值
  for (const count of [target, target + 1, target + 2, target + 4, target + 8]) {
    const ticks = niceTicks(lo, hi, count)
    if (ticks.length >= 3) return ticks
  }
  return [lo, lo + (hi - lo) / 2, hi]
}

/** 规则线标签：画在线上方靠右、整体落在绘图区内；纵向错开并避开最新点 */
export function placeThresholdLabels(
  items: { y: number; label: string; kind: RadarThreshold['kind']; width: number }[],
  latestY: number,
  minY: number,
  maxY: number,
): { y: number; label: string; kind: RadarThreshold['kind']; width: number }[] {
  const sorted = [...items].sort((a, b) => a.y - b.y)
  const placed: { y: number; label: string; kind: RadarThreshold['kind']; width: number }[] = []
  for (const item of sorted) {
    // 标签底边贴在线上方
    let y = item.y - 6
    if (Math.abs(y - latestY) < THR_GAP) {
      y = latestY - THR_GAP < minY + FONT ? latestY + THR_GAP : latestY - THR_GAP
    }
    const prev = placed.at(-1)
    if (prev && y - prev.y < THR_GAP) y = prev.y + THR_GAP
    y = Math.max(minY + FONT, Math.min(maxY - 4, y))
    if (prev && y - prev.y < THR_GAP) y = Math.min(maxY - 4, prev.y + THR_GAP)
    placed.push({ ...item, y })
  }
  return placed
}

export default function IndicatorHistoryChart({ item }: { item: RadarIndicator }): JSX.Element | null {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 640, height: 220 })
  const [preset, setPreset] = useState<RangePreset>('5y')
  const [active, setActive] = useState<number | null>(null)
  const [zoomed, setZoomed] = useState(false)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = (): void => {
      const w = Math.max(280, Math.round(el.clientWidth || el.getBoundingClientRect().width || 640))
      const h = w <= 560 ? 180 : 220
      setSize(cur => (cur.width === w && cur.height === h ? cur : { width: w, height: h }))
    }
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  const years = PRESETS.find(p => p.id === preset)?.years ?? 5
  const series = useMemo(() => sliceByYears(item.history, years), [item.history, years])
  const format = useMemo(
    () => sparkFormatter(item.display, series.at(-1)?.[1] ?? Number.NaN),
    [item.display, series],
  )

  if (item.history.length < 2) {
    return <p className="mr-muted">历史不足，暂无走势图。</p>
  }

  const { width: W, height: H } = size
  const plotW = W - PAD_L - PAD_R
  const plotH = H - PAD_T - PAD_B
  const values = series.map(([, v]) => v)
  const thrVals = item.thresholds.map(t => t.value)
  const rawLo = Math.min(...values, ...(thrVals.length ? thrVals : values))
  const rawHi = Math.max(...values, ...(thrVals.length ? thrVals : values))
  const pad = (rawHi - rawLo || Math.abs(rawHi) || 1) * 0.08
  const yLo = rawLo - pad
  const yHi = rawHi + pad
  const ySpan = yHi - yLo || 1
  const xAt = (i: number) => PAD_L + (series.length <= 1 ? 0 : (i / (series.length - 1)) * plotW)
  const yAt = (v: number) => PAD_T + (1 - (v - yLo) / ySpan) * plotH
  const path = series.map(([, v], i) => `${i ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join('')
  const yTicks = yAxisTicks(yLo, yHi, 4)
  const xTicks = xTickLabels(series.map(([d]) => d), W < 400 ? 4 : 5)
  const lastIndex = series.length - 1
  const last = series[lastIndex]
  const latestY = yAt(last[1])
  const plotRight = W - PAD_R
  const thrPlaced = placeThresholdLabels(
    item.thresholds
      .map(thr => ({
        y: yAt(thr.value),
        label: thr.label,
        kind: thr.kind,
        width: estimateLabelWidth(thr.label),
      }))
      .filter(t => t.y >= PAD_T && t.y <= H - PAD_B),
    latestY,
    PAD_T,
    H - PAD_B,
  )
  const shownIndex = active == null ? null : Math.min(active, lastIndex)
  const shown = shownIndex == null ? null : series[shownIndex]
  const hiVal = Math.max(...values)
  const loVal = Math.min(...values)
  const rangeLabel = PRESETS.find(p => p.id === preset)?.label ?? '近 5 年'

  const pickIndex = (clientX: number, svg: SVGSVGElement): number => {
    const svgX = clientXToSvgX(svg, clientX)
    const ratio = (svgX - PAD_L) / plotW
    return Math.round(Math.max(0, Math.min(1, ratio)) * lastIndex)
  }

  const onKeyDown = (event: React.KeyboardEvent<SVGSVGElement>): void => {
    const current = shownIndex ?? lastIndex
    let next: number | null = current
    if (event.key === 'ArrowLeft') next = Math.max(0, current - 1)
    else if (event.key === 'ArrowRight') next = Math.min(lastIndex, current + 1)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = lastIndex
    else if (event.key === 'Escape') next = null
    else return
    event.preventDefault()
    setActive(next)
  }

  return (
    <div className="mr-hist" data-testid={`mr-hist-${item.id}`} ref={wrapRef}>
      <div className="mr-hist__toolbar" role="group" aria-label="历史区间">
        {PRESETS.map(p => (
          <button
            key={p.id}
            type="button"
            className={`mr-hist__preset${preset === p.id ? ' is-active' : ''}`}
            aria-pressed={preset === p.id}
            onClick={() => { setPreset(p.id); setActive(null) }}
          >
            {p.label}
          </button>
        ))}
        <button type="button" className="mr-hist__zoom" onClick={() => setZoomed(true)}>
          放大
        </button>
      </div>
      <svg
        className="mr-hist__svg"
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`${item.label}历史`}
        tabIndex={0}
        data-active-index={shownIndex ?? ''}
        onPointerDown={event => {
          if (event.pointerType === 'mouse' && event.button !== 0) return
          setActive(pickIndex(event.clientX, event.currentTarget))
        }}
        onPointerMove={event => setActive(pickIndex(event.clientX, event.currentTarget))}
        onPointerLeave={event => {
          if (event.pointerType === 'mouse') setActive(null)
        }}
        onKeyDown={onKeyDown}
      >
        {yTicks.map(tick => (
          <g key={`y-${tick}`}>
            <line
              className="mr-hist__grid"
              x1={PAD_L}
              x2={plotRight}
              y1={yAt(tick)}
              y2={yAt(tick)}
            />
            <text className="mr-hist__axis" x={PAD_L - 6} y={yAt(tick) + 4} textAnchor="end" fontSize={FONT}>
              {tickLabel(tick)}
            </text>
          </g>
        ))}
        {xTicks.map(tick => (
          <text
            key={`x-${tick.index}-${tick.label}`}
            className="mr-hist__axis"
            x={xAt(tick.index)}
            y={H - 8}
            textAnchor="middle"
            fontSize={FONT}
          >
            {tick.label}
          </text>
        ))}
        {item.thresholds.map(thr => {
          const yy = yAt(thr.value)
          if (yy < PAD_T || yy > H - PAD_B) return null
          return (
            <line
              key={`line-${thr.kind}-${thr.value}`}
              className={`mr-hist__thr ${thresholdClass(thr.kind)}`}
              x1={PAD_L}
              x2={plotRight}
              y1={yy}
              y2={yy}
            />
          )
        })}
        <path className="mr-hist__line" d={path} />
        <circle className="mr-hist__dot" cx={xAt(lastIndex)} cy={latestY} r={4} />
        {shown && shownIndex != null ? (
          <>
            <line className="mr-hist__cursor" x1={xAt(shownIndex)} x2={xAt(shownIndex)} y1={PAD_T} y2={H - PAD_B} />
            <circle className="mr-hist__dot" cx={xAt(shownIndex)} cy={yAt(shown[1])} r={4} />
          </>
        ) : null}
        {thrPlaced.map(thr => {
          const labelRight = plotRight - 2
          const rectW = Math.min(thr.width, plotW - 8)
          const rectX = labelRight - rectW
          return (
            <g key={`lab-${thr.kind}-${thr.label}`} data-testid={`mr-hist-thr-label-${thr.kind}`}>
              <rect
                className={`mr-hist__thr-bg mr-hist__thr-bg--${thr.kind}`}
                x={rectX}
                y={thr.y - 11}
                width={rectW}
                height={16}
                rx={3}
              />
              <text
                className="mr-hist__thr-label"
                x={labelRight - THR_LABEL_PAD}
                y={thr.y + 1}
                textAnchor="end"
                fontSize={FONT}
              >
                {thr.label}
              </text>
            </g>
          )
        })}
      </svg>
      <p className="mr-hist__readout" data-testid={`mr-hist-readout-${item.id}`} aria-live="polite">
        {shown ? (
          <>
            <time dateTime={shown[0]}>{shown[0]}</time>
            {' · '}
            {format(shown[1])}
          </>
        ) : (
          <>
            {rangeLabel}
            {' · 最新 '}
            {format(last[1])}
            {' · 最高 '}
            {format(hiVal)}
            {' · 最低 '}
            {format(loVal)}
          </>
        )}
      </p>
      <ZoomChartDialog
        open={zoomed}
        onClose={() => setZoomed(false)}
        history={item.history}
        label={item.label}
        format={format}
        overlays={item.overlays}
      />
    </div>
  )
}

export { formatPercentileSince }
