import { average } from '../macro-posture/model.mjs'

/** 估值与拥挤度维度分的等权平均；只有一个有值用那个，都没有为 null。 */
export function heatScoreFromScores(valuation, crowding) {
  return average([valuation, crowding].filter(score => Number.isFinite(score)))
}

export function classifyHeat(heatScore) {
  if (heatScore == null) return null
  if (heatScore <= -0.5) return 'hot'
  if (heatScore >= 0.5) return 'cold'
  return 'mid'
}

export const HEAT_LABEL = { cold: '偏冷', mid: '居中', hot: '偏热' }
