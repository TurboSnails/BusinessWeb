import React from 'react'
import { Badge } from '../../components/ui'
import { sourceHref, sourceLabel } from './chips'
import {
  extraUnitNote,
  formatDirection,
  formatHistoryPosition,
  formatLastMove,
  formatReadingDate,
  formatReadingParts,
} from './OverviewFormat'
import type { Reading } from './types'

export default function ReadingCell({ reading, loading = false }: {
  reading: Reading | null | undefined
  loading?: boolean
}): JSX.Element {
  if (loading) return <div className="mm-reading mm-reading--muted" role="status">读数加载中</div>
  if (!reading) return <div className="mm-reading mm-reading--empty">本站暂无</div>

  const history = formatHistoryPosition(reading)
  const direction = formatDirection(reading)
  const date = formatReadingDate(reading.date, reading.frequency)
  const href = sourceHref(reading.source)
  const label = sourceLabel(reading.source)
  const unitNote = extraUnitNote(reading)
  const lastMove = formatLastMove(reading)
  const { digits, unitSuffix } = formatReadingParts(reading)

  return (
    <div className="mm-reading">
      <span className="mm-reading__label">{reading.label}</span>
      <span className="mm-reading__line">
        <span className="mm-reading__value">
          {digits}
          {unitSuffix ? <span className="mm-reading__unit">{unitSuffix === '%' ? '%' : ` ${unitSuffix}`}</span> : null}
        </span>
        <span className="mm-reading__sep" aria-hidden="true">·</span>
        <time className="mm-reading__date" dateTime={reading.date}>{date}</time>
        {history.map(part => (
          <React.Fragment key={part}>
            <span className="mm-reading__sep" aria-hidden="true">·</span>
            <span className="mm-reading__hist">{part}</span>
          </React.Fragment>
        ))}
        {direction && (
          <>
            <span className="mm-reading__sep" aria-hidden="true">·</span>
            <span className="mm-reading__dir">{direction}</span>
          </>
        )}
      </span>
      {(reading.stale || reading.refreshFailed) && (
        <span className="mm-reading__flags">
          {reading.stale && <Badge tone="warm" className="mm-chip mm-chip--stale">已过期</Badge>}
          {reading.refreshFailed && (
            <Badge tone="warm" className="mm-chip mm-chip--refresh">上次更新失败</Badge>
          )}
        </span>
      )}
      <details className="mm-reading__details">
        <summary>口径与来源</summary>
        <div className="mm-reading__details-body">
          {reading.note && <span className="mm-reading__note">{reading.note}</span>}
          {unitNote && <span className="mm-reading__note">{unitNote}</span>}
          {lastMove && <span className="mm-reading__note">{lastMove}</span>}
          <span className="mm-reading__source">
            来源：
            {href ? (
              <a href={href} target="_blank" rel="noopener noreferrer">{label}</a>
            ) : (
              label
            )}
          </span>
        </div>
      </details>
    </div>
  )
}
