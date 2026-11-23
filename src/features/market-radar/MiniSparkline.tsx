import React, { useId } from 'react'

/** 迷你折线：指标最近观测，无缩放控件 */
export default function MiniSparkline({
  history,
  label,
}: {
  history: [string, number][]
  label: string
}): JSX.Element | null {
  const titleId = useId()
  if (history.length < 2) return null
  const W = 220
  const H = 48
  const PAD = 4
  const values = history.map(([, v]) => v)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || 1
  const x = (i: number) => PAD + (i / (history.length - 1)) * (W - PAD * 2)
  const y = (v: number) => PAD + (1 - (v - lo) / span) * (H - PAD * 2)
  const d = history.map(([, v], i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const last = history[history.length - 1]
  const first = history[0]

  return (
    <figure className="mr-spark" data-testid="mr-sparkline">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={titleId}>
        <title id={titleId}>
          {label}：{first[0]} 至 {last[0]}
        </title>
        <path className="mr-spark__line" d={d} />
        <circle className="mr-spark__dot" cx={x(history.length - 1)} cy={y(last[1])} r={2.5} />
      </svg>
      <figcaption className="mr-spark__cap">
        {first[0].slice(0, 7)} → {last[0].slice(0, 7)}
      </figcaption>
    </figure>
  )
}
