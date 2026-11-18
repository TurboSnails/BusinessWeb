import type { ValuationStatus } from '../jixing-table/model'
import { GROUPS, type GroupFilter } from '../jixing-table/model'

export type MapCell = {
  code: string
  name: string
  group: Exclude<GroupFilter, 'all'> | 'hk' | 'overseas'
  pct: number | null
  status: ValuationStatus | null
  href: string
  /** 宽基象限：0=小盘…1=大盘；0=价值…1=成长 */
  size?: number
  style?: number
}

export const MAP_GROUPS = [
  { id: 'all', label: '全部' },
  { id: 'broad', label: '宽基' },
  { id: 'strategy', label: '红利策略' },
  { id: 'industry', label: '行业' },
  { id: 'pension', label: '专题' },
  { id: 'hk', label: '港股' },
  { id: 'overseas', label: '海外' },
] as const

export type MapGroupFilter = typeof MAP_GROUPS[number]['id']

/** 宽基规模×风格（本站自定示意坐标，非官方分类）。 */
export const BROAD_AXES: Record<string, { size: number; style: number }> = {
  '000016': { size: 0.95, style: 0.25 },
  '000010': { size: 0.85, style: 0.35 },
  '000001': { size: 0.8, style: 0.4 },
  '000300': { size: 0.75, style: 0.45 },
  '000906': { size: 0.65, style: 0.5 },
  '000510': { size: 0.6, style: 0.5 },
  '000905': { size: 0.45, style: 0.55 },
  '000852': { size: 0.3, style: 0.6 },
  '932000': { size: 0.15, style: 0.65 },
  '399006': { size: 0.35, style: 0.85 },
  '000688': { size: 0.4, style: 0.9 },
  '399001': { size: 0.7, style: 0.55 },
  '399330': { size: 0.75, style: 0.5 },
  '000009': { size: 0.55, style: 0.55 },
  '000985': { size: 0.5, style: 0.5 },
}

export const METHOD = {
  layout: '宽基按「规模（大盘↔小盘）× 风格（价值↔成长）」放入四象限（坐标为本站示意，非官方风格分类）；其余指数按分组网格排列。颜色与估值状态文字同时给出。',
  status: '估值状态与估值表一致：百分位 < 30% 低估，> 70% 高估，其余正常。港股 / 海外行来自港股全球页有状态的指数。',
}

export function statusClass(status: ValuationStatus | null): string {
  return status === 'low' ? 'jx-map-cell--low' : status === 'high' ? 'jx-map-cell--high' : status === 'normal' ? 'jx-map-cell--normal' : 'jx-map-cell--empty'
}

export function fromTableRow(r: {
  code: string; name: string; group: string; pePct: number | null; pbPct: number | null; basis: string; status: ValuationStatus | null
}): MapCell {
  const pct = r.basis === 'pb' ? r.pbPct : r.pePct
  const axes = BROAD_AXES[r.code]
  return {
    code: r.code,
    name: r.name,
    group: r.group as MapCell['group'],
    pct,
    status: r.status,
    href: `/jixing/table?code=${r.code}`,
    ...(axes ?? {}),
  }
}

export function fromGlobalRow(r: { key: string; name: string; valPct: number | null; state: '低估' | '正常' | '高估' | null }, section: 'hk' | 'overseas'): MapCell | null {
  if (!r.state) return null
  const status: ValuationStatus = r.state === '低估' ? 'low' : r.state === '高估' ? 'high' : 'normal'
  return {
    code: r.key,
    name: r.name,
    group: section,
    pct: r.valPct === null ? null : r.valPct / 100,
    status,
    href: '/jixing/global',
  }
}

export { GROUPS }
export const fmtPct = (v: number | null): string => v === null ? '—' : `${(v * 100).toFixed(0)}%`
