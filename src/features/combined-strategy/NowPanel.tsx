import React from 'react'
import { Link } from 'react-router-dom'
import { EquityCapInput } from '../macro-posture/composite/ConclusionCard'
import {
  formatNum2,
  formatSharePct,
  heatLabel,
  macroSideLabel,
  tierLabel,
  visibleText,
} from './labels'
import type { CombinedStrategyFile } from './types'

export default function NowPanel({ data }: { data: CombinedStrategyFile }): JSX.Element {
  const { current } = data
  const share = formatSharePct(current.equityShare)
  const cell = current.cell

  return (
    <section className="cs-now" id="cs-now" aria-labelledby="cs-now-title">
      <h2 id="cs-now-title">现在怎么做</h2>

      <p className="cs-now__headline" data-testid="cs-headline">
        {visibleText(current.headline)}
      </p>

      <div className="cs-now__strip" data-testid="cs-now-strip">
        <div className="cs-now__chip" data-testid="cs-macro-chip">
          <span className="cs-now__chip-label">宏观档位</span>
          <span className={`cs-now__chip-value${current.macroTier ? ` cs-tier--${current.macroTier}` : ''}`}>
            {tierLabel(current.macroTier)}
            {current.macroSide ? `（${macroSideLabel(current.macroSide)}）` : ''}
          </span>
          <span className="cs-now__chip-meta" data-testid="cs-equity-share">
            {share ? `仓位 ${share}` : '暂不给出仓位'}
          </span>
        </div>
        <div className="cs-now__chip" data-testid="cs-radar-chip">
          <span className="cs-now__chip-label">雷达档位</span>
          <span className={`cs-now__chip-value${current.radarTier ? ` cs-tier--${current.radarTier}` : ''}`}>
            {tierLabel(current.radarTier)}
          </span>
        </div>
        <div className="cs-now__chip" data-testid="cs-heat-chip">
          <span className="cs-now__chip-label">热度</span>
          <span className="cs-now__chip-value">{heatLabel(current.heat)}</span>
          <span className="cs-now__chip-meta" data-testid="cs-heat-score">
            {current.heatScore == null
              ? '—'
              : visibleText(formatNum2(current.heatScore, { signed: true }))}
          </span>
        </div>
      </div>

      <EquityCapInput equityShare={current.equityShare} />

      {cell ? (
        <div className="cs-now__cell" data-testid="cs-now-cell">
          {cell.thin ? (
            <p className="cs-thin-badge" data-testid="cs-thin-badge" role="status">样本少</p>
          ) : null}
          <h3 className="cs-now__cell-title">这一格怎么做</h3>
          <p className="cs-now__action" data-testid="cs-action">{visibleText(cell.action)}</p>
          <p className="cs-now__evidence" data-testid="cs-evidence">{visibleText(cell.evidence)}</p>
        </div>
      ) : null}

      {current.dates.length > 0 ? (
        <ul className="cs-now__dates" data-testid="cs-dates">
          {current.dates.map(row => (
            <li key={`${row.label}-${row.date}`}>{row.label} {row.date}</li>
          ))}
        </ul>
      ) : null}

      <ul className="cs-now__links">
        <li><Link to="/invest/macro-posture">看宏观依据</Link></li>
        <li><Link to="/invest/market-radar">看股市冷热</Link></li>
      </ul>
    </section>
  )
}
