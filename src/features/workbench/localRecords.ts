import { readRecords } from '../grid-trading/repository'
import { loadDcfRecords } from '../dcf/storage'
import { loadReports } from '../valuation/storage'
import { loadLocal } from '../candidates/store'

export type LocalRecordKind = 'grid' | 'dcf' | 'valuation' | 'candidates'

export interface LocalRecordSummary {
  kind: LocalRecordKind
  label: string
  path: string
  count: number
  latestName: string
  latestDate: string
}

interface Source {
  kind: LocalRecordKind
  label: string
  path: string
  read: () => Array<{ name: string; at: string }>
}

const SOURCES: Source[] = [
  {
    kind: 'grid', label: '网格记录', path: '/grid-trading/records',
    read: () => readRecords().map(r => ({ name: r.row.name || r.row.code, at: r.updatedAt ?? r.savedAt })),
  },
  {
    kind: 'dcf', label: 'DCF 记录', path: '/dcf',
    read: () => loadDcfRecords().map(r => ({ name: r.company || r.code, at: r.savedAt })),
  },
  {
    kind: 'valuation', label: '估值报告', path: '/valuation',
    read: () => loadReports().map(r => ({ name: r.snapshot.security.name || r.snapshot.security.code, at: r.createdAt })),
  },
  {
    kind: 'candidates', label: '候选池', path: '/candidates',
    read: () => loadLocal().map(c => ({ name: c.code, at: c.addedAt })),
  },
]

const time = (iso: string): number => {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : 0
}

/** 汇总本机各工具已保存的记录；任何一类读取失败都只跳过该类 */
export function summarizeLocalRecords(): LocalRecordSummary[] {
  return SOURCES.flatMap(source => {
    try {
      const items = source.read()
      if (items.length === 0) return []
      const latest = items.reduce((a, b) => (time(b.at) > time(a.at) ? b : a))
      return [{
        kind: source.kind,
        label: source.label,
        path: source.path,
        count: items.length,
        latestName: latest.name,
        latestDate: latest.at.slice(0, 10),
      }]
    } catch (error) {
      console.warn(`[workbench] 读取${source.label}失败`, error)
      return []
    }
  })
}
