import React, { useId, useState } from 'react'

// 板块叠加：最多 3 条分时涨跌幅折线放在同一坐标轴（单轴，单位 %）。颜色用 kp-ov__line--0/1/2（站点变量，避开红绿以免与涨跌混淆），
// 另用实线 / 虚线 / 点线区分，色弱也能分辨。
const W = 720
const H = 240
const PAD = { l: 52, r: 12, t: 12, b: 26 }
const TICKS = ['09:30', '10:30', '11:30', '14:00', '15:00']
export type Series = { code: string; name: string; values: Array<number | null> }

const fmt = (v: number): string => `${v > 0 ? '+' : ''}${v.toFixed(2).replace('-', '−')}%`

export default function OverlayChart({ times, series, label }: { times: string[]; series: Series[]; label: string }): JSX.Element {
  const uid = useId()
  const [hover, setHover] = useState<number | null>(null)
  const vals = series.flatMap(s => s.values).filter((v): v is number => v !== null)
  if (!series.length || !vals.length) return <p className="mm-empty">请选择板块</p>
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals)
  if (lo === hi) { lo -= 1; hi += 1 }
  const pad = (hi - lo) * 0.08
  lo -= pad; hi += pad
  const n = times.length
  const x = (i: number): number => PAD.l + (n > 1 ? (i / (n - 1)) * (W - PAD.l - PAD.r) : 0)
  const y = (v: number): number => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b)
  const path = (vs: Array<number | null>): string => {
    let d = '', pen = false
    vs.forEach((v, i) => { if (v === null) { pen = false; return } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true })
    return d
  }
  const grid = [0, 0.25, 0.5, 0.75, 1].map(t => lo + (hi - lo) * t)
  const onMove = (e: React.PointerEvent<SVGSVGElement>): void => {
    const box = e.currentTarget.getBoundingClientRect()
    const rel = ((e.clientX - box.left) / box.width) * W
    setHover(Math.max(0, Math.min(n - 1, Math.round(((rel - PAD.l) / (W - PAD.l - PAD.r)) * (n - 1)))))
  }
  return (
    <figure className="mm-chart kp-ov">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${uid}-t`} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <title id={`${uid}-t`}>{label}</title>
        {grid.map(t => (
          <g key={t}>
            <line className="mm-chart__grid" x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
            <text className="mm-chart__tick" x={PAD.l - 6} y={y(t) + 4} textAnchor="end">{fmt(t)}</text>
          </g>
        ))}
        <line className="mm-chart__ref" x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} />
        {TICKS.map(t => { const i = times.indexOf(t); return i < 0 ? null : <text key={t} className="mm-chart__tick" x={x(i)} y={H - 6} textAnchor="middle">{t === '11:30' ? '11:30/13:00' : t}</text> })}
        {series.map((s, k) => <path key={s.code} className={`kp-ov__line kp-ov__line--${k}`} d={path(s.values)} />)}
        {hover !== null && <line className="mm-chart__cross" x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} />}
      </svg>
      <figcaption className="kp-ov__legend">
        {hover !== null && <span className="kp-ov__time">{times[hover]}</span>}
        {series.map((s, k) => {
          const v = hover !== null ? s.values[hover] : s.values.filter((z): z is number => z !== null).at(-1) ?? null
          return (
            <span key={s.code} className="kp-ov__item">
              <svg viewBox="0 0 18 6" aria-hidden="true"><line className={`kp-ov__line kp-ov__line--${k}`} x1="0" x2="18" y1="3" y2="3" /></svg>
              {s.name} <b className={v === null || v === 0 ? '' : v > 0 ? 'mm-up' : 'mm-down'}>{v === null ? '—' : fmt(v)}</b>
            </span>
          )
        })}
      </figcaption>
    </figure>
  )
}
