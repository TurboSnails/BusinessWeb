import { describe, expect, it } from 'vitest'
import { fiscalLabel, fmtEps, nextEarningsView, shortFiscalLabel, surpriseBars, trendPoints } from './earnings'
import { fmtSignedShares, fmtUsdAmount } from './format'
import { filterInsider, insiderPriceText, insiderTypeCounts, roleLabel } from './insider'
import { daysToExpiry, exceedsOpenInterest, latestTradeDay, putCallRatio, roughPremium, volOiRatio } from './options'
import { shortChange, shortLevel } from './shortInterest'
import type { InsiderTransaction } from '../types'

describe('内部人交易', () => {
  it('职务翻译：单个、组合、认不出保留原文', () => {
    expect(roleLabel('Chief Executive Officer')).toBe('首席执行官')
    expect(roleLabel('Officer and Director')).toBe('高管、董事')
    expect(roleLabel('Beneficial Owner (10% or more)')).toBe('持股 10% 以上股东')
    expect(roleLabel('Chief Scientist')).toBe('Chief Scientist')
    expect(roleLabel('')).toBe('—')
  })

  it('价格区间与筛选', () => {
    expect(insiderPriceText({ priceLow: 146.03, priceHigh: 157.49 })).toBe('$146.03–157.49')
    expect(insiderPriceText({ priceLow: 10, priceHigh: 10 })).toBe('$10.00')
    expect(insiderPriceText({})).toBe('—')
    const rows = (['buy', 'sell', 'award', 'gift', 'sell'] as const).map((type, i): InsiderTransaction => ({ date: `2026-11-0${i + 1}`, name: 'x', role: 'Director', type, shares: 1 }))
    expect(filterInsider(rows, 'trade')).toHaveLength(3)
    expect(filterInsider(rows, 'sell')).toHaveLength(2)
    expect(insiderTypeCounts(rows)).toMatchObject({ buy: 1, sell: 2, award: 1, gift: 1, exercise: 0 })
  })
})

describe('做空', () => {
  it('较上期变化与分档', () => {
    expect(shortChange({ sharesShort: 159086108, sharesShortPrior: 170799103 })?.delta).toBe(-11712995)
    expect(shortChange({ sharesShort: 159086108, sharesShortPrior: 170799103 })?.pct).toBeCloseTo(-6.858, 2)
    expect(shortChange({ sharesShort: 1 })).toBeNull()
    expect(shortLevel(0.35)).toMatch(/很高/)
    expect(shortLevel(0.013)).toBe('较低')
    expect(shortLevel(undefined)).toBeNull()
  })
})

describe('财报预期', () => {
  it('财报日：未来 / 已过 / 预估区间', () => {
    expect(nextEarningsView({ nextEarnings: { dates: ['2026-12-01'], estimated: false } }, '2026-11-28')).toEqual({ status: 'upcoming', text: '2026-12-01', estimated: false })
    expect(nextEarningsView({ nextEarnings: { dates: ['2026-11-17'], estimated: false } }, '2026-11-28')).toEqual({ status: 'past', text: '2026-11-17' })
    expect(nextEarningsView({ nextEarnings: { dates: ['2027-02-24', '2027-03-02'], estimated: true } }, '2026-11-28')).toMatchObject({ text: '2027-02-24 至 2027-03-02', estimated: true })
    expect(nextEarningsView({}, '2026-11-28')).toEqual({ status: 'none' })
  })

  it('预期修正百分比', () => {
    const pts = trendPoints({ current: 2.87956, d7: 2.7613, d90: 2.70696 })
    expect(pts.map(p => p.label)).toEqual(['7 天前', '90 天前'])
    expect(pts[0].changePct).toBeCloseTo(4.282, 2)
    expect(trendPoints({ d30: 1 })[0].changePct).toBeNull()
  })

  it('财季标签与每股收益格式', () => {
    expect(fiscalLabel('3Q2027')).toBe('2027 财年第 3 季')
    expect(fiscalLabel(undefined, '2026-10-31')).toBe('截至 2026-10-31')
    expect(shortFiscalLabel('3Q2027')).toBe('2027财年Q3')
    expect(fmtEps(-0.04)).toBe('-$0.040')
    expect(fmtEps(2.68)).toBe('$2.68')
    expect(fmtEps(undefined)).toBe('—')
  })

  it('柱图：正负值共用零轴', () => {
    const { bars, zeroY } = surpriseBars([
      { key: 'a', label: 'a', actual: -0.05, estimate: -0.04 },
      { key: 'b', label: 'b', actual: 0.1, estimate: 0.05 },
    ], 0, 100)
    expect(zeroY).toBeCloseTo((0.1 / 0.15) * 100, 5)
    expect(bars[0].actualY).toBeCloseTo(zeroY, 5)
    expect(bars[0].beat).toBe(false)
    expect(bars[1].beat).toBe(true)
    expect(bars[1].actualY + bars[1].actualH).toBeCloseTo(zeroY, 5)
  })
})

describe('期权', () => {
  it('比值、权利金与标注', () => {
    expect(putCallRatio(50, 100)).toBe(0.5)
    expect(putCallRatio(50, 0)).toBeNull()
    expect(roughPremium({ volume: 1110, lastPrice: 0.15 })).toBeCloseTo(16650, 6)
    expect(roughPremium({ volume: 10 })).toBeNull()
    expect(volOiRatio({ volume: 770, openInterest: 195 })).toBeCloseTo(3.949, 2)
    expect(volOiRatio({ volume: 770, openInterest: 0 })).toBeNull()
    expect(exceedsOpenInterest({ volume: 770, openInterest: 0 })).toBe(true)
    expect(exceedsOpenInterest({ volume: 10, openInterest: 100 })).toBe(false)
  })

  it('最近成交日按美东，到期天数', () => {
    expect(latestTradeDay([{ lastTrade: '2026-11-25T20:25:49.000Z' }, { lastTrade: '2026-11-27T17:46:21.000Z' }, {}])).toBe('2026-11-27')
    expect(latestTradeDay([{ lastTrade: '2026-11-28T02:00:00.000Z' }])).toBe('2026-11-27')
    expect(daysToExpiry('2026-12-04', '2026-11-28')).toBe(6)
  })
})

describe('数字格式', () => {
  it('美元金额与带符号股数', () => {
    expect(fmtUsdAmount(4542781)).toBe('454.3万美元')
    expect(fmtUsdAmount(130826074070)).toBe('1308.26亿美元')
    expect(fmtUsdAmount(950)).toBe('$950')
    expect(fmtSignedShares(-3615082)).toBe('-361.5万')
    expect(fmtSignedShares(0)).toBe('0')
  })
})
