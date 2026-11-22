import React from 'react'
import { historyBarModel } from './OverviewFormat'
import type { Reading } from './types'

export default function OverviewHistoryBar({
  reading,
}: {
  reading: Pick<Reading, 'longPercentile' | 'longPercentileSince' | 'percentile' | 'percentileYears'> | null | undefined
}): JSX.Element {
  if (!reading) return <span className="mm-overview__muted">—</span>
  const model = historyBarModel(reading)
  if (!model) return <span className="mm-hist">历史不足</span>

  const pct = Math.max(0, Math.min(100, model.percentile))
  return (
    <div className="mm-hist">
      <div className="mm-hist__row">
        {/* 用 SVG 属性定位标记，不写内联样式 */}
        <svg
          className="mm-hist__bar"
          role="img"
          aria-label={model.ariaLabel}
          viewBox="0 0 100 10"
          preserveAspectRatio="none"
        >
          <rect className="mm-hist__track" x="0" y="3" width="100" height="4" />
          <rect className="mm-hist__mark" x={Math.max(0, Math.min(96, pct - 2))} y="0" width="4" height="10" />
        </svg>
        <span className="mm-hist__label">{model.label}</span>
      </div>
      <p className="mm-hist__window">
        {model.window}
        {model.secondary ? ` · ${model.secondary}` : ''}
      </p>
    </div>
  )
}
