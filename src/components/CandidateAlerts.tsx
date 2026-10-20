import React from 'react'
import { Link } from 'react-router-dom'
import { BellRing } from 'lucide-react'
import type { Company } from '../data/companies'
import { ALERT_LABEL, type CandidateAlert } from '../features/candidates/alerts'
import { MARKET_LABEL } from '../features/candidates/links'
import { Badge, Card } from './ui'
import '../styles/candidates.css'

/** 候选池顶部：今天需要动手的事项；没有事项时一行说明 */
export default function CandidateAlerts({ alerts, companies }: { alerts: CandidateAlert[]; companies: Company[] }): JSX.Element {
  const names = new Map(companies.map(c => [`${c.market}:${c.code}`, c.name]))
  if (!alerts.length) return <p className="cand-alerts-empty"><BellRing size={14} aria-hidden="true" /> 今天没有到期复查、进入买入区或评级变化的候选公司。</p>
  return (
    <Card as="section" label="今日待处理" title={<><BellRing size={16} aria-hidden="true" /> 今日待处理 · {alerts.length}</>} className="rn-card cand-alerts">
      <ul>
        {alerts.map(a => (
          <li key={`${a.kind}:${a.market}:${a.code}`}>
            <Badge tone={a.kind === 'buy-zone' ? 'accent' : 'warm'}>{ALERT_LABEL[a.kind]}</Badge>
            <Link to={`/research-notes/${a.market}/${encodeURIComponent(a.code)}`} className="rn-link">{names.get(`${a.market}:${a.code}`) ?? a.code} {a.code}</Link>
            <small>{MARKET_LABEL[a.market]}</small>
            <span>{a.text}</span>
          </li>
        ))}
      </ul>
      <p className="cand-foot">按固定规则提示，只说明「该看一眼了」，是否行动按决策记录里的条件判断。</p>
    </Card>
  )
}
