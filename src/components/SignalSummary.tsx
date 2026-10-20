import React from 'react'
import { Callout, Card, TableWrap } from './ui'
import type { Direction, SignalSummary as Summary } from '../features/signals/companySignals'
import '../styles/research.css'

const DIRECTION: Record<string, { label: string; className: string }> = {
  '1': { label: '偏积极', className: 'sig-dir is-pos' },
  '0': { label: '中性', className: 'sig-dir is-neutral' },
  '-1': { label: '偏谨慎', className: 'sig-dir is-neg' },
  null: { label: '不参与', className: 'sig-dir is-none' },
}
const dir = (d: Direction) => DIRECTION[String(d)]

/** 公司页顶部：各信号的结论、依据与方向，方向相反时列出分歧 */
export default function SignalSummary({ summary }: { summary: Summary }): JSX.Element {
  return (
    <Card title="决策信号汇总" className="rn-card sig-card">
      <TableWrap label="决策信号汇总">
        <table className="ui-table sig-table">
          <thead><tr>{['信号', '结论', '方向', '依据'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>
            {summary.signals.map(s => (
              <tr key={s.id}>
                <th scope="row">{s.label}</th>
                <td><strong>{s.verdict}</strong></td>
                <td><span className={dir(s.direction).className}>{dir(s.direction).label}</span></td>
                <td className="sig-detail">{s.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      {summary.conflicts.map(c => <Callout key={c} tone="warn" title="信号分歧" className="sig-callout">{c}</Callout>)}
      {summary.notes.map(n => <p key={n} className="rn-footnote">{n}</p>)}
      <p className="rn-footnote">方向按固定规则判断：基准情景涨幅 ≥15%、DCF 安全边际 ≥20% 记为偏积极；基准情景低于现价 5% 以上、DCF 安全边际低于 −10% 记为偏谨慎；林奇分类看同类内关注度；数据缺失或可信度低的不参与。汇总只帮助发现分歧，不是买卖建议。</p>
    </Card>
  )
}
