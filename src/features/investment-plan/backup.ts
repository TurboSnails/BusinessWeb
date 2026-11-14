// 显式文件导出与校验后替换；绝不上传。固定文件名 investment-plan-backup.json。
import type { PlanRepository } from './repository'
import type { Instant, PlanDocument, ValidationIssue } from './types'
import { MAX_PLAN_BYTES, PLAN_KEYS } from './types'
import { parsePlanDocument } from './validation'

export const BACKUP_FILENAME = 'investment-plan-backup.json'
export const BACKUP_FORMAT = 'businessweb-investment-plan' as const
/** 包装开销上限：document ≤262144，整体 ≤263168 */
export const MAX_BACKUP_BYTES = 263168

export type BackupFile = {
  format: typeof BACKUP_FORMAT
  version: 1
  exportedAt: Instant
  document: PlanDocument
}

export type BackupParseResult =
  | { ok: true; backup: BackupFile }
  | { ok: false; reason: 'too-large' | 'invalid-json' | 'invalid-wrapper' | 'unsupported-version' | 'invalid-document'; issues?: ValidationIssue[] }

export function buildBackup(document: PlanDocument, exportedAt: Instant): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt,
    document,
  }
}

export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup)
}

export function parseBackupPayload(raw: string): BackupParseResult {
  const bytes = new TextEncoder().encode(raw).length
  if (bytes > MAX_BACKUP_BYTES) return { ok: false, reason: 'too-large' }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return { ok: false, reason: 'invalid-json' }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'invalid-wrapper' }
  }
  const obj = parsed as Record<string, unknown>
  if (obj.format !== BACKUP_FORMAT) return { ok: false, reason: 'invalid-wrapper' }
  if (typeof obj.version !== 'number' || !Number.isInteger(obj.version)) return { ok: false, reason: 'invalid-wrapper' }
  if (obj.version > 1) return { ok: false, reason: 'unsupported-version' }
  if (obj.version !== 1) return { ok: false, reason: 'invalid-wrapper' }
  if (typeof obj.exportedAt !== 'string') return { ok: false, reason: 'invalid-wrapper' }
  // document 单独限长
  let docText: string
  try {
    docText = JSON.stringify(obj.document)
  } catch {
    return { ok: false, reason: 'invalid-document' }
  }
  if (new TextEncoder().encode(docText).length > MAX_PLAN_BYTES) {
    return { ok: false, reason: 'too-large' }
  }
  const doc = parsePlanDocument(obj.document)
  if (!doc.ok) return { ok: false, reason: 'invalid-document', issues: doc.issues }
  return {
    ok: true,
    backup: {
      format: BACKUP_FORMAT,
      version: 1,
      exportedAt: obj.exportedAt,
      document: doc.value,
    },
  }
}

export type RestoreResult =
  | { ok: true; persisted: boolean; document: PlanDocument }
  | { ok: false; reason: 'cancelled' | 'parse' | 'replace-failed'; detail?: string; issues?: ValidationIssue[] }

/**
 * 恢复：先 parse+预览由 UI 完成；此处仅在本人确认后 replace。
 * 坏文件原状态逐字不变（replace 失败或未调用）。
 */
export async function restoreFromBackup(
  raw: string,
  repository: PlanRepository,
  options: {
    confirmed: boolean
    expectedLocalRevision: number | null
    existingDownloadedOrConflictSaved: boolean
  },
): Promise<RestoreResult> {
  if (!options.confirmed) return { ok: false, reason: 'cancelled' }
  const snap = repository.getSnapshot()
  if (snap.mode === 'ready' && snap.document && !options.existingDownloadedOrConflictSaved) {
    return { ok: false, reason: 'cancelled', detail: 'must-backup-existing' }
  }
  const parsed = parseBackupPayload(raw)
  if (!parsed.ok) return { ok: false, reason: 'parse', detail: parsed.reason, issues: parsed.issues }
  const result = await repository.replace(options.expectedLocalRevision, parsed.backup.document, 'restore')
  if (!result.ok) return { ok: false, reason: 'replace-failed', detail: result.reason, issues: result.issues }
  return { ok: true, persisted: result.persisted, document: result.document }
}

/** 生成下载用 Blob（本机，不进 public） */
export function backupBlob(document: PlanDocument, exportedAt: Instant): Blob {
  const text = serializeBackup(buildBackup(document, exportedAt))
  return new Blob([text], { type: 'application/json' })
}

/**
 * 只读：从 storage 读取 PLAN_KEYS.document 原文（含 corrupt），供下载；不写回。
 */
export function readDocumentRaw(storage: Pick<Storage, 'getItem'> | null): string | null {
  if (!storage) return null
  try {
    return storage.getItem(PLAN_KEYS.document)
  } catch {
    return null
  }
}

export function downloadTextFile(filename: string, text: string, mime: string, doc: Document = document): void {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = doc.createElement('a')
  a.href = url
  a.download = filename
  doc.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
