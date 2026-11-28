import type { EtfTechRecord, TechPeriod } from '../../data/etfTechnical'

export type TechnicalPeriod = 'day' | 'week' | 'month'
export type TechnicalFilter = 'all' | 'bull' | 'bear' | 'gold' | 'dead'
export type MaFilter = 'all' | NonNullable<TechPeriod['ma']>
export const PERIOD_LABELS = { day: '日线', week: '周线', month: '月线' } as const
export const TECH_FILTERS: Array<{ value: TechnicalFilter; label: string }> = [
  { value: 'all', label: '全部技术状态' }, { value: 'bull', label: 'MACD 偏多' },
  { value: 'bear', label: 'MACD 偏空' }, { value: 'gold', label: '本期金叉' }, { value: 'dead', label: '本期死叉' },
]
export function crossing(period: TechPeriod | undefined): 'gold' | 'dead' | null {
  const prev = period?.previousHistogram, current = period?.histogram
  if (prev == null || current == null || !Number.isFinite(prev) || !Number.isFinite(current)) return null
  return prev <= 0 && current > 0 ? 'gold' : prev >= 0 && current < 0 ? 'dead' : null
}
export function matchesTechnical(record: EtfTechRecord | undefined, period: TechnicalPeriod, filter: TechnicalFilter, includeUnfinished = false, ma: MaFilter = 'all'): boolean {
  if (filter === 'all' && ma === 'all') return true
  const p = record?.[period]
  if (!p || (!p.complete && !includeUnfinished)) return false
  if (ma !== 'all' && p.ma !== ma) return false
  if (filter === 'all') return true
  if (filter === 'gold' || filter === 'dead') return crossing(p) === filter
  return p.macd === (filter === 'bull' ? '偏多' : '偏空')
}
