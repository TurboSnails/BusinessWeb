import type { RecommendationMonth } from '../types'

export type RatingKey = 'strongBuy' | 'buy' | 'hold' | 'sell' | 'strongSell'

export const RATING_KEYS: readonly RatingKey[] = ['strongBuy', 'buy', 'hold', 'sell', 'strongSell']

export const RATING_LABEL: Record<RatingKey, string> = {
  strongBuy: '强买',
  buy: '买入',
  hold: '持有',
  sell: '卖出',
  strongSell: '强卖',
}

export const RATING_COLOR: Record<RatingKey, string> = {
  strongBuy: '#1B7F4A',
  buy: '#3F9A62',
  hold: '#8A7A3A',
  sell: '#C4503F',
  strongSell: '#8E3426',
}

export interface RatingSlice {
  key: RatingKey
  label: string
  count: number
  color: string
}

export interface Consensus {
  key: RatingKey
  label: string
  total: number
}

/** Yahoo 口径：0m 为当月；找不到则取第一项 */
export function currentMonth(trend: RecommendationMonth[]): RecommendationMonth | null {
  if (!trend.length) return null
  return trend.find(m => m.period === '0m') ?? trend[0]
}

export function ratingSlices(month: RecommendationMonth | null): RatingSlice[] {
  if (!month) return []
  return RATING_KEYS.map(key => ({
    key,
    label: RATING_LABEL[key],
    count: month[key] ?? 0,
    color: RATING_COLOR[key],
  })).filter(s => s.count > 0)
}

/** 家数最多的档为「主流评级」；并列取更偏多一侧（强买→强卖） */
export function consensusOf(month: RecommendationMonth | null): Consensus | null {
  if (!month) return null
  let best: RatingKey = 'hold'
  let bestCount = -1
  for (const key of RATING_KEYS) {
    const n = month[key] ?? 0
    if (n > bestCount) {
      bestCount = n
      best = key
    }
  }
  const total = RATING_KEYS.reduce((s, k) => s + (month[k] ?? 0), 0)
  if (total <= 0) return null
  return { key: best, label: RATING_LABEL[best], total }
}

export function periodLabel(period: string): string {
  if (period === '0m') return '当月'
  const m = period.match(/^-(\d+)m$/)
  if (m) return `${m[1]}月前`
  return period
}

/** 环形图路径：返回 SVG arc path 列表 */
export function donutArcs(
  slices: RatingSlice[],
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
): { key: RatingKey; d: string; color: string }[] {
  const total = slices.reduce((s, x) => s + x.count, 0)
  if (total <= 0) return []
  let angle = -Math.PI / 2
  return slices.map(slice => {
    const sweep = (slice.count / total) * Math.PI * 2
    const a0 = angle
    const a1 = angle + sweep
    angle = a1
    return { key: slice.key, color: slice.color, d: annularSector(cx, cy, rInner, rOuter, a0, a1) }
  })
}

function annularSector(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0
  const p = (r: number, a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const
  const [x0, y0] = p(r1, a0)
  const [x1, y1] = p(r1, a1)
  const [x2, y2] = p(r0, a1)
  const [x3, y3] = p(r0, a0)
  return [
    `M${x0},${y0}`,
    `A${r1},${r1} 0 ${large} 1 ${x1},${y1}`,
    `L${x2},${y2}`,
    `A${r0},${r0} 0 ${large} 0 ${x3},${y3}`,
    'Z',
  ].join('')
}
