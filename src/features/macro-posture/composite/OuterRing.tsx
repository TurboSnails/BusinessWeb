import React from 'react'
import { Badge } from '../../../components/ui'
import type { OuterItem } from './types'

const LEVEL_LABEL: Record<NonNullable<OuterItem['level']>, string> = {
  high: '偏高',
  low: '偏低',
  neutral: '居中',
}

function statusLabel(item: OuterItem): { text: string; tone: 'warm' | 'accent' | 'muted' | 'neutral' } {
  if (item.grade === 'B') {
    if (item.status === 'warn') return { text: '预警亮', tone: 'warm' }
    if (item.status === 'clear') return { text: '未触发', tone: 'accent' }
    return { text: '暂无', tone: 'muted' }
  }
  if (item.status === 'info') return { text: '背景', tone: 'neutral' }
  return { text: '待接入', tone: 'muted' }
}

function WhyPromote({ item }: { item: OuterItem }): JSX.Element {
  return (
    <>
      {item.signal ? <p className="mp-outer__signal">{item.signal}</p> : null}
      <p className="mp-outer__why">
        <strong>为什么不计票</strong>
        {' '}
        {item.uncertainty.kind}：{item.uncertainty.text}
      </p>
      <p className="mp-outer__promote">
        <strong>晋级条件</strong>
        {' '}
        {item.promote}
      </p>
      {item.masters.length ? <p className="mp-muted">对应：{item.masters.join('、')}</p> : null}
    </>
  )
}

function LitRow({ item }: { item: OuterItem }): JSX.Element {
  const status = statusLabel(item)
  return (
    <li className="mp-outer__item mp-outer__item--B is-lit" data-testid={`mp-outer-lit-${item.id}`}>
      <div className="mp-outer__head">
        <span className="mp-outer__name">{item.name}</span>
        <Badge tone={status.tone}>{status.text}</Badge>
        {item.value ? <span className="mp-outer__value">{item.value}</span> : null}
      </div>
      <WhyPromote item={item} />
    </li>
  )
}

function ClearRow({ item }: { item: OuterItem }): JSX.Element {
  return (
    <li className="mp-outer__clear-item">
      <details className="mp-outer__clear-details">
        <summary>
          <span className="mp-outer__name">{item.name}</span>
          {item.value ? <span className="mp-outer__value">{item.value}</span> : null}
          <Badge tone="accent">未触发</Badge>
        </summary>
        <WhyPromote item={item} />
      </details>
    </li>
  )
}

function BackgroundRow({ item }: { item: OuterItem }): JSX.Element {
  const status = statusLabel(item)
  return (
    <li className={`mp-outer__item mp-outer__item--${item.grade}`}>
      <div className="mp-outer__head">
        <span className="mp-outer__name">{item.name}</span>
        <Badge tone={status.tone}>{status.text}</Badge>
        {item.level ? (
          <Badge tone="neutral" data-testid={`mp-outer-level-${item.id}`}>
            {LEVEL_LABEL[item.level]}
          </Badge>
        ) : null}
        {item.value ? <span className="mp-outer__value">{item.value}</span> : null}
      </div>
      <WhyPromote item={item} />
    </li>
  )
}

export default function OuterRing({ items }: { items: OuterItem[] }): JSX.Element {
  const b = items.filter(i => i.grade === 'B')
  const c = items.filter(i => i.grade === 'C')
  const d = items.filter(i => i.grade === 'D')
  const lit = b.filter(i => i.status === 'warn')
  const clear = b.filter(i => i.status !== 'warn')

  return (
    <section className="mp-outer" id="mp-outer" aria-labelledby="mp-outer-title">
      <h2 id="mp-outer-title">外圈（不计票）</h2>
      <p className="mp-section-lead">
        B 级预警影响置信度；C 级作背景；D 级待接入。都不改最终档位。
      </p>

      <div className="mp-outer__b" data-testid="mp-outer-b">
        <div className="mp-outer__b-head">
          <h3>B 预警灯</h3>
          <p className="mp-outer__chips" data-testid="mp-outer-b-chips" role="status">
            <span className="mp-outer__chip">亮 {lit.length}</span>
            <span className="mp-outer__chip">共 {b.length}</span>
          </p>
        </div>
        {lit.length > 0 ? (
          <p className="mp-outer__lit" role="status" data-testid="mp-outer-b-lit">
            当前亮灯 {lit.length} 项：{lit.map(i => i.name).join('、')}
          </p>
        ) : (
          <p className="mp-muted">当前无 B 级预警亮灯。</p>
        )}
        {lit.length > 0 && (
          <ul className="mp-outer__list mp-outer__list--lit">
            {lit.map(item => <LitRow key={item.id} item={item} />)}
          </ul>
        )}
        {clear.length > 0 && (
          <ul className="mp-outer__clear-list" data-testid="mp-outer-b-clear">
            {clear.map(item => <ClearRow key={item.id} item={item} />)}
          </ul>
        )}
      </div>

      <details className="mp-outer__fold">
        <summary>C 背景（{c.length}）</summary>
        <ul className="mp-outer__list">
          {c.map(item => <BackgroundRow key={item.id} item={item} />)}
        </ul>
      </details>

      <details className="mp-outer__fold">
        <summary>D 待接入（{d.length}）</summary>
        <ul className="mp-outer__list">
          {d.map(item => <BackgroundRow key={item.id} item={item} />)}
        </ul>
      </details>
    </section>
  )
}
