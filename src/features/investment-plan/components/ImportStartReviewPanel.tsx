import React, { useMemo, useState } from 'react'
import { BACKUP_FILENAME, backupBlob } from '../backup'
import {
  buildStartReviewImportPreview,
  confirmStartReviewIntoExistingPlan,
  type StartReviewImportPreview,
} from '../migration'
import type { PlanRepository, StorageLike } from '../repository'
import type { Day, Instant, PlanDocument } from '../types'
import { writeReasonLabel } from '../uiLabels'

export const IMPORT_START_REVIEW_WARNINGS = {
  sourceChanged: '检查日已带入本页计划，但自测记录在写入后又有变化，请复核两边是否仍一致。',
  notPersisted: '本机写入失败：检查日在内存中，请立刻备份下载。',
  receiptFailed: '检查日已保存，但“已导入”标记没写入；之后若再提示带入，请勿重复导入。',
} as const

export type ImportStartReviewDone = { warning?: string }

/** 已有计划、尚无检查日：显式非金额预览 → 先备份 → 本人确认 → 指纹重读后补带 */
export function ImportStartReviewPanel({
  storage,
  repository,
  doc,
  today,
  now,
  onDone,
  onCancel,
}: {
  storage: StorageLike | null
  repository: PlanRepository
  doc: PlanDocument
  today: Day
  now: Instant
  onDone: (result?: ImportStartReviewDone) => void
  onCancel: () => void
}): JSX.Element {
  const [preview] = useState<StartReviewImportPreview | null>(() => buildStartReviewImportPreview(storage, today))
  const [backedUp, setBackedUp] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [live, setLive] = useState('')

  const review = preview?.review
  const summary = useMemo(() => {
    if (!review) return null
    return `检查日 ${review.anchor} · 每 ${review.intervalMonths} 个月${
      review.completedDates.length ? ` · 已完成 ${review.completedDates.length} 次` : ''
    }`
  }, [review])

  const downloadBackup = (): void => {
    const blob = backupBlob(doc, now)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = BACKUP_FILENAME
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
    setBackedUp(true)
    setLive('已生成本机备份文件（含私人金额，请妥善保存）。')
    setError('')
  }

  const confirm = async (): Promise<void> => {
    if (!preview) {
      setError('没有可带入的自测检查日。')
      return
    }
    if (!backedUp) {
      setError('请先下载现有计划备份，再确认带入。')
      return
    }
    if (!confirmed) {
      setError('请先确认「这是我的自测检查日；我确认带入后保留原日历身份」。')
      return
    }
    if (doc.review) {
      setError('本页计划已有检查日，不会用自测覆盖。')
      return
    }
    setBusy(true)
    setError('')
    const r = await confirmStartReviewIntoExistingPlan(preview, {
      storage,
      repository,
      expectedLocalRevision: doc.localRevision,
      now,
      today,
    })
    setBusy(false)
    if (!r.ok) {
      if (r.reason === 'stale') {
        setError('自测记录已变化，请取消后重新打开「带入自测检查日」再核对。')
        return
      }
      if (r.reason === 'has-review') {
        setError('本页计划已有检查日，不会用自测覆盖。')
        return
      }
      setError(`未能带入：${writeReasonLabel(r.reason === 'patch-failed' ? r.detail ?? r.reason : r.reason)}自测记录未改动。`)
      return
    }
    const warning = r.sourceChangedAfterWrite
      ? IMPORT_START_REVIEW_WARNINGS.sourceChanged
      : !r.persisted
        ? IMPORT_START_REVIEW_WARNINGS.notPersisted
        : !r.receiptWritten
          ? IMPORT_START_REVIEW_WARNINGS.receiptFailed
          : undefined
    // 警告交给父级在 home 的 saveError/live 展示；此处立即 onDone 会卸载本面板
    onDone(warning ? { warning } : undefined)
  }

  if (!preview || !review || !summary) {
    return (
      <section className="ip-migrate" aria-labelledby="ip-import-review-title">
        <h2 id="ip-import-review-title" className="ip-h2">
          带入自测检查日
        </h2>
        <p className="ip-error" role="alert">
          没有可带入的自测检查日，或记录无法识别。
        </p>
        <div className="ip-actions">
          <button type="button" className="tool-btn ip-btn" onClick={onCancel}>
            关闭
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="ip-migrate" aria-labelledby="ip-import-review-title">
      <h2 id="ip-import-review-title" className="ip-h2">
        带入自测检查日
      </h2>
      <p className="ip-muted">只带入检查日与日历身份，不导入金额或预算。确认前请先备份现有计划。</p>
      <p>自测检查日：{summary}</p>
      <p className="ip-sr-only" aria-live="polite">
        {live}
      </p>
      <div className="ip-actions">
        <button type="button" className="tool-btn ip-btn" onClick={downloadBackup}>
          下载现有计划备份
        </button>
      </div>
      {backedUp && <p className="ip-muted">已下载备份。请确认下面选项后再带入。</p>}
      <label className="ip-check ip-check--required">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={!backedUp}
          onChange={e => setConfirmed(e.target.checked)}
        />
        <span>这是我的自测检查日；我确认带入后保留原日历身份</span>
      </label>
      {error && (
        <p className="ip-error" role="alert">
          {error}
        </p>
      )}
      <div className="ip-actions">
        <button type="button" className="tool-btn ip-btn" disabled={busy} onClick={() => void confirm()}>
          确认带入检查日
        </button>
        <button type="button" className="tool-btn ip-btn" onClick={onCancel}>
          取消
        </button>
      </div>
    </section>
  )
}
