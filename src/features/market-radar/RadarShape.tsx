import React from 'react'
import { DIMENSION_ORDER, DIMENSION_TITLE, formatNum2, visibleText } from './labels'
import type { RadarDimensionScore } from './types'

const CX = 120
const CY = 120
const R = 78
const ZERO_R = R * 0.5

function polar(angle: number, radius: number): [number, number] {
  const rad = ((angle - 90) * Math.PI) / 180
  return [CX + radius * Math.cos(rad), CY + radius * Math.sin(rad)]
}

function scoreToRadius(score: number | null): number {
  if (score == null || !Number.isFinite(score)) return ZERO_R
  const clamped = Math.max(-1, Math.min(1, score))
  return ((clamped + 1) / 2) * R
}

function scoreText(score: number | null): string {
  if (score == null) return '暂无'
  return visibleText(formatNum2(score, { signed: true }))
}

export default function RadarShape({ dimensions }: { dimensions: RadarDimensionScore[] }): JSX.Element {
  const ordered = DIMENSION_ORDER.map(id => dimensions.find(d => d.id === id)).filter(Boolean) as RadarDimensionScore[]
  const step = 360 / Math.max(ordered.length, 1)
  const points = ordered.map((dim, i) => {
    const [x, y] = polar(i * step, scoreToRadius(dim.score))
    return { dim, x, y, missing: dim.score == null }
  })
  const polygon = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const zeroRing = DIMENSION_ORDER.map((_, i) => polar(i * step, ZERO_R).map(n => n.toFixed(1)).join(',')).join(' ')
  const grid = [0.25, 0.5, 0.75, 1].map(frac =>
    DIMENSION_ORDER.map((_, i) => polar(i * step, R * frac).map(n => n.toFixed(1)).join(',')).join(' '),
  )
  const labels = ordered.map((dim, i) => {
    const [x, y] = polar(i * step, R + 28)
    return {
      id: dim.id,
      title: DIMENSION_TITLE[dim.id] ?? dim.title,
      score: scoreText(dim.score),
      x,
      y,
    }
  })
  const alt = ordered
    .map(d => `${DIMENSION_TITLE[d.id] ?? d.title} ${scoreText(d.score)}`)
    .join('；')

  return (
    <div className="mr-radar-shape" data-testid="mr-radar-shape">
      <svg
        className="mr-radar-shape__svg"
        viewBox="0 0 240 240"
        role="img"
        aria-label={`五维雷达：${alt}`}
      >
        {grid.map(pointsStr => (
          <polygon key={pointsStr} className="mr-radar-shape__grid" points={pointsStr} />
        ))}
        <polygon className="mr-radar-shape__zero" points={zeroRing} />
        <polygon className="mr-radar-shape__fill" points={polygon} />
        {points.map(p => (
          <circle key={p.dim.id} className="mr-radar-shape__dot" cx={p.x} cy={p.y} r={3.5} />
        ))}
        {labels.map(lab => (
          <text
            key={lab.id}
            className="mr-radar-shape__label"
            x={lab.x}
            y={lab.y}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            <tspan x={lab.x} dy="-0.55em">{lab.title}</tspan>
            <tspan x={lab.x} dy="1.2em">{lab.score}</tspan>
          </text>
        ))}
      </svg>
      <p className="mr-radar-shape__note">
        实线是当前各维度分，虚线是 0 分；越靠外越有利于股票。
      </p>
    </div>
  )
}
