import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { chapterHref, REF } from '../../invest-start/content'
import { downloadPlanIcs, ICS_CAVEAT } from '../calendar'
import { fenToYuan } from '../money'
import { selectAllocation, selectPlanStatus } from '../selectors'
import { planReviewStatus } from '../schedule'
import type { PlanPatchFn } from '../patchTypes'
import type { Day, Instant, PlanDocument, PlanReview } from '../types'
import { isAnchorDay } from '../../invest-start/validation'
import { bandLabel, dataLabel, FX_HINT } from '../uiLabels'

export function ReviewFlow({
  doc,
  today,
  now: _now,
  onPatch,
}: {
  doc: PlanDocument
  today: Day
  now: Instant
  onPatch: PlanPatchFn
}): JSX.Element {
  void _now
  const status = selectPlanStatus(doc, today)
  const alloc = selectAllocation(doc, today)
  const [interval, setInterval] = useState<3 | 6>(doc.review?.intervalMonths ?? 6)
  const [mode, setMode] = useState<PlanReview['mode']>(doc.review?.mode ?? 'calendar-check-band-act')
  const [anchor, setAnchor] = useState(doc.review?.anchor ?? suggestAnchor(today, 6))
  const [outcome, setOutcome] = useState<'no-action' | 'cashflow' | 'adjusted' | 'deferred'>('no-action')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [checkAsOf, setCheckAsOf] = useState(today)
  const [verifiedAck, setVerifiedAck] = useState(false)

  const saveSchedule = async (): Promise<void> => {
    if (!isAnchorDay(anchor)) {
      setError('检查日首日须为 1–28 日')
      return
    }
    setError('')
    await onPatch(latest => {
      const prev = latest.review
      const sameSeries = prev && prev.anchor === anchor && prev.intervalMonths === interval
      const next: PlanReview = {
        id: prev?.id ?? `review-${crypto.randomUUID?.() ?? Date.now()}`,
        anchor,
        intervalMonths: interval,
        completedDates: sameSeries ? prev!.completedDates : [],
        calendarSequence: sameSeries ? prev!.calendarSequence : prev ? prev.calendarSequence + 1 : 0,
        mode,
      }
      if (prev && prev.anchor === anchor && prev.intervalMonths === interval && prev.mode !== mode) {
        next.completedDates = prev.completedDates
        next.calendarSequence = prev.calendarSequence
      }
      return { ...latest, review: next }
    }, doc.localRevision)
  }

  const completeCheck = async (): Promise<void> => {
    if (!doc.review) {
      setError('请先保存检查日')
      return
    }
    const st = planReviewStatus(doc.review, today)
    if (!st.due) {
      setError('当前没有到期检查日')
      return
    }
    if (!verifiedAck) {
      setError('请勾选「这些金额已按该日核对」')
      return
    }
    const existing = doc.history.find(h => h.scheduleId === doc.review!.id && h.scheduledDate === st.due)
    if (existing) {
      if (!window.confirm('本期已记过一次，要更新那条记录吗？')) return
    }
    if (doc.history.length >= 100) {
      if (!window.confirm('检查记录将超过 100 条，最早的会被挤出。建议先下载备份。继续？')) return
    }
    setError('')
    const checkedAt = new Date().toISOString()
    await onPatch(latest => {
      const review = latest.review!
      const id = existing?.id ?? `hist-${crypto.randomUUID?.() ?? Date.now()}`
      const record = {
        id,
        scheduleId: review.id,
        scheduledDate: st.due!,
        checkedAt,
        asOf: checkAsOf,
        outcome,
        note: note.slice(0, 1000),
        snapshot: {
          funding: latest.funding.budgets,
          core: latest.core,
          coreTotalOnly: latest.coreTotalOnly,
          research: latest.research,
          researchTotalOnly: latest.researchTotalOnly,
          reserve: latest.funding.reserveActual,
        },
      }
      const completedDates =
        outcome === 'deferred' ? review.completedDates : [...new Set([...review.completedDates, st.due!])].sort()
      const history = existing
        ? latest.history.map(h => (h.id === existing.id ? record : h))
        : [...latest.history, record].slice(-100)
      return {
        ...latest,
        review: { ...review, completedDates },
        history,
      }
    }, doc.localRevision)
  }

  const savedMode = doc.review?.mode ?? mode
  const gapRows = alloc.rows.filter(r => r.gapFen !== null && r.calculatedDeviation)

  return (
    <section className="ip-review" aria-labelledby="ip-review-title">
      <h2 id="ip-review-title" className="ip-h2">
        检查日与核对
      </h2>
      <p className="ip-muted">
        书里有两种触发（
        <Link to={chapterHref(REF.s8_2)}>8.2</Link>
        ）：到期按目标复核，或到检查日核对且越过相对带宽才调。本页默认是「检查日核对、越过带宽才调」，不是书只允许这一种。带宽：事先定的偏离范围，按目标的相对比例算。
      </p>
      <p aria-live="polite">
        {doc.review
          ? status.review.due
            ? `检查日 ${status.review.due} 已到`
            : `下次检查日 ${status.review.next}，还有 ${status.review.daysToNext} 天`
          : '尚未设置检查日'}
      </p>

      <fieldset className="ip-fieldset">
        <legend>间隔</legend>
        <label className="ip-check">
          <input
            type="radio"
            checked={interval === 6}
            onChange={() => {
              setInterval(6)
              setAnchor(suggestAnchor(today, 6))
            }}
          />
          <span>半年（默认）</span>
        </label>
        <label className="ip-check">
          <input
            type="radio"
            checked={interval === 3}
            onChange={() => {
              setInterval(3)
              setAnchor(suggestAnchor(today, 3))
            }}
          />
          <span>季度</span>
        </label>
      </fieldset>
      <fieldset className="ip-fieldset">
        <legend>触发方式</legend>
        <label className="ip-check">
          <input
            type="radio"
            checked={mode === 'calendar-check-band-act'}
            onChange={() => setMode('calendar-check-band-act')}
          />
          <span>检查日核对，严格越过相对带宽才看条件计算（默认）</span>
        </label>
        <label className="ip-check">
          <input
            type="radio"
            checked={mode === 'calendar-rebalance'}
            onChange={() => setMode('calendar-rebalance')}
          />
          <span>到检查日按事先目标复核（不加越界条件）</span>
        </label>
      </fieldset>
      <label className="ip-field">
        <span>首个检查日（1–28）</span>
        <input type="date" value={anchor} onChange={e => setAnchor(e.target.value)} />
      </label>
      <div className="ip-actions">
        <button type="button" className="tool-btn ip-btn" onClick={() => void saveSchedule()}>
          保存检查日
        </button>
        {doc.review && (
          <button type="button" className="tool-btn ip-btn" onClick={() => downloadPlanIcs(doc.review!, today)}>
            下载 .ics
          </button>
        )}
      </div>
      {doc.review && <p className="ip-muted">{ICS_CAVEAT}</p>}

      {status.review.due && (
        <div className="ip-checkflow">
          <h3 className="ip-h3">本次检查</h3>
          <p>
            先核对日期与资金用途，再看事先约定条件。偏离状态：{bandLabel(alloc.state)}（{dataLabel(alloc.dataState)}）
          </p>
          {savedMode === 'calendar-rebalance' && (
            <p className="ip-muted">本期触发：到检查日按事先目标复核（不附加越界条件）。</p>
          )}
          {alloc.state === 'breached' && savedMode === 'calendar-check-band-act' && (
            <p className="ip-muted">
              记录显示超出事先带宽，待核对。差额只作按本次记录与目标计算的说明，不是「需买入/卖出」指令。
            </p>
          )}
          {gapRows.length > 0 && (
            <ul className="ip-list">
              {gapRows.map(r => (
                <li key={r.id}>
                  {r.label}：相对目标差额约 {r.gapFen !== null ? fenToYuan(r.gapFen < 0n ? -r.gapFen : r.gapFen) : '—'}{' '}
                  元（{r.gapFen !== null && r.gapFen < 0n ? '高于' : '低于'}目标）
                </li>
              ))}
            </ul>
          )}
          <p className="ip-muted">{FX_HINT}</p>
          <label className="ip-field">
            <span>本次核对估值日</span>
            <input type="date" value={checkAsOf} max={today} onChange={e => setCheckAsOf(e.target.value)} />
          </label>
          <label className="ip-check">
            <input type="checkbox" checked={verifiedAck} onChange={e => setVerifiedAck(e.target.checked)} />
            <span>这些金额已按该日核对</span>
          </label>
          <fieldset className="ip-fieldset">
            <legend>本次结果</legend>
            {(
              [
                ['no-action', '本次未调整'],
                ['cashflow', '记录新增资金安排'],
                ['adjusted', '已自行调整'],
                ['deferred', '暂缓并记原因'],
              ] as const
            ).map(([v, label]) => (
              <label key={v} className="ip-check">
                <input type="radio" checked={outcome === v} onChange={() => setOutcome(v)} />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
          <label className="ip-field">
            <span>备注（≤1000）</span>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} />
          </label>
          <button type="button" className="tool-btn ip-btn" onClick={() => void completeCheck()}>
            保存本次检查记录
          </button>
        </div>
      )}
      {error && (
        <p className="ip-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

function suggestAnchor(today: Day, months: number): Day {
  const [y, m, d] = today.split('-').map(Number)
  const idx = y * 12 + (m - 1) + months
  const day = Math.min(28, d)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}-${pad(day)}`
}
