import React from 'react'
import { Link } from 'react-router-dom'
import { BellRing } from 'lucide-react'
import type { Company } from '../data/companies'
import { ALERT_LABEL, type CandidateAlert } from '../features/candidates/alerts'
import { MARKET_LABEL } from '../features/candidates/links'
import { Badge, Card } from './ui'
import '../styles/candidates.css'

/** 候选池顶部：今天需要动手的事项；没有事项时一行说明 */
export default function CandidateAlerts({ alerts, companies, onSeen, onSnooze, paused = 0 }: {
  alerts: CandidateAlert[]
  companies: Company[]
  /** 「触及条件价」：已看过（只标记已读，不删除提醒） */
  onSeen?: (alert: CandidateAlert) => void
  /** 「触及条件价」：暂停 7 天 */
  onSnooze?: (alert: CandidateAlert) => void
  /** 因行情未更新等原因暂停判断的价位提醒数 */
  paused?: number
}): JSX.Element {
  const names = new Map(companies.map(c => [`${c.market}:${c.code}`, c.name]))
  const pausedNote = paused > 0 && <p className="cand-alerts-paused">另有 {paused} 条价位提醒暂停判断（行情未更新、币种不同或没有收盘价），详见候选列表的「提醒」。</p>
  if (!alerts.length) return <><p className="cand-alerts-empty"><BellRing size={14} aria-hidden="true" /> 今天没有到期复查、进入买入区、触及条件价或评级变化的候选公司。</p>{pausedNote}</>
  return (
    <Card as="section" label="今日待处理" title={<><BellRing size={16} aria-hidden="true" /> 今日待处理 · {alerts.length}</>} className="rn-card cand-alerts">
      <ul>
        {alerts.map(a => (
          <li key={`${a.kind}:${a.market}:${a.code}`}>
            <Badge tone={a.kind === 'buy-zone' || a.kind === 'price-hit' ? 'accent' : 'warm'}>{ALERT_LABEL[a.kind]}</Badge>
            <Link to={`/research-notes/${a.market}/${encodeURIComponent(a.code)}`} className="rn-link">{names.get(`${a.market}:${a.code}`) ?? a.code} {a.code}</Link>
            <small>{MARKET_LABEL[a.market]}</small>
            {a.kind === 'price-hit' && (onSeen || onSnooze) && (
              <span className="cand-alert-actions">
                {onSeen && <button type="button" className="tool-btn" onClick={() => onSeen(a)} aria-label={`已看过 ${a.code} 的价位提醒`}>已看过</button>}
                {onSnooze && <button type="button" className="tool-btn" onClick={() => onSnooze(a)} aria-label={`暂停 ${a.code} 的价位提醒 7 天`}>暂停 7 天</button>}
              </span>
            )}
            <span>{a.text}</span>
          </li>
        ))}
      </ul>
      {pausedNote}
      <p className="cand-foot">按固定规则提示，只说明「该看一眼了」，是否行动按决策记录里的条件判断。</p>
    </Card>
  )
}
