import React from 'react'
import { visibleText } from './labels'
import type { CombinedStrategyFile } from './types'

export default function WhyPanel({ data }: { data: CombinedStrategyFile }): JSX.Element {
  return (
    <section className="cs-why" id="cs-why" aria-labelledby="cs-why-title">
      <h2 id="cs-why-title">为什么这么做</h2>
      <p className="cs-lead" data-testid="cs-why-lead">
        下面四条是这套做法的依据，每条后面是 1973 年以来的数据。
      </p>
      <ol className="cs-why__list" data-testid="cs-why-list">
        {data.rationale.map(item => (
          <li key={item.title} className="cs-why__item" data-testid={`cs-why-${item.title}`}>
            <h3 className="cs-why__title">{item.title}</h3>
            <p className="cs-why__theory">{visibleText(item.theory)}</p>
            <p className="cs-why__evidence">{visibleText(item.evidence)}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
