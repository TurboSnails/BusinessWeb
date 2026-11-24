import React from 'react'
import IndicatorHistoryChart, { formatPercentileSince, sourceHost } from './IndicatorHistoryChart'
import { visibleText } from './labels'
import type { RadarIndicator } from './types'

export default function IndicatorDetail({ item }: { item: RadarIndicator }): JSX.Element {
  return (
    <div className="mr-ind-detail" data-testid={`mr-detail-${item.id}`}>
      <p className="mr-ind-detail__display">{visibleText(item.display)}</p>
      {item.changes.length ? (
        <ul className="mr-ind-detail__changes">
          {item.changes.map(change => (
            <li key={`${change.label}-${change.since}`}>
              {change.label}：{visibleText(change.text)}
              {change.toward === 'hot' ? '（变热）' : change.toward === 'cold' ? '（变冷）' : ''}
            </li>
          ))}
        </ul>
      ) : null}
      {item.inScore ? (
        <p className="mr-ind-detail__rule" data-testid={`mr-rule-${item.id}`}>
          打分规则：{visibleText(item.rule)}
        </p>
      ) : (
        <p className="mr-ind-detail__reason" data-testid={`mr-reason-${item.id}`}>
          {visibleText(item.rule)}
        </p>
      )}
      {item.note ? <p className="mr-ind-detail__note">{visibleText(item.note)}</p> : null}
      {item.percentile != null ? (
        <p className="mr-ind-detail__pct-meta">
          百分位窗口：{formatPercentileSince(item.percentileSince)}
          {item.percentileBasis ? ` · ${item.percentileBasis}` : ''}
        </p>
      ) : null}
      {item.source ? (
        <p className="mr-ind-detail__source">
          来源：
          {/^https?:\/\//.test(item.source) ? (
            <a href={item.source} target="_blank" rel="noreferrer">{sourceHost(item.source)}</a>
          ) : (
            item.source
          )}
        </p>
      ) : null}
      <IndicatorHistoryChart item={item} />
    </div>
  )
}
