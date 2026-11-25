import React from 'react'
import { Link } from 'react-router-dom'
import CapCalculator from './CapCalculator'
import { formatSharePct, tierLabel, visibleText } from './labels'
import type { CombinedStrategyFile } from './types'
import type { TacticalWatch } from './watch'

function officialText(month: string | undefined): string | null {
  if (!month) return null
  const m = Number(month.slice(5, 7))
  return m ? `${m} 月底定档` : null
}

export default function NowPanel({
  data,
  watch = null,
}: {
  data: CombinedStrategyFile
  watch?: TacticalWatch | null
}): JSX.Element {
  const { current } = data
  const tier = current.macroTier
  const share = formatSharePct(current.equityShare)
  const official = officialText(current.official?.month)

  return (
    <section
      className="cs-now cs-hero"
      id="cs-now"
      aria-labelledby="cs-now-title"
      data-tier={tier ?? 'none'}
    >
      <div className="cs-hero__top">
        <h2 id="cs-now-title" className="cs-hero__eyebrow">现在怎么做</h2>
        <span className="cs-hero__chips">
          <span className="cs-chip cs-chip--tier" data-testid="cs-now-tier">
            {tierLabel(tier)}{share ? ` · ${share}` : ''}
          </span>
          {official ? <span className="cs-chip">{official}</span> : null}
        </span>
      </div>

      <div className="cs-hero__grid">
        <div className="cs-hero__main">
          <p className="cs-now__instruction" data-testid="cs-instruction">
            {visibleText(current.instruction)}
          </p>
          <p className="cs-now__scope" data-testid="cs-now-scope">
            这是美股总仓位。主动额度和备用金另按
            <Link to="/monitor?tab=method">风险预算阶段</Link>
            执行。
          </p>
        </div>
        <CapCalculator equityShare={current.equityShare} />
        {watch ? (
          <p
            className={`cs-watch${watch.close ? ' is-close' : ''}`}
            data-testid="cs-now-watch"
            role="note"
          >
            <strong className="cs-watch__label">月底前留意</strong>
            <span>{visibleText(watch.text)}</span>
            {' '}<a href="#cs-triggers">什么情况下要动</a>
          </p>
        ) : null}
      </div>

      <h3 className="cs-now__steps-title">这个月要做的三件事</h3>
      <ol className="cs-now__steps" data-testid="cs-steps">
        {current.steps.map((step, i) => (
          <li key={step.title} data-testid={`cs-step-${step.title}`}>
            <span className="cs-now__step-no" aria-hidden="true">{i + 1}</span>
            <strong className="cs-now__step-title">{step.title}</strong>
            <span className="cs-now__step-text">{visibleText(step.text)}</span>
          </li>
        ))}
      </ol>

      {current.dates.length > 0 ? (
        <p className="cs-now__dates" data-testid="cs-dates">
          <span className="cs-now__dates-label">数据更新</span>
          {current.dates.map((row, i) => (
            <span key={`${row.label}-${row.date}`}>
              {i > 0 ? ' · ' : ''}{row.label} {row.date}
            </span>
          ))}
        </p>
      ) : null}
    </section>
  )
}
