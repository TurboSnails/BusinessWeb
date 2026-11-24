import React from 'react'
import { EquityCapInput } from '../macro-posture/composite/ConclusionCard'
import { visibleText } from './labels'
import type { CombinedStrategyFile } from './types'

export default function NowPanel({ data }: { data: CombinedStrategyFile }): JSX.Element {
  const { current } = data

  return (
    <section className="cs-now" id="cs-now" aria-labelledby="cs-now-title">
      <h2 id="cs-now-title">现在怎么做</h2>

      <p className="cs-now__instruction" data-testid="cs-instruction">
        {visibleText(current.instruction)}
      </p>

      <EquityCapInput equityShare={current.equityShare} />

      <h3 className="cs-now__steps-title">这个月要做的三件事</h3>
      <ol className="cs-now__steps" data-testid="cs-steps">
        {current.steps.map(step => (
          <li key={step.title} data-testid={`cs-step-${step.title}`}>
            <strong className="cs-now__step-title">{step.title}</strong>
            <span className="cs-now__step-text">{visibleText(step.text)}</span>
          </li>
        ))}
      </ol>

      {current.dates.length > 0 ? (
        <ul className="cs-now__dates" data-testid="cs-dates">
          {current.dates.map(row => (
            <li key={`${row.label}-${row.date}`}>{row.label} {row.date}</li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
