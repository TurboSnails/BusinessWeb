import { describe, expect, it } from 'vitest'
import type { CompanyValuation } from '../../features/company-valuation/model'
import {
  formatPremiumVsBase,
  parseScenarioPrice,
  pickScenarioTriple,
  premiumToBase,
  priceLabelAlign,
  resolveHeaderScenarioBundle,
  scenarioExtent,
} from './scenarioPrices'

describe('parseScenarioPrice', () => {
  it('accepts a single currency-prefixed number', () => {
    expect(parseScenarioPrice('$215')).toEqual({ kind: 'point', value: 215, display: '$215' })
    expect(parseScenarioPrice('HK$380')).toEqual({ kind: 'point', value: 380, display: 'HK$380' })
    expect(parseScenarioPrice('11.5 元')).toEqual({ kind: 'point', value: 11.5, display: '11.5 元' })
  })

  it('does not invent a midpoint from date-like parentheses', () => {
    const raw = 'HK$420.6（10-07）'
    expect(parseScenarioPrice(raw)).toEqual({ kind: 'none', display: raw })
  })

  it('does not average dual-listing quotes', () => {
    const raw = 'A 111.99 元 / H HK$60.9'
    expect(parseScenarioPrice(raw)).toEqual({ kind: 'none', display: raw })
  })

  it('keeps explicit ranges as ranges, never midpoint', () => {
    expect(parseScenarioPrice('25–30')).toEqual({
      kind: 'range',
      low: 25,
      high: 30,
      display: '25–30',
    })
    expect(parseScenarioPrice('25-30')).toEqual({
      kind: 'range',
      low: 25,
      high: 30,
      display: '25-30',
    })
    expect(parseScenarioPrice('25~30')).toEqual({
      kind: 'range',
      low: 25,
      high: 30,
      display: '25~30',
    })
    expect(parseScenarioPrice('25 至 30')).toEqual({
      kind: 'range',
      low: 25,
      high: 30,
      display: '25 至 30',
    })
    // 绝不产出 27.5 这类页面上没有的数字
    expect(parseScenarioPrice('25–30')).not.toMatchObject({ kind: 'point', value: 27.5 })
  })

  it('rejects MISSING / empty', () => {
    expect(parseScenarioPrice('MISSING')).toEqual({ kind: 'none', display: 'MISSING' })
    expect(parseScenarioPrice('')).toEqual({ kind: 'none', display: '未取得' })
  })
})

describe('pickScenarioTriple / premium', () => {
  it('maps bear/base/bull and computes premium only for base points', () => {
    const t = pickScenarioTriple([
      { name: '悲观', price: '$180' },
      { name: '基准', price: '$215' },
      { name: '乐观', price: '$260' },
    ])
    expect(t.base?.parsed).toEqual({ kind: 'point', value: 215, display: '$215' })
    expect(premiumToBase(232.5, 215)).toBeCloseTo(8.139, 2)
    expect(formatPremiumVsBase(8.1)).toBe('现价高于基准情景价 8.1%')
    expect(formatPremiumVsBase(-31)).toBe('现价低于基准情景价 31.0%')
  })

  it('scenarioExtent exposes range bounds for the bar', () => {
    expect(scenarioExtent({ kind: 'range', low: 25, high: 30, display: '25–30' })).toEqual({
      low: 25,
      high: 30,
    })
    expect(scenarioExtent({ kind: 'none', display: 'x' })).toBeUndefined()
  })
})

describe('priceLabelAlign', () => {
  it('maps edge bands to start/end', () => {
    expect(priceLabelAlign(0)).toBe('start')
    expect(priceLabelAlign(14.9)).toBe('start')
    expect(priceLabelAlign(15)).toBe('center')
    expect(priceLabelAlign(50)).toBe('center')
    expect(priceLabelAlign(85)).toBe('center')
    expect(priceLabelAlign(85.1)).toBe('end')
    expect(priceLabelAlign(100)).toBe('end')
  })
})

describe('resolveHeaderScenarioBundle', () => {
  const research = [
    { name: '悲观', price: '$215' },
    { name: '基准', price: '$317' },
    { name: '乐观', price: '$400' },
  ]
  const valuation = {
    key: 'us:AAPL',
    market: 'us',
    code: 'AAPL',
    name: '苹果',
    currency: 'USD',
    asOf: '2026-09-21',
    status: 'conditional',
    price: { value: 342.56, date: '2026-11-20', currency: 'USD', source: 's1' },
    value: { low: 280, base: 348.9, high: 420, kind: 'undated', date: null, primaryMethod: 'PE' },
    methods: [],
    quality: 'q',
    pricing: 'p',
    expectations: 'e',
    risk: 'r',
    assumptions: [],
    missing: [],
    sources: [],
    review: { mode: 'programmatic', by: 'x', note: 'n' },
  } as unknown as CompanyValuation

  it('valuation path: premium and bar share baseValue 348.9', () => {
    const b = resolveHeaderScenarioBundle({
      valuation,
      price: 342.56,
      currency: 'USD',
      scenarios: research,
      marketRefresh: {
        price: 342.56,
        priceDate: '2026-11-20',
        currency: 'USD',
        checkedAt: '2026-11-21',
        source: 't',
        originalAsOf: '2026-09-18',
        tradability: 'no-known-restriction',
      },
    })
    expect(b.source).toBe('valuation')
    expect(b.baseValue).toBe(348.9)
    expect(b.triple.base?.parsed).toMatchObject({ kind: 'point', value: 348.9 })
    expect(b.premiumLabel).toBe('现价低于基准情景价 1.8%')
    expect(b.title).toContain('综合估值')
  })

  it('research fallback when no valuation: shared base 317', () => {
    const b = resolveHeaderScenarioBundle({
      price: 342.56,
      scenarios: research,
      researchAsOf: '2026-09-18',
    })
    expect(b.source).toBe('research')
    expect(b.baseValue).toBe(317)
    expect(b.triple.base?.parsed).toMatchObject({ kind: 'point', value: 317 })
    expect(b.premiumLabel).toBe(formatPremiumVsBase(premiumToBase(342.56, 317)))
    expect(b.title).toContain('原研究情景')
  })
})
