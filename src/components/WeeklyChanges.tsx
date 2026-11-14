import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock } from 'lucide-react'
import type { Company } from '../data/companies'
import type { PriceObservation } from '../features/candidates/priceAlert'
import type { CandidateItem } from '../features/candidates/validation'
import { useWeeklyData } from '../features/weekly/useWeeklyData'
import { beijingDay, buildWeeklySummary, companyIndexFrom, completedWeek, weeklyCount, weeklyPriceHits } from '../features/weekly/weeklySummary'
import '../styles/candidates.css'

/**
 * 候选池「本周变化」：上一个完整自然周（北京时间周一至周日）与再前一周相比的可复核事实，默认折叠。
 * 与每周邮件同一份规则（src/features/weekly/weeklySummary.ts）；只用静态 JSON 与本机候选池，不需要服务端。
 */
export default function WeeklyChanges({ items, companies, observations, now }: {
  items: CandidateItem[]
  companies: Company[]
  /** 每家候选的收盘价观测（market:code → 观测），与「今日待处理」同一来源 */
  observations: Map<string, PriceObservation[]>
  /** 测试用：当前时间（默认现在） */
  now?: Date
}): JSX.Element {
  const today = beijingDay(now ?? new Date())
  const week = useMemo(() => completedWeek(new Date(`${today}T04:00:00Z`)), [today])
  const data = useWeeklyData(week)
  const index = useMemo(() => companyIndexFrom(companies), [companies])
  const summary = useMemo(() => buildWeeklySummary({
    week, candidates: items, priceHits: weeklyPriceHits(items, observations, week), ledger: data.ledger, cycle: data.cycle, macro: data.macro, companies: index,
  }), [week, items, observations, data, index])
  const count = weeklyCount(summary)
  const range = `${week.start.slice(5)} 至 ${week.end.slice(5)}`

  return (
    <details className="cand-weekly">
      <summary>
        <CalendarClock size={14} aria-hidden="true" /> 本周变化 · {data.loading ? '读取中' : summary.empty ? '无' : `${count} 项`}
        <small>上周 {range}（{week.id}）与再前一周相比</small>
      </summary>
      {data.loading ? <p className="cand-weekly-note" role="status">正在读取信号台账、牛熊周期周报和宏观快照…</p>
        : summary.empty ? <p className="cand-weekly-empty">{summary.emptyText}</p>
        : summary.sections.map(sec => (
          <section key={sec.id} aria-label={sec.title}>
            <h3>{sec.title} · {sec.lines.length}</h3>
            {sec.summary && <p className="cand-weekly-note">{sec.summary}</p>}
            <ul>
              {sec.lines.map((l, i) => (
                <li key={`${l.kind}:${i}`}>
                  {l.href ? <Link to={l.href} className="rn-link">{l.text}</Link> : <span>{l.text}</span>}
                  <small>日期 {l.date} · 来源：{l.source}</small>
                </li>
              ))}
            </ul>
          </section>
        ))}
      {[...summary.notes, ...(data.failed.length ? [`${data.failed.join('、')}未能读取，相关部分未比较。`] : [])].map(n => <p key={n} className="cand-weekly-note">{n}</p>)}
      <p className="cand-foot">只列可复核的事实（评级档位、触及条件价、决策记录与复查日、牛熊周期周状态、宏观阶段），不做预测；是复核提醒，不是买卖指令。每周一早上另发一封同内容的邮件（有变化时）。</p>
    </details>
  )
}
