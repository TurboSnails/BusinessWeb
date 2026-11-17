import type { IndexData } from '../macro/valuation'
import registry from './registry.json'

export type Point = [string, number]
export const validDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
export type IndexEtfRelation = {
  indexKey: string; indexCode: string; indexName: string; indexProvider: 'CSI' | 'SZSE'
  code: string; exchange: 'SH' | 'SZ'; name: string
  relationship: 'tracks' | 'related_theme'; benchmarkCode: string; benchmarkName: string
  verifiedAt: string; disclosureDate: string; evidenceUrl: string; evidenceLabel: string; relationNote?: string
}
export type EtfCatalog = { schemaVersion: 1; scope: string; relations: IndexEtfRelation[] }

/** 这里只接受有真实观测的有限正值；同月取最后一条，不插值。 */
export function monthlySeries(points: Point[]): Map<string, Point> {
  const map = new Map<string, Point>()
  for (const p of [...points].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (validDate(p[0]) && Number.isFinite(p[1]) && p[1] > 0) map.set(p[0].slice(0, 7), p)
  }
  return map
}

/** 只有至少24个真实月份才称长期位置；插值不能增加样本。 */
export function hasHistory(points: Point[], minimumMonths = 24): boolean {
  const months = [...monthlySeries(points).keys()]
  if (months.length < minimumMonths) return false
  const ordinal = (s: string) => Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7))
  return ordinal(months.at(-1)!) - ordinal(months[0]) >= minimumMonths - 1
}

export function compareIndices(indexes: Record<string, IndexData>, keys: string[], years: number | null): { months: string[]; series: { key: string; name: string; points: Point[]; firstDate: string; lastDate: string }[] } {
  const selected = keys.filter(k => indexes[k]).slice(0, 4)
  if (selected.length < 2) return { months: [], series: [] }
  const maps = selected.map(k => monthlySeries(indexes[k].monthly))
  let common = [...maps[0].keys()].filter(m => maps.every(map => map.has(m))).sort()
  if (years && common.length) {
    const latest = common.at(-1)!
    const floor = `${Number(latest.slice(0, 4)) - years}${latest.slice(4)}`
    common = common.filter(m => m >= floor)
  }
  if (common.length < 2) return { months: [], series: [] }
  return { months: common, series: selected.map((key, i) => ({ key, name: indexes[key].name, firstDate: maps[i].get(common[0])![0], lastDate: maps[i].get(common.at(-1)!)![0], points: common.map(m => [m, maps[i].get(m)![1] / maps[i].get(common[0])![1] * 100]) })) }
}

const OFFICIAL_HOSTS = new Set(['www.sse.com.cn', 'disc.static.szse.cn', 'www.gffunds.com.cn', 'www.99fund.com', 'www.csindex.com.cn', 'oss-ch.csindex.com.cn'])


/** JSON属于不可信输入；完整身份、公开官方域与披露日期一并校验。 */
export function validRelation(value: unknown): value is IndexEtfRelation {
  if (!value || typeof value !== 'object') return false
  const r = value as Record<string, unknown>
  const expected = typeof r.indexKey === 'string' ? (registry as Record<string, { code: string; provider: string }>)[r.indexKey] : undefined
  if (!expected || r.indexCode !== expected.code || r.indexProvider !== expected.provider) return false
  if (typeof r.code !== 'string' || !/^\d{6}$/.test(r.code) || !['SH', 'SZ'].includes(String(r.exchange)) || (r.exchange === 'SH' ? !r.code.startsWith('5') : !r.code.startsWith('1'))) return false
  if (![r.name, r.indexName, r.benchmarkName, r.evidenceLabel].every(v => typeof v === 'string' && v.trim())) return false
  if (!validDate(r.verifiedAt) || !validDate(r.disclosureDate) || r.disclosureDate > r.verifiedAt) return false
  try { const url = new URL(String(r.evidenceUrl)); if (url.protocol !== 'https:' || !OFFICIAL_HOSTS.has(url.hostname)) return false } catch { return false }
  return r.relationship === 'tracks' ? r.benchmarkCode === expected.code : r.relationship === 'related_theme' && typeof r.benchmarkCode === 'string' && !!r.benchmarkCode && typeof r.relationNote === 'string' && !!r.relationNote.trim()
}
export function validCatalog(value: unknown): value is EtfCatalog {
  if (!value || typeof value !== 'object') return false
  const raw = value as Record<string, unknown>
  if (raw.schemaVersion !== 1 || typeof raw.scope !== 'string' || !Array.isArray(raw.relations)) return false
  const seen = new Set<string>()
  return raw.relations.every(value => { if (!validRelation(value)) return false; const key = `${value.indexKey}|${value.exchange}|${value.code}`; if (seen.has(key)) return false; seen.add(key); return true })
}
export function relationsFor(catalog: EtfCatalog | null, indexKey: string): IndexEtfRelation[] {
  return (Array.isArray(catalog?.relations) ? catalog.relations : []).filter(validRelation).filter(r => r.indexKey === indexKey)
}
