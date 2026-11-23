import React, { useId, useMemo, useState } from 'react'
import type { Backtest, TierId } from './types'

const W = 640
const H = 240
const TOP = 12
const MID = 160
const BOTTOM = 36
const LEFT = 52
const RIGHT = 12

const TIER_LABEL: Record<TierId, string> = {
  offense: '进攻',
  'lean-offense': '偏进攻',
  neutral: '中性',
  'lean-defense': '偏防守',
  defense: '防守',
}

const LEGEND_TIERS: TierId[] = ['defense', 'lean-defense', 'neutral', 'lean-offense', 'offense']

function logY(value: number, min: number, max: number, y0: number, y1: number): number {
  const lo = Math.log(min)
  const hi = Math.log(max)
  const t = (Math.log(value) - lo) / (hi - lo || 1)
  return y0 + (1 - t) * (y1 - y0)
}

/** 在对数区间内挑 3–4 个整数刻度 */
function logTicks(min: number, max: number): number[] {
  const candidates = [50, 100, 200, 500, 1000, 2000, 5000, 10000]
  const inside = candidates.filter(v => v > min * 1.02 && v < max * 0.98)
  if (inside.length >= 3) {
    if (inside.length <= 4) return inside
    const step = Math.ceil(inside.length / 4)
    return inside.filter((_, i) => i % step === 0).slice(0, 4)
  }
  const mid = Math.exp((Math.log(min) + Math.log(max)) / 2)
  const q1 = Math.exp(Math.log(min) * 0.75 + Math.log(max) * 0.25)
  const q3 = Math.exp(Math.log(min) * 0.25 + Math.log(max) * 0.75)
  return [Math.round(q1), Math.round(mid), Math.round(q3)].filter((v, i, arr) => arr.indexOf(v) === i && v > min && v < max)
}

function decadeLabels(pts: { d: string }[]): { i: number; label: string }[] {
  const out: { i: number; label: string }[] = []
  let lastDecade = ''
  pts.forEach((p, i) => {
    const year = Number(p.d.slice(0, 4))
    if (!Number.isFinite(year)) return
    const decade = `${Math.floor(year / 10) * 10}`
    if (decade !== lastDecade && year % 10 === 0) {
      out.push({ i, label: String(year) })
      lastDecade = decade
    } else if (decade !== lastDecade && i === 0) {
      out.push({ i, label: String(Math.floor(year / 10) * 10) })
      lastDecade = decade
    }
  })
  return out
}

function formatAxis(n: number): string {
  return n.toLocaleString('zh-CN')
}

export default function TimelineChart({ timeline }: { timeline: Backtest['timeline'] }): JSX.Element | null {
  const labelId = useId()
  const [index, setIndex] = useState(() => Math.max(0, timeline.length - 1))
  const pts = useMemo(() => timeline.filter(row => row.spx > 0), [timeline])
  if (pts.length < 2) return null

  const prices = pts.map(p => p.spx)
  const minP = Math.min(...prices)
  const maxP = Math.max(...prices)
  const padMin = Math.max(minP * 0.92, 1)
  const padMax = maxP * 1.05
  const yTicks = logTicks(padMin, padMax)
  const xDecades = decadeLabels(pts)
  const x = (i: number) => LEFT + (i / (pts.length - 1)) * (W - LEFT - RIGHT)
  const yPrice = (v: number) => logY(v, padMin, padMax, TOP, MID - 8)
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${yPrice(p.spx).toFixed(1)}`).join('')

  const bandTop = MID
  const bandH = H - BOTTOM - MID
  const shown = pts[Math.min(index, pts.length - 1)]

  const pickFromClientX = (clientX: number, target: SVGSVGElement): void => {
    const box = target.getBoundingClientRect()
    const rel = ((clientX - box.left) / box.width) * W
    const t = Math.max(0, Math.min(1, (rel - LEFT) / (W - LEFT - RIGHT)))
    setIndex(Math.round(t * (pts.length - 1)))
  }

  return (
    <figure className="mp-timeline">
      <ul className="mp-timeline__legend" aria-label="档位色块图例">
        {LEGEND_TIERS.map(id => (
          <li key={id}>
            <span className={`mp-timeline__swatch mp-timeline__swatch--${id}`} aria-hidden="true" />
            {TIER_LABEL[id]}
          </li>
        ))}
        <li>
          <span className="mp-timeline__swatch mp-timeline__swatch--rec" aria-hidden="true" />
          灰色阴影为美国官方认定的衰退期（NBER）
        </li>
      </ul>
      <svg
        className="mp-timeline__svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-labelledby={labelId}
        tabIndex={0}
        onPointerMove={e => pickFromClientX(e.clientX, e.currentTarget)}
        onPointerDown={e => pickFromClientX(e.clientX, e.currentTarget)}
        onKeyDown={e => {
          if (e.key === 'ArrowLeft') {
            e.preventDefault()
            setIndex(i => Math.max(0, i - 1))
          }
          if (e.key === 'ArrowRight') {
            e.preventDefault()
            setIndex(i => Math.min(pts.length - 1, i + 1))
          }
        }}
      >
        <title id={labelId}>标普月均价对数走势与最终档位色带</title>
        {pts.map((p, i) => {
          if (!p.rec) return null
          const x0 = x(i)
          const x1 = i + 1 < pts.length ? x(i + 1) : x0 + 2
          return (
            <rect
              key={`rec-${p.d}`}
              className="mp-timeline__recession"
              x={x0}
              y={TOP}
              width={Math.max(x1 - x0, 1)}
              height={H - BOTTOM - TOP}
            />
          )
        })}
        {yTicks.map(tick => (
          <g key={`yt-${tick}`}>
            <line
              className="mp-timeline__grid"
              x1={LEFT}
              x2={W - RIGHT}
              y1={yPrice(tick)}
              y2={yPrice(tick)}
            />
            <text className="mp-timeline__axis" x={4} y={yPrice(tick) + 3}>{formatAxis(tick)}</text>
          </g>
        ))}
        <path className="mp-timeline__line" d={path} fill="none" />
        {pts.map((p, i) => {
          const tier = p.final
          return (
            <rect
              key={`band-${p.d}`}
              className={`mp-timeline__band${tier ? ` mp-timeline__band--${tier}` : ''}`}
              x={x(i)}
              y={bandTop}
              width={Math.max((W - LEFT - RIGHT) / pts.length, 1)}
              height={bandH}
            />
          )
        })}
        <line className="mp-timeline__cursor" x1={x(index)} x2={x(index)} y1={TOP} y2={H - BOTTOM} />
        <circle className="mp-timeline__dot" cx={x(index)} cy={yPrice(shown.spx)} r={3.5} />
        {xDecades.map(({ i, label }) => (
          <text key={`xd-${label}-${i}`} className="mp-timeline__axis" x={x(i)} y={H - 8} textAnchor="middle">
            {label}
          </text>
        ))}
        {xDecades.length === 0 && (
          <>
            <text className="mp-timeline__axis" x={LEFT} y={H - 8}>{pts[0].d.slice(0, 4)}</text>
            <text className="mp-timeline__axis" x={W - RIGHT} y={H - 8} textAnchor="end">{pts[pts.length - 1].d.slice(0, 4)}</text>
          </>
        )}
      </svg>
      <figcaption className="mp-timeline__caption" aria-live="polite">
        <span>
          <time dateTime={shown.d}>{shown.d}</time>
          {' · 月均价 '}
          <strong>{shown.spx.toLocaleString('zh-CN')}</strong>
          {' · 最终档位 '}
          <strong>{shown.final ? TIER_LABEL[shown.final] : '证据不足'}</strong>
          {shown.rec ? ' · 衰退期' : ''}
        </span>
      </figcaption>
      <label className="mp-timeline__select">
        <span className="visually-hidden">按月份查看档位</span>
        <select
          value={String(index)}
          onChange={e => setIndex(Number(e.target.value))}
          aria-label="按月份查看档位"
        >
          {pts.map((p, i) => (
            <option key={p.d} value={i}>
              {p.d}
              {' · '}
              {p.final ? TIER_LABEL[p.final] : '证据不足'}
            </option>
          ))}
        </select>
      </label>
    </figure>
  )
}
