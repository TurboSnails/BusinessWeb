import React from 'react'
import { Badge } from '../../../components/ui'
import { GLOSSARY, LEGEND, NOT_YET, REF } from '../content'
import { ChapterLinks } from './ChapterLinks'

/** 这些先别开：只列名称不放链接，避免把新手引过去 */
export function NotYet(): JSX.Element {
  return (
    <ul className="is-notyet">
      {NOT_YET.map(n => <li key={n.label}><strong>{n.label}</strong>：{n.why}</li>)}
    </ul>
  )
}

/** 可信度图例：来源类型与有效性是两回事，标识都带文字，不靠颜色区分 */
export function Legend(): JSX.Element {
  return (
    <dl className="is-legend-list">
      {LEGEND.map(l => (
        <div key={l.label} className="is-legend-item">
          <dt><Badge tone="neutral">{l.label}</Badge></dt>
          <dd>{l.text}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Glossary(): JSX.Element {
  return (
    <>
      <dl className="is-glossary">
        {GLOSSARY.map(g => (
          <div key={g.term} className="is-glossary__item">
            <dt>{g.term}</dt>
            <dd>{g.text}</dd>
          </div>
        ))}
      </dl>
      <p className="is-muted"><ChapterLinks refs={[REF.appI]} prefix="更多：" /></p>
    </>
  )
}
