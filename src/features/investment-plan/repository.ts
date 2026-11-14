// 唯一本机持久化：原子 patch、跨标签锁、存储失败保留内存草稿。组件不得 setItem。
import { localToday } from '../invest-start/checks'
import type { Day } from '../invest-start/types'
import { parsePlanDocument } from './validation'
import type { Instant, PlanDocument, ValidationIssue } from './types'
import { PLAN_KEYS } from './types'

export type PlanRead = {
  mode: 'empty' | 'ready' | 'corrupt' | 'unavailable'
  document: PlanDocument | null
  unsaved: boolean
  conflict: boolean
}

export type WriteResult =
  | { ok: true; persisted: boolean; document: PlanDocument }
  | { ok: false; reason: 'invalid' | 'revision-conflict' | 'protected' | 'storage'; issues?: ValidationIssue[] }

export interface PlanRepository {
  getSnapshot(): PlanRead
  subscribe(fn: () => void): () => void
  create(doc: PlanDocument): Promise<WriteResult>
  patch(expectedLocalRevision: number, change: (latest: PlanDocument) => PlanDocument): Promise<WriteResult>
  replace(
    expectedLocalRevision: number | null,
    next: PlanDocument,
    reason: 'restore' | 'cloud-resolution',
  ): Promise<WriteResult>
  clear(expectedLocalRevision: number): Promise<{ ok: boolean }>
  refresh(): void
}

export type SyncMeta = {
  schemaVersion: 1
  planId: string
  baseRevision: number | null
  dirty: boolean
}

export type ImportsReceipt = {
  schemaVersion: 1
  legacyConsumed: boolean
  startConsumed: boolean
}

export type ConflictRecord = {
  schemaVersion: 1
  reason: 'local' | 'cloud' | 'restore'
  local: PlanDocument
  remote: PlanDocument
  remoteRevision: number | null
  at: Instant
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface PlanRepoDeps {
  storage: StorageLike | null
  clock: () => Instant
  idFactory: () => string
  /** 加载/写入校验用的本地今天；默认 localToday(clock) */
  today?: () => Day
  locks?: LockManagerLike | null
  addEventListener?: (type: string, fn: EventListener) => void
  removeEventListener?: (type: string, fn: EventListener) => void
  /** corrupt 文档的 replace 须 UI 明确确认；默认 false */
  allowCorruptReplace?: () => boolean
}

export interface LockManagerLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>
}

const LOCK_NAME = 'businessweb-investment-plan'

type Internal = {
  read: PlanRead
  rawCorrupt: string | null
  frozenByOtherTab: boolean
  otherTabDraft: PlanDocument | null
  /** 上次成功落盘的 revision；用于区分「自己的未保存草稿」与「另一窗口」 */
  lastPersistedRevision: number | null
}

function stableClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

function readRaw(storage: StorageLike | null, key: string): { kind: 'ok'; value: string } | { kind: 'missing' } | { kind: 'unavailable' } {
  if (!storage) return { kind: 'unavailable' }
  try {
    const v = storage.getItem(key)
    return v === null ? { kind: 'missing' } : { kind: 'ok', value: v }
  } catch {
    return { kind: 'unavailable' }
  }
}

function writeRaw(storage: StorageLike | null, key: string, value: string): boolean {
  if (!storage) return false
  try {
    storage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

function removeRaw(storage: StorageLike | null, key: string): boolean {
  if (!storage) return false
  try {
    storage.removeItem(key)
    return true
  } catch {
    return false
  }
}

export function loadImportsReceipt(storage: StorageLike | null): ImportsReceipt | 'missing' | 'corrupt' | 'unavailable' {
  const r = readRaw(storage, PLAN_KEYS.imports)
  if (r.kind === 'unavailable') return 'unavailable'
  if (r.kind === 'missing') return 'missing'
  try {
    const v = JSON.parse(r.value) as unknown
    if (
      !v ||
      typeof v !== 'object' ||
      (v as ImportsReceipt).schemaVersion !== 1 ||
      typeof (v as ImportsReceipt).legacyConsumed !== 'boolean' ||
      typeof (v as ImportsReceipt).startConsumed !== 'boolean'
    ) {
      return 'corrupt'
    }
    return v as ImportsReceipt
  } catch {
    return 'corrupt'
  }
}

export function writeImportsReceipt(storage: StorageLike | null, receipt: ImportsReceipt): boolean {
  return writeRaw(storage, PLAN_KEYS.imports, JSON.stringify(receipt))
}

export function restoreImportsFromMigration(doc: PlanDocument, storage: StorageLike | null): boolean {
  if (!doc.migration) return true
  const next: ImportsReceipt = {
    schemaVersion: 1,
    legacyConsumed: !!doc.migration.legacy?.imported,
    startConsumed: !!doc.migration.start?.imported,
  }
  return writeImportsReceipt(storage, next)
}

function loadConflict(storage: StorageLike | null): ConflictRecord | null {
  const r = readRaw(storage, PLAN_KEYS.conflict)
  if (r.kind !== 'ok') return null
  try {
    const v = JSON.parse(r.value) as unknown
    if (!v || typeof v !== 'object' || (v as ConflictRecord).schemaVersion !== 1) return null
    const local = parsePlanDocument((v as ConflictRecord).local)
    const remote = parsePlanDocument((v as ConflictRecord).remote)
    if (!local.ok || !remote.ok) return null
    return {
      schemaVersion: 1,
      reason: (v as ConflictRecord).reason,
      local: local.value,
      remote: remote.value,
      remoteRevision: (v as ConflictRecord).remoteRevision ?? null,
      at: (v as ConflictRecord).at,
    }
  } catch {
    return null
  }
}

export function createPlanRepository(deps: PlanRepoDeps): PlanRepository {
  const listeners = new Set<() => void>()
  let writeQueue: Promise<unknown> = Promise.resolve()
  let singleTabMode = !deps.locks
  const todayOf = (): Day => deps.today?.() ?? localToday(new Date(deps.clock()))
  const parseDoc = (input: unknown) => parsePlanDocument(input, todayOf())
  let state: Internal = {
    read: { mode: 'empty', document: null, unsaved: false, conflict: false },
    rawCorrupt: null,
    frozenByOtherTab: false,
    otherTabDraft: null,
    lastPersistedRevision: null,
  }

  const notify = () => {
    for (const fn of listeners) fn()
  }

  const setRead = (next: Partial<Internal> & { read?: PlanRead }) => {
    const prev = state.read
    const read = next.read ?? state.read
    // 同一状态稳定引用；值不变则不 notify，避免 useSyncExternalStore 死循环
    const same =
      read.mode === prev.mode &&
      read.document === prev.document &&
      read.unsaved === prev.unsaved &&
      read.conflict === prev.conflict
    const nextState: Internal = {
      ...state,
      ...next,
      read: same ? prev : read,
    }
    const unchanged =
      same &&
      nextState.rawCorrupt === state.rawCorrupt &&
      nextState.frozenByOtherTab === state.frozenByOtherTab &&
      nextState.otherTabDraft === state.otherTabDraft
    state = nextState
    if (!unchanged) notify()
  }

  const loadFromStorage = (): void => {
    const conflict = loadConflict(deps.storage) !== null
    const r = readRaw(deps.storage, PLAN_KEYS.document)
    if (r.kind === 'unavailable') {
      // 保留内存草稿；不可用时仍可编辑（见 patch）
      setRead({
        read: {
          mode: state.read.document ? 'unavailable' : 'unavailable',
          document: state.read.document,
          unsaved: state.read.document ? true : state.read.unsaved,
          conflict,
        },
        rawCorrupt: null,
      })
      return
    }
    if (r.kind === 'missing') {
      // 纯加载零写入；若内存有 unsaved 草稿则保留
      if (state.read.unsaved && state.read.document) {
        setRead({ read: { ...state.read, conflict }, rawCorrupt: null })
        return
      }
      setRead({
        read: { mode: 'empty', document: null, unsaved: false, conflict },
        rawCorrupt: null,
        lastPersistedRevision: null,
      })
      return
    }
    const parsed = parseDoc(r.value)
    if (!parsed.ok) {
      setRead({
        read: { mode: 'corrupt', document: null, unsaved: false, conflict },
        rawCorrupt: r.value,
      })
      return
    }
    // 自己的未保存草稿：存储里仍是 lastPersistedRevision → 不是另一窗口
    if (
      state.read.unsaved &&
      state.read.document &&
      state.lastPersistedRevision !== null &&
      parsed.value.localRevision === state.lastPersistedRevision
    ) {
      setRead({
        read: {
          mode: 'ready',
          document: state.read.document,
          unsaved: true,
          conflict,
        },
        rawCorrupt: null,
        frozenByOtherTab: false,
        otherTabDraft: null,
      })
      return
    }
    // storage 事件：若内存有未保存草稿且 revision 不同 → 冻结
    if (
      state.read.unsaved &&
      state.read.document &&
      state.read.document.localRevision !== parsed.value.localRevision
    ) {
      setRead({
        read: {
          mode: 'ready',
          document: state.read.document,
          unsaved: true,
          conflict: true,
        },
        frozenByOtherTab: true,
        otherTabDraft: parsed.value,
        rawCorrupt: null,
      })
      return
    }
    setRead({
      read: { mode: 'ready', document: parsed.value, unsaved: false, conflict },
      rawCorrupt: null,
      frozenByOtherTab: false,
      otherTabDraft: null,
      lastPersistedRevision: parsed.value.localRevision,
    })
  }

  loadFromStorage()

  const onStorage = (ev: Event) => {
    const e = ev as StorageEvent
    if (e.key && e.key !== PLAN_KEYS.document && e.key !== PLAN_KEYS.conflict && e.key !== PLAN_KEYS.sync) return
    loadFromStorage()
  }
  const onVisibility = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') loadFromStorage()
  }
  deps.addEventListener?.('storage', onStorage)
  deps.addEventListener?.('visibilitychange', onVisibility)

  const withLock = async <T>(fn: () => Promise<T>): Promise<T> => {
    if (deps.locks) {
      try {
        return await deps.locks.request(LOCK_NAME, fn)
      } catch {
        singleTabMode = true
        return fn()
      }
    }
    singleTabMode = true
    return fn()
  }

  const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = writeQueue.then(fn, fn)
    writeQueue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  const persistDoc = (doc: PlanDocument): { persisted: boolean } => {
    const text = JSON.stringify(doc)
    const ok = writeRaw(deps.storage, PLAN_KEYS.document, text)
    return { persisted: ok }
  }

  const markDirtySync = (doc: PlanDocument) => {
    const raw = readRaw(deps.storage, PLAN_KEYS.sync)
    let meta: SyncMeta = {
      schemaVersion: 1,
      planId: doc.id,
      baseRevision: null,
      dirty: true,
    }
    if (raw.kind === 'ok') {
      try {
        const cur = JSON.parse(raw.value) as SyncMeta
        if (cur && cur.schemaVersion === 1) {
          meta = { ...cur, planId: doc.id, dirty: true }
        }
      } catch {
        /* ignore */
      }
    }
    writeRaw(deps.storage, PLAN_KEYS.sync, JSON.stringify(meta))
  }

  const assertWritable = (): WriteResult | null => {
    if (state.read.mode === 'corrupt') {
      return { ok: false, reason: 'protected' }
    }
    if (state.frozenByOtherTab) {
      return { ok: false, reason: 'revision-conflict' }
    }
    if (state.read.conflict && loadConflict(deps.storage)) {
      return { ok: false, reason: 'protected' }
    }
    return null
  }

  const api: PlanRepository = {
    getSnapshot(): PlanRead {
      return state.read
    },

    subscribe(fn) {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },

    refresh() {
      loadFromStorage()
    },

    create(doc) {
      return enqueue(() =>
        withLock(async () => {
          loadFromStorage()
          if (state.read.mode === 'corrupt') return { ok: false as const, reason: 'protected' as const }
          if (state.read.mode === 'ready' && state.read.document) {
            return { ok: false as const, reason: 'revision-conflict' as const }
          }
          const parsed = parseDoc(doc)
          if (!parsed.ok) return { ok: false as const, reason: 'invalid' as const, issues: parsed.issues }
          const now = deps.clock()
          const next: PlanDocument = {
            ...stableClone(parsed.value),
            id: parsed.value.id || deps.idFactory(),
            localRevision: 1,
            createdAt: now,
            updatedAt: now,
          }
          // 再校验一次生成后的文档
          const again = parseDoc(next)
          if (!again.ok) return { ok: false as const, reason: 'invalid' as const, issues: again.issues }
          const { persisted } = persistDoc(again.value)
          if (persisted) markDirtySync(again.value)
          setRead({
            read: {
              mode: persisted ? 'ready' : deps.storage ? 'ready' : 'unavailable',
              document: again.value,
              unsaved: !persisted,
              conflict: state.read.conflict,
            },
            rawCorrupt: null,
            frozenByOtherTab: false,
            lastPersistedRevision: persisted ? again.value.localRevision : state.lastPersistedRevision,
          })
          if (again.value.migration) restoreImportsFromMigration(again.value, deps.storage)
          return { ok: true as const, persisted, document: again.value }
        }),
      )
    },

    patch(expectedLocalRevision, change) {
      return enqueue(() =>
        withLock(async () => {
          const blocked = assertWritable()
          if (blocked) return blocked
          // unavailable：仍允许在内存草稿上编辑
          const workingUnavail =
            state.read.mode === 'unavailable' && state.read.document && state.read.unsaved
          if (!workingUnavail) {
            loadFromStorage()
          }
          const latest = state.read.document
          if (
            !latest ||
            (state.read.mode !== 'ready' && state.read.mode !== 'unavailable')
          ) {
            return { ok: false as const, reason: 'revision-conflict' as const }
          }
          if (latest.localRevision !== expectedLocalRevision) {
            return { ok: false as const, reason: 'revision-conflict' as const }
          }
          if (state.frozenByOtherTab) {
            return { ok: false as const, reason: 'revision-conflict' as const }
          }
          let changed: PlanDocument
          try {
            changed = change(stableClone(latest))
          } catch {
            return { ok: false as const, reason: 'invalid' as const }
          }
          // 仓库生成 revision+1 与 updatedAt；保留 id/createdAt
          const next: PlanDocument = {
            ...changed,
            id: latest.id,
            createdAt: latest.createdAt,
            localRevision: latest.localRevision + 1,
            updatedAt: deps.clock(),
            schemaVersion: 1,
          }
          const parsed = parseDoc(next)
          if (!parsed.ok) return { ok: false as const, reason: 'invalid' as const, issues: parsed.issues }
          // 写前再读比对（单标签 fallback）；unavailable 跳过
          if ((singleTabMode || !deps.locks) && state.read.mode !== 'unavailable') {
            const reread = readRaw(deps.storage, PLAN_KEYS.document)
            if (reread.kind === 'ok') {
              const cur = parseDoc(reread.value)
              if (cur.ok && cur.value.localRevision !== expectedLocalRevision) {
                // 若存储仍是自己上次落盘的版本，允许继续（自己的 pending draft）
                if (
                  state.lastPersistedRevision === null ||
                  cur.value.localRevision !== state.lastPersistedRevision
                ) {
                  return { ok: false as const, reason: 'revision-conflict' as const }
                }
              }
            }
          }
          const { persisted } = persistDoc(parsed.value)
          if (persisted) markDirtySync(parsed.value)
          setRead({
            read: {
              mode: persisted ? 'ready' : deps.storage ? 'ready' : 'unavailable',
              document: parsed.value,
              unsaved: !persisted,
              conflict: state.read.conflict,
            },
            frozenByOtherTab: persisted ? false : state.frozenByOtherTab,
            lastPersistedRevision: persisted ? parsed.value.localRevision : state.lastPersistedRevision,
          })
          if (parsed.value.migration) restoreImportsFromMigration(parsed.value, deps.storage)
          return { ok: true as const, persisted, document: parsed.value }
        }),
      )
    },

    replace(expectedLocalRevision, nextDoc, reason) {
      return enqueue(() =>
        withLock(async () => {
          loadFromStorage()
          if (state.read.mode === 'corrupt') {
            if (!deps.allowCorruptReplace?.()) {
              return { ok: false as const, reason: 'protected' as const }
            }
            // corrupt replace 不能靠 expectedLocalRevision=null 绕过——仍需 allowCorruptReplace
          } else if (state.read.mode === 'ready' && state.read.document) {
            if (expectedLocalRevision === null || state.read.document.localRevision !== expectedLocalRevision) {
              return { ok: false as const, reason: 'revision-conflict' as const }
            }
          } else if (expectedLocalRevision !== null && state.read.mode === 'empty') {
            return { ok: false as const, reason: 'revision-conflict' as const }
          }

          const parsed = parseDoc(nextDoc)
          if (!parsed.ok) return { ok: false as const, reason: 'invalid' as const, issues: parsed.issues }

          let next: PlanDocument
          if (state.read.mode === 'ready' && state.read.document) {
            const local = state.read.document
            next = {
              ...stableClone(parsed.value),
              id: local.id,
              createdAt: local.createdAt,
              localRevision: local.localRevision + 1,
              updatedAt: deps.clock(),
              schemaVersion: 1,
            }
          } else {
            // 空本机：沿用导入文档 id/createdAt，revision 重置 1
            next = {
              ...stableClone(parsed.value),
              localRevision: 1,
              updatedAt: deps.clock(),
              schemaVersion: 1,
            }
          }
          void reason
          const again = parseDoc(next)
          if (!again.ok) return { ok: false as const, reason: 'invalid' as const, issues: again.issues }
          const { persisted } = persistDoc(again.value)
          if (persisted) markDirtySync(again.value)
          setRead({
            read: {
              mode: persisted ? 'ready' : deps.storage ? 'ready' : 'unavailable',
              document: again.value,
              unsaved: !persisted,
              conflict: false,
            },
            rawCorrupt: null,
            frozenByOtherTab: false,
            otherTabDraft: null,
            lastPersistedRevision: persisted ? again.value.localRevision : state.lastPersistedRevision,
          })
          return { ok: true as const, persisted, document: again.value }
        }),
      )
    },

    clear(expectedLocalRevision) {
      return enqueue(() =>
        withLock(async () => {
          loadFromStorage()
          if (state.read.mode === 'ready' && state.read.document) {
            if (state.read.document.localRevision !== expectedLocalRevision) {
              return { ok: false }
            }
          } else if (state.read.mode === 'corrupt') {
            // 允许清除 corrupt（本人确认后）
          } else if (state.read.mode !== 'empty') {
            return { ok: false }
          }
          const removed = removeRaw(deps.storage, PLAN_KEYS.document)
          if (!removed && state.read.mode !== 'empty') {
            return { ok: false }
          }
          removeRaw(deps.storage, PLAN_KEYS.sync)
          // conflict 仅在本人确认时删——这里 clear 规格：清除本人确认要删除的 conflict
          removeRaw(deps.storage, PLAN_KEYS.conflict)
          // 保留 imports 收据与所有 plan2026/start
          setRead({
            read: { mode: 'empty', document: null, unsaved: false, conflict: false },
            rawCorrupt: null,
            frozenByOtherTab: false,
            otherTabDraft: null,
            lastPersistedRevision: null,
          })
          return { ok: true }
        }),
      )
    },
  }

  return api
}

let singleton: PlanRepository | null = null

export function getPlanRepository(): PlanRepository {
  if (!singleton) {
    const storage = ((): StorageLike | null => {
      try {
        return typeof localStorage === 'undefined' ? null : localStorage
      } catch {
        return null
      }
    })()
    const locks =
      typeof navigator !== 'undefined' && 'locks' in navigator
        ? (navigator.locks as LockManagerLike)
        : null
    singleton = createPlanRepository({
      storage,
      clock: () => new Date().toISOString(),
      idFactory: () =>
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `plan-${Date.now().toString(36)}`,
      locks,
      addEventListener: (t, fn) => {
        if (typeof window !== 'undefined') window.addEventListener(t, fn)
        else if (typeof document !== 'undefined' && t === 'visibilitychange') document.addEventListener(t, fn)
      },
      removeEventListener: (t, fn) => {
        if (typeof window !== 'undefined') window.removeEventListener(t, fn)
        else if (typeof document !== 'undefined' && t === 'visibilitychange') document.removeEventListener(t, fn)
      },
    })
  }
  return singleton
}

/** 测试用：重置单例 */
export function resetPlanRepositoryForTests(): void {
  singleton = null
}
