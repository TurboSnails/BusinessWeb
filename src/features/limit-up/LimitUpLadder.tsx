import React, { useState } from 'react'
import { Copy } from 'lucide-react'
import { EmptyState } from '../../components/ui'
import { ladderCopyText, type LadderTier } from './ladder'

export default function LimitUpLadder({ tiers, onPickConcept }: { tiers: LadderTier[]; onPickConcept(name: string): void }): JSX.Element {
  const [copied, setCopied] = useState<'ok' | 'fail' | ''>('')
  if (tiers.length === 0) return <EmptyState title="暂无涨停梯队数据" />
  const total = tiers.reduce((n, t) => n + t.stocks.length, 0)
  const copy = async () => {
    const done = (state: 'ok' | 'fail') => { setCopied(state); setTimeout(() => setCopied(''), 1500) }
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(ladderCopyText(tiers))
      done('ok')
    } catch { done('fail') }
  }
  const label = copied === 'ok' ? '已复制' : copied === 'fail' ? '复制失败，请手动选择' : '复制梯队'
  return (
    <section className="ui-card limitup-ladder" aria-label="涨停梯队图">
      <div className="limitup-ladder__head">
        <h2 className="limitup-detail__title">涨停梯队图 <small>共 {total} 只，最高 {tiers[0].boards} 板</small></h2>
        <button type="button" className="tool-btn" onClick={() => void copy()}><Copy size={15} aria-hidden="true" />{label}</button>
      </div>
      <div className="limitup-ladder__tiers">
        {tiers.map(tier => (
          <div key={tier.boards} className="limitup-tier">
            <div className="limitup-tier__label"><strong>{tier.boards}</strong>板<span>{tier.stocks.length} 只</span></div>
            <ul className="limitup-tier__stocks">
              {tier.stocks.map(s => (
                <li key={s.code} className="limitup-tier__stock" title={s.description || undefined}>
                  <span className="limitup-tier__name">{s.name}</span>
                  <span className="limitup-tier__meta">{s.code} · {s.limitUpTime ? s.limitUpTime.slice(-8, -3) : '--'} · {s.marketCap.toFixed(0)}亿</span>
                  <span className="limitup-tier__tags">{s.concepts.slice(0, 3).map(c => (
                    <button key={c} type="button" className="limitup-tier__tag" onClick={() => onPickConcept(c)}>{c}</button>
                  ))}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
