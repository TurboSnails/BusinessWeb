import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Callout, Page } from '../components/ui'
import { localToday } from '../features/invest-start/checks'
import { BackupControls } from '../features/investment-plan/components/BackupControls'
import { FundingEditor } from '../features/investment-plan/components/FundingEditor'
import { AllocationEditor } from '../features/investment-plan/components/AllocationEditor'
import { ContributionEditor } from '../features/investment-plan/components/ContributionEditor'
import { HistoryPanel } from '../features/investment-plan/components/HistoryPanel'
import { MigrationPreviewPanel } from '../features/investment-plan/components/MigrationPreview'
import { PlanWizard } from '../features/investment-plan/components/PlanWizard'
import { ReviewFlow } from '../features/investment-plan/components/ReviewFlow'
import { createEmptyPlan, PLAN_KEYS } from '../features/investment-plan/types'
import { getPlanRepository } from '../features/investment-plan/repository'
import { selectPlanStatus } from '../features/investment-plan/selectors'
import { usePlan } from '../features/investment-plan/usePlan'
import { PRIVACY_LOCAL, PRIVACY_OWNER_SYNCED, writeReasonLabel } from '../features/investment-plan/uiLabels'
import '../styles/investment-plan.css'

const OwnerSyncLazy = lazy(async () => {
  const m = await import('../features/investment-plan/components/OwnerSyncPanel')
  return { default: m.OwnerSyncPanel }
})

const DISCLAIMER =
  '不构成投资建议，不承诺收益。这里帮你记录规则与核对事项，不是对资金、能力或投资资格的审核。'

/** /invest/my-plan「我的计划与持仓」：纯本机；普通访问零业务网络请求 */
export default function MyPlan(): JSX.Element {
  const repo = useMemo(() => getPlanRepository(), [])
  const { snapshot, create, patch, refresh } = usePlan(repo)
  const today = localToday()
  const location = useLocation()
  const showOwner = location.hash === '#owner-sync'

  const [mode, setMode] = useState<'home' | 'wizard' | 'migrate'>('home')
  const [live, setLive] = useState('')
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  const storage = useMemo(() => {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage
    } catch {
      return null
    }
  }, [])

  const ownerSynced = useMemo(() => {
    if (!storage) return false
    try {
      const raw = storage.getItem(PLAN_KEYS.sync)
      if (!raw) return false
      const meta = JSON.parse(raw) as { baseRevision?: number | null }
      return meta.baseRevision != null
    } catch {
      return false
    }
  }, [storage, snapshot.document?.updatedAt, snapshot.unsaved])

  const doPatch = async (
    change: (latest: NonNullable<typeof snapshot.document>) => NonNullable<typeof snapshot.document>,
    expectedLocalRevision?: number,
  ): Promise<{ ok: boolean; reason?: string; document?: NonNullable<typeof snapshot.document> }> => {
    // 用户编辑传编辑器所见 revision；向导链式第二步省略 → 用仓库最新
    const rev = expectedLocalRevision ?? repo.getSnapshot().document?.localRevision
    if (rev == null) return { ok: false, reason: 'protected' }
    const r = await patch(rev, change)
    if (r.ok) {
      setSaveError('')
      setLive(r.persisted ? '已保存' : '未写入本机，请备份')
      return { ok: true, document: r.document }
    }
    if (r.reason === 'revision-conflict') {
      refresh()
    }
    const msg = writeReasonLabel(r.reason)
    setSaveError(msg)
    setLive(msg)
    return { ok: false, reason: r.reason }
  }

  const startEmpty = async (): Promise<void> => {
    const id = crypto.randomUUID?.() ?? `plan-${Date.now()}`
    const r = await create(createEmptyPlan(new Date().toISOString(), id))
    if (r.ok) {
      setMode('wizard')
      setLive(r.persisted ? '已创建空计划' : '创建在内存中，请备份')
      setSaveError(r.persisted ? '' : '未写入本机，编辑仍可用；请备份或重试。')
    } else {
      setLive(`无法创建：${writeReasonLabel(r.reason)}`)
      setSaveError(writeReasonLabel(r.reason))
    }
  }

  const status = snapshot.document ? selectPlanStatus(snapshot.document, today) : null
  const privacy = ownerSynced ? PRIVACY_OWNER_SYNCED : PRIVACY_LOCAL

  return (
    <Page className="investment-plan">
      <nav className="breadcrumb ip-breadcrumb" aria-label="面包屑">
        <Link to="/">Live</Link>
        <span aria-hidden="true">›</span>
        <Link to="/invest">投资</Link>
        <span aria-hidden="true">›</span>
        <span className="breadcrumb__current">我的计划与持仓</span>
      </nav>

      <header className="page-head ip-head">
        <h1>我的计划与持仓</h1>
        <p>记录家庭资金用途、三笔预算、配置类别与检查日。规则代替盯盘。</p>
      </header>

      <Callout tone="warn" title="不构成投资建议，不承诺收益" className="ip-disclaimer">
        <p>{DISCLAIMER}</p>
        <p>{privacy}</p>
      </Callout>

      <p className="ip-sr-only" aria-live="polite">
        {live}
      </p>
      {saveError && (
        <p className="ip-error" role="alert">
          {saveError}
        </p>
      )}

      {(snapshot.unsaved || snapshot.mode === 'unavailable') && (
        <Callout tone="warn" title="这次尚未保存">
          <p>关页会丢失，请备份。编辑计算仍可用。可稍后重试写入本机。</p>
        </Callout>
      )}

      {snapshot.mode === 'corrupt' && (
        <Callout tone="warn" title="本机计划无法识别">
          <p>原记录已保留。请先下载原文，确认后再恢复或重建。不会回退到旧 plan2026 / start 资金。</p>
        </Callout>
      )}

      {snapshot.mode === 'empty' && mode === 'home' && (
        <section className="ip-empty" aria-labelledby="ip-empty-title">
          <h2 id="ip-empty-title" className="ip-h2">
            还没有本页计划
          </h2>
          <p>旧投资计划页是另一份独立记录；导入后，在本页继续维护，旧页的修改不会同步到这里。</p>
          <div className="ip-actions">
            <button type="button" className="tool-btn ip-btn" onClick={() => void startEmpty()}>
              新建空计划
            </button>
            <button type="button" className="tool-btn ip-btn" onClick={() => setMode('migrate')}>
              预览本机已有记录
            </button>
            <Link className="ip-inline" to="/investment-plan-2026">
              查看旧页独立记录
            </Link>
          </div>
        </section>
      )}

      {mode === 'migrate' && (
        <MigrationPreviewPanel
          storage={storage}
          repository={repo}
          today={today}
          now={new Date().toISOString()}
          idFactory={() => crypto.randomUUID?.() ?? `plan-${Date.now()}`}
          onDone={() => setMode('wizard')}
          onCancel={() => setMode('home')}
        />
      )}

      {snapshot.document && mode === 'wizard' && !snapshot.document.wizard.completed && (
        <PlanWizard
          doc={snapshot.document}
          today={today}
          now={new Date().toISOString()}
          onPatch={doPatch}
          onComplete={() => setMode('home')}
        />
      )}

      {snapshot.document && mode === 'home' && status && (
        <>
          <section className="ip-home-first" aria-labelledby="ip-home-title">
            <h2 id="ip-home-title" className="ip-h2">
              本期待办
            </h2>
            <p aria-live="polite">
              {!snapshot.document.review
                ? '还没设检查日'
                : status.review.due
                  ? `检查日 ${status.review.due} 已到`
                  : `下次检查日 ${status.review.next}，还有 ${status.review.daysToNext} 天`}
            </p>
            {status.todos.length > 0 ? (
              <ul className="ip-todos">
                {status.todos.map(t => (
                  <li key={t.id}>{t.label}</li>
                ))}
              </ul>
            ) : status.canSayNothingToDo ? (
              <p role="status">
                今天没有例行检查待办。未到检查日，资金安全、重大产品公告和家庭用款变化仍要及时处理。
              </p>
            ) : (
              <p className="ip-muted">资料尚未齐备，不能说「今天没有例行检查待办」。</p>
            )}
            {!snapshot.document.wizard.completed && (
              <div className="ip-actions">
                <button type="button" className="tool-btn ip-btn" onClick={() => setMode('wizard')}>
                  继续向导
                </button>
              </div>
            )}
          </section>

          <details className="ip-details" open={!snapshot.document.wizard.completed}>
            <summary>家庭资金与三预算</summary>
            <FundingEditor doc={snapshot.document} now={new Date().toISOString()} onPatch={doPatch} />
          </details>
          <details className="ip-details">
            <summary>配置类别</summary>
            <AllocationEditor
              doc={snapshot.document}
              today={today}
              now={new Date().toISOString()}
              onPatch={doPatch}
            />
          </details>
          <details className="ip-details">
            <summary>检查日与定投备忘</summary>
            <ReviewFlow
              doc={snapshot.document}
              today={today}
              now={new Date().toISOString()}
              onPatch={doPatch}
            />
            <ContributionEditor doc={snapshot.document} today={today} onPatch={doPatch} />
          </details>
          <details className="ip-details">
            <summary>检查记录与年度复盘</summary>
            <HistoryPanel doc={snapshot.document} now={new Date().toISOString()} onPatch={doPatch} />
          </details>
        </>
      )}

      {(snapshot.mode === 'ready' || snapshot.mode === 'corrupt' || snapshot.unsaved) && (
        <BackupControls
          repository={repo}
          storage={storage}
          now={new Date().toISOString()}
          corrupt={snapshot.mode === 'corrupt'}
        />
      )}

      {showOwner && (
        <Suspense fallback={<p className="ip-muted">加载站长面板…</p>}>
          <OwnerSyncLazy repository={repo} storage={storage} />
        </Suspense>
      )}
    </Page>
  )
}
