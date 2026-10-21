import { describe, expect, it } from 'vitest'
import { gridSensitivity } from './sensitivity'
import type { Candle, GridParams } from './types'

const row: GridParams = { name: 't', code: '510300', date: '2026-01-05', initialPrice: 10, initialAmount: 1000, step: 1, rebound: 0, pullback: 0, gridAmount: 100 }
const candles: Candle[] = [
  { date: '2026-01-05', close: 10, high: 10, low: 10 },
  { date: '2026-01-06', close: 9, high: 10, low: 8.9 },
  { date: '2026-01-07', close: 10, high: 10.1, low: 9 },
  { date: '2026-01-08', close: 11, high: 11, low: 10 },
]

describe('gridSensitivity', () => {
  it('returns five step scales with the current one flagged', () => {
    const { rows } = gridSensitivity(row, candles)
    expect(rows.map(r => r.scale)).toEqual([0.5, 0.75, 1, 1.5, 2])
    expect(rows.filter(r => r.isCurrent)).toHaveLength(1)
    expect(rows[2].step).toBe(1)
  })
  it('compares against holding the opening amount', () => {
    expect(gridSensitivity(row, candles).buyHoldPnl).toBeCloseTo(100)
  })
  it('does not mutate the input row', () => {
    gridSensitivity(row, candles)
    expect(row.step).toBe(1)
  })
})
