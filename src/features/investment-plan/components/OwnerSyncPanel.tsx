import React, { useMemo, useState } from 'react'
import type { PlanRepository, StorageLike } from '../repository'
import { usePlan } from '../usePlan'
import { usePlanSync } from '../usePlanSync'

/**
 * 站长专用：仅在 /invest/my-plan#owner-sync 惰性加载。
 * token 只留当前页内存；不借用 PULSE token；不写 localStorage/备份/URL。
 */
export function OwnerSyncPanel({
  repository,
  storage,
}: {
  repository: PlanRepository
  storage: StorageLike | null
}): JSX.Element {
  const { snapshot, patch } = usePlan(repository)
  const locationOrigin = typeof window !== 'undefined' ? window.location.origin : ''
  const viteApiBase = ((import.meta as { env?: Record<string, string | undefined> }).env?.VITE_API_BASE ?? '').replace(
    /\/$/,
    '',
  )
  const sync = usePlanSync({
    repository,
    storage,
    locationOrigin,
    viteApiBase,
    now: () => new Date().toISOString(),
  })
  const [tokenInput, setTokenInput] = useState('')
  const [confirmKeep, setConfirmKeep] = useState(false)
  const [confirmAdopt, setConfirmAdopt] = useState(false)

  const weeklyOn = snapshot.document?.notifications.ownerWeeklyEnabled === true
  const privacy = useMemo(() => {
    if (sync.phase === 'ready' || sync.phase === 'comparing' || sync.phase === 'conflict') {
      return '你已选择把计划副本同步到站长专用云端；本机与云端可分别保留。断开只清除本页内存中的 token，不删除云端副本。'
    }
    return '开启前：云端不会收到本机计划。邮件按北京时间检查日期；海外临界日可能差一天。'
  }, [sync.phase])

  const toggleWeekly = async (on: boolean): Promise<void> => {
    if (!snapshot.document) return
    await patch(snapshot.document.localRevision, latest => ({
      ...latest,
      notifications: { ownerWeeklyEnabled: on },
    }))
  }

  return (
    <section id="owner-sync" className="ip-owner-slot" aria-labelledby="ip-owner-title">
      <h2 id="ip-owner-title" className="ip-h2">站长专用同步</h2>
      <p className="ip-muted">访客无需此入口。hash 只控制面板可见，不是鉴权。</p>
      <p className="ip-muted">{privacy}</p>
      <p className="ip-muted">使用独立环境变量 PLAN_SYNC_TOKEN（≥32 字符），不借用候选池 PULSE token。</p>

      {sync.endpointBlocked ? (
        <p role="status">请在 API 同源站点使用站长同步。普通本机编辑、备份与日历不受影响。</p>
      ) : (
        <>
          <label className="ip-field">
            <span>站长同步 token（仅本页内存，刷新即失效）</span>
            <input
              type="password"
              autoComplete="new-password"
              className="ip-input"
              value={tokenInput}
              onChange={e => {
                setTokenInput(e.target.value)
                sync.setToken(e.target.value)
              }}
              aria-label="站长同步 token"
            />
          </label>
          <div className="ip-actions">
            <button type="button" className="tool-btn ip-btn" onClick={() => void sync.readAndCompare()} disabled={sync.tokenLen < 32}>
              读取云端并比较
            </button>
            <button type="button" className="tool-btn ip-btn" onClick={() => void sync.uploadLocal()} disabled={sync.tokenLen < 32}>
              同步当前本机副本
            </button>
            <button
              type="button"
              className="tool-btn ip-btn"
              onClick={() => {
                setTokenInput('')
                sync.clearToken()
              }}
            >
              断开（清内存 token）
            </button>
          </div>
        </>
      )}

      {sync.message && (
        <p className="ip-muted" role="status" aria-live="polite">
          {sync.message}
        </p>
      )}

      {snapshot.document && sync.tokenLen >= 32 && (
        <label className="ip-check">
          <input
            type="checkbox"
            checked={weeklyOn}
            onChange={e => void toggleWeekly(e.target.checked)}
          />
          <span>周报纳入本计划的检查日提醒（无金额；须成功同步到云端后服务器才读得到；默认关闭）</span>
        </label>
      )}

      {sync.phase === 'conflict' && sync.conflict && (
        <div className="ip-confirm" role="group" aria-label="云端冲突处理">
          <p>云端与本机均为有效计划且内容不同。没有自动合并。</p>
          <div className="ip-actions">
            <button type="button" className="tool-btn ip-btn" onClick={sync.downloadBoth}>
              分别下载，暂不处理
            </button>
          </div>
          <label className="ip-check">
            <input type="checkbox" checked={confirmKeep} onChange={e => setConfirmKeep(e.target.checked)} />
            <span>确认：保留本机并用最新云版本号覆盖云端</span>
          </label>
          <button
            type="button"
            className="tool-btn ip-btn"
            disabled={!confirmKeep}
            onClick={() => void sync.keepLocalOverwriteCloud()}
          >
            保留本机并覆盖云端
          </button>
          <label className="ip-check">
            <input type="checkbox" checked={confirmAdopt} onChange={e => setConfirmAdopt(e.target.checked)} />
            <span>确认：采用云端作为当前本机计划（不再次上传）</span>
          </label>
          <button type="button" className="tool-btn ip-btn" disabled={!confirmAdopt} onClick={() => void sync.adoptCloud()}>
            采用云端
          </button>
          <button
            type="button"
            className="tool-btn tool-btn--danger ip-btn"
            disabled={!sync.resolutionDone}
            onClick={sync.clearConflict}
          >
            清除本机冲突档
          </button>
          {!sync.resolutionDone && (
            <p className="ip-muted">须先完成「保留本机」或「采用云端」后，才能清除冲突档。</p>
          )}
        </div>
      )}
    </section>
  )
}

export default OwnerSyncPanel
