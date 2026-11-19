import React from 'react'
import { assess, GUIDES, type Lean } from './explain'
import type { Reading } from './model'

export type SummaryItem = { id?: string; name: string; reading?: Reading }

interface Question {
  title: string
  items: SummaryItem[]
  offense: string
  defense: string
  neutral: string
}

const leanScore = (lean: Lean) => (lean === 'offense' ? 1 : lean === 'defense' ? -1 : 0)

function judge(question: Question) {
  const rows = question.items.flatMap(item => {
    const verdict = assess(item.reading, item.id ? GUIDES[item.id] : undefined)
    return verdict && verdict.level !== 'unknown' ? [{ item, verdict }] : []
  })
  const score = rows.reduce((sum, row) => sum + leanScore(row.verdict.lean), 0)
  const lean: Lean = score > 0 ? 'offense' : score < 0 ? 'defense' : 'neutral'
  const text = rows.length ? question[lean] : '数据不足'
  // Lead with the readings that point the same way as the verdict, then the others.
  const ordered = [...rows].sort((a, b) => Number(b.verdict.lean === lean) - Number(a.verdict.lean === lean))
  return { lean: rows.length ? lean : 'neutral' as Lean, text, rows: ordered, score }
}

const OVERALL: { min: number; label: string; advice: string; lean: Lean }[] = [
  { min: 3, label: '进攻为主', lean: 'offense', advice: '多数证据支持上涨，可以逐步提高股票仓位，回调时分批买入，同时设好自己能承受的止损线。' },
  { min: 1, label: '偏进攻', lean: 'offense', advice: '证据略偏正面，可以在原有仓位上小幅增加，新资金分批进场。' },
  { min: 0, label: '攻守平衡', lean: 'neutral', advice: '正反证据相当，保持原有仓位，等更明确的信号再调整。' },
  { min: -2, label: '偏防守', lean: 'defense', advice: '风险证据偏多，以持有为主、少追高；新资金分批、小额进场。' },
  { min: -Infinity, label: '防守为主', lean: 'defense', advice: '多项风险信号同时出现，控制仓位、留足现金，等市场宽度和信用利差好转再加仓。' },
]

export default function PlainSummary({ questions, trend }: { questions: Question[]; trend?: { label: string; lean: Lean } }): JSX.Element {
  const judged = questions.map(question => ({ question, ...judge(question) }))
  const total = judged.reduce((sum, row) => sum + leanScore(row.lean), 0) + (trend ? leanScore(trend.lean) : 0)
  const overall = OVERALL.find(row => total >= row.min)!
  const reasons = (lean: Lean) => judged.filter(row => row.lean === lean).map(row => row.text)
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
      </div>
      <ul className="us-plain__questions">
        {judged.map(({ question, lean, text, rows }) => (
          <li key={question.title} className="us-plain__question" data-lean={lean}>
            <h3>{question.title}</h3>
            <strong>{text}</strong>
            <ul>{rows.map(({ item, verdict }) => (
              <li key={item.name}><span>{item.name}</span><span className="us-market__chip" data-lean={verdict.lean}>{verdict.label}</span></li>
            ))}</ul>
          </li>
        ))}
      </ul>
      <p className="us-plain__disclaimer">结论由下方各项指标的历史位置和经验区间自动汇总，每项都可以展开看依据。只用于帮助理解市场状态，不构成投资建议。</p>
    </section>
  )
}

export type { Question }
