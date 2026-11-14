import React, { useRef, useState } from 'react'
import { FundingEditor, type FundingEditorHandle } from './FundingEditor'
import { AllocationEditor } from './AllocationEditor'
import { ContributionEditor } from './ContributionEditor'
import { ReviewFlow } from './ReviewFlow'
import type { PlanPatchFn } from '../patchTypes'
import type { Day, Instant, PlanDocument } from '../types'

const STEPS = [
  { n: 1 as const, title: '资金先分用途' },
  { n: 2 as const, title: '三笔投资预算' },
  { n: 3 as const, title: '记录配置与市值' },
  { n: 4 as const, title: '检查日和预算节奏' },
]

export function PlanWizard({
  doc,
  today,
  now,
  onPatch,
  onComplete,
}: {
  doc: PlanDocument
  today: Day
  now: Instant
  onPatch: PlanPatchFn
  onComplete: () => void
}): JSX.Element {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(doc.wizard.nextStep)
  const [error, setError] = useState('')
  const titleRef = useRef<HTMLHeadingElement>(null)
  const fundingRef = useRef<FundingEditorHandle>(null)

  const advanceWizard = async (next: 1 | 2 | 3 | 4, skipped?: boolean): Promise<boolean> => {
    // 链式第二步：不传 expected → 用仓库最新 revision（上一步刚写入）
    const r = await onPatch(latest => ({
      ...latest,
      wizard: {
        nextStep: next,
        completed: false,
        skippedSteps: skipped
          ? ([...new Set([...latest.wizard.skippedSteps, step])] as (1 | 2 | 3 | 4)[])
          : latest.wizard.skippedSteps,
      },
    }))
    if (!r.ok) {
      setError('有一项填写不符合要求，未保存。')
      return false
    }
    setStep(next)
    setError('')
    queueMicrotask(() => titleRef.current?.focus())
    return true
  }

  const saveAndContinue = async (): Promise<void> => {
    if (step === 1) {
      const ok = await fundingRef.current?.savePurposes()
      if (!ok) {
        setError('请先修正本步填写后再继续')
        return
      }
    } else if (step === 2) {
      const ok = await fundingRef.current?.saveBudgets(false)
      if (!ok) {
        setError('请先修正本步填写后再继续')
        return
      }
    }
    await advanceWizard((step + 1) as 1 | 2 | 3 | 4)
  }

  const skip = async (): Promise<void> => {
    await advanceWizard((step + 1) as 1 | 2 | 3 | 4, true)
  }

  const goBack = async (): Promise<void> => {
    await advanceWizard((step - 1) as 1 | 2 | 3 | 4)
  }

  const finish = async (skipped?: boolean): Promise<void> => {
    const r = await onPatch(latest => ({
      ...latest,
      wizard: {
        nextStep: 4,
        completed: true,
        skippedSteps: skipped
          ? ([...new Set([...latest.wizard.skippedSteps, 4])] as (1 | 2 | 3 | 4)[])
          : latest.wizard.skippedSteps,
      },
    }))
    if (!r.ok) {
      setError('有一项填写不符合要求，未保存。')
      return
    }
    onComplete()
  }

  return (
    <section className="ip-wizard" aria-labelledby="ip-wizard-title">
      <h2 id="ip-wizard-title" className="ip-h2" ref={titleRef} tabIndex={-1}>
        整理计划 · 第 {step} 步：{STEPS[step - 1].title}
      </h2>
      <ol className="ip-steps">
        {STEPS.map(s => (
          <li key={s.n} aria-current={s.n === step ? 'step' : undefined}>
            {s.n}. {s.title}
          </li>
        ))}
      </ol>
      <p className="ip-muted">
        每步可跳过；跳过保留既有值。全部跳过也可得到合法空草稿，首页会显示缺项，不会显示安全。
      </p>

      {step === 1 && (
        <FundingEditor ref={fundingRef} doc={doc} now={now} onPatch={onPatch} sections="purposes" />
      )}
      {step === 2 && (
        <FundingEditor ref={fundingRef} doc={doc} now={now} onPatch={onPatch} sections="budgets" />
      )}
      {step === 3 && <AllocationEditor doc={doc} today={today} now={now} onPatch={onPatch} />}
      {step === 4 && (
        <>
          <ReviewFlow doc={doc} today={today} now={now} onPatch={onPatch} />
          <ContributionEditor doc={doc} today={today} onPatch={onPatch} />
        </>
      )}

      {error && (
        <p className="ip-error" role="alert">
          {error}
        </p>
      )}

      <div className="ip-actions">
        {step > 1 && (
          <button type="button" className="tool-btn ip-btn" onClick={() => void goBack()}>
            上一步
          </button>
        )}
        {step < 4 ? (
          <>
            <button type="button" className="tool-btn ip-btn" onClick={() => void saveAndContinue()}>
              保存并继续
            </button>
            <button type="button" className="tool-btn ip-btn" onClick={() => void skip()}>
              跳过这一步
            </button>
          </>
        ) : (
          <>
            <button type="button" className="tool-btn ip-btn" onClick={() => void finish()}>
              保存这份计划
            </button>
            <button type="button" className="tool-btn ip-btn" onClick={() => void finish(true)}>
              跳过并保存草稿
            </button>
          </>
        )}
      </div>
    </section>
  )
}
