import { calculateGrid } from './simulation'
import type { Candle, GridParams } from './types'

export type SensitivityRow = {
  scale: number
  step: number
  pnl: number
  maxCapital: number
  trades: number
  /** 总盈亏 / 最大资金占用，占用为 0 时为 0 */
  returnOnCapital: number
  isCurrent: boolean
}

export type Sensitivity = { rows: SensitivityRow[]; buyHoldPnl: number }

export const SENSITIVITY_SCALES = [0.5, 0.75, 1, 1.5, 2] as const

/** 在同一段真实日线上只改步长，看结果对格距有多敏感；其他参数与当前回测一致 */
export function gridSensitivity(row: GridParams, candles: Candle[]): Sensitivity {
  const rows = SENSITIVITY_SCALES.map(scale => {
    const step = Number((row.step * scale).toFixed(4))
    const result = calculateGrid({ ...row, step }, candles)
    return {
      scale, step, pnl: result.pnl, maxCapital: result.maxCapital, trades: result.buys + result.sells,
      returnOnCapital: result.maxCapital > 0 ? result.pnl / result.maxCapital : 0,
      isCurrent: scale === 1,
    }
  })
  const last = candles[candles.length - 1]
  const buyHoldPnl = last && row.initialPrice > 0 ? row.initialAmount * (last.close / row.initialPrice - 1) : 0
  return { rows, buyHoldPnl }
}
