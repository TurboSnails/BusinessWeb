import React from 'react'
import { Link } from 'react-router-dom'
import type { StepGroup, StepLink } from '../content'
import type { StepProgress } from '../types'
import { ChapterLinks } from './ChapterLinks'

function StepAnchor({ link }: { link: StepLink }): JSX.Element {
  // 页内锚点用普通 <a>，站内页面用 Link
  return link.to.startsWith('#')
    ? <a href={link.to}>{link.label}</a>
    : <Link to={link.to}>{link.label}</Link>
}

/** 路线清单：勾选是本人确认「做过了」，不代表资金审核或投资许可；进度按稳定 stepId 存 */
export function RouteChecklist({ groups, steps, onToggle }: {
  groups: StepGroup[]
  steps: Record<string, StepProgress>
  onToggle: (stepId: string, checked: boolean) => void
}): JSX.Element {
  const seen = new Set<string>()
  return (
    <div className="is-checklist">
      {groups.map(g => {
        const items = g.steps.filter(s => !seen.has(s.id))
        items.forEach(s => seen.add(s.id))
        const doneCount = items.filter(s => steps[s.id]?.checked).length
        return (
          <section key={g.id} className="is-group" aria-labelledby={`is-group-${g.id}`}>
            <h3 id={`is-group-${g.id}`} className="is-h3">{g.title} <span className="is-muted">（{doneCount} / {items.length}）</span></h3>
            {g.note && <p className="is-muted">{g.note}</p>}
            <ol className="is-steps">
              {items.map(s => {
                const checked = !!steps[s.id]?.checked
                const id = `is-step-${g.id}-${s.id}`
                return (
                  <li key={s.id} className={checked ? 'is-step is-step--done' : 'is-step'}>
                    <input id={id} type="checkbox" checked={checked} onChange={e => onToggle(s.id, e.target.checked)} />
                    <div className="is-step__body">
                      <label htmlFor={id} className="is-step__title">{s.title}{checked && <span className="visually-hidden">（已完成）</span>}</label>
                      {s.detail && <p className="is-step__detail">{s.detail}</p>}
                      {(s.links?.length || s.refs?.length) ? (
                        <p className="is-step__links">
                          {s.links?.map((l, i) => (
                            <React.Fragment key={l.to}>
                              {i > 0 && <span aria-hidden="true"> · </span>}
                              <StepAnchor link={l} />
                            </React.Fragment>
                          ))}
                          {s.links?.length && s.refs?.length ? <span aria-hidden="true"> · </span> : null}
                          <ChapterLinks refs={s.refs} />
                        </p>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>
        )
      })}
    </div>
  )
}
