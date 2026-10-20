import { describe, expect, it } from 'vitest'
import previous from '../../public/research/adr-2026-10-07/previous.json'
import audit from '../../public/research/adr-2026-10-07/audit.json'
import valuation from '../../public/research/adr-valuation-2026-10-20/valuation.json'
import snapshot from './companyMarketSnapshot.json'
import { adrValuationDetails } from './details/adrValuation'
import { parseDetails } from './detailParser'

const usd = (text?: string) => {
  if (!text || text.includes('[MISSING]')) return null
  const match = text.match(/US\$([\d,.]+)/)
  return match ? Number(match[1].replace(/,/g, '')) : null
}

describe('ADR 2026-10-20 valuation overlay', () => {
  const actual = parseDetails(adrValuationDetails)
  const codes = (previous as { companies: Array<{ code: string }> }).companies.map(({ code }) => code)
  const auditRow = Object.fromEntries((audit as { companies: Array<{ code: string; rating: string; judgment: string }> }).companies.map(r => [r.code, r]))
  const cyclical = new Set(
    (valuation as { companies: Array<{ code: string; cyclical: boolean }> }).companies.filter(c => c.cyclical).map(c => c.code),
  )

  it('covers the 66 reviewed companies and excludes SOFI', () => {
    expect(codes).toHaveLength(66)
    expect(Object.keys(actual).sort()).toEqual(codes.map(c => `adr:${c}`).sort())
    expect(actual['adr:SOFI']).toBeUndefined()
  })

  it('recomputes ratio and rating from the published scenario prices', () => {
    for (const code of codes) {
      const key = `adr:${code}`
      const item = actual[key]
      const scenarios = item.scenarios!
      expect(scenarios.map(s => s.name), key).toEqual(['悲观', '基准', '乐观'])
      expect(scenarios.every(s => s.prob?.includes('[MISSING]')), key).toBe(true)
      expect(item.headline, key).toContain('（估值初稿，未认证）')
      expect(item.headline, key).toContain('不构成买卖建议')
      expect(item.headline, key).toContain(auditRow[code].judgment)
      expect(item.headline!.startsWith(item.rating!), key).toBe(true)
      expect(item.discipline?.invalid, key).toBeTruthy()

      const P = (snapshot as Record<string, { price: number }>)[key].price
      expect(Number(item.ratioNote!.match(/现价 US\$([\d,.]+)/)?.[1].replace(/,/g, '')), key).toBe(P)
      const [bear, base, bull] = scenarios.map(s => usd(s.price))
      const numeric = bear !== null && base !== null && bull !== null
      const loss = scenarios[0].assumption.includes('TTM EPS 为负')
      const pitfalls = (item.pitfalls ?? []).join('\n')
      const flagged = pitfalls.includes('数据不稳定标记') || (numeric && bear! >= P)
      if (!numeric) {
        for (const s of scenarios) expect(s.price, key).toContain('[MISSING]')
        expect(item.ratioNote, key).toContain('[MISSING]')
      } else {
        const ratio = bear! < P && P < base! ? (base! - P) / (P - bear!) : null
        const shown = item.ratioNote!.match(/= (-?[\d.]+):1/)
        // 发布的 ratio 用未四舍五入价格，复算用已四舍五入价格，允许最后一位小数差
        if (ratio !== null) expect(Number(shown?.[1]), key).toBeCloseTo(ratio, 1)
        else expect(shown, key).toBeNull()
      }

      let expected: string
      if (loss) expected = auditRow[code].rating === '等待证据' ? '回避' : '观察'
      else if (!numeric || flagged) expected = '观察'
      else {
        const ratio = bear! < P && P < base! ? (base! - P) / (P - bear!) : null
        if (ratio === null || ratio < 1 || ratio > 8) expected = '观察'
        else expected = cyclical.has(code) ? '观察' : '条件关注' // ratio ≥2 也只有一套倍数方法，封顶条件关注
      }
      expect(item.rating, `${key}: ${item.ratioNote}`).toBe(expected)
    }
    const rated = Object.values(actual).map(c => c.rating)
    expect(rated.every(r => r !== '优先关注')).toBe(true)
  })
})
