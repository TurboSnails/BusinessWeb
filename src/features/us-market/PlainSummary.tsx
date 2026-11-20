import React, { useContext } from 'react'
import { GuideContext } from './cards'
import { assess, FAMILY, GUIDES, voteOf, type Assessment, type Guide, type Lean } from './explain'
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

export function judge(question: Question, asOf: string, guides: Record<string, Guide> = GUIDES, family: Record<string, string> = FAMILY) {
  const votes: Vote[] = question.items.flatMap(item => {
    const verdict = assess(item.reading, item.id ? guides[item.id] : undefined)
    const last = item.reading?.history.at(-1)
    if (!verdict || verdict.level === 'unknown' || !last || !item.reading) return []
    const state = freshness(last[0], item.reading.frequency, asOf)
    const stale = state === '沿用上期' || state === '日期待核对' || Boolean(item.reading.releasedAt && item.reading.releasedAt.slice(0, 10) > asOf)
    return [{ item, verdict, score: voteOf(verdict), stale, counted: false }]
  })
  // One vote per family: keep the strongest reading from each source.
  const best = new Map<string, Vote>()
  for (const vote of votes) {
    if (vote.stale) continue
    const group = family[vote.item.id ?? ''] ?? vote.item.id ?? vote.item.name
    const current = best.get(group)
    if (!current || Math.abs(vote.score) > Math.abs(current.score)) best.set(group, vote)
  }
  for (const vote of best.values()) vote.counted = true
  const families = [...best.values()]
  const score = families.length ? families.reduce((sum, vote) => sum + vote.score, 0) / families.length : 0
  const lean: Lean = !families.length ? 'neutral' : score >= 0.5 ? 'offense' : score <= -0.5 ? 'defense' : 'neutral'
  const text = families.length ? question[lean] : '数据不足'
  const ordered = [...votes].sort((a, b) => Number(b.counted) - Number(a.counted) || Math.abs(b.score) - Math.abs(a.score))
  return { lean, text, votes: ordered, score, families: families.length, stale: votes.filter(vote => vote.stale).length }
}

export default function PlainSummary({ questions, trend, asOf, market = '美股' }: { questions: Question[]; trend?: { label: string; lean: Lean }; asOf: string; market?: string }): JSX.Element {
  const { guides, family } = useContext(GuideContext)
  const judged = questions.map(question => ({ question, ...judge(question, asOf, guides, family) }))
  const answered = judged.filter(row => row.families > 0)
  const stale = judged.reduce((sum, row) => sum + row.stale, 0)
  return (
    <section className="us-plain" aria-label="一句话看懂">
      <div className="us-plain__head">
        <h3>{market}各维度判断</h3>
        {trend && <p className="us-plain__why">{market === 'A股' ? '沪深300 中期趋势' : '美股近期交易环境'} · {trend.label}</p>}
        <p className="us-plain__evidence">{answered.length}/{questions.length} 个问题有可用证据{stale > 0 && `，另有 ${stale} 项读数因日期或披露时效仅供回看`}。</p>
      </div>
      <ul className="us-plain__questions">
        {judged.map(({ question, lean, text, votes }) => (
          <li key={question.title} className="us-plain__question" data-lean={lean}>
            <h3>{question.title}</h3>
            <strong>{text}</strong>
            <ul>{votes.map(({ item, verdict, counted, stale: old }) => (
              <li key={item.name} className={counted ? undefined : 'is-folded'}>
                <span>{item.name}{old ? '（仅回看）' : ''}</span>
                <span className="us-market__chip" data-lean={verdict.lean}>{verdict.label}</span>
              </li>
            ))}</ul>
          </li>
        ))}
      </ul>
      <p className="us-plain__disclaimer">每个问题按来源分组计票。灰色读数供对照。点开下方指标可查看样本期、历史位置和判定依据。</p>
    </section>
  )
}
