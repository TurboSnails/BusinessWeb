import React, { useState } from 'react'
import type { Point } from './model'

const W = 320
const H = 120
const TOP = 6
const BOTTOM = 18
const LEFT = 4
const RIGHT = 4
const round = (value: number) => Math.round(value * 100) / 100

/** Line chart with the period average, extremes and a hover read-out. */
export default function HistoryChart({ points, label, format }: {
  points: Point[]
  label: string
  format(value: number): string
}): JSX.Element | null {
  const [hover, setHover] = useState<number | null>(null)
  if (points.length < 3) return null
  const values = points.map(([, v]) => v)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.05 || 1
  const min = lo - pad
  const max = hi + pad
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const last = points.length - 1
  const x = (i: number) => LEFT + (i / last) * (W - LEFT - RIGHT)
  const y = (v: number) => TOP + (1 - (v - min) / (max - min)) * (H - TOP - BOTTOM)
  const path = points.map(([, v], i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const area = `${path}L${x(last).toFixed(1)},${H - BOTTOM}L${x(0).toFixed(1)},${H - BOTTOM}Z`
  const shown = hover ?? last
  const hiIndex = values.indexOf(hi)
  const loIndex = values.indexOf(lo)
  const ticks = [hi, (hi + lo) / 2, lo]
  // Where the latest reading sits within the shown range, 0 = lowest, 100 = highest.
  const rank = Math.round((values.filter(v => v < values[last]).length / Math.max(values.length - 1, 1)) * 100)

  const onMove = (event: React.PointerEvent<SVGSVGElement>): void => {
    const box = event.currentTarget.getBoundingClientRect()
    const rel = ((event.clientX - box.left) / box.width) * W
    setHover(Math.max(0, Math.min(last, Math.round(((rel - LEFT) / (W - LEFT - RIGHT)) * last))))
  }

  return (
    <figure className="us-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}：${points[0][0]} ${format(values[0])}，${points[last][0]} ${format(values[last])}，区间均值 ${format(round(mean))}`}
        onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {ticks.map((tick, i) => <g key={i}>
          <line className="us-chart__grid" x1={LEFT} x2={W - RIGHT} y1={y(tick)} y2={y(tick)} />
          <text className="us-chart__tick" x={W - RIGHT} y={y(tick) - 2} textAnchor="end">{format(round(tick))}</text>
        </g>)}
        <path className="us-chart__area" d={area} />
        <line className="us-chart__mean" x1={LEFT} x2={W - RIGHT} y1={y(mean)} y2={y(mean)} />
        <path className="us-chart__line" d={path} />
        <circle className="us-chart__extreme" cx={x(hiIndex)} cy={y(hi)} r={2} />
        <circle className="us-chart__extreme" cx={x(loIndex)} cy={y(lo)} r={2} />
        {hover !== null && <line className="us-chart__cursor" x1={x(shown)} x2={x(shown)} y1={TOP} y2={H - BOTTOM} />}
        <circle className="us-chart__dot" cx={x(shown)} cy={y(values[shown])} r={3} />
        <text className="us-chart__axis" x={LEFT} y={H - 4}>{points[0][0].slice(0, 7)}</text>
        <text className="us-chart__axis" x={W - RIGHT} y={H - 4} textAnchor="end">{points[last][0].slice(0, 7)}</text>
      </svg>
      <figcaption className="us-chart__caption">
        <span><time dateTime={points[shown][0]}>{points[shown][0]}</time> <strong>{format(values[shown])}</strong></span>
        <span className="us-chart__legend">均值（虚线）{format(round(mean))} · 最高 {format(hi)}（{points[hiIndex][0].slice(0, 7)}）· 最低 {format(lo)}（{points[loIndex][0].slice(0, 7)}）· 最新值高于区间内 {rank}% 的时间</span>
      </figcaption>
    </figure>
  )
}
