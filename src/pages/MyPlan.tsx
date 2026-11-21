import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Callout, Page } from '../components/ui'
import { localToday } from '../features/invest-start/checks'
import { BackupControls } from '../features/investment-plan/components/BackupControls'
import { FundingEditor } from '../features/investment-plan/components/FundingEditor'
import { AllocationEditor } from '../features/investment-plan/components/AllocationEditor'
import { ContributionEditor } from '../features/investment-plan/components/ContributionEditor'
import { HistoryPanel } from '../features/investment-plan/components/HistoryPanel'
import { ImportStartReviewPanel } from '../features/investment-plan/components/ImportStartReviewPanel'
import { MigrationPreviewPanel } from '../features/investment-plan/components/MigrationPreview'
import { PlanWizard } from '../features/investment-plan/components/PlanWizard'
import { ReviewFlow } from '../features/investment-plan/components/ReviewFlow'
import { peekStartReview } from '../features/investment-plan/migration'
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

  const [mode, setMode] = useState<'home' | 'wizard' | 'migrate' | 'empty-confirm' | 'import-review'>('home')
  const [preferStartImport, setPreferStartImport] = useState(false)
  const [live, setLive] = useState('')
  const [saveError, setSaveError] = useState('')
  const [skippedStartReview, setSkippedStartReview] = useState<string | null>(null)

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

  const startReview = peekStartReview(storage)

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

  /** 仅创建空计划；带入检查日必须走 MigrationPreviewPanel，不得直写 review */
  const createEmpty = async (): Promise<void> => {
    const id = crypto.randomUUID?.() ?? `plan-${Date.now()}`
    if (startReview) setSkippedStartReview(startReview.anchor)
    else setSkippedStartReview(null)
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

  const requestEmpty = (): void => {
    if (startReview) {
      setMode('empty-confirm')
      return
    }
    void createEmpty()
  }

  const openStartMigrate = (): void => {
    setPreferStartImport(true)
    setMode('migrate')
  }

  const openMigrate = (): void => {
    setPreferStartImport(false)
    setMode('migrate')
  }

  const openImportReview = (): void => {
    setMode('import-review')
  }

  const status = snapshot.document ? selectPlanStatus(snapshot.document, today) : null
  const privacy = ownerSynced ? PRIVACY_OWNER_SYNCED : PRIVACY_LOCAL
  const canImportOrphanReview = !!snapshot.document && !snapshot.document.review && !!startReview

  return (
    <Page className="investment-plan">
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
          {startReview && (
            <p>
              自测页已有检查日 {startReview.anchor}（每 {startReview.intervalMonths} 个月
              {startReview.completedDates.length ? `，已完成 ${startReview.completedDates.length} 次` : ''}
              ）。建议用自测结果建立计划，默认带入检查日并保留原日历身份。
            </p>
          )}
          <div className="ip-actions">
            {startReview ? (
              <button type="button" className="tool-btn ip-btn" onClick={openStartMigrate}>
                用自测结果建立计划
              </button>
            ) : null}
            <button type="button" className="tool-btn ip-btn" onClick={requestEmpty}>
              新建空计划
            </button>
            <button type="button" className="tool-btn ip-btn" onClick={openMigrate}>
              预览本机已有记录
            </button>
            <Link className="ip-inline" to="/investment-plan-2026">
              查看旧页独立记录
            </Link>
          </div>
        </section>
      )}

      {snapshot.mode === 'empty' && mode === 'empty-confirm' && startReview && (
        <section className="ip-empty" aria-labelledby="ip-empty-confirm-title">
          <h2 id="ip-empty-confirm-title" className="ip-h2">
            新建空计划
          </h2>
          <p>
            自测页已有检查日 {startReview.anchor}。带入检查日须走自测预览确认（保留日历身份与收据），不能直接写入。
            若不带入，本页计划会没有检查日；自测记录仍保留，之后可再带入。
          </p>
          <div className="ip-actions">
            <button type="button" className="tool-btn ip-btn" onClick={openStartMigrate}>
              去自测预览并带入检查日
            </button>
            <button type="button" className="tool-btn ip-btn" onClick={() => void createEmpty()}>
              不带入，仅空计划
            </button>
            <button type="button" className="tool-btn ip-btn" onClick={() => setMode('home')}>
              取消
            </button>
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
          preferStartImport={preferStartImport}
          onDone={() => {
            setSkippedStartReview(null)
            setMode('wizard')
          }}
          onCancel={() => {
            setPreferStartImport(false)
            setMode(snapshot.mode === 'empty' ? 'home' : 'home')
          }}
        />
      )}

      {snapshot.document && mode === 'import-review' && !snapshot.document.review && (
        <ImportStartReviewPanel
          storage={storage}
          repository={repo}
          doc={snapshot.document}
          today={today}
          now={new Date().toISOString()}
          onDone={result => {
            setSkippedStartReview(null)
            refresh()
            setMode('home')
            if (result?.warning) {
              setSaveError(result.warning)
              setLive(result.warning)
            } else {
              setSaveError('')
              setLive('已带入自测检查日')
            }
          }}
          onCancel={() => setMode('home')}
        />
      )}

      {snapshot.document && skippedStartReview && !snapshot.document.review && mode !== 'import-review' && (
        <Callout tone="warn" title="检查日未带入">
          <p>
            自测页的检查日 {skippedStartReview} 未带入本页计划。
            {startReview ? '需要时可用「带入自测检查日」打开预览。' : ''}
          </p>
          {canImportOrphanReview && (
            <div className="ip-actions">
              <button type="button" className="tool-btn ip-btn" onClick={openImportReview}>
                带入自测检查日
              </button>
            </div>
          )}
        </Callout>
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
          {canImportOrphanReview && !skippedStartReview && (
            <Callout tone="info" title="自测检查日尚未带入">
              <p>
                自测页曾保存检查日 {startReview!.anchor}（每 {startReview!.intervalMonths} 个月
                {startReview!.completedDates.length ? `，已完成 ${startReview!.completedDates.length} 次` : ''}
                ）。本页计划还没有检查日；不会自动覆盖，需先备份并显式确认。
              </p>
              <div className="ip-actions">
                <button type="button" className="tool-btn ip-btn" onClick={openImportReview}>
                  带入自测检查日
                </button>
              </div>
            </Callout>
          )}
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

      {(snapshot.mode === 'ready' || snapshot.mode === 'corrupt' || snapshot.unsaved) && mode !== 'import-review' && (
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
