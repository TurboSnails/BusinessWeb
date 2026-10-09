import selection from './futureTrendsSelection.json'
import { ResearchSummary } from './futureTrendsResearch'

export type Priority = 1 | 2 | 3 | 4
export interface Selection { key: string; sector: string; industry: string; priority: Priority; reason: string; watch: string }
export const SELECTION = selection as Selection[]
const entries = new Map(SELECTION.map((x, i) => [x.key, { ...x, rank: i }]))
export const priorityNames: Record<Priority, string> = { 1: '优先候选', 2: '备选', 3: '暂缓', 4: '全部观察' }
export function presentation(r: ResearchSummary): Selection & { rank: number } {
  return entries.get(r.key) ?? { key: r.key, sector: r.primaryTrend, industry: '主营业务待核实', priority: 4, rank: 999,
    reason: r.moat.replace(/^待验证：/, ''), watch: '尚未完成公司级估值，保留观察，完整分析见公司页。' }
}
export const byPriority = (a: ResearchSummary, b: ResearchSummary): number => presentation(a).rank - presentation(b).rank || a.name.localeCompare(b.name, 'zh-CN')
export const displayText = (value: string): string => value.replace(/\[MISSING\]/g, '待核实').replace(/\[STALE\]/g, '历史数据')
const symbols: Record<string, string> = { CNY: '¥', HKD: 'HK$', USD: 'US$', EUR: '€', JPY: 'JP¥', DKK: 'DKK ' }
export function priceLabel(n: number | null, currency: string): string {
  return n === null ? '待补充' : `${symbols[currency] ?? currency}${new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`
}
export function percentLabel(n: number | null): string { return n === null ? '待核实' : new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(n) }
export function dateLabel(value: string): string {
  const m = value.match(/(\d{4})[-/](\d{2})[-/](\d{2})(?: (\d{2}):(\d{2}))?/)
  if (!m) return '报价待补充'
  const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0)))
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'UTC', month: 'numeric', day: 'numeric', ...(m[4] ? { hour: '2-digit', minute: '2-digit', hour12: false } as const : {}) }).format(date)
}
