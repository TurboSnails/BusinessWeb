import React from 'react'
import { assess, FAMILY, GUIDES, voteOf, type Assessment, type Lean } from './explain'
import { freshness, type Reading } from './model'

export type SummaryItem = { id?: string; name: string; reading?: Reading }

export interface Question {
  title: string
  items: SummaryItem[]
  offense: string
  defense: string
  neutral: string
}

interface Vote { item: SummaryItem; verdict: Assessment; score: number; stale: boolean; counted: boolean }

/** Questions need at least this many independent families voting before the overall call is made. */
const MIN_QUESTIONS = 3

export function judge(question: Question, asOf: string) {
  const votes: Vote[] = question.items.flatMap(item => {
    const verdict = assess(item.reading, item.id ? GUIDES[item.id] : undefined)
    const last = item.reading?.history.at(-1)
    if (!verdict || verdict.level === 'unknown' || !last || !item.reading) return []
    // A reading carried past its normal publication lag still informs, at half weight.
    const stale = freshness(last[0], item.reading.frequency, asOf) === '沿用上期'
    return [{ item, verdict, score: voteOf(verdict) * (stale ? 0.5 : 1), stale, counted: false }]
  })
  // One vote per family: keep the strongest reading from each source.
  const best = new Map<string, Vote>()
  for (const vote of votes) {
    const family = FAMILY[vote.item.id ?? ''] ?? vote.item.id ?? vote.item.name
    const current = best.get(family)
    if (!current || Math.abs(vote.score) > Math.abs(current.score)) best.set(family, vote)
  }
  for (const vote of best.values()) vote.counted = true
  const families = [...best.values()]
  const score = families.length ? families.reduce((sum, vote) => sum + vote.score, 0) / families.length : 0
  const lean: Lean = !families.length ? 'neutral' : score >= 0.5 ? 'offense' : score <= -0.5 ? 'defense' : 'neutral'
  const text = families.length ? question[lean] : '数据不足'
  const ordered = [...votes].sort((a, b) => Number(b.counted) - Number(a.counted) || Math.abs(b.score) - Math.abs(a.score))
  return { lean, text, votes: ordered, score, families: families.length, stale: families.filter(vote => vote.stale).length }
}

const OVERALL: { min: number; label: string; advice: string; lean: Lean }[] = [
  { min: 3, label: '进攻为主', lean: 'offense', advice: '多数证据支持上涨，可以逐步提高股票仓位，回调时分批买入，同时设好自己能承受的止损线。' },
  { min: 1, label: '偏进攻', lean: 'offense', advice: '证据略偏正面，可以在原有仓位上小幅增加，新资金分批进场。' },
  { min: 0, label: '攻守平衡', lean: 'neutral', advice: '正反证据相当，保持原有仓位，等更明确的信号再调整。' },
  { min: -2, label: '偏防守', lean: 'defense', advice: '风险证据偏多，以持有为主、少追高；新资金分批、小额进场。' },
  { min: -Infinity, label: '防守为主', lean: 'defense', advice: '多项风险信号同时出现，控制仓位、留足现金，等市场宽度和信用利差好转再加仓。' },
]
const step = (lean: Lean) => (lean === 'offense' ? 1 : lean === 'defense' ? -1 : 0)

export default function PlainSummary({ questions, trend, asOf }: { questions: Question[]; trend?: { label: string; lean: Lean }; asOf: string }): JSX.Element {
  const judged = questions.map(question => ({ question, ...judge(question, asOf) }))
  const answered = judged.filter(row => row.families > 0)
  const evidence = answered.reduce((sum, row) => sum + row.families, 0)
  const stale = answered.reduce((sum, row) => sum + row.stale, 0)
  const enough = answered.length >= MIN_QUESTIONS
  const total = answered.reduce((sum, row) => sum + step(row.lean), 0) + (trend ? step(trend.lean) : 0)
  const overall = enough ? OVERALL.find(row => total >= row.min)! : { label: '证据不足', lean: 'neutral' as Lean, advice: '能用的数据太少，暂时不要据此调整仓位。' }
  const reasons = (lean: Lean) => answered.filter(row => row.lean === lean).map(row => row.text)
  const pros = reasons('offense')
  const cons = reasons('defense')
  return (
    <section className="us-plain" aria-label="一句话看懂">
      <div className="us-plain__head">
        <p className="us-plain__eyebrow">用大白话看懂现在的美股</p>
        <p className="us-plain__overall" data-lean={overall.lean}><strong>{overall.label}</strong></p>
        <p className="us-plain__why">
          {cons.length > 0 && <>不利因素：{cons.join('、')}。</>}
          {pros.length > 0 && <>有利因素：{pros.join('、')}。</>}
          {trend && <>近期走势：{trend.label}。</>}
        </p>
        <p className="us-plain__advice">{overall.advice}</p>
        <p className="us-plain__evidence">依据 {answered.length}/{questions.length} 个问题、{evidence} 个独立来源{stale ? `（其中 ${stale} 个已过正常更新周期，按半票计）` : ''}。</p>
      </div>
      <ul className="us-plain__questions">
        {judged.map(({ question, lean, text, votes }) => (
          <li key={question.title} className="us-plain__question" data-lean={lean}>
            <h3>{question.title}</h3>
            <strong>{text}</strong>
            <ul>{votes.map(({ item, verdict, counted, stale: old }) => (
              <li key={item.name} className={counted ? undefined : 'is-folded'}>
                <span>{item.name}{old ? '（旧）' : ''}</span>
                <span className="us-market__chip" data-lean={verdict.lean}>{verdict.label}</span>
              </li>
            ))}</ul>
          </li>
        ))}
      </ul>
      <p className="us-plain__disclaimer">每个问题里同一来源只计一票（灰色为同源的参考项），过期数据计半票。结论由下方各项指标的历史位置和经验区间自动汇总，每项都可以展开看依据；只用于帮助理解市场状态，不构成投资建议。</p>
    </section>
  )
}
