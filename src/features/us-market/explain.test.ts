import { describe, expect, it } from 'vitest'
import { assess, GUIDES, percentileOf, withinYears } from './explain'
import type { Point, Reading } from './model'

const reading = (history: Point[], extra: Partial<Reading> = {}): Reading => ({ name: 'x', unit: '%', source: '', scope: '', frequency: '月频', history, ...extra })
const monthly = (values: number[]): Point[] => values.map((v, i) => [new Date(Date.UTC(2000, i, 28)).toISOString().slice(0, 10), v])

describe('assess', () => {
  it('never lets a nominal balance lean either way however high its percentile', () => {
    expect(assess(reading(monthly([...Array.from({ length: 40 }, (_, i) => i), 100])), GUIDES.mmfTotal)).toMatchObject({ level: 'very-high', lean: 'neutral' })
  })

  it('prefers the published 10-year average over rule-of-thumb bands for short valuation series', () => {
    expect(assess(reading([['2026-11-13', 18.3]], { unit: '倍', benchmark10y: 19.1 }), GUIDES.spxFactSetFpe)).toMatchObject({ level: 'normal', basis: '10 年均值 19.1 倍' })
    expect(assess(reading([['2026-11-13', 22]], { unit: '倍', benchmark10y: 19.1 }), GUIDES.spxFactSetFpe)).toMatchObject({ level: 'high', lean: 'defense' })
  })

  it('uses the historical percentile when the series spans at least two years', () => {
    const result = assess(reading(monthly([...Array.from({ length: 40 }, (_, i) => i), 100])), GUIDES.marginGdp)
    expect(result).toMatchObject({ level: 'very-high', lean: 'defense', label: '很高' })
    expect(result?.basis).toMatch(/^近 3 年 \d+% 分位$/)
  })

  it('falls back to the published long-run average for short surveys', () => {
    expect(assess(reading([['2026-10-31', 13.31]]), GUIDES.retailCash)).toMatchObject({ level: 'very-low', lean: 'defense', basis: 'AAII 长期平均 22%' })
    expect(assess(reading([['2026-11-18', 42.2]]), GUIDES.retailBear)).toMatchObject({ level: 'very-high', lean: 'offense' })
  })

  it('applies rule-of-thumb bands and marks contrarian readings', () => {
    const vix = assess(reading([['2026-11-18', 35]], { unit: '点' }), GUIDES.vix)
    expect(vix).toMatchObject({ level: 'very-high', lean: 'offense' })
    expect(vix?.sentence.startsWith('（逆向指标）')).toBe(true)
    expect(assess(reading([['2026-11-12', 3.6]]), GUIDES.managerCash)).toMatchObject({ level: 'very-low', lean: 'defense' })
  })

  it('says so when there is nothing to compare with', () => {
    expect(assess(reading([['2026-11-11', 1]]), GUIDES.mmfTotal)).toMatchObject({ level: 'unknown', lean: 'neutral' })
    expect(assess(reading([['2026-11-11', 1]]), GUIDES.naaim)?.level).toBe('very-low')
    expect(assess(reading([['2026-11-11', 1]]), undefined)).toBeUndefined()
  })
})

it('percentileOf counts ties as half', () => {
  expect(percentileOf([1, 2, 3, 4], 4)).toBe(88)
  expect(percentileOf([1, 2, 3, 4], 0)).toBe(0)
})

it('withinYears keeps the trailing window', () => {
  const history = monthly(Array.from({ length: 36 }, (_, i) => i))
  expect(withinYears(history, 1).length).toBe(13)
  expect(withinYears(history, null)).toBe(history)
})

it('不把 M1 口径调整前的历史纳入新口径分位', () => {
  const legacy = monthly(Array.from({ length: 48 }, (_, i) => i)).filter(([date]) => date < '2025-01-01')
  const guide = { ...GUIDES.marginGdp, comparableSince: '2025-01-01' }
  const result = assess(reading([...legacy, ['2026-10-31', 5]]), guide)
  expect(result?.percentile).toBeUndefined()
})
