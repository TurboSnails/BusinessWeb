import { validSavedRecord } from './validation'
import type { SavedRecord } from './types'

export type ImportConflictChoice = 'skip' | 'replace'
export type GridImportPreview = { records: SavedRecord[]; errors: string[] }
export type GridImportApplication = { records: SavedRecord[]; conflicts: string[] }
const SCHEMA_VERSION = 1

export function exportGridRecords(records: SavedRecord[]): string {
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), records }, null, 2)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function parseGridImport(text: string): GridImportPreview {
  let decoded: unknown
  try { decoded = JSON.parse(text) } catch { return { records: [], errors: ['JSON 文件格式无效'] } }

  let input: unknown[]
  if (Array.isArray(decoded)) input = decoded
  else if (isObject(decoded) && decoded.schemaVersion === SCHEMA_VERSION && Array.isArray(decoded.records)) input = decoded.records
  else if (isObject(decoded) && typeof decoded.schemaVersion === 'number' && decoded.schemaVersion !== SCHEMA_VERSION) {
    return { records: [], errors: ['不支持的导入版本'] }
  } else return { records: [], errors: ['导入文件缺少 records 数组'] }

  const records: SavedRecord[] = []
  const errors: string[] = []
  const ids = new Set<string>()
  input.forEach((value, index) => {
    if (!validSavedRecord(value)) {
      errors.push(`第 ${index + 1} 条记录结构无效`)
      return
    }
    if (ids.has(value.id)) {
      errors.push(`第 ${index + 1} 条记录重复使用 ID ${value.id}`)
      return
    }
    ids.add(value.id)
    records.push({ ...value, schemaVersion: SCHEMA_VERSION })
  })
  return { records, errors }
}

export function applyGridImport(
  existing: SavedRecord[],
  incoming: SavedRecord[],
  choices: Record<string, ImportConflictChoice> = {},
): GridImportApplication {
  const records = [...existing]
  const conflicts: string[] = []
  for (const imported of incoming) {
    const index = records.findIndex(record => record.id === imported.id)
    if (index === -1) {
      records.push(imported)
      continue
    }
    if (!choices[imported.id]) {
      conflicts.push(imported.id)
    } else if (choices[imported.id] === 'replace') {
      records[index] = imported
    }
  }
  return { records, conflicts }
}
