// 站长云同步客户端：不自动上传；token 仅内存；sync/conflict 键读写。
import { parsePlanDocument } from './validation'
import type { ConflictRecord, PlanRepository, StorageLike, SyncMeta } from './repository'
import { PLAN_KEYS, type Instant, type PlanDocument } from './types'

export const TRUSTED_API_ORIGINS = new Set([
  'https://business-web-black.vercel.app',
])

export type CloudGetResult =
  | { ok: true; revision: number; document: PlanDocument | null }
  | { ok: false; status: number; error: string }

export type CloudPutResult =
  | { ok: true; revision: number }
  | { ok: false; status: number; error: string; latestRevision?: number }

export function resolvePlanSyncEndpoint(locationOrigin: string, viteApiBase: string): {
  endpoint: string | null
  reason?: 'cross-origin-pages'
} {
  const base = (viteApiBase || '').replace(/\/$/, '')
  if (!base) {
    // 同源
    try {
      const u = new URL(locationOrigin)
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        return { endpoint: `${u.origin}/api/market-data/plan-sync` }
      }
    } catch {
      /* fallthrough */
    }
    return { endpoint: null, reason: 'cross-origin-pages' }
  }
  try {
    const u = new URL(base)
    if (!TRUSTED_API_ORIGINS.has(u.origin)) {
      return { endpoint: null, reason: 'cross-origin-pages' }
    }
    // GitHub Pages → 跨域 API：本期不承诺，提示回同源站
    if (typeof locationOrigin === 'string') {
      try {
        const page = new URL(locationOrigin)
        if (page.origin !== u.origin) {
          return { endpoint: null, reason: 'cross-origin-pages' }
        }
      } catch {
        return { endpoint: null, reason: 'cross-origin-pages' }
      }
    }
    return { endpoint: `${u.origin}/api/market-data/plan-sync` }
  } catch {
    return { endpoint: null, reason: 'cross-origin-pages' }
  }
}

export function loadSyncMeta(storage: StorageLike | null): SyncMeta | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(PLAN_KEYS.sync)
    if (!raw) return null
    const v = JSON.parse(raw) as SyncMeta
    if (!v || v.schemaVersion !== 1) return null
    return v
  } catch {
    return null
  }
}

export function writeSyncMeta(storage: StorageLike | null, meta: SyncMeta): boolean {
  if (!storage) return false
  try {
    storage.setItem(PLAN_KEYS.sync, JSON.stringify(meta))
    return true
  } catch {
    return false
  }
}

export function clearSyncMetaBaseline(storage: StorageLike | null, planId: string): boolean {
  return writeSyncMeta(storage, {
    schemaVersion: 1,
    planId,
    baseRevision: null,
    dirty: true,
  })
}

export function loadConflictRecord(storage: StorageLike | null): ConflictRecord | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(PLAN_KEYS.conflict)
    if (!raw) return null
    const v = JSON.parse(raw) as ConflictRecord
    if (!v || v.schemaVersion !== 1) return null
    const local = parsePlanDocument(v.local)
    const remote = parsePlanDocument(v.remote)
    if (!local.ok || !remote.ok) return null
    return {
      schemaVersion: 1,
      reason: v.reason,
      local: local.value,
      remote: remote.value,
      remoteRevision: v.remoteRevision ?? null,
      at: v.at,
    }
  } catch {
    return null
  }
}

export function writeConflictRecord(storage: StorageLike | null, record: ConflictRecord): boolean {
  if (!storage) return false
  try {
    storage.setItem(PLAN_KEYS.conflict, JSON.stringify(record))
    return true
  } catch {
    return false
  }
}

export function removeConflictRecord(storage: StorageLike | null): boolean {
  if (!storage) return false
  try {
    storage.removeItem(PLAN_KEYS.conflict)
    return true
  } catch {
    return false
  }
}

export async function cloudGet(
  endpoint: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CloudGetResult> {
  const res = await fetchImpl(endpoint, {
    method: 'GET',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    credentials: 'same-origin',
  })
  if (res.status === 401) return { ok: false, status: 401, error: '同步 token 无效' }
  if (!res.ok) return { ok: false, status: res.status, error: '读取云端失败' }
  const revisionHeader = res.headers.get('x-revision') ?? res.headers.get('etag')?.replace(/"/g, '')
  const revision = Number(revisionHeader)
  if (!Number.isSafeInteger(revision) || revision < 0) {
    return { ok: false, status: 502, error: '云端版本无效' }
  }
  const body = (await res.json()) as { schemaVersion?: number; document?: unknown }
  if (!body || body.schemaVersion !== 1) return { ok: false, status: 502, error: '云端包装无效' }
  if (body.document === null || body.document === undefined) {
    return { ok: true, revision, document: null }
  }
  const parsed = parsePlanDocument(body.document)
  if (!parsed.ok) return { ok: false, status: 502, error: '云端计划无效' }
  return { ok: true, revision, document: parsed.value }
}

export async function cloudPut(
  endpoint: string,
  token: string,
  expectedRevision: number,
  document: PlanDocument,
  fetchImpl: typeof fetch = fetch,
): Promise<CloudPutResult> {
  const res = await fetchImpl(endpoint, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'if-match': `"${expectedRevision}"`,
      accept: 'application/json',
    },
    credentials: 'same-origin',
    body: JSON.stringify({ schemaVersion: 1, document }),
  })
  if (res.status === 401) return { ok: false, status: 401, error: '同步 token 无效' }
  if (res.status === 409) {
    const body = (await res.json().catch(() => ({}))) as { latestRevision?: number; error?: string }
    return {
      ok: false,
      status: 409,
      error: typeof body.error === 'string' ? body.error : '云端版本已变化',
      latestRevision: typeof body.latestRevision === 'number' ? body.latestRevision : undefined,
    }
  }
  if (!res.ok) return { ok: false, status: res.status, error: '上传失败' }
  const body = (await res.json()) as { ok?: boolean; revision?: number }
  if (!body?.ok || !Number.isSafeInteger(body.revision)) {
    return { ok: false, status: 502, error: '云端写入响应无效' }
  }
  return { ok: true, revision: body.revision as number }
}

export function documentsDiffer(a: PlanDocument | null, b: PlanDocument | null): boolean {
  if (a === null && b === null) return false
  if (a === null || b === null) return true
  // 比较业务内容：去掉本机 id / revision / 时间戳噪声（replace 会保留本机 id）
  const strip = (d: PlanDocument) => {
    const { id: _id, localRevision: _l, updatedAt: _u, createdAt: _c, ...rest } = d
    return rest
  }
  return JSON.stringify(strip(a)) !== JSON.stringify(strip(b))
}

export function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  // 延后 revoke，避免部分浏览器在 click 前回收
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export async function adoptCloudDocument(
  repository: PlanRepository,
  remote: PlanDocument,
  remoteRevision: number,
  storage: StorageLike | null,
  at: Instant,
): Promise<{ ok: boolean; reason?: string }> {
  const snap = repository.getSnapshot()
  const expected = snap.document?.localRevision ?? null
  const r = await repository.replace(expected, remote, 'cloud-resolution')
  if (!r.ok) return { ok: false, reason: r.reason }
  const written = writeSyncMeta(storage, {
    schemaVersion: 1,
    planId: r.document.id,
    baseRevision: remoteRevision,
    dirty: false,
  })
  if (!written) {
    clearSyncMetaBaseline(storage, r.document.id)
    return { ok: false, reason: 'sync-meta' }
  }
  // 冲突档保留至本人清除；此处不自动删
  void at
  return { ok: true }
}
