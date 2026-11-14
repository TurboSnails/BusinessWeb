import React, { useState } from 'react'
import type { PlanPatchFn } from '../patchTypes'
import type { Instant, PlanDocument } from '../types'
import { outcomeLabel } from '../uiLabels'

export function HistoryPanel({
  doc,
  now: _now,
  onPatch,
}: {
  doc: PlanDocument
  now: Instant
  onPatch: PlanPatchFn
}): JSX.Element {
  void _now
  const [followed, setFollowed] = useState('')
  const [changed, setChanged] = useState('')
  const [next, setNext] = useState('')
  const [openAnnual, setOpenAnnual] = useState<string | null>(null)

  const addAnnual = async (): Promise<void> => {
    const at = new Date().toISOString()
    const year = new Date(at).getFullYear()
    await onPatch(
      latest => ({
        ...latest,
        annualReviews: [
          ...latest.annualReviews,
          {
            id: `annual-${year}-${crypto.randomUUID?.() ?? Date.now()}`,
            year,
            at,
            followedRules: followed.slice(0, 1000),
            changedNeeds: changed.slice(0, 1000),
            nextVerification: next.slice(0, 1000),
          },
        ].slice(-20),
      }),
      doc.localRevision,
    )
    setFollowed('')
    setChanged('')
    setNext('')
  }

  return (
    <section className="ip-history" aria-labelledby="ip-history-title">
      <h2 id="ip-history-title" className="ip-h2">
        检查记录与年度复盘
      </h2>
      <h3 className="ip-h3">检查记录</h3>
      {doc.history.length === 0 ? (
        <p className="ip-muted">还没有检查记录。浏览不会自动生成快照。</p>
      ) : (
        <ul className="ip-list">
          {[...doc.history].reverse().slice(0, 20).map(h => (
            <li key={h.id}>
              {h.asOf} · {outcomeLabel(h.outcome)}
              {h.scheduledDate ? ` · 计划日 ${h.scheduledDate}` : ''}
              {h.note ? ` · ${h.note.slice(0, 80)}` : ''}
            </li>
          ))}
        </ul>
      )}

      <h3 className="ip-h3">简单年度复盘（三个问题）</h3>
      <label className="ip-field">
        <span>是否遵守了事先规则</span>
        <textarea value={followed} onChange={e => setFollowed(e.target.value)} rows={2} />
      </label>
      <label className="ip-field">
        <span>家庭用款与需求有何变化</span>
        <textarea value={changed} onChange={e => setChanged(e.target.value)} rows={2} />
      </label>
      <label className="ip-field">
        <span>下一年要核对什么</span>
        <textarea value={next} onChange={e => setNext(e.target.value)} rows={2} />
      </label>
      <div className="ip-actions">
        <button type="button" className="tool-btn ip-btn" onClick={() => void addAnnual()}>
          保存年度复盘
        </button>
      </div>
      <ul className="ip-list">
        {doc.annualReviews.map(a => (
          <li key={a.id}>
            <button type="button" className="tool-btn ip-btn" onClick={() => setOpenAnnual(openAnnual === a.id ? null : a.id)}>
              {a.year} · 已记
            </button>
            {openAnnual === a.id && (
              <div className="ip-muted">
                <p>是否遵守：{a.followedRules || '（空）'}</p>
                <p>需求变化：{a.changedNeeds || '（空）'}</p>
                <p>下年核对：{a.nextVerification || '（空）'}</p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
