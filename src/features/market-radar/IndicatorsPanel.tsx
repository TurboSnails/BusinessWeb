import React from 'react'
import { Badge } from '../../components/ui'
import {
  DIMENSION_ORDER,
  DIMENSION_TITLE,
  HEAT_LABEL,
  scoreBadge,
  visibleText,
} from './labels'
import MiniSparkline from './MiniSparkline'
import type { RadarFile, RadarIndicator } from './types'

function PercentileBar({ indicator }: { indicator: RadarIndicator }): JSX.Element {
  const pct = indicator.percentile
  const heat = indicator.heat
  const W = 120
  const H = 10
  const x = pct == null ? null : (Math.max(0, Math.min(100, pct)) / 100) * W
  return (
    <div
      className="mr-pct"
      role="img"
      aria-label={
        pct == null
          ? '历史百分位暂无'
          : `历史百分位 ${pct.toFixed(0)}，${HEAT_LABEL[heat]}`
      }
      data-testid={`mr-pct-${indicator.id}`}
    >
      <svg className="mr-pct__svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={`mr-pct-g-${indicator.id}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" className="mr-pct__stop--cold" />
            <stop offset="50%" className="mr-pct__stop--mid" />
            <stop offset="100%" className="mr-pct__stop--hot" />
          </linearGradient>
        </defs>
        <rect
          className="mr-pct__track"
          x={0}
          y={2}
          width={W}
          height={6}
          rx={3}
          fill={`url(#mr-pct-g-${indicator.id})`}
        />
        {x != null ? (
          <circle className={`mr-pct__thumb mr-pct__thumb--${heat}`} cx={x} cy={H / 2} r={4} />
        ) : null}
      </svg>
      <div className="mr-pct__meta">
        <span className="mr-pct__num">{pct == null ? '—' : `${Math.round(pct)}`}</span>
        <span className={`mr-pct__heat mr-pct__heat--${heat}`}>{HEAT_LABEL[heat]}</span>
      </div>
    </div>
  )
}

function IndicatorRow({ item }: { item: RadarIndicator }): JSX.Element {
  const scoreText = visibleText(scoreBadge(item.score))
  return (
    <details className="mr-ind" data-testid={`mr-ind-${item.id}`}>
      <summary className="mr-ind__summary">
        <span className="mr-ind__name">{item.label}</span>
        <span className="mr-ind__display">{visibleText(item.display)}</span>
        <PercentileBar indicator={item} />
        <Badge tone={item.score == null ? 'muted' : item.score > 0 ? 'down' : item.score < 0 ? 'warm' : 'neutral'}>
          <span data-testid={`mr-score-badge-${item.id}`}>{scoreText}</span>
        </Badge>
        <span className="mr-ind__years" data-testid={`mr-years-${item.id}`}>
          {item.historyYears == null ? '历史年数 —' : item.historyYears < 1 ? '仅零星读数' : `历史约 ${item.historyYears >= 10 ? Math.round(item.historyYears) : item.historyYears.toFixed(1)} 年`}
        </span>
        <Badge tone={item.inScore ? 'accent' : 'neutral'}>
          <span data-testid={`mr-inscore-${item.id}`}>
            {item.inScore ? '计分' : '只展示'}
          </span>
        </Badge>
      </summary>
      <div className="mr-ind__body">
        {!item.inScore ? (
          <p className="mr-ind__reason" data-testid={`mr-reason-${item.id}`}>
            {visibleText(item.rule)}
          </p>
        ) : (
          <p className="mr-ind__rule" data-testid={`mr-rule-${item.id}`}>
            打分规则：{visibleText(item.rule)}
          </p>
        )}
        {item.note ? <p className="mr-ind__note">{visibleText(item.note)}</p> : null}
        <MiniSparkline history={item.history} label={item.label} display={item.display} />
      </div>
    </details>
  )
}

export default function IndicatorsPanel({ data }: { data: RadarFile }): JSX.Element {
  return (
    <section className="mr-indicators" id="mr-indicators" aria-labelledby="mr-indicators-title">
      <h2 id="mr-indicators-title">指标</h2>
      <p className="mr-muted">按五个维度分组。百分位用扩张窗口（只用当时可得数据）；可点开看近况折线与规则。</p>
      {DIMENSION_ORDER.map(dimId => {
        const items = data.indicators.filter(i => i.dimension === dimId)
        if (!items.length) return null
        return (
          <div key={dimId} className="mr-ind-group" data-testid={`mr-ind-group-${dimId}`}>
            <h3 className="mr-ind-group__title">{DIMENSION_TITLE[dimId]}</h3>
            <div className="mr-ind-group__list">
              {items.map(item => <IndicatorRow key={item.id} item={item} />)}
            </div>
          </div>
        )
      })}
    </section>
  )
}
