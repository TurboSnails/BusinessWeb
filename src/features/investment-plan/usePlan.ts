// 订阅 PlanRepository；组件不直接读写 localStorage。
import { useCallback, useRef, useSyncExternalStore } from 'react'
import { getPlanRepository, type PlanRead, type PlanRepository, type WriteResult } from './repository'
import type { PlanDocument } from './types'

export function usePlan(repo: PlanRepository = getPlanRepository()): {
  snapshot: PlanRead
  create: (doc: PlanDocument) => Promise<WriteResult>
  patch: (expectedLocalRevision: number, change: (latest: PlanDocument) => PlanDocument) => Promise<WriteResult>
  replace: (
    expectedLocalRevision: number | null,
    next: PlanDocument,
    reason: 'restore' | 'cloud-resolution',
  ) => Promise<WriteResult>
  clear: (expectedLocalRevision: number) => Promise<{ ok: boolean }>
  refresh: () => void
} {
  const repoRef = useRef(repo)
  repoRef.current = repo

  const subscribe = useCallback((onStoreChange: () => void) => repoRef.current.subscribe(onStoreChange), [])
  const getSnapshot = useCallback(() => repoRef.current.getSnapshot(), [])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  return {
    snapshot,
    create: doc => repoRef.current.create(doc),
    patch: (rev, change) => repoRef.current.patch(rev, change),
    replace: (rev, next, reason) => repoRef.current.replace(rev, next, reason),
    clear: rev => repoRef.current.clear(rev),
    refresh: () => repoRef.current.refresh(),
  }
}
