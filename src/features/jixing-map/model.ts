import type { ValuationStatus } from '../jixing-table/model'
import { GROUPS, type GroupFilter } from '../jixing-table/model'

export type MapCell = {
  code: string
  name: string
  group: Exclude<GroupFilter, 'all'> | 'hk' | 'overseas'
  pct: number | null
  status: ValuationStatus | null
  href: string
  position?: { x: number; y: number }
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

/** 横轴从小盘到大盘，纵轴从成长到价值。示意坐标为指数名称留出间距。 */
const BROAD_POSITIONS: Partial<Record<string, { x: number; y: number }>> = {
  '000016': { x: 88, y: 75 },
  '000010': { x: 88, y: 65 },
  '000001': { x: 68, y: 65 },
  '000300': { x: 68, y: 54 },
  '000906': { x: 86, y: 42 },
  '000510': { x: 68, y: 42 },
  '000905': { x: 36, y: 34 },
  '000852': { x: 27, y: 26 },
  '932000': { x: 15, y: 18 },
  '399006': { x: 29, y: 8 },
  '000688': { x: 47, y: 13 },
  '399001': { x: 77, y: 31 },
  '399330': { x: 89, y: 53 },
  '000009': { x: 58, y: 31 },
  '000985': { x: 50, y: 42 },
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
  return {
    code: r.code,
    name: r.name,
    group: r.group as MapCell['group'],
    pct,
    status: r.status,
    href: `/jixing/table?code=${r.code}`,
    position: BROAD_POSITIONS[r.code],
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
