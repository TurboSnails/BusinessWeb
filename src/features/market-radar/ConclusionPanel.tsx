import React from 'react'
import { Link } from 'react-router-dom'
import {
  DIMENSION_ORDER,
  DIMENSION_TITLE,
  TIER_ORDER_DEFENSE_LEFT,
  formatNum2,
  tierLabel,
  visibleText,
} from './labels'
import type { RadarFile } from './types'
import type { TierId } from '../macro-posture/composite/types'

const TIER_DEFS: { id: TierId; label: string }[] = TIER_ORDER_DEFENSE_LEFT.map(id => ({
  id,
  label: tierLabel(id),
}))

function TierStrip({ current }: { current: TierId | null }): JSX.Element {
  return (
    <ol className="mr-tier-strip" aria-label="风险档位，防守在左、进攻在右" data-testid="mr-tier-strip">
      {TIER_DEFS.map(tier => {
        const active = tier.id === current
        return (
          <li
            key={tier.id}
            className={`mr-tier-strip__seg mr-tier-strip__seg--${tier.id}${active ? ' is-active' : ''}`}
            aria-current={active ? 'true' : undefined}
          >
            <span className="mr-tier-strip__label">{tier.label}</span>
            {active ? <span className="visually-hidden">（当前）</span> : null}
          </li>
        )
      })}
    </ol>
  )
}

export default function ConclusionPanel({
  data,
  mastersTier,
}: {
  data: RadarFile
  mastersTier: TierId | null
}): JSX.Element {
  const { current, comparison } = data
  const radarTier = current.tier
  const compareTier = mastersTier ?? comparison.mastersTier
  const dims = DIMENSION_ORDER.map(id => current.dimensions.find(d => d.id === id)).filter(Boolean)

  return (
    <section className="mr-conclusion" id="mr-conclusion" aria-labelledby="mr-conclusion-title">
      <h2 id="mr-conclusion-title">结论</h2>

      <TierStrip current={radarTier} />

      <div className="mr-conclusion__grid">
        <div className="mr-conclusion__main" data-testid="mr-conclusion-main">
          <p
            className={`mr-conclusion__tier${radarTier ? ` mr-conclusion__tier--${radarTier}` : ''}`}
            data-testid="mr-tier-name"
          >
            {tierLabel(radarTier)}
          </p>
          <p className="mr-conclusion__score" data-testid="mr-score">
            综合分 {current.score == null ? '—' : visibleText(formatNum2(current.score, { signed: true }))}
          </p>
          <p className="mr-conclusion__headline" data-testid="mr-headline">
            {visibleText(current.headline)}
          </p>
        </div>

        <aside className="mr-conclusion__masters" data-testid="mr-masters-compare">
          <p className="mr-conclusion__masters-label">大师方案（宏观攻守）</p>
          <p
            className={`mr-conclusion__masters-tier${compareTier ? ` mr-conclusion__tier--${compareTier}` : ''}`}
            data-testid="mr-masters-tier"
          >
            {tierLabel(compareTier)}
          </p>
          <p className="mr-conclusion__masters-text" data-testid="mr-comparison-text">
            {visibleText(comparison.text)}
          </p>
          <p className="mr-conclusion__masters-link">
            <Link to="/invest/macro-posture">查看宏观攻守全文</Link>
          </p>
        </aside>
      </div>

      <ul className="mr-dims" data-testid="mr-dimensions">
        {dims.map(dim => {
          if (!dim) return null
          return (
            <li key={dim.id} className="mr-dims__card" data-testid={`mr-dim-${dim.id}`}>
              <h3 className="mr-dims__title">{DIMENSION_TITLE[dim.id] ?? dim.title}</h3>
              <p className="mr-dims__score" data-testid={`mr-dim-score-${dim.id}`}>
                {dim.score == null ? '—' : visibleText(formatNum2(dim.score, { signed: true }))}
              </p>
              <p className="mr-dims__summary">{visibleText(dim.summary)}</p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
