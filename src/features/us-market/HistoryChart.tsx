import React, { useState } from 'react'
import { nearestIndex, weeklyCloses, withinPriceRange, type PriceRange } from './chartSeries'
import type { Point } from './model'

const W = 320
const H = 120
const TOP = 6
const BOTTOM = 18
const LEFT = 4
const RIGHT = 4
const round = (value: number) => Math.round(value * 100) / 100

/** Line chart with the period average, extremes and a hover read-out. */
export default function HistoryChart({ points, label, format, priceRange }: {
  points: Point[]
  label: string
  format(value: number): string
  priceRange?: PriceRange
}): JSX.Element | null {
  // Hover remembers a calendar time, not an index, so prop changes can never leave it stale.
  const [hoverAt, setHoverAt] = useState<number | null>(null)
  const sorted = [...points].sort(([a], [b]) => a.localeCompare(b))
  const ranged = priceRange ? withinPriceRange(sorted, priceRange) : sorted
  // Price charts show daily closes for 1y and the last available weekly close for longer ranges.
  const { points: pts, latestWeekAsOf } = priceRange && priceRange !== '1y'
    ? weeklyCloses(ranged)
    : { points: ranged, latestWeekAsOf: undefined }
  if (pts.length < 3) return null
  const values = pts.map(([, v]) => v)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.05 || 1
  const min = lo - pad
  const max = hi + pad
  // Plot by calendar date so gaps (weekends, holidays, missing weeks) stay visible.
  const t0 = Date.parse(pts[0][0])
  const span = Math.max(Date.parse(pts[pts.length - 1][0]) - t0, 1)
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const last = pts.length - 1
  const x = (date: string) => LEFT + ((Date.parse(date) - t0) / span) * (W - LEFT - RIGHT)
  const y = (v: number) => TOP + (1 - (v - min) / (max - min)) * (H - TOP - BOTTOM)
  const path = pts.map(([d, v], i) => `${i ? 'L' : 'M'}${x(d).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const area = `${path}L${x(pts[last][0]).toFixed(1)},${H - BOTTOM}L${x(pts[0][0]).toFixed(1)},${H - BOTTOM}Z`
  const shown = hoverAt === null ? last : nearestIndex(pts, hoverAt)
  const hiIndex = values.indexOf(hi)
  const loIndex = values.indexOf(lo)
  const ticks = [hi, (hi + lo) / 2, lo]
  // Share of the shown sample below the latest reading, 0 = lowest, 100 = highest.
  const rank = Math.round((values.filter(v => v < values[last]).length / values.length) * 100)
  // Say what the ranked observations are so sampling changes are visible next to the count.
  const basis = priceRange === '1y' ? '日收盘' : priceRange ? '每周最后可用收盘' : '观测'

  const onMove = (event: React.PointerEvent<SVGSVGElement>): void => {
    const box = event.currentTarget.getBoundingClientRect()
    const rel = ((event.clientX - box.left) / box.width) * W
    const clamped = Math.max(0, Math.min(1, (rel - LEFT) / (W - LEFT - RIGHT)))
    setHoverAt(t0 + clamped * span)
  }

  return (
    <figure className="us-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}：${pts[0][0]} ${format(values[0])}，${pts[last][0]} ${format(values[last])}，区间均值 ${format(round(mean))}`}
        onPointerMove={onMove} onPointerLeave={() => setHoverAt(null)}>
        {ticks.map((tick, i) => <g key={i}>
          <line className="us-chart__grid" x1={LEFT} x2={W - RIGHT} y1={y(tick)} y2={y(tick)} />
          <text className="us-chart__tick" x={W - RIGHT} y={y(tick) - 2} textAnchor="end">{format(round(tick))}</text>
        </g>)}
        <path className="us-chart__area" d={area} />
        <line className="us-chart__mean" x1={LEFT} x2={W - RIGHT} y1={y(mean)} y2={y(mean)} />
        <path className="us-chart__line" d={path} />
        <circle className="us-chart__extreme" cx={x(pts[hiIndex][0])} cy={y(hi)} r={2} />
        <circle className="us-chart__extreme" cx={x(pts[loIndex][0])} cy={y(lo)} r={2} />
        {hoverAt !== null && <line className="us-chart__cursor" x1={x(pts[shown][0])} x2={x(pts[shown][0])} y1={TOP} y2={H - BOTTOM} />}
        <circle className="us-chart__dot" cx={x(pts[shown][0])} cy={y(values[shown])} r={3} />
        <text className="us-chart__axis" x={LEFT} y={H - 4}>{pts[0][0].slice(0, 7)}</text>
        <text className="us-chart__axis" x={W - RIGHT} y={H - 4} textAnchor="end">{pts[last][0].slice(0, 7)}</text>
      </svg>
      <figcaption className="us-chart__caption">
        <span><time dateTime={pts[shown][0]}>{pts[shown][0]}</time> <strong>{format(values[shown])}</strong></span>
        <span className="us-chart__legend">均值（虚线）{format(round(mean))} · 最高 {format(hi)}（{pts[hiIndex][0].slice(0, 7)}）· 最低 {format(lo)}（{pts[loIndex][0].slice(0, 7)}）· 最新值高于区间内 {rank}% 的{basis}（{values.length} 个）{latestWeekAsOf ? ` · 最新一周取截至 ${latestWeekAsOf} 的最后可用收盘` : ''}</span>
      </figcaption>
    </figure>
  )
}
