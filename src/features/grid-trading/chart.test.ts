import { describe, expect, it } from 'vitest'
import { buildChartSeries, nearestChartPoint } from './chart'
import { calculateGrid } from './simulation'
import type { Candle, GridParams, SavedRecord } from './types'

const row: GridParams = { name: 'ETF', code: '510300', date: '2026-01-05', initialPrice: 10, initialAmount: 1_000, step: 1, rebound: 0.1, pullback: 0.1, gridAmount: 100 }
const candles: Candle[] = [
  { date: '2026-01-05', close: 10, high: 10, low: 10 },
  { date: '2026-01-06', close: 9, high: 9.2, low: 9 },
  { date: '2026-01-07', close: 9.5, high: 9.5, low: 9.2 },
]
const result = calculateGrid(row, candles)
const record: SavedRecord = { id: 'chart-1', savedAt: '2026-01-08T00:00:00.000Z', row, result }

describe('grid chart series', () => {
  it('builds all aligned price, position, capital, PnL and next-level series', () => {
    const series = buildChartSeries(record, result)

    expect(series.map(item => item.key)).toEqual(['positionValue', 'capitalUsed', 'pnl', 'current', 'nextBuy', 'nextSell'])
    expect(series.every(item => item.points.map(point => point.date).join(',') === candles.map(candle => candle.date).join(','))).toBe(true)
    expect(series.find(item => item.key === 'current')?.points.map(point => point.value)).toEqual([10, 9, 9.5])
    expect(series.find(item => item.key === 'nextBuy')?.points.every(point => point.value === result.nextBuy)).toBe(true)
  })

  it('returns empty chart series for an empty history', () => {
    const emptyRecord = { ...record, result: calculateGrid(row, []) }

    expect(buildChartSeries(emptyRecord, emptyRecord.result).every(item => item.points.length === 0)).toBe(true)
  })

  it('finds the nearest chart point by date and handles empty/single-point data', () => {
    const points = [
      { date: '2026-01-05', value: 10 },
      { date: '2026-01-06', value: 9 },
      { date: '2026-01-07', value: 9.5 },
    ]

    expect(nearestChartPoint(points, '2026-01-06')).toEqual(points[1])
    expect(nearestChartPoint(points, '2026-01-06T12:00:00Z')).toEqual(points[1])
    expect(nearestChartPoint([points[0]], '2026-01-20')).toEqual(points[0])
    expect(nearestChartPoint([], '2026-01-20')).toBeNull()
  })
})
