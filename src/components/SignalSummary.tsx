import React from 'react'
import { Callout, Card, TableWrap } from './ui'
import type { Direction, Signal, SignalSummary as Summary } from '../features/signals/companySignals'
import { OWN_STAGE, RESEARCH_STAGE, type OwnStage, type ResearchStage } from '../features/signals/maturity'
import '../styles/research.css'

const DIRECTION: Record<string, { label: string; className: string }> = {
  '1': { label: '偏积极', className: 'sig-dir is-pos' },
  '0': { label: '中性', className: 'sig-dir is-neutral' },
  '-1': { label: '偏谨慎', className: 'sig-dir is-neg' },
  null: { label: '不参与', className: 'sig-dir is-none' },
}
const dir = (d: Direction) => DIRECTION[String(d)]

// 追加分歧后，原有「没有发现分歧 / 没有明显方向」的说明不再成立
const NO_CONFLICT_NOTE = /没有发现分歧|没有明显方向/

/**
 * 公司页顶部：各信号的结论、依据与方向，方向相反时列出分歧。
 * sources：每行比较所用的数据来源（如「原研究情景 · 2026-09-30」），写在信号名下；
 * extraConflicts：页面层发现的其他分歧（如综合估值与原研究情景方向相反），复用同一「信号分歧」提示。
 */
export default function SignalSummary({ summary, stage, own, sources, extraConflicts }: {
  summary: Summary
  stage: ResearchStage
  own: OwnStage
  sources?: Partial<Record<Signal['id'], string>>
  extraConflicts?: string[]
}): JSX.Element {
  const extra = (extraConflicts ?? []).filter(Boolean)
  const conflicts = [...summary.conflicts, ...extra]
  const notes = extra.length ? summary.notes.filter(n => !NO_CONFLICT_NOTE.test(n)) : summary.notes
  return (
    <Card title="决策信号汇总" className="rn-card sig-card">
      <p className="sig-maturity">
        <span title={RESEARCH_STAGE[stage].desc}>研究成熟度 <strong>{RESEARCH_STAGE[stage].label}</strong></span>
        <span>本人 <strong className={own === 'recorded' ? 'is-done' : undefined}>{OWN_STAGE[own]}</strong></span>
        {own !== 'recorded' && <span className="sig-maturity__hint">据此行动前，先自己估值并写决策记录</span>}
      </p>
      <TableWrap label="决策信号汇总">
        <table className="ui-table sig-table">
          <thead><tr>{['信号', '结论', '方向', '依据'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>
            {summary.signals.map(s => (
              <tr key={s.id}>
                <th scope="row">
                  {s.label}
                  {sources?.[s.id] && <><br /><small className="sig-source">{sources[s.id]}</small></>}
                </th>
                <td><strong>{s.verdict}</strong></td>
                <td><span className={dir(s.direction).className}>{dir(s.direction).label}</span></td>
                <td className="sig-detail">{s.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      {conflicts.map(c => <Callout key={c} tone="warn" title="信号分歧" className="sig-callout">{c}</Callout>)}
      {notes.map(n => <p key={n} className="rn-footnote">{n}</p>)}
      <p className="rn-footnote">方向按固定规则判断：基准情景涨幅 ≥15%、DCF 安全边际 ≥20% 记为偏积极；基准情景低于现价 5% 以上、DCF 安全边际低于 −10% 记为偏谨慎；林奇分类看同类内关注度；数据缺失或可信度低的不参与。汇总只帮助发现分歧，不是买卖建议。</p>
    </Card>
  )
}
