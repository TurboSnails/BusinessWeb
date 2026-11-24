import { formatDate } from '../macro-posture/format.mjs'
import { TIERS } from '../macro-posture/model.mjs'
import { classifyHeat, HEAT_LABEL, heatScoreFromScores } from './heat.mjs'
import { findMatrixCell, macroSide } from './matrix.mjs'

const fullDate = d => `${d.slice(0, 4)} 年 ${formatDate(d)}`

export function heatFromRadarCurrent(radarCurrent) {
  const byId = Object.fromEntries((radarCurrent?.dimensions ?? []).map(row => [row.id, row.score]))
  const heatScore = heatScoreFromScores(byId.valuation, byId.crowding)
  return { heatScore, heat: classifyHeat(heatScore) }
}

export function buildHeadline({ macroTier, equityShare, heat, cell }) {
  if (macroTier == null || heat == null || equityShare == null) {
    return '宏观攻守或雷达读数暂缺，暂不给出综合结论。'
  }
  const tierLabel = TIERS.find(row => row.id === macroTier)?.label ?? macroTier
  const n = Math.round(equityShare * 100)
  const action = cell?.action ?? ''
  return `宏观${tierLabel}、市场${HEAT_LABEL[heat]}：股票仓位按自设上限的 ${n}%。${action}`
}

export function buildCurrent({ posture, radar, matrix, today }) {
  const final = posture?.current?.final ?? null
  const macroTier = final?.tier ?? null
  const equityShare = final?.equityShare ?? null
  const side = macroSide(macroTier)
  const radarTier = radar?.tier ?? null
  const { heatScore, heat } = heatFromRadarCurrent(radar)
  const cell = findMatrixCell(matrix, side, heat)
  return {
    macroTier,
    equityShare,
    macroSide: side,
    radarTier,
    heatScore,
    heat,
    headline: buildHeadline({ macroTier, equityShare, heat, cell }),
    cell,
    dates: [
      { label: '宏观攻守', date: fullDate(posture.current.asOf) },
      { label: '市场雷达', date: fullDate(today) },
    ],
  }
}
