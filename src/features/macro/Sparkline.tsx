import React, { useState } from 'react'

const W = 240
const H = 56
const PAD = 4

/** 近两年迷你走势：弱化色的线 + 强调色的最新点；虚线是黄/红阈值；悬停显示日期与数值 */
export default function Sparkline({ points, thresholds = [], digits = 1, unit = '', label }: {
  points: [string, number][]
  thresholds?: number[]
  digits?: number
  unit?: string
  label: string
}): JSX.Element | null {
  const [hover, setHover] = useState<number | null>(null)
  if (points.length < 2) return null
  const values = points.map(p => p[1])
  const lo = Math.min(...values, ...thresholds)
  const hi = Math.max(...values, ...thresholds)
  const span = hi - lo || 1
  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2)
  const y = (v: number) => PAD + (1 - (v - lo) / span) * (H - PAD * 2)
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join('')
  const last = points.length - 1
  const shown = hover ?? last
  const fmt = (v: number) => `${v.toFixed(digits)}${unit}`

  const onMove = (e: React.PointerEvent<SVGSVGElement>): void => {
    const box = e.currentTarget.getBoundingClientRect()
    const rel = ((e.clientX - box.left) / box.width) * W
    setHover(Math.max(0, Math.min(last, Math.round(((rel - PAD) / (W - PAD * 2)) * last))))
  }

  return (
    <figure className="macro-spark">
      <svg viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`${label}近两年走势：${points[0][0].slice(0, 7)} ${fmt(points[0][1])}，${points[last][0].slice(0, 7)} ${fmt(points[last][1])}`}
        onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {thresholds.map(t => <line key={t} className="macro-spark__threshold" x1={PAD} x2={W - PAD} y1={y(t)} y2={y(t)} />)}
        <path className="macro-spark__line" d={path} />
        {hover !== null && <line className="macro-spark__cross" x1={x(hover)} x2={x(hover)} y1={0} y2={H} />}
        <circle className="macro-spark__dot" cx={x(shown)} cy={y(points[shown][1])} r={3.5} />
      </svg>
      <figcaption className="macro-spark__caption">
        <span>{points[shown][0].slice(0, 7)}</span>
        <span>{fmt(points[shown][1])}</span>
      </figcaption>
    </figure>
  )
}
