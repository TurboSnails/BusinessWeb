import { describe, expect, it } from 'vitest'
import type { RecommendationMonth } from '../types'
import { consensusOf, currentMonth, ratingSlices } from './ratingStats'

const trend: RecommendationMonth[] = [
  { period: '-1m', strongBuy: 2, buy: 10, hold: 5, sell: 1, strongSell: 0 },
  { period: '0m', strongBuy: 8, buy: 15, hold: 6, sell: 1, strongSell: 0 },
]

describe('ratingStats', () => {
  it('取当月 0m', () => {
    expect(currentMonth(trend)?.period).toBe('0m')
  })

  it('切片去掉 0 家', () => {
    const slices = ratingSlices(currentMonth(trend))
    expect(slices.map(s => s.key)).toEqual(['strongBuy', 'buy', 'hold', 'sell'])
  })

  it('主流评级取家数最多', () => {
    const c = consensusOf(currentMonth(trend))
    expect(c?.label).toBe('买入')
    expect(c?.total).toBe(30)
  })
})
