import React, { useId, useState } from 'react'

export type Point = { date: string; value: number | null; muted?: boolean }

const W = 720
const H = 220
const PAD = { l: 48, r: 12, t: 12, b: 26 }

const md = (d: string): string => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`

/**
 * 单序列走势图（折线或柱）：悬停十字线显示当日数值；refs 画参考线（如 75 / 25、2% / −1%）。
 * 柱状时按较前一日增减着色（A 股习惯：红增绿减）；muted 的点（补算数据）用虚线 / 浅色。
 */
export default function MoodChart({ points, label, format, refs = [], kind = 'line', zeroBase = false }: {
  points: Point[]
  label: string
  format: (v: number) => string
  refs?: Array<{ value: number; label: string }>
  kind?: 'line' | 'bar'
  zeroBase?: boolean
}): JSX.Element {
  const [hover, setHover] = useState<number | null>(null)
  const uid = useId()
  const vals = points.map(p => p.value).filter((v): v is number => v !== null)
  if (!vals.length) return <p className="mm-empty">暂无历史数据</p>
  const all = [...vals, ...refs.map(r => r.value), ...(zeroBase || kind === 'bar' ? [0] : [])]
  let lo = Math.min(...all), hi = Math.max(...all)
  if (lo === hi) { lo -= 1; hi += 1 }
  const pad = (hi - lo) * 0.06
  if (!(zeroBase || kind === 'bar') || lo < 0) lo -= pad
  hi += pad
  const n = points.length
  const step = (W - PAD.l - PAD.r) / Math.max(n, 1)
  const x = (i: number): number => (kind === 'bar' ? PAD.l + step * (i + 0.5) : PAD.l + (n > 1 ? (i / (n - 1)) * (W - PAD.l - PAD.r) : (W - PAD.l - PAD.r) / 2))
  const y = (v: number): number => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b)
  const ticks = [0, 1 / 3, 2 / 3, 1].map(t => lo + (hi - lo) * t)
  const every = Math.max(1, Math.ceil(n / 7))

  const segments = (muted: boolean): string => {
    let d = '', pen = false
    points.forEach((p, i) => {
      const next = points[i + 1]
      const inSeg = p.value !== null && (!!p.muted === muted || (next && !!next.muted === muted && next.value !== null))
      if (!inSeg) { pen = false; return }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value as number).toFixed(1)}`
      pen = true
    })
    return d
  }

  const onMove = (e: React.PointerEvent<SVGSVGElement>): void => {
    const box = e.currentTarget.getBoundingClientRect()
    const rel = ((e.clientX - box.left) / box.width) * W
    const i = kind === 'bar' ? Math.floor((rel - PAD.l) / step) : Math.round(((rel - PAD.l) / (W - PAD.l - PAD.r)) * (n - 1))
    setHover(Math.max(0, Math.min(n - 1, i)))
  }
  const hp = hover === null ? null : points[hover]
  const barW = Math.max(2, Math.min(18, step - 2))

  return (
    <figure className="mm-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${uid}-t`} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <title id={`${uid}-t`}>{label}</title>
        {ticks.map(t => (
          <g key={t}>
            <line className="mm-chart__grid" x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
            <text className="mm-chart__tick" x={PAD.l - 6} y={y(t) + 4} textAnchor="end">{format(t)}</text>
          </g>
        ))}
        {refs.map(r => (
          <g key={r.label}>
            <line className="mm-chart__ref" x1={PAD.l} x2={W - PAD.r} y1={y(r.value)} y2={y(r.value)} />
            <text className="mm-chart__ref-label" x={W - PAD.r - 4} y={y(r.value) - 4} textAnchor="end">{r.label}</text>
          </g>
        ))}
        {points.map((p, i) => (i % every === 0 || i === n - 1) && (
          <text key={p.date} className="mm-chart__tick" x={x(i)} y={H - 8} textAnchor="middle">{md(p.date)}</text>
        ))}
        {kind === 'bar'
          ? points.map((p, i) => {
            if (p.value === null) return null
            const prev = points[i - 1]?.value
            const cls = prev === null || prev === undefined ? 'is-flat' : p.value >= prev ? 'is-up' : 'is-down'
            const top = Math.min(y(p.value), y(Math.max(lo, 0)))
            return <rect key={p.date} className={`mm-chart__bar ${cls}${p.muted ? ' is-muted' : ''}`} x={x(i) - barW / 2} y={top} width={barW} height={Math.max(1, Math.abs(y(Math.max(lo, 0)) - y(p.value)))} rx={2} />
          })
          : (
            <>
              <path className="mm-chart__line is-muted" d={segments(true)} />
              <path className="mm-chart__line" d={segments(false)} />
              {/* 前后都没有数据的孤立点画成圆点，否则只有一天数据时什么也看不到 */}
              {points.map((p, i) => p.value !== null && (points[i - 1]?.value ?? null) === null && (points[i + 1]?.value ?? null) === null && (
                <circle key={p.date} className={`mm-chart__solo${p.muted ? ' is-muted' : ''}`} cx={x(i)} cy={y(p.value)} r={3.5} />
              ))}
            </>
          )}
        {hp && hover !== null && (
          <g>
            <line className="mm-chart__cross" x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} />
            {hp.value !== null && kind === 'line' && <circle className="mm-chart__dot" cx={x(hover)} cy={y(hp.value)} r={4} />}
          </g>
        )}
      </svg>
      <figcaption className="mm-chart__caption" aria-live="polite">
        {hp ? <><b>{hp.date}</b> {hp.value === null ? '—' : format(hp.value)}{hp.muted ? '（补算）' : ''}</> : '把鼠标移到图上查看每日数值'}
      </figcaption>
    </figure>
  )
}
