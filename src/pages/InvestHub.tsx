import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { INVEST_GROUPS, type HubGroup } from '../data/siteMap'

function GroupLinks({ group }: { group: HubGroup }): JSX.Element {
  return (
    <div className="hub-grid">
      {group.links.map(l => (
        <Link key={l.path} to={l.path} className="hub-card">
          <span className="hub-card__title">{l.label}</span>
          <span className="hub-card__desc">{l.desc}</span>
          <ArrowRight size={16} className="hub-card__arrow" aria-hidden="true" />
        </Link>
      ))}
    </div>
  )
}

export default function InvestHub(): JSX.Element {
  return (
    <main className="container animate-fade-in">
      <header className="page-head">
        <h1>正念投资</h1>
        <p>不盯盘、不预测的普通人投资方法。先读书，再用工具，最后才看行情。</p>
      </header>

      {INVEST_GROUPS.map(group =>
        group.collapsed ? (
          <details key={group.id} className="hub-group hub-group--fold">
            <summary>{group.title}</summary>
            {group.hint && <p className="hub-group__hint">{group.hint}</p>}
            <GroupLinks group={group} />
          </details>
        ) : (
          <section key={group.id} className={`hub-group hub-group--${group.id}`}>
            <h2>{group.title}</h2>
            <GroupLinks group={group} />
          </section>
        )
      )}
    </main>
  )
}
