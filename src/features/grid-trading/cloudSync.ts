import { readRecords, GRID_SYNC_CONFIG_KEY, GRID_TOMBSTONES_KEY, saveRecordsAfterSync } from './repository'
import type { GridTombstone } from './repository'
import { validSavedRecord } from './validation'
import type { SavedRecord } from './types'

export type SyncConfig = { endpoint: string; token: string }
export type SyncStatus = 'not-configured' | 'cancelled' | 'invalid-config' | 'synced' | 'error'
export type SyncResult = { status: SyncStatus; records?: SavedRecord[]; error?: string; domain?: string }
export type ConfirmSyncTarget = (domain: string, recordCount: number) => boolean | Promise<boolean>
type CloudItem = SavedRecord | GridTombstone
type FetchLike = typeof fetch
const TOMBSTONE_TTL = 180 * 24 * 60 * 60 * 1000

function validConfig(config: SyncConfig | null | undefined): config is SyncConfig {
  if (!config || typeof config.endpoint !== 'string' || typeof config.token !== 'string' || !config.endpoint.trim() || config.token.trim().length < 16) return false
  try {
    const url = new URL(config.endpoint)
    let fingerprint = 2166136261
    for (const character of url.hostname.toLowerCase()) fingerprint = Math.imul(fingerprint ^ character.charCodeAt(0), 16777619) >>> 0
    return fingerprint !== 2263066342 && url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
  } catch {
    return false
  }
}

export function loadSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(GRID_SYNC_CONFIG_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SyncConfig
    return validConfig(parsed) ? parsed : null
  } catch {
    return null
  }
}

export async function saveSyncConfig(config: SyncConfig, confirmTarget: ConfirmSyncTarget): Promise<boolean> {
  if (!validConfig(config)) return false
  const origin = new URL(config.endpoint).origin
  if (!await confirmTarget(origin, 0)) return false
  try {
    localStorage.setItem(GRID_SYNC_CONFIG_KEY, JSON.stringify({ endpoint: config.endpoint.trim(), token: config.token.trim() }))
    return true
  } catch {
    throw new Error('无法在本机保存独立同步配置')
  }
}

function itemTimestamp(item: CloudItem): number {
  return new Date(item.updatedAt ?? item.savedAt).valueOf()
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([key, item]) => key !== 'schemaVersion' && item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  return JSON.stringify(value)
}

function isTombstone(item: CloudItem): item is GridTombstone {
  return (item as GridTombstone).deleted === true
}

function readStoredTombstones(): GridTombstone[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(GRID_TOMBSTONES_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(item => item?.deleted === true && typeof item.id === 'string') as GridTombstone[] : []
  } catch {
    return []
  }
}

export async function syncGridRecords(
  records: SavedRecord[],
  config: SyncConfig | null | undefined,
  fetchImpl: FetchLike = fetch,
  confirmTarget: ConfirmSyncTarget,
): Promise<SyncResult> {
  if (!config) return { status: 'not-configured' }
  if (!validConfig(config)) return { status: 'invalid-config', error: '同步服务必须是 HTTPS 地址，且需要独立 token（至少 16 个字符）' }
  const url = new URL(config.endpoint)
  if (!await confirmTarget(url.origin, records.length)) return { status: 'cancelled', domain: url.origin }

  const localSnapshot = JSON.stringify(readRecords())
  const headers = { authorization: `Bearer ${config.token.trim()}`, 'content-type': 'application/json' }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)
  try {
    const getResponse = await fetchImpl(config.endpoint, { method: 'GET', headers, signal: controller.signal, redirect: 'error' })
    if (!getResponse.ok) throw new Error(`读取独立云端记录失败（HTTP ${getResponse.status}）`)
    const payload = await getResponse.json() as { records?: CloudItem[] }
    if (!Array.isArray(payload.records)) throw new Error('独立同步服务响应缺少 records 数组')

    if (!payload.records.every(item => validSavedRecord(item) || item && item.deleted === true && typeof item.id === 'string' && Number.isFinite(itemTimestamp(item)))) throw new Error('云端记录结构无效，未执行上传')
    if ((payload as { schemaVersion?: number }).schemaVersion !== undefined && (payload as { schemaVersion?: number }).schemaVersion !== 1) throw new Error('不支持的同步版本')

    const merged = new Map<string, CloudItem>()
    const localTombstones = readStoredTombstones()
    for (const item of [...records, ...localTombstones, ...payload.records]) {
      const previous = merged.get(item.id)
      if (previous && !isTombstone(previous) && !isTombstone(item) && itemTimestamp(item) === itemTimestamp(previous) && canonical(item) !== canonical(previous)) {
        throw new Error(`记录 ${item.id} 存在相同时间但内容不同的冲突；请先导出备份并调整该记录后重试`)
      }
      if (!previous || itemTimestamp(item) > itemTimestamp(previous)
        || (itemTimestamp(item) === itemTimestamp(previous) && isTombstone(item) && !isTombstone(previous))) {
        merged.set(item.id, item)
      }
    }
    const now = Date.now()
    const tombstones = [...merged.values()].filter(isTombstone)
      .filter(item => now - itemTimestamp(item) < TOMBSTONE_TTL)
    const deletedIds = new Set([...merged.values()].filter(isTombstone).map(item => item.id))
    const syncedRecords = [...merged.values()].filter((item): item is SavedRecord => !isTombstone(item) && !deletedIds.has(item.id))
    if (JSON.stringify(readRecords()) !== localSnapshot) throw new Error('同步期间本地记录已修改；已停止上传，请重试')
    const putResponse = await fetchImpl(config.endpoint, {
      method: 'PUT', headers, body: JSON.stringify({ schemaVersion: 1, records: [...syncedRecords, ...tombstones] }), signal: controller.signal, redirect: 'error',
    })
    if (!putResponse.ok) throw new Error(`写入独立云端记录失败（HTTP ${putResponse.status}）`)
    if (JSON.stringify(readRecords()) !== localSnapshot) throw new Error('同步期间本地记录已修改；云端已写入此前版本，本地最新数据已保留，请重试')
    saveRecordsAfterSync(syncedRecords, tombstones)
    return { status: 'synced', records: syncedRecords, domain: url.origin }
  } catch (error) {
    if (controller.signal.aborted) return { status: 'error', error: '同步请求超时', domain: url.origin }
    return { status: 'error', error: error instanceof Error ? error.message : '同步失败', domain: url.origin }
  } finally {
    clearTimeout(timeout)
  }
}
