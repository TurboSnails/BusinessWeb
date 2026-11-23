import React from 'react'
import { Badge } from '../../../components/ui'
import { formatPricePoint } from './labels'
import type { Current } from './types'

function MtdFormula({ mtd }: { mtd: NonNullable<Current['tactical']['mtd']> }): JSX.Element | null {
  if (mtd.prior9 == null || !Number.isFinite(mtd.prior9)) return null
  const prior9 = formatPricePoint(mtd.prior9)
  const average = formatPricePoint(mtd.average)
  const days = mtd.days
  const remaining = mtd.remaining
  const threshold = mtd.threshold
  const thresholdTxt = threshold != null && Number.isFinite(threshold)
    ? `，剩余 ${remaining ?? '—'} 天均价低于 ${formatPricePoint(threshold)} 月底触发`
    : ''
  return (
    <div className="mp-tactical__mtd" data-testid="mp-mtd-formula">
      <p>
        10 个月均线含本月 → 本月均价 &lt; 前 9 个月均价 {prior9} 即触发；已过 {days} 天均价 {average}
        {thresholdTxt}
      </p>
      {mtd.source ? <p className="mp-muted">日线来源：{mtd.source}</p> : null}
    </div>
  )
}

export default function TacticalBreakers({ current }: { current: Current }): JSX.Element {
  const active = current.breakers.filter(b => b.active)
  const mtd = current.tactical?.mtd
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
          {mtd ? <MtdFormula mtd={mtd} /> : null}
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
