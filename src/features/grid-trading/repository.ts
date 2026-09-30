import type { SavedRecord } from './types'

export const GRID_RECORDS_KEY = 'businessweb.grid-trading.v1'
export const GRID_TOMBSTONES_KEY = 'businessweb.grid-trading.deleted.v1'
export const GRID_SYNC_CONFIG_KEY = 'businessweb.grid-trading.sync.v1'
const SCHEMA_VERSION = 1
const TOMBSTONE_TTL = 180 * 24 * 60 * 60 * 1000

export type GridTombstone = { id: string; savedAt: string; updatedAt: string; deleted: true }

function getStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

export function readRecords(): SavedRecord[] {
  const storage = getStorage()
  if (!storage) return []
  try {
    const raw = storage.getItem(GRID_RECORDS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    const records = Array.isArray(parsed) ? parsed : (parsed as { records?: unknown[] })?.records
    if (!Array.isArray(records)) return []
    return records.filter(isSavedRecord).map(record => ({ ...record, schemaVersion: record.schemaVersion ?? SCHEMA_VERSION }))
  } catch {
    return []
  }
}

function isSavedRecord(value: unknown): value is SavedRecord {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<SavedRecord>
  return typeof candidate.id === 'string' && !!candidate.id
    && !!candidate.row && typeof candidate.row === 'object'
    && !!candidate.result && typeof candidate.result === 'object'
}

export function writeRecords(records: SavedRecord[]): void {
  const storage = getStorage()
  if (!storage) throw new Error('浏览器本地存储不可用，记录未保存')
  const payload = { schemaVersion: SCHEMA_VERSION, records }
  try {
    storage.setItem(GRID_RECORDS_KEY, JSON.stringify(payload))
  } catch {
    throw new Error('本地存储空间不足或不可用；现有记录未被清除，请先导出或清理数据')
  }
}

export function saveRecord(record: SavedRecord): void {
  const records = readRecords()
  const normalized = { ...record, schemaVersion: SCHEMA_VERSION }
  const index = records.findIndex(item => item.id === record.id)
  if (index === -1) writeRecords([normalized, ...records])
  else writeRecords(records.map((item, itemIndex) => itemIndex === index ? normalized : item))
}

export function saveRecordIfUnchanged(record: SavedRecord, expected: SavedRecord): boolean {
  const current = readRecords().find(item => item.id === expected.id)
  if (!current || JSON.stringify(current) !== JSON.stringify({ ...expected, schemaVersion: expected.schemaVersion ?? SCHEMA_VERSION })) return false
  saveRecord(record)
  return true
}

function readTombstones(): GridTombstone[] {
  const storage = getStorage()
  if (!storage) return []
  try {
    const parsed: unknown = JSON.parse(storage.getItem(GRID_TOMBSTONES_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(item => item && item.deleted === true && typeof item.id === 'string') as GridTombstone[] : []
  } catch {
    return []
  }
}

export function writeTombstones(tombstones: GridTombstone[]): void {
  const storage = getStorage()
  if (!storage) return
  storage.setItem(GRID_TOMBSTONES_KEY, JSON.stringify(tombstones))
}

export function readLiveTombstones(now = Date.now()): GridTombstone[] {
  return readTombstones().filter(item => now - new Date(item.updatedAt).valueOf() < TOMBSTONE_TTL)
}

export function removeRecords(ids: string[], syncEnabled = false): void {
  const storage = getStorage()
  const previousTombstones = storage?.getItem(GRID_TOMBSTONES_KEY) ?? null
  const idSet = new Set(ids)
  const remaining = readRecords().filter(record => !idSet.has(record.id))
  if (syncEnabled) {
    const timestamp = new Date().toISOString()
    const current = readLiveTombstones().filter(item => !idSet.has(item.id))
    writeTombstones([...current, ...ids.map(id => ({ id, savedAt: timestamp, updatedAt: timestamp, deleted: true as const }))])
  }
  try { writeRecords(remaining) } catch (error) {
    if (syncEnabled && storage) {
      if (previousTombstones === null) storage.removeItem(GRID_TOMBSTONES_KEY)
      else storage.setItem(GRID_TOMBSTONES_KEY, previousTombstones)
    }
    throw error
  }
}

export function saveRecordsAfterSync(records: SavedRecord[], tombstones: GridTombstone[]): void {
  writeRecords(records)
  writeTombstones(tombstones)
}

export function isSyncConfigured(): boolean {
  const storage = getStorage()
  if (!storage) return false
  try {
    const value = JSON.parse(storage.getItem(GRID_SYNC_CONFIG_KEY) ?? 'null') as { endpoint?: unknown; token?: unknown } | null
    return !!value && typeof value.endpoint === 'string' && typeof value.token === 'string' && value.token.length > 0
  } catch {
    return false
  }
}
