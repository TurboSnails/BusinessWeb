import React from 'react'
import { Link } from 'react-router-dom'
import { dcfLink, dcfOf, type ToolSources } from '../features/candidates/links'
import type { CandidateMarket } from '../features/candidates/validation'
import { DCF_FILTERS, type DcfFilterId } from '../features/dcf/filter'
import '../styles/research.css'

const NOT_APPLICABLE: Record<string, string> = { financial: '不适用（金融）', negativeFcf: '不适用（现金流为负）', incomplete: '数据不全' }
const pct = (v: number): string => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}%`

/** 列表里的 DCF 单元格：本人记录优先，否则显示预填库的自动估值；安全边际按最新股价。点击进入 DCF 页重算或调整 */
export function DcfCell({ market, code, name, price, tools }: { market: CandidateMarket; code: string; name: string; price?: number | null; tools: ToolSources }): JSX.Element {
  const dcf = dcfOf(market, code, tools)
  const to = dcfLink(market, code, name, price ?? dcf?.current)
  if (!dcf) return <Link className="rn-dcf" to={to} aria-label={`算 DCF ${code}`}>算 DCF</Link>
  if (dcf.price == null) return <Link className="rn-dcf is-na" to={to} aria-label={`DCF ${code} ${NOT_APPLICABLE[dcf.status ?? ''] ?? '未得合理价'}`}>{NOT_APPLICABLE[dcf.status ?? ''] ?? '未得合理价'}</Link>
  const tag = dcf.source === 'mine' ? '我的' : '自动'
  const buy = dcf.buyBelow != null && dcf.current != null && dcf.current <= dcf.buyBelow
  // 现金流不稳定（如周期股低谷、某年为负）时，DCF 只作参考：灰色显示并标注，不用红绿暗示贵贱
  const low = dcf.source === 'auto' && dcf.credibility === 'low'
  const title = dcf.source === 'mine'
    ? `本人保存于 ${dcf.savedAt?.slice(0, 10) ?? ''}，合理价 ${dcf.price.toFixed(2)}${dcf.current ? `，按最新价 ${dcf.current} 计算` : '（未取得最新价，沿用保存时）'}`
    : `按公开财报默认假设，合理价 ${dcf.price.toFixed(2)}，买入参考 ${dcf.buyBelow?.toFixed(2) ?? '—'}，现价 ${dcf.current ?? '—'}${low ? '；现金流不稳定，可信度低，仅供参考' : ''}；点击查看与调整`
  return (
    <Link className={`rn-dcf ${low ? 'is-na' : dcf.mos == null ? '' : dcf.mos >= 0 ? 'is-good' : 'is-bad'}`} to={to} title={title}
      aria-label={`DCF ${code} ${tag} 安全边际 ${dcf.mos == null ? '未知' : pct(dcf.mos)}${low ? ' 可信度低' : ''}`}>
      <span className="rn-dcf__tag">{tag}</span>{dcf.mos == null ? '—' : pct(dcf.mos)}{low ? <span className="rn-dcf__low">低可信</span> : buy ? <span className="rn-dcf__buy">低于买入价</span> : null}
    </Link>
  )
}

export function DcfFilterChips({ value, onChange, className }: { value: DcfFilterId; onChange: (id: DcfFilterId) => void; className?: string }): JSX.Element {
  return (
    <span className={className} role="group" aria-label="DCF 筛选">
      {DCF_FILTERS.map(f => (
        <button key={f.id} type="button" aria-pressed={value === f.id} onClick={() => onChange(f.id)} className={value === f.id ? 'tool-btn tool-btn--primary' : 'tool-btn'}>
          {f.id === 'all' ? 'DCF：全部' : f.label}
        </button>
      ))}
    </span>
  )
}
