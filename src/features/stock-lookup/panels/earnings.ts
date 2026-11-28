import type { EarningsData, EarningsEstimate, EstimatePeriod } from '../types'

export const PERIOD_LABEL: Record<EstimatePeriod, string> = {
  '0q': '本季',
  '+1q': '下季',
  '0y': '本财年',
  '+1y': '下财年',
}

export type NextEarningsView =
  | { status: 'upcoming'; text: string; estimated: boolean }
  | { status: 'past'; text: string }
  | { status: 'none' }

/** 财报日：有未来日期 → 下次；只有过去日期 → 最近一次，下次未公布 */
export function nextEarningsView(data: Pick<EarningsData, 'nextEarnings'>, today: string): NextEarningsView {
  const dates = (data.nextEarnings?.dates ?? []).slice().sort()
  if (!dates.length) return { status: 'none' }
  const future = dates.filter(d => d >= today)
  if (future.length) {
    const estimated = data.nextEarnings?.estimated === true
    const text = estimated && future.length > 1 ? `${future[0]} 至 ${future[future.length - 1]}` : future[0]
    return { status: 'upcoming', text, estimated }
  }
  return { status: 'past', text: dates[dates.length - 1] }
}

export interface TrendPoint {
  label: string
  value: number
  /** 现在相对当时的变化 % */
  changePct: number | null
}

const TREND_KEYS = [['d7', '7 天前'], ['d30', '30 天前'], ['d60', '60 天前'], ['d90', '90 天前']] as const

export function trendPoints(t: EarningsEstimate['epsTrend']): TrendPoint[] {
  const out: TrendPoint[] = []
  for (const [k, label] of TREND_KEYS) {
    const v = t[k]
    if (v == null) continue
    out.push({ label, value: v, changePct: t.current != null && v !== 0 ? ((t.current - v) / Math.abs(v)) * 100 : null })
  }
  return out
}

/** 3Q2027 → 2027 财年第 3 季 */
export function fiscalLabel(fq?: string, periodEnd?: string): string {
  const m = fq ? /^([1-4])Q(\d{4})$/.exec(fq) : null
  if (m) return `${m[2]} 财年第 ${m[1]} 季`
  return periodEnd ? `截至 ${periodEnd}` : '—'
}

/** 图表横轴用的短标签：3Q2027 → 2027财年Q3 */
export function shortFiscalLabel(fq?: string, periodEnd?: string): string {
  const m = fq ? /^([1-4])Q(\d{4})$/.exec(fq) : null
  if (m) return `${m[2]}财年Q${m[1]}`
  return periodEnd ? periodEnd.slice(0, 7) : '—'
}

export interface BarGeom {
  key: string
  label: string
  actualY: number
  actualH: number
  estimateY: number
  estimateH: number
  actual?: number
  estimate?: number
  beat: boolean | null
}

/** 实际 vs 预期柱：支持负值，零轴随数据位置移动 */
export function surpriseBars(
  rows: { key: string; label: string; actual?: number; estimate?: number }[],
  plotTop: number,
  plotH: number,
): { bars: BarGeom[]; zeroY: number } {
  const vals = rows.flatMap(r => [r.actual, r.estimate]).filter((v): v is number => v != null)
  const max = Math.max(0, ...vals)
  const min = Math.min(0, ...vals)
  const span = max - min || 1
  const yOf = (v: number): number => plotTop + ((max - v) / span) * plotH
  const zeroY = yOf(0)
  const seg = (v?: number): [number, number] => {
    if (v == null) return [zeroY, 0]
    const y = yOf(v)
    return [Math.min(y, zeroY), Math.abs(zeroY - y)]
  }
  const bars = rows.map(r => {
    const [actualY, actualH] = seg(r.actual)
    const [estimateY, estimateH] = seg(r.estimate)
    return {
      key: r.key,
      label: r.label,
      actualY,
      actualH,
      estimateY,
      estimateH,
      actual: r.actual,
      estimate: r.estimate,
      beat: r.actual != null && r.estimate != null ? r.actual >= r.estimate : null,
    }
  })
  return { bars, zeroY }
}

/** 每股收益：小于 1 美元保留 3 位，避免 -0.04 显示成 -0.0 */
export function fmtEps(n?: number): string {
  if (n == null) return '—'
  const digits = Math.abs(n) < 1 ? 3 : 2
  return `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(digits)}`
}
