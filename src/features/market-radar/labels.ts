import type { RadarDimensionId, RadarHeat, RadarStatus } from './types'
import type { TierId } from '../macro-posture/composite/types'

export const TIER_ORDER_DEFENSE_LEFT: TierId[] = [
  'defense',
  'lean-defense',
  'neutral',
  'lean-offense',
  'offense',
]

export const TIER_LABEL: Record<TierId, string> = {
  offense: '进攻',
  'lean-offense': '偏进攻',
  neutral: '中性',
  'lean-defense': '偏防守',
  defense: '防守',
}

export const DIMENSION_ORDER: RadarDimensionId[] = [
  'liquidity',
  'valuation',
  'crowding',
  'trading',
  'earnings',
]

export const DIMENSION_TITLE: Record<RadarDimensionId, string> = {
  liquidity: '流动性',
  valuation: '估值',
  crowding: '仓位与拥挤度',
  trading: '交易结构',
  earnings: '盈利',
}

export const HEAT_LABEL: Record<RadarHeat, string> = {
  hot: '偏热',
  warm: '略热',
  neutral: '中性',
  cool: '略冷',
  cold: '偏冷',
  na: '不给冷热',
}

/** fresh 不加标记；其余返回短文案 */
export function statusLabel(status: RadarStatus, ageDays: number | null): string | null {
  if (status === 'fresh') return null
  if (status === 'stale') return `滞后 ${ageDays ?? '—'} 天`
  if (status === 'discontinued') return '停更'
  return '零星读数'
}

/** ASCII 负号换成「−」；小数点前的除外 */
export function visibleText(text: string): string {
  return text.replace(/(?<![\d.])-(?=\d)/g, '−')
}

export function formatNum2(value: number | null | undefined, opts?: { signed?: boolean }): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const body = Math.abs(value).toFixed(2)
  if (opts?.signed) {
    if (value === 0) return '0.00'
    return `${value > 0 ? '+' : '−'}${body}`
  }
  return value < 0 ? `−${body}` : body
}

export function formatPct1(value: number | null | undefined, opts?: { signed?: boolean }): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const pct = value * 100
  const body = Math.abs(pct).toFixed(1)
  if (opts?.signed) {
    if (pct === 0) return '0.0%'
    return `${pct > 0 ? '+' : '−'}${body}%`
  }
  return `${pct < 0 ? '−' : ''}${body}%`
}

export function scoreBadge(score: -1 | 0 | 1 | null | undefined): string {
  if (score == null) return '暂无'
  if (score > 0) return `+${score}`
  if (score < 0) return '−1'
  return '0'
}

export function tierLabel(id: TierId | null | undefined): string {
  if (!id) return '证据不足'
  return TIER_LABEL[id]
}
