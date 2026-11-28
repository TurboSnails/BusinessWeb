import type { ShortInterestData } from '../types'

/** 较上期变化：股数差与百分比；缺任一期返回 null */
export function shortChange(d: Pick<ShortInterestData, 'sharesShort' | 'sharesShortPrior'>): { delta: number; pct: number | null } | null {
  if (d.sharesShort == null || d.sharesShortPrior == null) return null
  const delta = d.sharesShort - d.sharesShortPrior
  return { delta, pct: d.sharesShortPrior > 0 ? (delta / d.sharesShortPrior) * 100 : null }
}

/** 空头占流通股的粗分档：只作阅读提示，不是信号 */
export function shortLevel(pctFloat?: number): string | null {
  if (pctFloat == null) return null
  if (pctFloat >= 0.2) return '很高（两成以上流通股被做空）'
  if (pctFloat >= 0.1) return '偏高（一成以上）'
  if (pctFloat >= 0.05) return '中等'
  return '较低'
}
