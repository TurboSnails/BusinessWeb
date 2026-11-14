import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock } from 'lucide-react'
import { earningsSoon, earningsSoonText } from '../features/candidates/earningsSoon'
import type { CandidateItem } from '../features/candidates/validation'
import type { EarningsCalendar } from '../features/earnings/model'
import '../styles/candidates.css'

/** 候选池「财报临近」：池里未来 days 天内有财报的公司（日期、时段、是否确认）；没有时不渲染 */
export default function EarningsSoonList({ items, cal, today, days = 14 }: { items: CandidateItem[]; cal: EarningsCalendar | null; today: string; days?: number }): JSX.Element | null {
  const soon = useMemo(() => (cal ? earningsSoon(items, cal.items, today, days) : []), [items, cal, today, days])
  if (!soon.length) return null
  return (
    <section className="cand-earnings" aria-label="财报临近">
      <h3><CalendarClock size={14} aria-hidden="true" /> 财报临近 · {soon.length}<small>未来 {days} 天</small></h3>
      <ul>
        {soon.map(e => (
          <li key={`${e.market}:${e.code}`}>
            <Link to={`/research-notes/${e.market}/${encodeURIComponent(e.code)}`} className="rn-link">{e.name} {e.code}</Link>
            <span>{earningsSoonText(e)}</span>
          </li>
        ))}
      </ul>
      <p className="cand-earnings-foot">日期来自<Link to="/earnings" className="rn-link">财报前瞻</Link>（生成于 {cal?.generatedAt.slice(0, 10)}）；只列事实，不是买卖指令。</p>
    </section>
  )
}
