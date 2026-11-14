import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { chapterHref, REF } from '../../invest-start/content'
import { isAnchorDay } from '../../invest-start/validation'
import { normalizeYuanInput } from '../money'
import type { PlanPatchFn } from '../patchTypes'
import { contributionDue, contributionNext } from '../schedule'
import type { Contribution, Day, PlanDocument } from '../types'

export function ContributionEditor({
  doc,
  today,
  onPatch,
}: {
  doc: PlanDocument
  today: Day
  onPatch: PlanPatchFn
}): JSX.Element {
  const [label, setLabel] = useState('月度预算')
  const [amount, setAmount] = useState('')
  const [interval, setInterval] = useState<1 | 3>(1)
  const [anchor, setAnchor] = useState(
    today.slice(0, 8) + Math.min(28, Number(today.slice(8))).toString().padStart(2, '0'),
  )
  const [error, setError] = useState('')

  const add = async (): Promise<void> => {
    const yuan = normalizeYuanInput(amount)
    if (!yuan) {
      setError('请填写有效金额（元）')
      return
    }
    let a = anchor
    if (!isAnchorDay(a)) {
      const day = Math.min(28, Number(today.slice(8, 10)))
      a = `${today.slice(0, 8)}${String(day).padStart(2, '0')}`
    }
    setError('')
    const row: Contribution = {
      id: `contrib-${crypto.randomUUID?.() ?? Date.now()}`,
      label: label.slice(0, 80) || '定投预算',
      amount: { currency: 'CNY', amount: yuan },
      intervalMonths: interval,
      anchor: a,
      enabled: true,
      acknowledgedDates: [],
    }
    await onPatch(latest => ({ ...latest, contributions: [...latest.contributions, row] }), doc.localRevision)
    setAmount('')
  }

  const ack = async (c: Contribution): Promise<void> => {
    const due = contributionDue(c, today)
    if (!due) return
    await onPatch(
      latest => ({
        ...latest,
        contributions: latest.contributions.map(x =>
          x.id === c.id ? { ...x, acknowledgedDates: [...new Set([...x.acknowledgedDates, due])].sort() } : x,
        ),
      }),
      doc.localRevision,
    )
  }

  const toggle = async (c: Contribution): Promise<void> => {
    await onPatch(
      latest => ({
        ...latest,
        contributions: latest.contributions.map(x => (x.id === c.id ? { ...x, enabled: !x.enabled } : x)),
      }),
      doc.localRevision,
    )
  }

  const remove = async (c: Contribution): Promise<void> => {
    if (!window.confirm(`删除定投备忘「${c.label}」？`)) return
    await onPatch(
      latest => ({
        ...latest,
        contributions: latest.contributions.filter(x => x.id !== c.id),
      }),
      doc.localRevision,
    )
  }

  return (
    <section className="ip-contrib" aria-labelledby="ip-contrib-title">
      <h2 id="ip-contrib-title" className="ip-h2">
        可选定投预算备忘
      </h2>
      <p className="ip-muted">
        只是预算核对，本站不会扣款。小额时可考虑按季、先核对费用（
        <Link to={chapterHref(REF.s9_9)}>9.9 案例</Link>
        ）；不翻倍补扣（
        <Link to={chapterHref(REF.s10_7)}>10.7</Link>
        ）。
      </p>
      <ul className="ip-list">
        {doc.contributions.map(c => {
          const due = contributionDue(c, today)
          const next = contributionNext(c, today)
          return (
            <li key={c.id}>
              {c.label} · 每 {c.intervalMonths} 月 · {c.enabled ? '启用' : '已停用'} · 下次参考 {next}
              {due && c.enabled && (
                <>
                  {' '}
                  <button type="button" className="tool-btn ip-btn" onClick={() => void ack(c)}>
                    核对本期预算 {due}
                  </button>
                </>
              )}
              <button type="button" className="tool-btn ip-btn" onClick={() => void toggle(c)}>
                {c.enabled ? '停用' : '启用'}
              </button>
              <button type="button" className="tool-btn ip-btn" onClick={() => void remove(c)}>
                删除
              </button>
            </li>
          )
        })}
      </ul>
      <label className="ip-field">
        <span>标签</span>
        <input value={label} onChange={e => setLabel(e.target.value)} />
      </label>
      <label className="ip-field">
        <span>金额（元）</span>
        <input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} />
      </label>
      <fieldset className="ip-fieldset">
        <legend>节奏</legend>
        <label className="ip-check">
          <input type="radio" checked={interval === 1} onChange={() => setInterval(1)} />
          <span>每月</span>
        </label>
        <label className="ip-check">
          <input type="radio" checked={interval === 3} onChange={() => setInterval(3)} />
          <span>每季</span>
        </label>
      </fieldset>
      <label className="ip-field">
        <span>首个预算日（日号 1–28）</span>
        <input type="date" value={anchor} onChange={e => setAnchor(e.target.value)} />
      </label>
      {error && (
        <p className="ip-error" role="alert">
          {error}
        </p>
      )}
      <div className="ip-actions">
        <button type="button" className="tool-btn ip-btn" onClick={() => void add()}>
          添加定投备忘
        </button>
      </div>
    </section>
  )
}
