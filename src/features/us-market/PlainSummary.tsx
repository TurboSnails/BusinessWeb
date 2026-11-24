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

interface Vote { item: SummaryItem; verdict: Assessment; score: number; stale: boolean; excludedReason?: string; counted: boolean }

function observationPeriod(reading: Reading) {
  const date = reading.history.at(-1)?.[0]
  if (!date) return ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))) return '日期待核对'
  const month = Number(date.slice(5, 7))
  if (/季|quarter/i.test(reading.frequency)) return `${date.slice(0, 4)} 年第 ${Math.ceil(month / 3)} 季度`
  if (/月|month/i.test(reading.frequency)) return `${date.slice(0, 4)} 年 ${month} 月`
  return date
}

export function judge(question: Question, asOf: string, guides: Record<string, Guide> = GUIDES, family: Record<string, string> = FAMILY) {
  const votes: Vote[] = question.items.flatMap(item => {
    if (!Number.isFinite(item.reading?.history.at(-1)?.[1])) return []
    const verdict = assess(item.reading, item.id ? guides[item.id] : undefined)
    const last = item.reading?.history.at(-1)
    if (!verdict || verdict.level === 'unknown' || !last || !item.reading) return []
    const state = freshness(last[0], item.reading.frequency, asOf)
    const pending = item.reading.releasedAt && item.reading.releasedAt.slice(0, 10) > asOf
    const excludedReason = pending ? '尚未披露' : state === '沿用上期' ? '已超过更新周期' : state === '日期待核对' ? state : undefined
    return [{ item, verdict, score: voteOf(verdict), stale: Boolean(excludedReason), excludedReason, counted: false }]
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
  const counted = ordered.filter(vote => vote.counted)
  const periods = [...new Set(counted.map(vote => vote.item.reading!)
    .sort((a, b) => a.history.at(-1)![0].localeCompare(b.history.at(-1)![0]))
    .map(observationPeriod))]
  const excluded = question.items.flatMap(item => {
    const vote = votes.find(v => v.item === item)
    if (vote?.counted) return []
    const hasValue = Number.isFinite(item.reading?.history.at(-1)?.[1])
    const reason = vote ? vote.excludedReason ?? '同组已有指标计入' : hasValue ? '缺少可用判定依据' : '暂无有效读数'
    return [{ item, reason }]
  })
  return { lean, text, votes: ordered, counted, excluded, periods, score, families: families.length, stale: votes.filter(vote => vote.stale).length }
}

function ObservationDate({ item }: { item: SummaryItem }) {
  const date = item.reading?.history.at(-1)?.[0]
  if (!item.reading || !date) return null
  return <small className="us-plain__observed">{item.reading.frequency} · {observationPeriod(item.reading)}</small>
}

export default function PlainSummary({ questions, trend, asOf, market = '美股' }: { questions: Question[]; trend?: { label: string; lean: Lean }; asOf: string; market?: string }): JSX.Element {
  const { guides, family } = useContext(GuideContext)
  const judged = questions.map(question => ({ question, ...judge(question, asOf, guides, family) }))
  const answered = judged.filter(row => row.families > 0)
  return (
    <section className="us-plain" aria-label="一句话看懂">
      <div className="us-plain__head">
        <h3>{market === '美股' ? '市场层面怎么看（短线参考）' : `${market}各维度判断`}</h3>
        {trend && <p className="us-plain__why">{market === 'A股' ? '沪深300 中期趋势' : '美股近期交易环境'} · {trend.label}</p>}
        <p className="us-plain__evidence">核对日 <time dateTime={asOf}>{asOf}</time> · {answered.length}/{questions.length} 个问题有可用证据</p>
      </div>
      <ul className="us-plain__questions">
        {judged.map(({ question, lean, text, counted, excluded, periods }) => (
          <li key={question.title} className="us-plain__question" data-lean={lean}>
            <h3>{question.title}</h3>
            <strong>{text}</strong>
            {counted.length > 0 && <>
              <p className="us-plain__coverage">计入 {counted.length} 项 · 观测期 {periods.join('、')}</p>
              <ul>{counted.map(({ item, verdict }) => (
                <li key={item.name}>
                  <span>{item.name}<ObservationDate item={item} /></span>
                  <span className="us-market__chip" data-lean={verdict.lean}>{verdict.label}</span>
                </li>
              ))}</ul>
            </>}
            {excluded.length > 0 && <details className="us-plain__excluded">
              <summary>未计入 {excluded.length} 项</summary>
              <ul>{excluded.map(({ item, reason }) => (
                <li key={item.name}>
                  <span>{item.name}<ObservationDate item={item} /></span>
                  <span>{reason}</span>
                </li>
              ))}</ul>
            </details>}
          </li>
        ))}
      </ul>
      <p className="us-plain__disclaimer">{market === '美股' ? '美股总仓位以综合策略为准。' : ''}每个问题按来源分组计票，每组最多计入一项。下方指标卡可查看历史位置和判定依据。</p>
    </section>
  )
}
