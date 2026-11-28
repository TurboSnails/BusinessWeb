import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { consensusOf, currentMonth, ratingSlices } from './ratingStats'
import type { RecommendationMonth } from '../types'

/** 接口任务 fixtures：至少一组真实样本驱动评级计算 */
describe('fixtures 样本', () => {
  it('yahoo quoteSummary 评级趋势可算主流评级', () => {
    const raw = JSON.parse(
      readFileSync(resolve('src/features/stock-lookup/fixtures/yahoo-quoteSummary-MRVL.json'), 'utf8'),
    ) as {
      recommendationTrend?: {
        trend?: Array<{
          period: string
          strongBuy: number
          buy: number
          hold: number
          sell: number
          strongSell: number
        }>
      }
    }
    const trend = raw.recommendationTrend?.trend ?? []
    expect(trend.length).toBeGreaterThan(0)
    const months: RecommendationMonth[] = trend.map(t => ({
      period: t.period,
      strongBuy: t.strongBuy,
      buy: t.buy,
      hold: t.hold,
      sell: t.sell,
      strongSell: t.strongSell,
    }))
    const month = currentMonth(months)
    expect(month).toBeTruthy()
    const slices = ratingSlices(month)
    expect(slices.reduce((s, x) => s + x.count, 0)).toBeGreaterThan(0)
    expect(consensusOf(month)?.total).toBeGreaterThan(0)
  })
})
