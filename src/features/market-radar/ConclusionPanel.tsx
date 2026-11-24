import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  DIMENSION_ORDER,
  DIMENSION_TITLE,
  formatNum2,
  visibleText,
} from './labels'
import RadarShape from './RadarShape'
import type { RadarDimensionId, RadarFile } from './types'
import './conclusion-panel.css'

const MARKET_HEAT_LABEL = {
  hot: '股市偏热',
  mid: '股市居中',
  cold: '股市偏冷',
} as const

function formatGeneratedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const month = d.getMonth() + 1
  const day = d.getDate()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${month} 月 ${day} 日 ${hh}:${mm}`
}

/** 月末口径的冷热分：优先用 timeline.heatScore，旧数据由估值、拥挤度两维平均 */
export function heatScoreOf(row: RadarFile['backtest']['timeline'][number]): number | null {
  if (row.heatScore != null && Number.isFinite(row.heatScore)) return row.heatScore
  const parts = [row.dims?.[1], row.dims?.[2]].filter((v): v is number => v != null && Number.isFinite(v))
  return parts.length ? parts.reduce((sum, v) => sum + v, 0) / parts.length : null
}

/** 冷热分走势：固定 −1～+1 纵轴，画 0 线与 ±0.5 阈值线；往上是偏冷 */
function HeatSpark({ values }: { values: (number | null)[] }): JSX.Element | null {
  if (values.filter(v => v != null).length < 2) return null
  const W = 120
  const H = 28
  const yAt = (v: number) => H - ((v + 1) / 2) * (H - 4) - 2
  let d = ''
  let pen = false
  values.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) { pen = false; return }
    const x = (i / Math.max(1, values.length - 1)) * W
    d += `${pen ? 'L' : 'M'}${x.toFixed(1)},${yAt(v).toFixed(1)}`
    pen = true
  })
  return (
    <svg className="mr-conclusion__score-spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="冷热分近 10 年走势" data-testid="mr-heat-spark">
      <line className="mr-dims__spark-zero" x1={0} x2={W} y1={yAt(0)} y2={yAt(0)} />
      <line className="mr-conclusion__spark-band" x1={0} x2={W} y1={yAt(0.5)} y2={yAt(0.5)} data-testid="mr-heat-spark-cold" />
      <line className="mr-conclusion__spark-band" x1={0} x2={W} y1={yAt(-0.5)} y2={yAt(-0.5)} data-testid="mr-heat-spark-hot" />
      <path d={d} className="mr-conclusion__score-spark-line" />
    </svg>
  )
}

function DimSpark({ values }: { values: (number | null)[] }): JSX.Element | null {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v))
  if (nums.length < 2) return null
  const W = 88
  const H = 22
  const lo = Math.min(...nums, -1)
  const hi = Math.max(...nums, 1)
  const span = hi - lo || 1
  const yAt = (v: number) => H - ((v - lo) / span) * (H - 4) - 2
  let path = ''
  let pen = false
  values.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) { pen = false; return }
    const x = (i / Math.max(1, values.length - 1)) * W
    path += `${pen ? 'L' : 'M'}${x.toFixed(1)},${yAt(v).toFixed(1)}`
    pen = true
  })
  const zeroY = yAt(0)
  return (
    <svg className="mr-dims__spark" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <line className="mr-dims__spark-zero" x1={0} x2={W} y1={zeroY} y2={zeroY} />
      <path d={path} className="mr-dims__spark-line" />
    </svg>
  )
}

function driverScoreText(score: -1 | 0 | 1 | null): string {
  if (score == null) return '—'
  if (score > 0) return `+${score}`
  if (score < 0) return '−1'
  return '0'
}

export type ConclusionActions = {
  onOpenIndicator?: (id: string) => void
  onFilterDimension?: (dim: RadarDimensionId) => void
}

export default function ConclusionPanel({
  data,
  onOpenIndicator,
  onFilterDimension,
}: { data: RadarFile } & ConclusionActions): JSX.Element {
  const { current, backtest } = data
  const heat = current.heat
  const dims = DIMENSION_ORDER.map(id => current.dimensions.find(d => d.id === id)).filter(Boolean)
  const counts = current.counts
  const statusParts = [
    counts.status.fresh ? `${counts.status.fresh} 项最新` : null,
    counts.status.stale ? `${counts.status.stale} 项滞后` : null,
    counts.status.discontinued ? `${counts.status.discontinued} 项停更` : null,
    counts.status.sparse ? `${counts.status.sparse} 项零星` : null,
  ].filter(Boolean)

  const lastMonth = backtest.timeline.at(-1) ?? null
  const lastHeat = lastMonth ? heatScoreOf(lastMonth) : null
  // 先取最近 120 个月再画，缺值断开，保证横轴就是近 10 年
  const heatSeries = useMemo(() => backtest.timeline.slice(-120).map(heatScoreOf), [backtest.timeline])

  const dimSeries = useMemo(() => {
    const map = new Map<RadarDimensionId, (number | null)[]>()
    DIMENSION_ORDER.forEach((id, index) => {
      const series = backtest.timeline.map(row => row.dims?.[index] ?? null)
      map.set(id, series.slice(-120))
    })
    return map
  }, [backtest.timeline])

  const heatTrend = heatSeries.filter(v => v != null).length >= 2 ? (
    <div className="mr-conclusion__trend-block" data-testid="mr-heat-trend">
      <div className="mr-conclusion__score-trend">
        <span className="mr-conclusion__score-trend-label">冷热分近 10 年走势（往上偏冷，虚线为 ±0.50）</span>
        <HeatSpark values={heatSeries} />
      </div>
      <p className="mr-conclusion__last-month" data-testid="mr-last-month">
        月末口径，≤ −0.50 为偏热、≥ +0.50 为偏冷
        {lastMonth && lastHeat != null ? `；${lastMonth.d} 月末 ${visibleText(formatNum2(lastHeat, { signed: true }))}` : ''}
        。上面的读数用最新数据，可能与月末不同。
      </p>
    </div>
  ) : null

  return (
    <section className="mr-conclusion" id="mr-conclusion" aria-labelledby="mr-conclusion-title">
      <h2 id="mr-conclusion-title">结论</h2>

      <div className="mr-conclusion__grid">
        <div className="mr-conclusion__stack">
          <div className="mr-conclusion__main" data-testid="mr-conclusion-main">
            <p
              className={`mr-conclusion__heat${heat ? ` mr-conclusion__heat--${heat}` : ''}`}
              data-testid="mr-heat"
            >
              {heat ? MARKET_HEAT_LABEL[heat] : '冷热待定'}
            </p>
            <p className="mr-conclusion__headline" data-testid="mr-headline">
              {visibleText(current.headline)}
            </p>
            <p className="mr-conclusion__strategy-link" data-testid="mr-strategy-link">
              冷热不改变仓位。仓位多少、这个阶段怎么做，见
              {' '}
              <Link to="/invest/strategy">综合策略</Link>
              。
            </p>
            <p className="mr-conclusion__freshness" data-testid="mr-freshness">
              {counts.total} 项指标
              {statusParts.length ? `：${statusParts.join(' · ')}` : ''}
            </p>
            <p className="mr-conclusion__generated" data-testid="mr-generated">
              数据生成于 {formatGeneratedAt(data.generatedAt)}
            </p>
            {current.caveats.length ? (
              <ul className="mr-conclusion__caveats" data-testid="mr-caveats">
                {current.caveats.map(text => (
                  <li key={text}>{visibleText(text)}</li>
                ))}
              </ul>
            ) : null}
          </div>
          {heatTrend}
        </div>
        <div className="mr-conclusion__shape" data-testid="mr-conclusion-shape">
          <RadarShape dimensions={current.dimensions} />
        </div>
      </div>

      <ul className="mr-dims" data-testid="mr-dimensions">
        {dims.map(dim => {
          if (!dim) return null
          return (
            <li key={dim.id} className="mr-dims__card" data-testid={`mr-dim-${dim.id}`}>
              <div className="mr-dims__head">
                <h3 className="mr-dims__title">{DIMENSION_TITLE[dim.id] ?? dim.title}</h3>
                <p className="mr-dims__score" data-testid={`mr-dim-score-${dim.id}`}>
                  {dim.score == null ? '—' : visibleText(formatNum2(dim.score, { signed: true }))}
                </p>
                <DimSpark values={dimSeries.get(dim.id) ?? []} />
                <button
                  type="button"
                  className="mr-dims__filter"
                  data-testid={`mr-dim-filter-${dim.id}`}
                  onClick={() => onFilterDimension?.(dim.id)}
                >
                  看这一维
                </button>
              </div>
              {dim.drivers?.length ? (
                <ul className="mr-dims__drivers" data-testid={`mr-dim-drivers-${dim.id}`}>
                  {dim.drivers.map(driver => (
                    <li key={driver.id} className="mr-dims__driver">
                      <button
                        type="button"
                        className="mr-dims__driver-btn"
                        onClick={() => onOpenIndicator?.(driver.id)}
                      >
                        {driver.label}
                      </button>
                      <span className="mr-dims__driver-score">{driverScoreText(driver.score)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mr-dims__summary">{visibleText(dim.summary)}</p>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
