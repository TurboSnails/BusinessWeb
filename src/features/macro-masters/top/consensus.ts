import type { TopMaster } from '../top'
import type { Lean, MasterTake, Posture } from '../types'

export type LeanCounts = { caution: number; support: number; neutral: number; unknown: number }

export type MasterLeanBias = 'caution' | 'support' | 'mixed' | 'unknown'

export function sortTopMasters(masters: readonly TopMaster[]): TopMaster[] {
  return [...masters].sort((a, b) => a.rank - b.rank)
}

export function leanCounts(take: MasterTake): LeanCounts {
  const counts: LeanCounts = { caution: 0, support: 0, neutral: 0, unknown: 0 }
  for (const item of take.items) counts[item.lean] += 1
  return counts
}

/** rule 档位 → 共识方向；其余用项数比较 */
export function masterLeanBias(take: MasterTake): MasterLeanBias {
  if (take.mode === 'rule') {
    if (take.posture === 'defense') return 'caution'
    if (take.posture === 'offense') return 'support'
    if (take.posture === 'unknown') return 'unknown'
    return 'mixed'
  }
  const { caution, support, unknown } = leanCounts(take)
  if (unknown === take.items.length) return 'unknown'
  if (caution > support) return 'caution'
  if (support > caution) return 'support'
  return 'mixed'
}

export function countsBarText(counts: LeanCounts, temperature = false): string {
  const caution = temperature ? '过热' : '谨慎'
  const support = temperature ? '过冷' : '积极'
  return `${caution} ${counts.caution} · 中性 ${counts.neutral} · ${support} ${counts.support}`
}

/**
 * 从六位 takes 算一句共识，如「6 位中 3 位的读数以偏谨慎为主」。
 * 无 takes 时返回空串。
 */
export function consensusSummary(takes: MasterTake[]): string {
  if (!takes.length) return ''
  const total = takes.length
  let caution = 0
  let support = 0
  for (const take of takes) {
    const bias = masterLeanBias(take)
    if (bias === 'caution') caution += 1
    else if (bias === 'support') support += 1
  }
  if (caution === 0 && support === 0) {
    return `${total} 位的读数没有一边倒，暂看不出统一方向。`
  }
  if (caution === support) {
    return `${total} 位中偏谨慎与偏积极各 ${caution} 位，方向分歧。`
  }
  if (caution > support) {
    return `${total} 位中 ${caution} 位的读数以偏谨慎为主。`
  }
  return `${total} 位中 ${support} 位的读数以偏积极为主。`
}

export const ROLE_DIMENSIONS = ['流动性', '信用', '趋势', '估值', '选股'] as const

export type RoleDivision = { dimension: (typeof ROLE_DIMENSIONS)[number]; names: string[] }

/** 从 role 文案里抠分工（含关键词即算） */
export function roleDivisions(
  masters: readonly TopMaster[],
  nameOf: (slug: TopMaster['slug']) => string,
): RoleDivision[] {
  return ROLE_DIMENSIONS.map(dimension => ({
    dimension,
    names: masters
      .filter(m => m.role.includes(dimension))
      .map(m => nameOf(m.slug)),
  })).filter(row => row.names.length > 0)
}

export function postureLabel(posture: Posture | undefined): string {
  if (posture === 'defense') return '偏防守'
  if (posture === 'offense') return '偏进攻'
  if (posture === 'neutral') return '中性'
  return '数据不足'
}

export function dominantLeanLabel(lean: Lean): string {
  if (lean === 'caution') return '偏谨慎'
  if (lean === 'support') return '偏积极'
  if (lean === 'neutral') return '中性'
  return '缺数据'
}
