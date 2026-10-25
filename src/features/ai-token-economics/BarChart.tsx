import React from 'react'

export interface Bar { label: string; value: number; tone?: 'a' | 'b' | 'c' }

/** 横向条形图：以 0 为轴，正负向两侧延伸；仅用 CSS 类上色 */
export default function BarChart({ title, bars, format, unit }: { title: string; bars: Bar[]; format: (v: number) => string; unit?: string }): JSX.Element {
  const width = 640, rowH = 40, left = 150, right = 70, top = 8
  const height = top + bars.length * rowH + 8
  const lo = Math.min(0, ...bars.map(b => b.value)), hi = Math.max(0, ...bars.map(b => b.value))
  const span = hi - lo || 1
  const plot = width - left - right
  const x = (v: number) => left + (v - lo) / span * plot
  const zero = x(0)
  return (
    <figure className="ate-chart">
      <figcaption>{title}{unit && <small>{unit}</small>}</figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}：${bars.map(b => `${b.label} ${format(b.value)}`).join('；')}`}>
        <line className="ate-chart__axis" x1={zero} x2={zero} y1={top} y2={height - 8} />
        {bars.map((b, i) => {
          const y = top + i * rowH
          const x1 = Math.min(zero, x(b.value)), w = Math.max(1, Math.abs(x(b.value) - zero))
          return <g key={b.label} className={`ate-chart__bar ate-chart__bar--${b.tone ?? 'a'}`}>
            <text className="ate-chart__label" x={left - 10} y={y + rowH / 2 + 4} textAnchor="end">{b.label}</text>
            <rect x={x1} y={y + 6} width={w} height={rowH - 14} rx="2" />
            <text className="ate-chart__value" x={b.value >= 0 ? x1 + w + 8 : x1 - 8} y={y + rowH / 2 + 4} textAnchor={b.value >= 0 ? 'start' : 'end'}>{format(b.value)}</text>
          </g>
        })}
      </svg>
    </figure>
  )
}

/** 前后对比的分组竖条图 */
export function PairChart({ title, groups, unit, format }: { title: string; groups: Array<{ label: string; before: number; after: number }>; unit?: string; format: (v: number) => string }): JSX.Element {
  const width = 640, height = 260, left = 20, bottom = 44, top = 24
  const max = Math.max(...groups.flatMap(g => [g.before, g.after])) * 1.15
  const plotH = height - top - bottom
  const slot = (width - left * 2) / groups.length
  const barW = Math.min(54, slot / 3)
  const y = (v: number) => top + (1 - v / max) * plotH
  return (
    <figure className="ate-chart">
      <figcaption>{title}{unit && <small>{unit}</small>}</figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}：${groups.map(g => `${g.label} ${format(g.before)} → ${format(g.after)}`).join('；')}`}>
        <line className="ate-chart__axis" x1={left} x2={width - left} y1={y(0)} y2={y(0)} />
        {groups.map((g, i) => {
          const cx = left + slot * (i + .5)
          return <g key={g.label}>
            <g className="ate-chart__bar ate-chart__bar--b"><rect x={cx - barW - 3} y={y(g.before)} width={barW} height={y(0) - y(g.before)} rx="2" /><text className="ate-chart__value" x={cx - barW / 2 - 3} y={y(g.before) - 6} textAnchor="middle">{format(g.before)}</text></g>
            <g className="ate-chart__bar ate-chart__bar--a"><rect x={cx + 3} y={y(g.after)} width={barW} height={y(0) - y(g.after)} rx="2" /><text className="ate-chart__value" x={cx + barW / 2 + 3} y={y(g.after) - 6} textAnchor="middle">{format(g.after)}</text></g>
            <text className="ate-chart__label" x={cx} y={height - 24} textAnchor="middle">{g.label}</text>
          </g>
        })}
      </svg>
      <p className="ate-legend"><span className="ate-swatch ate-swatch--b" />前（09-13 周 / 降价前）<span className="ate-swatch ate-swatch--a" />后（10-11 周 / 降价后）</p>
    </figure>
  )
}
