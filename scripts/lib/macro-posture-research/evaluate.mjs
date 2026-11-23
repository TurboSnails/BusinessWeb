import {
  PILLARS, TIERS, V21_COMPONENTS, classify, pillarScore, scoreComponent,
} from '../macro-posture/model.mjs'

const tierIndex = id => TIERS.findIndex(t => t.id === id)
const CAP_TIER = 'lean-offense'

/**
 * 在 v2.1 evaluate 之上叠加候选：
 * - component：score≠null 时追加进对应支柱均值（权重不变）
 * - valuationCap：最终档位上限为偏进攻
 * activeIds: 本次启用的候选 id 列表
 */
export function evaluateWithCandidates(frame, readings, activeIds = []) {
  const active = new Set(activeIds)
  const scores = Object.fromEntries(V21_COMPONENTS.map(def => [def.id, scoreComponent(def, frame.components[def.id])]))

  const extrasByPillar = { growth: [], credit: [], liquidity: [], inflation: [] }
  for (const id of ['rateExp', 'permits', 'hours', 'eps', 'sloos']) {
    if (!active.has(id)) continue
    const score = readings[id]?.score
    if (score == null) continue
    scores[id] = score
    const pillar = id === 'rateExp' ? 'liquidity'
      : id === 'sloos' ? 'credit' : 'growth'
    extrasByPillar[pillar].push(score)
  }

  const pillars = Object.fromEntries(PILLARS.map(({ id }) => {
    const base = V21_COMPONENTS.filter(def => def.pillar === id).map(def => scores[def.id])
    return [id, pillarScore([...base, ...extrasByPillar[id]])]
  }))

  const classified = classify(pillars, scores, frame.tactical.below, frame.components.nfciCredit?.delta)
  let final = classified.final

  if (active.has('valuationCap') && readings.valuationCap?.active && final.tier != null) {
    const idx = tierIndex(final.tier)
    const capIdx = tierIndex(CAP_TIER)
    if (idx >= 0 && idx < capIdx) {
      final = { tier: CAP_TIER, equityShare: TIERS[capIdx].equityShare }
    }
  }

  return {
    ...classified,
    final,
    scores,
    pillars,
    driver: final.tier !== classified.final.tier ? 'cap' : classified.driver,
  }
}
