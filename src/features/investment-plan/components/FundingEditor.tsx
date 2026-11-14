import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { Link } from 'react-router-dom'
import { chapterHref, REF } from '../../invest-start/content'
import { normalizeYuanInput, percentToBps, bpsToPercent, yuanToFen } from '../money'
import type { PlanPatchFn } from '../patchTypes'
import { selectEmergency, selectReferenceTotal } from '../selectors'
import type { Instant, PlanDocument } from '../types'
import { FX_HINT, writeReasonLabel } from '../uiLabels'

type Earliest = PlanDocument['funding']['earliestUse']

export type FundingEditorHandle = {
  savePurposes: () => Promise<boolean>
  saveBudgets: (confirm?: boolean) => Promise<boolean>
}

export const FundingEditor = forwardRef<
  FundingEditorHandle,
  {
    doc: PlanDocument
    now: Instant
    onPatch: PlanPatchFn
    /** 向导分步：只渲染用途 / 只渲染预算 / 全部 */
    sections?: 'purposes' | 'budgets' | 'all'
  }
>(function FundingEditor({ doc, now, onPatch, sections = 'all' }, ref) {
  const f = doc.funding
  const [expense, setExpense] = useState(f.monthlyNecessaryExpense?.amount ?? '')
  const [months, setMonths] = useState(f.emergencyMonths !== null ? String(f.emergencyMonths) : '')
  const [recent, setRecent] = useState(f.recentNeedAmount?.amount ?? '')
  const [earliest, setEarliest] = useState<Earliest>(f.earliestUse)
  const [debt, setDebt] = useState<boolean | null>(f.highInterestDebt)
  const [core, setCore] = useState(f.budgets.core?.amount ?? '')
  const [research, setResearch] = useState(f.budgets.research?.amount ?? '')
  const [reserve, setReserve] = useState(f.budgets.reserve?.amount ?? '')
  const [reserveActual, setReserveActual] = useState(f.reserveActual.value?.amount ?? '')
  const [reserveAsOf, setReserveAsOf] = useState(f.reserveActual.asOf ?? '')
  const [reserveVerified, setReserveVerified] = useState(false)
  const [researchCap, setResearchCap] = useState(
    doc.limits.researchCapBps !== null ? bpsToPercent(doc.limits.researchCapBps) : '',
  )
  const [singleCap, setSingleCap] = useState(
    doc.limits.singleStockCapBps !== null ? bpsToPercent(doc.limits.singleStockCapBps) : '',
  )
  const [ackRecord, setAckRecord] = useState(false)
  const [ackExit, setAckExit] = useState(false)
  const [error, setError] = useState('')

  // 另一窗口更新并 refresh 后，按新 revision 重灌草稿
  useEffect(() => {
    setExpense(f.monthlyNecessaryExpense?.amount ?? '')
    setMonths(f.emergencyMonths !== null ? String(f.emergencyMonths) : '')
    setRecent(f.recentNeedAmount?.amount ?? '')
    setEarliest(f.earliestUse)
    setDebt(f.highInterestDebt)
    setCore(f.budgets.core?.amount ?? '')
    setResearch(f.budgets.research?.amount ?? '')
    setReserve(f.budgets.reserve?.amount ?? '')
    setReserveActual(f.reserveActual.value?.amount ?? '')
    setReserveAsOf(f.reserveActual.asOf ?? '')
    setResearchCap(doc.limits.researchCapBps !== null ? bpsToPercent(doc.limits.researchCapBps) : '')
    setSingleCap(doc.limits.singleStockCapBps !== null ? bpsToPercent(doc.limits.singleStockCapBps) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.localRevision])

  const moneyOrNull = (raw: string) => {
    const n = normalizeYuanInput(raw)
    return n === null ? null : { currency: 'CNY' as const, amount: n }
  }

  const savePurposes = async (): Promise<boolean> => {
    const monthlyNecessaryExpense = moneyOrNull(expense)
    const recentNeedAmount = moneyOrNull(recent)
    if ((expense.trim() && !monthlyNecessaryExpense) || (recent.trim() && !recentNeedAmount)) {
      setError('金额须为非负两位小数元。')
      return false
    }
    const emergencyMonths = months.trim() === '' ? null : Number(months)
    if (months.trim() && (!Number.isInteger(emergencyMonths) || emergencyMonths! < 1 || emergencyMonths! > 60)) {
      setError('应急月数须为 1–60 的整数。')
      return false
    }
    setError('')
    const r = await onPatch(
      latest => ({
        ...latest,
        funding: {
          ...latest.funding,
          monthlyNecessaryExpense,
          emergencyMonths: emergencyMonths as number | null,
          recentNeedAmount,
          earliestUse: earliest,
          highInterestDebt: debt,
        },
      }),
      doc.localRevision,
    )
    if (!r.ok) {
      setError(writeReasonLabel(r.reason ?? 'invalid'))
      return false
    }
    return true
  }

  const saveBudgets = async (confirm = false): Promise<boolean> => {
    const c = moneyOrNull(core)
    const r = moneyOrNull(research)
    const v = moneyOrNull(reserve)
    if ((core.trim() && !c) || (research.trim() && !r) || (reserve.trim() && !v)) {
      setError('预算金额须为非负两位小数元。')
      return false
    }
    if (confirm && (!c || !r || !v)) {
      setError('三项都填（可填 0）后才能确认')
      return false
    }
    setError('')
    const result = await onPatch(latest => {
      const prev = latest.funding.budgets
      const same =
        (prev.core?.amount ?? null) === (c?.amount ?? null) &&
        (prev.research?.amount ?? null) === (r?.amount ?? null) &&
        (prev.reserve?.amount ?? null) === (v?.amount ?? null)
      let confirmedAt = prev.confirmedAt
      if (confirm && c && r && v) confirmedAt = now
      else if (!same) confirmedAt = null
      // confirm=false 且金额未变 → 保留已有 confirmedAt（向导「保存并继续」不撤确认）
      return {
        ...latest,
        funding: {
          ...latest.funding,
          budgets: { core: c, research: r, reserve: v, confirmedAt },
        },
      }
    }, doc.localRevision)
    if (!result.ok) {
      setError(writeReasonLabel(result.reason ?? 'invalid'))
      return false
    }
    return true
  }

  useImperativeHandle(ref, () => ({ savePurposes, saveBudgets }))

  const saveReserveActual = async (): Promise<void> => {
    const amount = moneyOrNull(reserveActual)
    if (reserveActual.trim() && !amount) {
      setError('备用金实际余额无效')
      return
    }
    if (amount && !reserveAsOf) {
      setError('请填写备用金估值日期')
      return
    }
    if (amount && !reserveVerified) {
      setError('请勾选「这些金额已按该日核对」')
      return
    }
    setError('')
    const r = await onPatch(
      latest => ({
        ...latest,
        funding: {
          ...latest.funding,
          reserveActual: amount
            ? {
                value: amount,
                asOf: reserveAsOf,
                source: 'manual',
                verifiedAt: now,
              }
            : { value: null, asOf: null, source: 'manual', verifiedAt: null },
        },
      }),
      doc.localRevision,
    )
    if (!r.ok) setError(writeReasonLabel(r.reason ?? 'invalid'))
  }

  const saveLimits = async (confirm: boolean): Promise<void> => {
    const rc = researchCap.trim() === '' ? null : percentToBps(researchCap)
    const sc = singleCap.trim() === '' ? null : percentToBps(singleCap)
    if (researchCap.trim() && (!rc || !rc.ok || rc.bps > 2000)) {
      setError('主动上限须为 0%–20%')
      return
    }
    if (singleCap.trim() && (!sc || !sc.ok || sc.bps < 1)) {
      setError('单只上限须为有效百分数')
      return
    }
    const researchCapBps = rc && rc.ok ? rc.bps : null
    const singleStockCapBps = sc && sc.ok ? sc.bps : null
    if (researchCapBps !== null && researchCapBps > 500 && (!ackRecord || !ackExit)) {
      setError('提高主动上限至超过 5% 须两项本人声明')
      return
    }
    setError('')
    const r = await onPatch(latest => {
      const prev = latest.limits
      const changed =
        prev.researchCapBps !== researchCapBps || prev.singleStockCapBps !== singleStockCapBps
      return {
        ...latest,
        limits: {
          researchCapBps,
          singleStockCapBps,
          confirmedAt: confirm ? now : changed ? null : prev.confirmedAt,
          increaseAcknowledgedAt:
            researchCapBps !== null && researchCapBps > 500 && ackRecord && ackExit
              ? now
              : researchCapBps !== null && researchCapBps > 500
                ? prev.increaseAcknowledgedAt
                : null,
        },
      }
    }, doc.localRevision)
    if (!r.ok) setError(writeReasonLabel(r.reason ?? 'invalid'))
  }

  const emergency = selectEmergency(doc)
  const refTotal = selectReferenceTotal(doc)
  const needText =
    emergency.needFen === null
      ? '未知'
      : `${(emergency.needFen / 100n).toString()}.${(emergency.needFen % 100n).toString().padStart(2, '0')} 元`
  const draftTotal = (() => {
    const parts = [core, research, reserve].map(s => (s.trim() === '' ? null : normalizeYuanInput(s)))
    if (parts.some((p, i) => [core, research, reserve][i].trim() !== '' && p === null)) return '无效'
    if (parts.some(p => p === null)) return null
    const sum = parts.reduce((s, p) => s + yuanToFen(p!)!, 0n)
    return `${(sum / 100n).toString()}.${(sum % 100n).toString().padStart(2, '0')}`
  })()

  const showPurposes = sections === 'all' || sections === 'purposes'
  const showBudgets = sections === 'all' || sections === 'budgets'

  return (
    <section className="ip-funding" aria-labelledby="ip-funding-title">
      <h2 id="ip-funding-title" className="ip-h2">家庭资金与三预算</h2>
      <p className="ip-muted">
        预算不代替资金检查。参考总额 = 配置底仓 + 主动 + 备用金（书 7.4 /
        <Link to={chapterHref(REF.s9_1)}>9.1 案例</Link>
        ）；近期确定支出先排除，自住房不计。
      </p>

      {showPurposes && (
        <>
          <h3 className="ip-h3">资金用途</h3>
          <label className="ip-field">
            <span>月必要支出（元）</span>
            <input
              inputMode="decimal"
              value={expense}
              onChange={e => setExpense(e.target.value)}
              aria-describedby="ip-expense-hint"
            />
          </label>
          <p id="ip-expense-hint" className="ip-muted">
            开篇提示 6–12 个月只是起点，由你本人定月数。
          </p>
          <label className="ip-field">
            <span>应急月数（1–60 个月，开篇建议 6–12 个月只是起点）</span>
            <input inputMode="numeric" value={months} onChange={e => setMonths(e.target.value)} />
          </label>
          <p>应急需求 = 月必要支出 × 月数 = {needText}</p>
          <label className="ip-field">
            <span>近期确定支出（元，明确 0 也可）</span>
            <input inputMode="decimal" value={recent} onChange={e => setRecent(e.target.value)} />
          </label>
          <fieldset className="ip-fieldset">
            <legend>该笔资金最早用款档</legend>
            {(
              [
                ['under-3y', '不到 3 年'],
                ['3-to-5y', '3 年到不足 5 年'],
                ['5y-plus', '5 年及以上'],
              ] as const
            ).map(([v, label]) => (
              <label key={v} className="ip-check">
                <input type="radio" name="earliest" checked={earliest === v} onChange={() => setEarliest(v)} />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
          {earliest === 'under-3y' && (
            <p className="ip-warn" role="status">
              底座.5：这笔钱近期可能要用，整理持仓时仍要优先核对用途；不生成卖出指令。
            </p>
          )}
          <fieldset className="ip-fieldset">
            <legend>是否有高息欠款</legend>
            <label className="ip-check">
              <input type="radio" name="debt" checked={debt === true} onChange={() => setDebt(true)} />
              <span>有</span>
            </label>
            <label className="ip-check">
              <input type="radio" name="debt" checked={debt === false} onChange={() => setDebt(false)} />
              <span>没有</span>
            </label>
          </fieldset>
          <div className="ip-actions">
            <button type="button" className="tool-btn ip-btn" onClick={() => void savePurposes()}>
              保存资金用途
            </button>
          </div>
        </>
      )}

      {showBudgets && (
        <>
          <h3 className="ip-h3">三笔投资预算（元）</h3>
          <p className="ip-muted">无自动 75/20/5。备用金在参考总额分母内；近期支出不在分母内。</p>
          <label className="ip-field">
            <span>配置底仓预算</span>
            <input inputMode="decimal" value={core} onChange={e => setCore(e.target.value)} />
          </label>
          <label className="ip-field">
            <span>主动（研究）预算</span>
            <input inputMode="decimal" value={research} onChange={e => setResearch(e.target.value)} />
          </label>
          <label className="ip-field">
            <span>备用金预算</span>
            <input inputMode="decimal" value={reserve} onChange={e => setReserve(e.target.value)} />
          </label>
          <p>
            实时参考总额（草稿）：{draftTotal ?? '未知'} 元；已确认：
            {refTotal.state === 'ok' ? refTotal.total?.amount : '未确认'}
          </p>
          <div className="ip-actions">
            <button type="button" className="tool-btn ip-btn" onClick={() => void saveBudgets(false)}>
              保存预算草稿
            </button>
            <button type="button" className="tool-btn ip-btn" onClick={() => void saveBudgets(true)}>
              确认这三笔预算
            </button>
          </div>
        </>
      )}

      {sections === 'all' && (
        <>
          <h3 className="ip-h3">备用金实际余额</h3>
          <p className="ip-muted">{FX_HINT}</p>
          <label className="ip-field">
            <span>实际余额（元）</span>
            <input inputMode="decimal" value={reserveActual} onChange={e => setReserveActual(e.target.value)} />
          </label>
          <label className="ip-field">
            <span>估值日期</span>
            <input type="date" value={reserveAsOf} onChange={e => setReserveAsOf(e.target.value)} />
          </label>
          <label className="ip-check">
            <input
              type="checkbox"
              checked={reserveVerified}
              onChange={e => setReserveVerified(e.target.checked)}
            />
            <span>这些金额已按该日核对</span>
          </label>
          <button type="button" className="tool-btn ip-btn" onClick={() => void saveReserveActual()}>
            保存备用金实际余额
          </button>

          <h3 className="ip-h3">主动 / 单只上限</h3>
          <label className="ip-field">
            <span>主动额度上限（%）</span>
            <input inputMode="decimal" value={researchCap} onChange={e => setResearchCap(e.target.value)} />
          </label>
          <label className="ip-field">
            <span>单只上限（%）</span>
            <input inputMode="decimal" value={singleCap} onChange={e => setSingleCap(e.target.value)} />
          </label>
          <label className="ip-check">
            <input type="checkbox" checked={ackRecord} onChange={e => setAckRecord(e.target.checked)} />
            <span>已写完整决策记录（37.4）</span>
          </label>
          <label className="ip-check">
            <input type="checkbox" checked={ackExit} onChange={e => setAckExit(e.target.checked)} />
            <span>已读过退出判据（18.10）</span>
          </label>
          <div className="ip-actions">
            <button type="button" className="tool-btn ip-btn" onClick={() => void saveLimits(false)}>
              保存上限草稿
            </button>
            <button type="button" className="tool-btn ip-btn" onClick={() => void saveLimits(true)}>
              确认上限
            </button>
          </div>
          {doc.limits.confirmedAt && <p className="ip-muted">上限已确认</p>}
        </>
      )}

      {error && (
        <p className="ip-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
})
