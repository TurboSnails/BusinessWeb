import { month } from '../macro-posture-market/data.mjs'
import { monthlyReturns } from '../macro-posture/backtest.mjs'
import { monthEnd } from '../macro-posture/panel.mjs'
import { buildCurrent } from './current.mjs'
import { buildFusion } from './fusion.mjs'
import { buildMatrix } from './matrix.mjs'
import { buildRationale } from './rationale.mjs'

export function buildCombinedStrategy({
  signals, panel, today, posture, radar, generatedAt, buyholdFull,
}) {
  const lastComplete = monthEnd(today, -1)
  const returns = monthlyReturns(panel, lastComplete)
  const end = month(lastComplete)
  const matrix = buildMatrix(signals, returns)
  const fusion = buildFusion({ signals, returns, end })
  const current = buildCurrent({ posture, radar, matrix, today })
  const timeline = signals.map(({ d, masters, radar: radarTier, heat, spx }) => ({
    d, macro: masters, radar: radarTier, heat, spx,
  }))
  const rationale = buildRationale({
    matrix,
    fusion,
    buyholdFull: buyholdFull ?? { cagr: 0, maxDd: 0 },
  })
  return {
    generatedAt,
    ruleVersion: 'fusion-v1',
    current,
    rationale,
    matrix,
    fusion,
    timeline,
  }
}
