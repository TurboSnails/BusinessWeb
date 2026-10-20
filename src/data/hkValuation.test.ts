import { describe, expect, it } from 'vitest'
import previous from '../../public/research/hk-2026-10-07/previous.json'
import { hkValuationDetails } from './details/hkValuation'
import { parseDetails } from './detailParser'

const priceOf = (text?: string) => {
  if (!text || text.includes('[MISSING]')) return null
  const match = text.match(/HK\$([\d,.]+)/)
  return match ? Number(match[1].replace(/,/g, '')) : null
}

describe('HK 2026-10-20 valuation overlay', () => {
  it('covers all 127 prior-review companies and ratings follow the stated rules', () => {
    const actual = parseDetails(hkValuationDetails)
    const expected = (previous as { companies: Array<{ code: string }> }).companies
      .map(({ code }) => `hk:${code}`)
    expect(Object.keys(actual).sort()).toEqual(expected.sort())
    expect(expected).toHaveLength(127)

    for (const key of expected) {
      const item = actual[key]
      expect(item?.rating, key).toBeTruthy()
      expect(item?.scenarios, key).toHaveLength(3)
      expect(item?.headline, key).toContain('估值初稿（未认证）')
      const scenarios = item!.scenarios!
      expect(scenarios.map(({ name }) => name), key).toEqual(['悲观', '基准', '乐观'])
      expect(scenarios.every(({ prob }) => prob?.includes('[MISSING]')), key).toBe(true)
      const cap = item?.discipline?.invalid ?? ''
      const current = priceOf(item?.ratioNote)
      const bear = priceOf(scenarios[0].price)
      const base = priceOf(scenarios[1].price)
      const numeric = current !== null && bear !== null && base !== null && current > bear
      const ratio = numeric ? (base! - current!) / (current! - bear!) : null
      const displayedRatio = item?.ratioNote?.match(/=(-?[\d.]+):1/)
      if (ratio !== null) expect(Number(displayedRatio?.[1]), key).toBe(Number(ratio.toFixed(2)))
      else expect(item?.ratioNote, key).toContain('[MISSING]')

      let expectedRating: string
      if (cap.includes('TTM EPS为负') && !cap.includes('与10-07复核评级冲突')) expectedRating = '回避'
      else if (cap.includes('复核回避')) expectedRating = '回避'
      else if (!numeric || ratio === null || bear! >= current! || ratio > 8
        || cap.includes('经营现金流为负') || cap.includes('周期行业')) expectedRating = '观察'
      else if (ratio >= 2) expectedRating = '条件关注' // one valuation method caps priority
      else if (ratio >= 1) expectedRating = '条件关注'
      else expectedRating = '观察'
      expect(item?.rating, `${key}: ${item?.ratioNote}; ${cap}`).toBe(expectedRating)
    }
  })
})
