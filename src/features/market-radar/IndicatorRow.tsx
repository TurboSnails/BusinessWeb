import React from 'react'
import { Badge } from '../../components/ui'
import {
  HEAT_LABEL,
  scoreBadge,
  statusLabel,
  visibleText,
} from './labels'
import MiniSparkline from './MiniSparkline'
import IndicatorDetail from './IndicatorDetail'
import type { RadarIndicator } from './types'

function parseDate(d: string): number {
  return Date.parse(d.length === 7 ? `${d}-28` : d)
}

/** 近 3 年；不足 24 个点时取最近 24 个 */
function sparkWindow(history: [string, number][]): [string, number][] {
  if (history.length < 2) return history
  const end = parseDate(history[history.length - 1][0])
  if (!Number.isFinite(end)) return history.slice(-24)
  const cutoff = end - 3 * 365.25 * 86_400_000
  const threeYear = history.filter(([d]) => {
    const t = parseDate(d)
    return Number.isFinite(t) && t >= cutoff
  })
  if (threeYear.length >= 24) return threeYear
  return history.slice(-24)
}

export function heatNaReason(item: RadarIndicator): string {
  if (item.status !== 'fresh') {
    if (item.status === 'stale') return statusLabel(item.status, item.ageDays) ?? '滞后'
    if (item.status === 'discontinued') return '停更'
    return '零星读数'
  }
  if (item.direction === 'none') return '无方向'
  return '历史不足'
}

function HistoryPosition({ indicator, compact }: { indicator: RadarIndicator; compact?: boolean }): JSX.Element {
  const pct = indicator.percentile
  const heat = indicator.heat
  const W = compact ? 64 : 100
  const H = 14
  const x = pct == null ? null : (Math.max(0, Math.min(100, pct)) / 100) * W
  return (
    <div
      className={`mr-pos${compact ? ' mr-pos--compact' : ''}`}
      role="img"
      aria-label={
        pct == null
          ? '历史位置暂无'
          : `历史百分位 ${Math.round(pct)}，${HEAT_LABEL[heat]}${indicator.direction === 'cold' ? '，数值越高越冷' : ''}`
      }
      data-testid={`mr-pct-${indicator.id}`}
    >
      <svg className="mr-pos__svg" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <rect className="mr-pos__track" x={0} y={5} width={W} height={4} rx={2} />
        <line className="mr-pos__tick" x1={(20 / 100) * W} x2={(20 / 100) * W} y1={3} y2={11} />
        <line className="mr-pos__tick" x1={(80 / 100) * W} x2={(80 / 100) * W} y1={3} y2={11} />
        {x != null ? (
          <circle className={`mr-pos__thumb mr-pos__thumb--${heat}`} cx={x} cy={H / 2} r={4} />
        ) : null}
      </svg>
      <div className="mr-pos__meta">
        <span className="mr-pos__num">{pct == null ? '—' : `${Math.round(pct)}`}</span>
        {!compact && indicator.direction === 'cold' ? (
          <span className="mr-pos__hint">数值越高越冷</span>
        ) : null}
      </div>
    </div>
  )
}

function ChangeCell({ item }: { item: RadarIndicator }): JSX.Element {
  const change = item.changes[0]
  if (!change) return <span className="mr-ind-row__muted">—</span>
  const towardLabel = change.toward === 'hot' ? '变热' : change.toward === 'cold' ? '变冷' : '持平'
  return (
    <span
      className={`mr-ind-row__change mr-ind-row__change--${change.toward}`}
      data-testid={`mr-change-${item.id}`}
    >
      <span className="mr-ind-row__change-text">{visibleText(change.text)}</span>
      <span className="mr-ind-row__change-label">{change.label}</span>
      <span className="visually-hidden">（{towardLabel}）</span>
    </span>
  )
}

function UpdateCell({ item }: { item: RadarIndicator }): JSX.Element {
  const mark = statusLabel(item.status, item.ageDays)
  return (
    <span className="mr-ind-row__update" data-testid={`mr-update-${item.id}`}>
      <time dateTime={item.observedOn ?? undefined}>{item.observedOn ?? '—'}</time>
      {mark ? <span className={`mr-ind-row__status mr-ind-row__status--${item.status}`}>{mark}</span> : null}
    </span>
  )
}

function HeatCell({ item }: { item: RadarIndicator }): JSX.Element {
  if (item.heat === 'na') {
    return (
      <span className="mr-ind-row__heat mr-ind-row__heat--na" data-testid={`mr-heat-${item.id}`}>
        <span className="mr-ind-row__heat-main">—</span>
        <span className="mr-ind-row__heat-reason">{heatNaReason(item)}</span>
      </span>
    )
  }
  return (
    <span className={`mr-ind-row__heat mr-pct__heat mr-pct__heat--${item.heat}`} data-testid={`mr-heat-${item.id}`}>
      {HEAT_LABEL[item.heat]}
    </span>
  )
}

export default function IndicatorRow({
  item,
  expanded,
  onToggle,
}: {
  item: RadarIndicator
  expanded: boolean
  onToggle: () => void
}): JSX.Element {
  const scored = item.score != null
  const sparkHistory = sparkWindow(item.history)
  const statusMark = statusLabel(item.status, item.ageDays)

  return (
    <div
      className={`mr-ind-row${expanded ? ' is-expanded' : ''}`}
      data-testid={`mr-ind-${item.id}`}
      id={`mr-ind-${item.id}`}
    >
      <button
        type="button"
        className="mr-ind-row__summary"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className="mr-ind-row__name">
          <span className="mr-ind-row__label">{item.label}</span>
          {scored ? (
            <Badge tone={item.score! > 0 ? 'down' : item.score! < 0 ? 'warm' : 'neutral'}>
              <span data-testid={`mr-score-badge-${item.id}`}>{visibleText(scoreBadge(item.score))}</span>
            </Badge>
          ) : (
            <span className="mr-ind-row__display-only" data-testid={`mr-inscore-${item.id}`}>只展示</span>
          )}
          {scored ? (
            <span className="visually-hidden" data-testid={`mr-inscore-${item.id}`}>计分</span>
          ) : null}
        </span>
        <span className="mr-ind-row__meta">
          <span className="mr-ind-row__value" data-testid={`mr-value-${item.id}`}>{visibleText(item.valueText)}</span>
          <span className="mr-ind-row__change-wrap"><ChangeCell item={item} /></span>
        </span>
        <span className="mr-ind-row__pos">
          <HistoryPosition indicator={item} />
          {statusMark ? (
            <span className={`mr-ind-row__pos-status mr-ind-row__status mr-ind-row__status--${item.status}`}>
              {statusMark}
            </span>
          ) : null}
        </span>
        <HeatCell item={item} />
        <span className="mr-ind-row__spark">
          {sparkHistory.length >= 2 && item.status !== 'sparse' ? (
            <MiniSparkline history={sparkHistory} label={item.label} display={item.display} simple />
          ) : (
            <span className="mr-ind-row__muted">—</span>
          )}
        </span>
        <span className="mr-ind-row__update-wrap"><UpdateCell item={item} /></span>
      </button>
      {expanded ? (
        <div className="mr-ind-row__panel">
          <IndicatorDetail item={item} />
        </div>
      ) : null}
    </div>
  )
}
