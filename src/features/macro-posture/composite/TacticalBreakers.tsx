import React from 'react'
import { Badge } from '../../../components/ui'
import type { Current } from './types'

export default function TacticalBreakers({ current }: { current: Current }): JSX.Element {
  const active = current.breakers.filter(b => b.active)
  return (
    <section className="mp-tactical" id="mp-tactical" aria-labelledby="mp-tactical-title">
      <h2 id="mp-tactical-title">战术修正与熔断</h2>
      <div className="mp-tactical__grid">
        <article className="mp-tactical__card">
          <h3>战术修正</h3>
          <p>{current.tactical.display}</p>
          <p className="mp-muted">
            {current.tactical.below === true
              ? '月均价低于近 10 个月均价 → 相对宏观档位下调一档。'
              : current.tactical.below === false
                ? '月均价未跌破近 10 个月均价 → 不因趋势下调。'
                : '趋势读数不足，暂不做战术修正。'}
          </p>
        </article>
        <article className="mp-tactical__card">
          <h3>熔断</h3>
          {active.length === 0 ? (
            <p>当前无熔断生效。</p>
          ) : (
            <ul className="mp-breaker-list">
              {active.map(item => (
                <li key={item.id}>
                  <Badge tone="warm">生效</Badge>
                  <strong>{item.label}</strong>
                  <span>{item.effect}</span>
                  <p className="mp-muted">{item.rule}</p>
                </li>
              ))}
            </ul>
          )}
          <details className="mp-tactical__all">
            <summary>全部熔断规则</summary>
            <ul className="mp-breaker-list">
              {current.breakers.map(item => (
                <li key={item.id}>
                  <Badge tone={item.active ? 'warm' : 'muted'}>{item.active ? '生效' : '未触发'}</Badge>
                  <strong>{item.label}</strong>
                  <span>{item.effect}</span>
                  <p className="mp-muted">{item.rule}</p>
                </li>
              ))}
            </ul>
          </details>
        </article>
      </div>
    </section>
  )
}
