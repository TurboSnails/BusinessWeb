import React, { useEffect, useState } from 'react'
import { clientXToSvgX } from '../macro-posture/composite/timeline/chartMath'
import { percentileOf } from './indicators'

export const LONG_W = 640
export const LONG_H = 150
/** 顶部 ≥20、底部 ≥22；左侧留给最小/最大刻度 */
export const LONG_PAD = { l: 40, r: 12, t: 20, b: 22 }

export type RangeId = '5y' | '10y' | '20y' | 'all'

export type RangeOption = { id: RangeId; label: string; years: number | null }

const MS_YEAR = 365.25 * 24 * 3600 * 1000

/** 最新观测日相对首点的年数 */
export function historySpanYears(points: [string, number][]): number {
  if (points.length < 2) return 0
  const a = Date.parse(points[0][0])
  const b = Date.parse(points[points.length - 1][0])
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0
  return (b - a) / MS_YEAR
}

/** 从最新观测日往前截 years 年；years 为 null 表示全部 */
export function cutByYears(points: [string, number][], years: number | null): [string, number][] {
  if (!points.length || years == null || !Number.isFinite(years)) return points
  const end = points[points.length - 1][0]
  const cut = `${Number(end.slice(0, 4)) - years}${end.slice(4)}`
  const i0 = points.findIndex(p => p[0] >= cut)
  return points.slice(i0 < 0 ? 0 : i0)
}

/** 按实际历史长度决定可见按钮 */
export function availableRanges(spanYears: number): RangeOption[] {
  const n = Math.max(1, Math.round(spanYears))
  if (spanYears < 5) return [{ id: 'all', label: '全部', years: null }]
  if (spanYears < 10) {
    return [
      { id: '5y', label: '5 年', years: 5 },
      { id: 'all', label: `全部（约 ${n} 年）`, years: null },
    ]
  }
  return [
    { id: '5y', label: '5 年', years: 5 },
    { id: '10y', label: '10 年', years: 10 },
    { id: '20y', label: '20 年', years: 20 },
    { id: 'all', label: `全部（约 ${n} 年）`, years: null },
  ]
}

export function defaultRangeId(spanYears: number): RangeId {
  return spanYears >= 10 ? '10y' : 'all'
}

/** 区间内点数 < 2 时禁用该按钮 */
export function rangeEnabled(points: [string, number][], years: number | null): boolean {
  return cutByYears(points, years).length >= 2
}

/**
 * 最高点默认标在上方、最低点默认标在下方；越出 [0, H] 则翻到另一侧。
 * 返回的是 text 基线 y，保证落在 [0, H] 内。
 */
export function extremumLabelY(pointY: number, kind: 'max' | 'min', height = LONG_H): number {
  const above = pointY - 6
  const below = pointY + 14
  if (kind === 'max') {
    if (above >= 0) return Math.min(height, above)
    return Math.min(height, Math.max(0, below))
  }
  if (below <= height) return Math.max(0, below)
  return Math.min(height, Math.max(0, above))
}

/** 按像素位置切换锚点（靠边用 start/end） */
export function labelAnchor(svgX: number, width = LONG_W, padL = LONG_PAD.l, padR = LONG_PAD.r): 'start' | 'middle' | 'end' {
  const edge = 48
  if (svgX < padL + edge) return 'start'
  if (svgX > width - padR - edge) return 'end'
  return 'middle'
}

/** viewBox x → 最近点下标 */
export function indexAtSvgX(svgX: number, count: number, width = LONG_W, pad = LONG_PAD): number {
  if (count <= 1) return 0
  const inner = width - pad.l - pad.r
  const ratio = (svgX - pad.l) / Math.max(1, inner)
  return Math.max(0, Math.min(count - 1, Math.round(ratio * (count - 1))))
}

/** 长历史图：按日期切 5/10/20 年 / 全部；标出区间最高最低；悬停与键盘读数 */
export default function LongHistoryChart({ points, digits = 1, unit = '', label }: {
  points: [string, number][]
  digits?: number
  unit?: string
  label: string
}): JSX.Element | null {
  const span = historySpanYears(points)
  const ranges = availableRanges(span)
  const [range, setRange] = useState<RangeId>(() => defaultRangeId(span))
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    if (!availableRanges(span).some(r => r.id === range)) setRange(defaultRangeId(span))
  }, [span, range])

  if (points.length < 24) return null

  const opt = ranges.find(r => r.id === range) ?? ranges[ranges.length - 1]
  const shown = cutByYears(points, opt.years)
  if (shown.length < 2) return null

  const values = shown.map(p => p[1])
  const lo = Math.min(...values), hi = Math.max(...values), vspan = hi - lo || 1
  const x = (i: number) => LONG_PAD.l + (i / (shown.length - 1)) * (LONG_W - LONG_PAD.l - LONG_PAD.r)
  const y = (v: number) => LONG_PAD.t + (1 - (v - lo) / vspan) * (LONG_H - LONG_PAD.t - LONG_PAD.b)
  const path = shown.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join('')
  const last = shown.length - 1
  const maxI = values.indexOf(hi), minI = values.indexOf(lo)
  const cur = hover ?? last
  const fmt = (v: number) => `${v.toFixed(digits)}${unit}`
  const pct = percentileOf(points, shown[cur][1])

  const pick = (e: React.PointerEvent<SVGSVGElement>): void => {
    setHover(indexAtSvgX(clientXToSvgX(e.currentTarget, e.clientX), shown.length))
  }

  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>): void => {
    const current = hover ?? last
    let next: number | null = current
    if (e.key === 'ArrowLeft') next = hover === null ? last : Math.max(0, current - 1)
    else if (e.key === 'ArrowRight') next = hover === null ? last : Math.min(last, current + 1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = last
    else if (e.key === 'Escape') next = null
    else return
    e.preventDefault()
    setHover(next)
  }

  const markIs = (i: number, kind: 'max' | 'min') => (kind === 'max' ? i === maxI : i === minI)

  return (
    <figure className="macro-long">
      <div className="macro-long__bar" role="group" aria-label={`${label}时间范围`}>
        {ranges.map(r => {
          const ok = rangeEnabled(points, r.years)
          return (
            <button
              key={r.id}
              type="button"
              className={`macro-long__tab${range === r.id ? ' is-on' : ''}`}
              aria-pressed={range === r.id}
              disabled={!ok}
              onClick={() => { setRange(r.id); setHover(null) }}
            >{r.label}</button>
          )
        })}
        <span className="macro-long__pct" aria-live="polite">
          {shown[cur][0].slice(0, 7)} · {fmt(shown[cur][1])}{pct !== undefined && ` · 历史分位 ${pct}%`}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${LONG_W} ${LONG_H}`}
        role="img"
        tabIndex={0}
        aria-label={`${label}${shown[0][0].slice(0, 4)}年至今走势，区间最高 ${fmt(hi)}（${shown[maxI][0].slice(0, 7)}），最低 ${fmt(lo)}（${shown[minI][0].slice(0, 7)}）`}
        onPointerDown={e => { if (e.pointerType === 'mouse' && e.button !== 0) return; pick(e) }}
        onPointerMove={pick}
        onPointerLeave={e => { if (e.pointerType === 'mouse') setHover(null) }}
        onKeyDown={onKeyDown}
        onBlur={() => setHover(null)}
      >
        <text className="macro-long__axis" x={LONG_PAD.l - 4} y={y(hi) + 3} textAnchor="end">{fmt(hi)}</text>
        <text className="macro-long__axis" x={LONG_PAD.l - 4} y={y(lo) + 3} textAnchor="end">{fmt(lo)}</text>
        <path className="macro-spark__line" d={path} />
        {hover !== null && <line className="macro-spark__cross" x1={x(hover)} x2={x(hover)} y1={0} y2={LONG_H} />}
        {[maxI, minI].filter((i, n, a) => a.indexOf(i) === n && i !== cur).map(i => {
          const kind: 'max' | 'min' = markIs(i, 'max') ? 'max' : 'min'
          const cy = y(values[i])
          const ly = extremumLabelY(cy, kind)
          return (
            <g key={`${kind}-${i}`}>
              <circle className="macro-long__mark" cx={x(i)} cy={cy} r={3} />
              <text className="macro-long__label" x={x(i)} y={ly} textAnchor={labelAnchor(x(i))}>
                {shown[i][0].slice(0, 7)} {fmt(values[i])}
              </text>
            </g>
          )
        })}
        <circle className="macro-spark__dot" cx={x(cur)} cy={y(shown[cur][1])} r={4} />
      </svg>
    </figure>
  )
}
