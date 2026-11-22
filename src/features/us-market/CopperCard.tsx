import React, { useState } from 'react'
import { Segmented } from '../../components/ui/PageTabs'
import { SignedChg, format } from './cards'
import {
  COPPER_NOTE,
  COPPER_PENDING,
  buildCopperSnapshot,
} from './copper'
import type { Point, Reading } from './model'

type Props = {
  series?: Record<string, Reading | undefined>
  asOf: string
}

type ChartMode = 'ratio' | 'copper'

const W = 320
const H = 110
const TOP = 8
const BOTTOM = 18
const LEFT = 36
const RIGHT = 36

function fmtCopper(v: number): string {
  return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(v) + ' 美元/磅'
}

function fmtRatio(v: number): string {
  return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 4, maximumFractionDigits: 6 }).format(v)
}

function fmtYield(v: number): string {
  return format(v, '%')
}

function fmtPctile(p: number | undefined): string {
  return p === undefined ? '—' : `${p}% 分位`
}

function DualChart({ dates, ratio, yieldPts }: {
  dates: string[]
  ratio: number[]
  yieldPts: number[]
}): JSX.Element | null {
  const [hover, setHover] = useState<number | null>(null)
  if (dates.length < 3) return null
  const t0 = Date.parse(dates[0]!)
  const span = Math.max(Date.parse(dates.at(-1)!) - t0, 1)
  const x = (date: string) => LEFT + ((Date.parse(date) - t0) / span) * (W - LEFT - RIGHT)
  const scale = (vals: number[]) => {
    const lo = Math.min(...vals)
    const hi = Math.max(...vals)
    const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.05 || 1
    const min = lo - pad
    const max = hi + pad
    return (v: number) => TOP + (1 - (v - min) / (max - min)) * (H - TOP - BOTTOM)
  }
  const yRatio = scale(ratio)
  const yYield = scale(yieldPts)
  const pathOf = (vals: number[], y: (v: number) => number) =>
    vals.map((v, i) => `${i ? 'L' : 'M'}${x(dates[i]!).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const shown = hover === null ? dates.length - 1 : hover
  const onMove = (event: React.PointerEvent<SVGSVGElement>): void => {
    const box = event.currentTarget.getBoundingClientRect()
    const rel = ((event.clientX - box.left) / box.width) * W
    const clamped = Math.max(0, Math.min(1, (rel - LEFT) / (W - LEFT - RIGHT)))
    const t = t0 + clamped * span
    let best = 0
    let bestDist = Infinity
    for (let i = 0; i < dates.length; i++) {
      const dist = Math.abs(Date.parse(dates[i]!) - t)
      if (dist < bestDist) { best = i; bestDist = dist }
    }
    setHover(best)
  }
  return (
    <figure className="us-copper__chart us-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`近 5 年铜金比与 10 年期国债收益率：${dates[0]} 至 ${dates.at(-1)}`}
        onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <path className="us-chart__line us-copper__ratio-line" d={pathOf(ratio, yRatio)} />
        <path className="us-chart__line us-copper__yield-line" d={pathOf(yieldPts, yYield)} />
        <circle className="us-chart__dot" cx={x(dates[shown]!)} cy={yRatio(ratio[shown]!)} r={3} />
        <text className="us-chart__axis" x={LEFT} y={H - 4}>{dates[0]!.slice(0, 7)}</text>
        <text className="us-chart__axis" x={W - RIGHT} y={H - 4} textAnchor="end">{dates.at(-1)!.slice(0, 7)}</text>
        <text className="us-chart__tick" x={2} y={TOP + 8}>{fmtRatio(Math.max(...ratio))}</text>
        <text className="us-chart__tick" x={W - 2} y={TOP + 8} textAnchor="end">{fmtYield(Math.max(...yieldPts))}</text>
      </svg>
      <figcaption className="us-chart__caption">
        <span><time dateTime={dates[shown]}>{dates[shown]}</time> 铜金比 <strong>{fmtRatio(ratio[shown]!)}</strong> · 10 年期美债 <strong>{fmtYield(yieldPts[shown]!)}</strong></span>
        <span className="us-copper__legends">
          <span className="us-copper__legend"><i className="us-copper__swatch us-copper__swatch--ratio" aria-hidden />铜金比（左轴）</span>
          <span className="us-copper__legend"><i className="us-copper__swatch us-copper__swatch--yield" aria-hidden />10 年期美债收益率（右轴）</span>
        </span>
      </figcaption>
    </figure>
  )
}

function CopperLine({ points }: { points: Point[] }): JSX.Element | null {
  const [hover, setHover] = useState<number | null>(null)
  if (points.length < 3) return null
  const dates = points.map(([d]) => d)
  const vals = points.map(([, v]) => v)
  const t0 = Date.parse(dates[0]!)
  const span = Math.max(Date.parse(dates.at(-1)!) - t0, 1)
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.05 || 1
  const min = lo - pad
  const max = hi + pad
  const x = (date: string) => LEFT + ((Date.parse(date) - t0) / span) * (W - LEFT - RIGHT)
  const y = (v: number) => TOP + (1 - (v - min) / (max - min)) * (H - TOP - BOTTOM)
  const path = vals.map((v, i) => `${i ? 'L' : 'M'}${x(dates[i]!).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const shown = hover === null ? dates.length - 1 : hover
  const onMove = (event: React.PointerEvent<SVGSVGElement>): void => {
    const box = event.currentTarget.getBoundingClientRect()
    const rel = ((event.clientX - box.left) / box.width) * W
    const clamped = Math.max(0, Math.min(1, (rel - LEFT) / (W - LEFT - RIGHT)))
    const t = t0 + clamped * span
    let best = 0
    let bestDist = Infinity
    for (let i = 0; i < dates.length; i++) {
      const dist = Math.abs(Date.parse(dates[i]!) - t)
      if (dist < bestDist) { best = i; bestDist = dist }
    }
    setHover(best)
  }
  return (
    <figure className="us-copper__chart us-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`近 5 年铜价：${dates[0]} 至 ${dates.at(-1)}`}
        onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <path className="us-chart__line us-copper__ratio-line" d={path} />
        <circle className="us-chart__dot" cx={x(dates[shown]!)} cy={y(vals[shown]!)} r={3} />
        <text className="us-chart__axis" x={LEFT} y={H - 4}>{dates[0]!.slice(0, 7)}</text>
        <text className="us-chart__axis" x={W - RIGHT} y={H - 4} textAnchor="end">{dates.at(-1)!.slice(0, 7)}</text>
      </svg>
      <figcaption className="us-chart__caption">
        <span><time dateTime={dates[shown]}>{dates[shown]}</time> <strong>{fmtCopper(vals[shown]!)}</strong></span>
      </figcaption>
    </figure>
  )
}

export default function CopperCard({ series, asOf }: Props): JSX.Element {
  const [mode, setMode] = useState<ChartMode>('ratio')
  const snap = buildCopperSnapshot(series, asOf)

  if (!snap.ready) {
    return (
      <section className="us-copper" aria-label="铜价与铜金比（背景）">
        <header className="us-copper__head">
          <h3>铜价与铜金比（背景）</h3>
        </header>
        <p className="us-copper__pending">{COPPER_PENDING}</p>
      </section>
    )
  }

  return (
    <section className="us-copper" aria-label="铜价与铜金比（背景）">
      <header className="us-copper__head">
        <div>
          <h3>铜价与铜金比（背景）</h3>
          <p className="us-market__muted">不参与本页攻守判断，仅作宏观背景。</p>
        </div>
        <Segmented
          label="铜图切换"
          items={[{ id: 'ratio' as const, label: '铜金比与美债' }, { id: 'copper' as const, label: '铜价' }]}
          value={mode}
          onChange={setMode}
        />
      </header>

      <p className="us-copper__asof">
        数据截至 {snap.asOfDate} 收盘
        {snap.stale && <span className="us-copper__stale"> · 更新已落后超过两个交易日，请留意时效</span>}
      </p>

      <dl className="us-copper__stats">
        <div>
          <dt>铜价</dt>
          <dd>
            <strong>{fmtCopper(snap.copper!.value)}</strong>
            <span className="us-market__muted"> · 近 1 年 <SignedChg value={snap.copper!.yearChange} unit="%" /></span>
            <span className="us-market__muted"> · 近 10 年 {fmtPctile(snap.copper!.percentile10y)}</span>
          </dd>
        </div>
        <div>
          <dt>铜金比</dt>
          <dd>
            <strong>{fmtRatio(snap.ratio!.value)}</strong>
            <span className="us-market__muted"> · 近 10 年 {fmtPctile(snap.ratio!.percentile10y)}</span>
          </dd>
        </div>
      </dl>

      {mode === 'ratio'
        ? <DualChart dates={snap.chart.dates} ratio={snap.chart.ratio} yieldPts={snap.chart.yield} />
        : <CopperLine points={snap.copperHistory} />}

      <p className="us-copper__note">{COPPER_NOTE}</p>
    </section>
  )
}
