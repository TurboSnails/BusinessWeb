import { useCallback, useEffect, useRef, useState } from 'react'
import { clearToken, loadLocal, loadToken, mergeCandidates, moveCandidate, readCloud, saveLocal, saveToken, setCandidateNote, toggleCandidate, writeCloud } from './store'
import type { CloudError } from './store'
import type { CandidateItem, CandidateMarket } from './validation'

export type SyncState = 'no-token' | 'syncing' | 'synced' | 'error'

// 本机先写入（立即可见），有 token 时再同步到云端；写入串行化，版本冲突时用云端最新数据覆盖本机并提示。
export function useCandidates(enabled: boolean) {
  const [items, setItems] = useState<CandidateItem[]>(loadLocal)
  const [token, setToken] = useState<string | null>(loadToken)
  const [state, setState] = useState<SyncState>(token ? 'syncing' : 'no-token')
  const [message, setMessage] = useState('')
  const itemsRef = useRef(items)
  const revision = useRef<number | null>(null)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const dirty = useRef(false) // 上次写入失败：本机有未上传改动，下次拉取要合并而不是被云端覆盖

  const fail = useCallback((e: unknown): void => {
    const err = e as CloudError
    if (err?.kind === 'auth') { clearToken(); setToken(null); setState('no-token'); setMessage('Token 无效，请重新输入'); return }
    setState('error'); setMessage(err?.message ?? '同步失败，数据仅保存在本机')
  }, [])
  const apply = (next: CandidateItem[]): void => { itemsRef.current = next; setItems(next); saveLocal(next) }

  // 拉取云端并与本机合并；首次连接（revision 未知）时把本机独有项补传
  const pull = useCallback((tk: string): Promise<void> => {
    queue.current = queue.current.then(async () => {
      setState('syncing')
      try {
        const cloud = await readCloud(tk)
        const first = revision.current === null || dirty.current
        const merged = first ? mergeCandidates(cloud.items, itemsRef.current) : cloud.items
        revision.current = cloud.revision
        apply(merged)
        if (first && JSON.stringify(merged) !== JSON.stringify(cloud.items)) { await writeCloud(tk, merged, cloud.revision); revision.current = cloud.revision + 1 }
        dirty.current = false
        setState('synced'); setMessage('')
      } catch (e) { fail(e) }
    })
    return queue.current
  }, [fail])

  useEffect(() => { if (enabled && token) void pull(token) }, [enabled, token, pull])

  const push = (next: CandidateItem[]): void => {
    apply(next)
    const tk = token
    if (!tk) return
    queue.current = queue.current.then(async () => {
      if (revision.current === null) return
      setState('syncing')
      try {
        await writeCloud(tk, next, revision.current)
        revision.current += 1; setState('synced'); setMessage('')
      } catch (e) {
        dirty.current = true
        if ((e as CloudError)?.kind === 'conflict') {
          try { const cloud = await readCloud(tk); revision.current = cloud.revision; apply(cloud.items); dirty.current = false; setState('synced'); setMessage('其他设备已更新候选池，已刷新为最新，请重新操作') } catch (e2) { fail(e2) }
        } else fail(e)
      }
    })
  }

  return {
    items, state, message,
    toggle: (market: CandidateMarket, code: string): void => push(toggleCandidate(itemsRef.current, market, code)),
    move: (from: number, to: number): void => push(moveCandidate(itemsRef.current, from, to)),
    setNote: (market: CandidateMarket, code: string, note: string): void => push(setCandidateNote(itemsRef.current, market, code, note)),
    clear: (): void => push([]),
    connect: (value: string): boolean => { if (!saveToken(value)) return false; revision.current = null; setToken(value.trim()); return true },
    retry: (): void => { if (token) void pull(token) },
  }
}
