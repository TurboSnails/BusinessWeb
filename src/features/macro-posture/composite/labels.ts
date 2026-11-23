import type { ComponentScore, TierId, Tone } from './types'
import type { MasterTake, Posture } from '../../macro-masters/types'

export type DriverId = 'macro' | 'breaker' | 'tactical' | 'repair' | 'insufficient'
export type ConfidenceLevel = 'high' | 'medium' | 'low'

export const DRIVER_LABEL: Record<DriverId, string> = {
  macro: '宏观',
  breaker: '熔断',
  tactical: '战术修正',
  repair: '修复确认',
  insufficient: '证据不足',
}

export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  high: '高',
  medium: '中',
  low: '低',
}

export const TIER_ORDER_DEFENSE_LEFT: TierId[] = [
  'defense',
  'lean-defense',
  'neutral',
  'lean-offense',
  'offense',
]

/** 进攻侧 / 防守侧 / 中性，用于与大师 posture 对照 */
export function tierSide(tier: TierId): 'offense' | 'defense' | 'neutral' {
  if (tier === 'offense' || tier === 'lean-offense') return 'offense'
  if (tier === 'defense' || tier === 'lean-defense') return 'defense'
  return 'neutral'
}

export type AlignKind = '同向' | '反向' | '无法对照' | '只能逐项对照'

export function alignMaster(siteTier: TierId | null, take: MasterTake): AlignKind {
  if (take.mode !== 'rule') return '只能逐项对照'
  if (!siteTier || !take.posture || take.posture === 'unknown') return '无法对照'
  return tierSide(siteTier) === (take.posture as Exclude<Posture, 'unknown'>) ? '同向' : '反向'
}

export function formatSharePct(share: number | null | undefined): string | null {
  if (share == null || !Number.isFinite(share)) return null
  return `${(share * 100).toFixed(1).replace(/\.0$/, '')}%`
}

/** 回测等比例：统一一位小数，可附带 % */
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

export function formatNum1(value: number | null | undefined, opts?: { signed?: boolean }): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const body = Math.abs(value).toFixed(1)
  if (opts?.signed) {
    if (value === 0) return '0.0'
    return `${value > 0 ? '+' : '−'}${body}`
  }
  return `${value < 0 ? '−' : ''}${body}`
}

export function formatNum2(value: number | null | undefined, opts?: { signed?: boolean }): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const body = Math.abs(value).toFixed(2)
  if (opts?.signed) {
    if (value === 0) return '0.00'
    return `${value > 0 ? '+' : '−'}${body}`
  }
  return value.toFixed(2)
}

/** 置信度徽标：优先用支柱方向 counts；缺字段时只写档位 */
export function confidenceBadgeText(confidence: {
  level: ConfidenceLevel
  agree: number
  total: number
  counts?: { positive: number; neutral: number; negative: number } | null
}): string {
  const level = `置信度${CONFIDENCE_LABEL[confidence.level]}`
  const counts = confidence.counts
  if (!counts) return level
  return `${level} · 支柱 ${counts.positive} 正 · ${counts.neutral} 中性 · ${counts.negative} 负`
}

/** 综合分 = 各支柱贡献之和：+0.18 + 0.10 + 0.00 + 0.00 = +0.28 */
export function formatContributionSum(values: readonly (number | null | undefined)[]): string | null {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v))
  if (nums.length === 0) return null
  const parts = nums.map((v, i) => {
    const body = Math.abs(v).toFixed(2)
    if (i === 0) {
      if (v === 0) return '+0.00'
      return `${v > 0 ? '+' : '−'}${body}`
    }
    return v < 0 ? `− ${body}` : `+ ${body}`
  })
  const total = nums.reduce((sum, v) => sum + v, 0)
  return `${parts.join(' ')} = ${formatNum2(total, { signed: true })}`
}

export function formatPricePoint(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 1 })
}

/** failedSources：ASCII id 用 outer 映射成中文名，映射不到则丢弃；已是中文名的原样保留 */
export function resolveFailedSourceLabels(
  failed: readonly string[],
  outer: readonly { id: string; name: string }[],
): string[] {
  const byId = new Map(outer.map(item => [item.id, item.name]))
  const out: string[] = []
  for (const raw of failed) {
    if (!raw) continue
    if (/^[\x00-\x7F]+$/.test(raw)) {
      const mapped = byId.get(raw)
      if (mapped) out.push(mapped)
      continue
    }
    out.push(raw)
  }
  return out
}

/** 单项转差 12 个月回报差：≤ −1% 有预警力，> +1% 反向，其余无明显 */
export function singleSpreadLabel(spread12: number | null | undefined): string {
  if (spread12 == null || !Number.isFinite(spread12)) return '—'
  if (spread12 <= -0.01) return '有预警力'
  if (spread12 > 0.01) return '反向'
  return '无明显预警力'
}

export function scoreBadge(score: ComponentScore | null | undefined): string {
  if (score == null) return '暂无'
  if (score > 0) return `+${score}`
  return String(score)
}

export function toneClass(tone: Tone): string {
  return `is-${tone}`
}

export function scoreTone(score: number | null | undefined): Tone {
  if (score == null) return 'unknown'
  if (score > 0.15) return 'positive'
  if (score < -0.25) return 'caution'
  if (score < -0.75) return 'negative'
  return 'neutral'
}
