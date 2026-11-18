import { GROUPS, type GroupFilter, type ValuationStatus } from '../jixing-table/model'

export type ThresholdRow = {
  code: string
  name: string
  group: Exclude<GroupFilter, 'all'>
  basis: 'pe' | 'pb'
  basisLabel: string
  current: number
  lowLine: number
  highLine: number
  pct: number | null
  distLowPct: number | null
  alreadyLow: boolean
  distHighPct: number | null
  alreadyHigh: boolean
  status: ValuationStatus | null
  sampleCount: number
  sampleSince: string | null
  date: string
}

export type JixingThresholdData = {
  version: 1
  asOf: string
  generatedAt: string
  sourceAsOf: string
  rows: ThresholdRow[]
  method: { lines: string; dist: string; status: string }
  sources: { label: string; url: string }[]
}

export { GROUPS }
export type { GroupFilter }

export const METHOD = {
  lines: '低估线 / 高估线 = 近 10 年窗口内判定指标（PE 或行业 PB）样本的 30% / 70% 分位对应值，与估值表参考线同源。分位线随历史滚动每天重算，不是固定常数。',
  dist: '距低估线 % = 低估线 / 当前 − 1；当前已 ≤ 低估线则显示「已低估」。距高估线 % = 高估线 / 当前 − 1；当前已 ≥ 高估线则显示「已高估」。',
  status: '估值状态与估值表一致：百分位 < 30% 低估，> 70% 高估，其余正常。本站自定，与官方无关。',
}

const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const positive = (v: unknown): v is number => finite(v) && v > 0
const date = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

function isRow(v: unknown, asOf: string): v is ThresholdRow {
  if (!record(v) || v.date !== asOf || typeof v.code !== 'string' || typeof v.name !== 'string') return false
  if (!GROUPS.some(g => g.id !== 'all' && g.id === v.group)) return false
  if (v.basis !== 'pe' && v.basis !== 'pb') return false
  if (!positive(v.current) || !positive(v.lowLine) || !positive(v.highLine) || v.lowLine > v.highLine) return false
  if (!(v.pct === null || (finite(v.pct) && v.pct >= 0 && v.pct <= 1))) return false
  if (typeof v.alreadyLow !== 'boolean' || typeof v.alreadyHigh !== 'boolean') return false
  if (!(v.distLowPct === null || finite(v.distLowPct)) || !(v.distHighPct === null || finite(v.distHighPct))) return false
  if (!(v.status === null || v.status === 'low' || v.status === 'normal' || v.status === 'high')) return false
  if (!Number.isInteger(v.sampleCount) || (v.sampleCount as number) < 0) return false
  if (!(v.sampleSince === null || date(v.sampleSince))) return false
  return typeof v.basisLabel === 'string'
}

export function asJixingThreshold(v: unknown): JixingThresholdData | null {
  if (!record(v) || v.version !== 1 || !date(v.asOf) || typeof v.generatedAt !== 'string') return null
  if (!Array.isArray(v.rows) || !v.rows.length) return null
  const rows = v.rows.filter((r): r is ThresholdRow => isRow(r, v.asOf as string))
  if (rows.length !== v.rows.length) return null
  if (!record(v.method) || typeof v.method.lines !== 'string') return null
  return v as unknown as JixingThresholdData
}

export const fmtPct = (v: number | null): string => v === null ? '—' : `${(v * 100).toFixed(1)}%`
export const fmtNum = (v: number | null): string => v === null ? '—' : v.toFixed(2)
export const fmtDist = (pct: number | null, already: boolean, alreadyLabel: string): string =>
  already ? alreadyLabel : (pct === null ? '—' : `${(pct * 100).toFixed(1)}%`)
