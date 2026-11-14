// 站长同步状态机：token 仅内存；不自动上传。
import { useCallback, useRef, useState } from 'react'
import {
  adoptCloudDocument,
  cloudGet,
  cloudPut,
  documentsDiffer,
  downloadJson,
  loadConflictRecord,
  loadSyncMeta,
  removeConflictRecord,
  resolvePlanSyncEndpoint,
  writeConflictRecord,
  writeSyncMeta,
} from './cloud'
import type { ConflictRecord, PlanRepository, StorageLike } from './repository'
import type { PlanDocument } from './types'
import { writeReasonLabel } from './uiLabels'

export type PlanSyncPhase =
  | 'idle'
  | 'need-token'
  | 'ready'
  | 'comparing'
  | 'conflict'
  | 'paused'
  | 'blocked-origin'

export function usePlanSync(opts: {
  repository: PlanRepository
  storage: StorageLike | null
  locationOrigin: string
  viteApiBase: string
  now: () => string
}) {
  const tokenRef = useRef('')
  const [tokenLen, setTokenLen] = useState(0)
  const [phase, setPhase] = useState<PlanSyncPhase>('need-token')
  const [message, setMessage] = useState('')
  const [cloudRevision, setCloudRevision] = useState<number | null>(null)
  const [cloudDoc, setCloudDoc] = useState<PlanDocument | null>(null)
  const [conflict, setConflict] = useState<ConflictRecord | null>(() => loadConflictRecord(opts.storage))
  /** 冲突是否已完成一次明确选择（保留本机/采用云端） */
  const [resolutionDone, setResolutionDone] = useState(false)
  const uploadLocalRevisionRef = useRef<number | null>(null)

  const endpointInfo = resolvePlanSyncEndpoint(opts.locationOrigin, opts.viteApiBase)

  const clearToken = useCallback(() => {
    tokenRef.current = ''
    setTokenLen(0)
    setPhase(endpointInfo.endpoint ? 'need-token' : 'blocked-origin')
    setMessage('')
  }, [endpointInfo.endpoint])

  const setToken = useCallback(
    (token: string) => {
      tokenRef.current = token
      setTokenLen(token.length)
      if (!endpointInfo.endpoint) {
        setPhase('blocked-origin')
        setMessage('请在 API 同源站点使用站长同步')
        return
      }
      if (token.length >= 32) {
        setPhase('ready')
        setMessage('')
      } else {
        setPhase('need-token')
      }
    },
    [endpointInfo.endpoint],
  )

  const readAndCompare = useCallback(async () => {
    if (!endpointInfo.endpoint || tokenRef.current.length < 32) {
      setMessage('请先输入有效的站长同步 token')
      return
    }
    setPhase('comparing')
    setMessage('正在读取云端…')
    const got = await cloudGet(endpointInfo.endpoint, tokenRef.current)
    if (!got.ok) {
      if (got.status === 401) {
        clearToken()
        setMessage('token 无效，已清除内存中的凭据')
        return
      }
      setPhase('paused')
      setMessage('读取云端失败：保留本机计划与旧基线，请稍后重试')
      return
    }
    setCloudRevision(got.revision)
    setCloudDoc(got.document)
    const local = opts.repository.getSnapshot().document
    const meta = loadSyncMeta(opts.storage)

    // 空本机 + 非空云端：进入冲突态供「采用云端」（不写假 local）
    if (!local && got.document) {
      const record: ConflictRecord = {
        schemaVersion: 1,
        reason: 'cloud',
        local: got.document,
        remote: got.document,
        remoteRevision: got.revision,
        at: opts.now(),
      }
      setConflict(record)
      setResolutionDone(false)
      setPhase('conflict')
      setMessage('本机为空，云端有计划：可采用云端到本机')
      return
    }

    // 云端未变（revision === base）：仅本机更新 → 非冲突
    if (meta && meta.baseRevision !== null && got.revision === meta.baseRevision) {
      setPhase('ready')
      setResolutionDone(false)
      setMessage(
        got.document
          ? `已读取云端副本（版本 ${got.revision}），与上次同步基线一致；本机可上传更新`
          : `云端为空（版本 ${got.revision}）`,
      )
      return
    }

    if (got.document && local && documentsDiffer(local, got.document)) {
      // 冲突时不推进 baseRevision；保留旧基线直至明确选择
      const existing = loadConflictRecord(opts.storage)
      if (existing) {
        downloadJson('my-plan-previous-conflict-local.json', existing.local)
        downloadJson('my-plan-previous-conflict-cloud.json', existing.remote)
      }
      const record: ConflictRecord = {
        schemaVersion: 1,
        reason: 'cloud',
        local,
        remote: got.document,
        remoteRevision: got.revision,
        at: opts.now(),
      }
      const saved = writeConflictRecord(opts.storage, record)
      if (!saved) {
        setPhase('paused')
        setConflict(null)
        setMessage('无法保存双副本冲突档：请先分别下载，暂不覆盖任一侧')
        downloadJson('my-plan-local-conflict.json', local)
        downloadJson('my-plan-cloud-conflict.json', got.document)
        return
      }
      opts.repository.refresh()
      setConflict(record)
      setResolutionDone(false)
      setPhase('conflict')
      setMessage('云端与本机不同：请比较后选择，不会自动覆盖本机')
      return
    }

    // 无冲突：可安全刷新基线
    if (meta) {
      writeSyncMeta(opts.storage, { ...meta, baseRevision: got.revision })
    } else if (local) {
      writeSyncMeta(opts.storage, {
        schemaVersion: 1,
        planId: local.id,
        baseRevision: got.revision,
        dirty: true,
      })
    }
    setPhase('ready')
    setResolutionDone(false)
    setMessage(
      got.document
        ? `已读取云端副本（版本 ${got.revision}），与本机一致或一侧为空`
        : `云端为空（版本 ${got.revision}），可上传本机副本`,
    )
  }, [clearToken, endpointInfo.endpoint, opts])

  const uploadLocal = useCallback(async () => {
    if (!endpointInfo.endpoint || tokenRef.current.length < 32) return
    const local = opts.repository.getSnapshot().document
    if (!local) {
      setMessage('本机没有可上传的计划')
      return
    }
    const meta = loadSyncMeta(opts.storage)
    if (!meta || meta.baseRevision === null) {
      setMessage('请先「读取云端并比较」再上传')
      setPhase('ready')
      return
    }
    if (conflict || loadConflictRecord(opts.storage)) {
      setMessage('存在未解决的冲突，请先处理')
      setPhase('conflict')
      return
    }
    uploadLocalRevisionRef.current = local.localRevision
    setMessage('正在上传…')
    const put = await cloudPut(endpointInfo.endpoint, tokenRef.current, meta.baseRevision, local)
    if (!put.ok) {
      if (put.status === 401) {
        clearToken()
        setMessage('token 无效，已清除内存中的凭据')
        return
      }
      if (put.status === 409) {
        const got = await cloudGet(endpointInfo.endpoint, tokenRef.current)
        if (!got.ok || !got.document) {
          setPhase('paused')
          setMessage('冲突后无法获取云端副本：保留本机，请稍后重试')
          return
        }
        const existing = loadConflictRecord(opts.storage)
        if (existing) {
          downloadJson('my-plan-previous-conflict-local.json', existing.local)
          downloadJson('my-plan-previous-conflict-cloud.json', existing.remote)
        }
        const record: ConflictRecord = {
          schemaVersion: 1,
          reason: 'cloud',
          local,
          remote: got.document,
          remoteRevision: got.revision,
          at: opts.now(),
        }
        if (!writeConflictRecord(opts.storage, record)) {
          setPhase('paused')
          setMessage('冲突档写入失败：请下载两侧后暂不覆盖')
          downloadJson('my-plan-local-conflict.json', local)
          downloadJson('my-plan-cloud-conflict.json', got.document)
          return
        }
        opts.repository.refresh()
        setConflict(record)
        setResolutionDone(false)
        setCloudRevision(got.revision)
        setCloudDoc(got.document)
        setPhase('conflict')
        setMessage('上传冲突：已保留双副本，请选择')
        return
      }
      setPhase('paused')
      setMessage('上传失败：本机计划未删除，基线未改')
      return
    }
    const still = opts.repository.getSnapshot().document
    const startedAt = uploadLocalRevisionRef.current
    const dirtyStill = !still || still.localRevision !== startedAt
    const nextMeta = {
      schemaVersion: 1 as const,
      planId: local.id,
      baseRevision: put.revision,
      dirty: dirtyStill,
    }
    if (!writeSyncMeta(opts.storage, nextMeta)) {
      writeSyncMeta(opts.storage, { ...nextMeta, baseRevision: null, dirty: true })
      setPhase('paused')
      setMessage('同步元数据写入失败：基线未知，请重新读取云端，不能显示已同步')
      return
    }
    setCloudRevision(put.revision)
    setPhase('ready')
    setMessage(
      dirtyStill
        ? `云端已更新到版本 ${put.revision}，但本机在上传后又有编辑，仍标为待同步`
        : `已同步到云端版本 ${put.revision}`,
    )
  }, [clearToken, conflict, endpointInfo.endpoint, opts])

  const keepLocalOverwriteCloud = useCallback(async () => {
    if (!endpointInfo.endpoint || tokenRef.current.length < 32 || !conflict) return
    if (conflict.remoteRevision === null) {
      setMessage('缺少云端版本，请重新读取')
      return
    }
    // 上传当前本机副本，而非冲突快照（可能已过时）
    const current = opts.repository.getSnapshot().document ?? conflict.local
    const put = await cloudPut(
      endpointInfo.endpoint,
      tokenRef.current,
      conflict.remoteRevision,
      current,
    )
    if (!put.ok) {
      if (put.status === 409) {
        setMessage('再次冲突：请重新读取并比较（旧冲突档请先导出）')
        return
      }
      setMessage('覆盖云端失败')
      return
    }
    if (
      !writeSyncMeta(opts.storage, {
        schemaVersion: 1,
        planId: current.id,
        baseRevision: put.revision,
        dirty: false,
      })
    ) {
      setPhase('paused')
      setMessage('元数据写入失败，请重新 GET')
      return
    }
    setCloudRevision(put.revision)
    setResolutionDone(true)
    setPhase('conflict')
    setMessage(`已用本机覆盖云端（版本 ${put.revision}）。落败云副本仍在冲突档，确认比较后再清除。`)
  }, [conflict, endpointInfo.endpoint, opts])

  const adoptCloud = useCallback(async () => {
    if (!conflict) return
    const snap = opts.repository.getSnapshot()
    const emptyLocal = !snap.document
    const remote = conflict.remote
    const r = emptyLocal
      ? await opts.repository.replace(null, remote, 'cloud-resolution')
      : await adoptCloudDocument(
          opts.repository,
          remote,
          conflict.remoteRevision ?? 0,
          opts.storage,
          opts.now(),
        )
    if (!r.ok) {
      const reason = 'reason' in r ? String(r.reason) : 'unknown'
      setMessage(`采用云端失败：${writeReasonLabel(reason)}`)
      return
    }
    if (
      !writeSyncMeta(opts.storage, {
        schemaVersion: 1,
        planId: ('document' in r && r.document ? r.document.id : remote.id),
        baseRevision: conflict.remoteRevision,
        dirty: false,
      })
    ) {
      setPhase('paused')
      setMessage('元数据写入失败，请重新 GET')
      return
    }
    setResolutionDone(true)
    setPhase('conflict')
    setMessage('已采用云端作为当前本机计划（未再次上传）。落败本机副本仍在冲突档，确认后再清除。')
    opts.repository.refresh()
  }, [conflict, opts])

  const downloadBoth = useCallback(() => {
    const c = conflict ?? loadConflictRecord(opts.storage)
    if (!c) {
      if (cloudDoc) downloadJson('my-plan-cloud.json', cloudDoc)
      const local = opts.repository.getSnapshot().document
      if (local) downloadJson('my-plan-local.json', local)
      return
    }
    downloadJson('my-plan-local-conflict.json', c.local)
    downloadJson('my-plan-cloud-conflict.json', c.remote)
  }, [cloudDoc, conflict, opts])

  const clearConflict = useCallback(() => {
    if (!resolutionDone) {
      setMessage('请先完成「保留本机」或「采用云端」后再清除冲突档')
      return
    }
    if (!window.confirm('确认清除本机冲突档？清除后须重新读取云端并比较，才能再上传。')) return
    removeConflictRecord(opts.storage)
    setConflict(null)
    setResolutionDone(false)
    // 清除后使基线未知，强制重新 GET
    const local = opts.repository.getSnapshot().document
    if (local) {
      writeSyncMeta(opts.storage, {
        schemaVersion: 1,
        planId: local.id,
        baseRevision: null,
        dirty: true,
      })
    }
    setPhase('ready')
    setMessage('已清除本机冲突档；请重新「读取云端并比较」后再上传')
    opts.repository.refresh()
  }, [opts, resolutionDone])

  return {
    phase: endpointInfo.endpoint ? phase : 'blocked-origin',
    endpointBlocked: !endpointInfo.endpoint,
    tokenLen,
    message,
    cloudRevision,
    cloudDoc,
    conflict,
    resolutionDone,
    setToken,
    clearToken,
    readAndCompare,
    uploadLocal,
    keepLocalOverwriteCloud,
    adoptCloud,
    downloadBoth,
    clearConflict,
  }
}
