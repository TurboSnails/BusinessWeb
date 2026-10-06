import React from 'react'
import { Link } from 'react-router-dom'
import { VERDICT_LABEL, type LabDirection, type LabVerdict } from '../../data/aiLab'

export function Stars({ fit }: { fit: number }): JSX.Element {
  return (
    <span className="lab-stars" role="img" aria-label={`匹配度 ${fit}/5`}>
      {'★'.repeat(fit)}{'☆'.repeat(5 - fit)}
    </span>
  )
}

export function VerdictBadge({ verdict }: { verdict: LabVerdict }): JSX.Element {
  return <span className={`lab-badge lab-badge--${verdict}`}>{VERDICT_LABEL[verdict]}</span>
}

function costLine(d: LabDirection): string {
  const parts: string[] = []
  if (d.hoursPerWeek !== undefined) parts.push(`每周 ${d.hoursPerWeek}h`)
  if (d.startCost) parts.push(`启动 ${d.startCost}`)
  return parts.join(' · ')
}

export default function LabDirectionCard({ direction: d }: { direction: LabDirection }): JSX.Element {
  const cost = costLine(d)
  return (
    <Link to={`/ai/${d.slug}`} className={`lab-card lab-card--${d.verdict}`}>
      <span className="lab-card__meta">
        <VerdictBadge verdict={d.verdict} />
        <Stars fit={d.fit} />
        <span className="tag lab-card__status">{d.status}</span>
      </span>
      <span className="lab-card__title">{d.title}</span>
      <span className="lab-card__reason">{d.reason}</span>
      {cost && <span className="lab-card__cost">{cost}</span>}
    </Link>
  )
}
