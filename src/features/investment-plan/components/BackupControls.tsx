import React, { useRef, useState } from 'react'
import {
  BACKUP_FILENAME,
  backupBlob,
  downloadTextFile,
  parseBackupPayload,
  readDocumentRaw,
  restoreFromBackup,
} from '../backup'
import type { PlanRepository, StorageLike } from '../repository'
import type { Instant } from '../types'

export function BackupControls({
  repository,
  storage,
  now,
  corrupt,
}: {
  repository: PlanRepository
  storage: StorageLike | null
  now: Instant
  corrupt: boolean
}): JSX.Element {
  const snap = repository.getSnapshot()
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [pendingRaw, setPendingRaw] = useState<string | null>(null)
  const [downloadedExisting, setDownloadedExisting] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const downloadBackup = (): void => {
    if (!snap.document) return
    const blob = backupBlob(snap.document, now)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = BACKUP_FILENAME
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
    setDownloadedExisting(true)
    setMsg('已生成本机备份文件（含私人金额，请妥善保存）。')
  }

  const downloadCorruptRaw = (): void => {
    const raw = readDocumentRaw(storage)
    if (raw === null) {
      setError('读不到原文')
      return
    }
    downloadTextFile('investment-plan-corrupt-raw.json', raw, 'application/json')
    setDownloadedExisting(true)
    setMsg('已下载无法识别的原文（只读，未改动存储）。')
  }

  const onFile = async (file: File): Promise<void> => {
    const text = await file.text()
    const parsed = parseBackupPayload(text)
    if (!parsed.ok) {
      setMsg('')
      setError('这个文件不是本页导出的备份，原计划未改动。')
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    setPendingRaw(text)
    setConfirmRestore(true)
    setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const doRestore = async (): Promise<void> => {
    if (!pendingRaw) return
    if (snap.mode === 'ready' && snap.document && !downloadedExisting) {
      setError('请先下载现有计划备份，再确认恢复。')
      return
    }
    const r = await restoreFromBackup(pendingRaw, repository, {
      confirmed: true,
      expectedLocalRevision: snap.document?.localRevision ?? null,
      existingDownloadedOrConflictSaved: downloadedExisting || snap.mode === 'empty' || corrupt,
    })
    setConfirmRestore(false)
    setPendingRaw(null)
    if (!r.ok) {
      setMsg('')
      setError('恢复没有完成，原计划未改动。')
      return
    }
    setError('')
    setMsg(r.persisted ? '已恢复。' : '恢复在内存中，请立刻再备份。')
  }

  const doClear = async (): Promise<void> => {
    const rev = snap.document?.localRevision ?? 0
    const r = await repository.clear(rev || 1)
    setConfirmClear(false)
    if (!r.ok) {
      setError('清除失败，界面与存储保持原样。')
      return
    }
    setMsg('已清除本页计划（保留导入收据与旧 plan2026/start 键）。若曾下载 .ics 到外部日历，请自行删除对应系列。')
  }

  return (
    <section className="ip-backup" aria-labelledby="ip-backup-title">
      <h2 id="ip-backup-title" className="ip-h2">
        备份 / 恢复 / 清除
      </h2>
      <p className="ip-muted">备份含私人金额，只在这台设备生成，不会上传。</p>
      <div className="ip-actions">
        {snap.document && (
          <button type="button" className="tool-btn ip-btn" onClick={downloadBackup}>
            下载备份
          </button>
        )}
        {corrupt && (
          <button type="button" className="tool-btn ip-btn" onClick={downloadCorruptRaw}>
            下载无法识别的原文
          </button>
        )}
        <button type="button" className="tool-btn ip-btn" onClick={() => fileRef.current?.click()}>
          选择备份文件恢复
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="ip-file"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) void onFile(f)
          }}
        />
      </div>
      {confirmRestore && (
        <div className="ip-confirm" role="group" aria-label="确认恢复">
          <p>确认用备份替换当前计划？取消则不写入。</p>
          <div className="ip-actions">
            <button type="button" className="tool-btn ip-btn" onClick={() => void doRestore()}>
              确认恢复
            </button>
            <button
              type="button"
              className="tool-btn ip-btn"
              onClick={() => {
                setConfirmRestore(false)
                setPendingRaw(null)
              }}
            >
              取消
            </button>
          </div>
        </div>
      )}
      <div className="ip-actions">
        {confirmClear ? (
          <>
            <p className="ip-muted">清除不会删除外部日历中已导入的系列，请自行手动删除。</p>
            <button type="button" className="tool-btn tool-btn--danger ip-btn" onClick={() => void doClear()}>
              确认清除本页计划
            </button>
            <button type="button" className="tool-btn ip-btn" onClick={() => setConfirmClear(false)}>
              取消
            </button>
          </>
        ) : (
          <button type="button" className="tool-btn ip-btn" onClick={() => setConfirmClear(true)}>
            清除本页计划
          </button>
        )}
      </div>
      {msg && (
        <p className="ip-muted" role="status">
          {msg}
        </p>
      )}
      {error && (
        <p className="ip-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
