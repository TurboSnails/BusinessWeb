import React from 'react'
import { Badge } from '../../components/ui'
import { Panel, PanelCol } from './OverviewExpand'
import { useOverviewJump } from './OverviewJump'
import type { CycleView } from './types'

const METHOD_NOTE =
  '本站回测过两条仓位规则——总回报指数 10 个月均线、席勒 CAPE 分档——相对同样平均仓位的恒定组合，都没有被证实能提高风险调整后的回报。所以这里只描述风险状态，不承诺收益。'

function confidenceLabel(confidence: 'low' | 'medium'): string {
  return confidence === 'medium' ? '置信度中' : '置信度低'
}

function dimensionNameFromEvidence(text: string): string | null {
  const idx = text.indexOf('：')
  if (idx <= 0) return null
  // 「估值（长期背景）：…」→ 取括号前的维度名
  const head = text.slice(0, idx)
  const paren = head.indexOf('（')
  return (paren > 0 ? head.slice(0, paren) : head).trim() || null
}

function EvidenceItem({
  text,
  onJump,
}: {
  text: string
  onJump?: (name: string) => void
}): JSX.Element {
  const idx = text.indexOf('。')
  const name = dimensionNameFromEvidence(text)
  const clickable = Boolean(onJump && name)
  const head = idx > 0 && text.includes('：') ? text.slice(0, idx + 1) : null
  const rest = head ? text.slice(idx + 1) : text

  const inner = head ? (
    <>
      <strong className="mm-now__lead">{head}</strong>
      {rest}
    </>
  ) : text

  if (!clickable || !name || !onJump) return <li>{inner}</li>

  return (
    <li>
      <button type="button" className="mm-now__evidence-link" onClick={() => onJump(name)}>
        {inner}
      </button>
    </li>
  )
}

export default function OverviewNow({ view }: { view: CycleView }): JSX.Element {
  const { posture, phase, supports, counters, flips, asOf } = view
  const showColumns = posture.value !== 'unknown'
  const supportTitle = posture.value === 'neutral' ? '偏谨慎的证据' : '支持这个判断的'
  const counterTitle = posture.value === 'neutral' ? '偏积极的证据' : '反面证据'
  const { jumpToDimension } = useOverviewJump()

  return (
    <section id="mm-now" className="mm-now" aria-labelledby="mm-now-title">
      <h2 id="mm-now-title" className="mm-now__heading">现在的位置</h2>

      <div className="mm-now__headline">
        <p className="mm-now__posture">{posture.label}</p>
        <div className="mm-now__tags">
          <Badge tone="neutral" className="mm-chip">{confidenceLabel(posture.confidence)}</Badge>
          <Badge tone="neutral" className="mm-chip">{phase.name}</Badge>
          {asOf ? (
            <Badge tone="muted" className="mm-chip">
              数据快照 {asOf}
            </Badge>
          ) : null}
        </div>
      </div>

      <p className="mm-now__meaning">{posture.meaning}</p>
      <p className="mm-now__phase-summary">{phase.summary}</p>

      {showColumns ? (
        <div className="mm-now__columns">
          <div className="mm-now__col">
            <h3>{supportTitle}</h3>
            {supports.length ? (
              <ul>{supports.map(item => (
                <EvidenceItem key={item} text={item} onJump={jumpToDimension} />
              ))}</ul>
            ) : (
              <p className="mm-now__empty">暂无</p>
            )}
          </div>
          <div className="mm-now__col">
            <h3>{counterTitle}</h3>
            {counters.length ? (
              <ul>{counters.map(item => (
                <EvidenceItem key={item} text={item} onJump={jumpToDimension} />
              ))}</ul>
            ) : (
              <p className="mm-now__empty">暂无</p>
            )}
          </div>
          <div className="mm-now__col">
            <h3>什么情况会改判</h3>
            {flips.length ? (
              <ul>{flips.map(item => <li key={item}>{item}</li>)}</ul>
            ) : (
              <p className="mm-now__empty">暂无</p>
            )}
          </div>
        </div>
      ) : null}

      <details className="mm-now__method">
        <summary>这是怎么判的</summary>
        <Panel cols={3} className="mm-now__method-panel">
          <PanelCol title="攻守档怎么定">
            <p>{posture.rule}</p>
          </PanelCol>
          <PanelCol title="阶段怎么分">
            <p>{phase.rule}</p>
          </PanelCol>
          <PanelCol title="回测说明了什么">
            <p>{METHOD_NOTE}</p>
          </PanelCol>
        </Panel>
      </details>
    </section>
  )
}
