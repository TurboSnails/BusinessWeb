import { describe, expect, it } from 'vitest'
import { compareValuation, parseValuationDocument, matchValuationFilter, valuationReliability, VALUATION_FILTERS } from './model'
import { exampleValuation, fixtureApple, fixtureNvidia, fixtureQihoo360 } from './testFixture'

it('以基准价/现价−1对比，并使用有日期的更新报价', () => {
  const record = exampleValuation()
  const result = compareValuation(record, { price: 80, priceDate: '2026-10-22', currency: 'USD' })
  expect(compareValuation(record, { price: 80, priceDate: '2026-10-22', currency: 'HKD' }).current).toBe(100)
  expect(compareValuation(record, { price: 80, priceDate: '2026-10-22' }).current).toBe(100)
  expect(result.current).toBe(80)
  expect(result.baseGap).toBe(.25)
  expect(result.position).toBe('below')
  expect(result.priceDate).toBe('2026-10-22')
  expect(compareValuation(record, { price: 200, priceDate: '2026-10-19', currency: 'USD' }).current).toBe(100)
  expect(compareValuation(record, { price: 0, priceDate: '2026-10-22', currency: 'USD' }).current).toBe(100)
})

it('不把未来/未定期限情景说成今日低估，缺项不返回零价', () => {
  const future = exampleValuation()
  future.value = { ...future.value!, kind: 'future', date: '2028-10-22' }
  expect(compareValuation(future).label).toBe('未来情景')
  expect(matchValuationFilter('below', future)).toBe(false)
  expect(matchValuationFilter('future', future)).toBe(true)
  future.value = { ...future.value!, kind: 'undated', date: null }
  expect(matchValuationFilter('undated', future)).toBe(true)
  expect(matchValuationFilter('within', future)).toBe(true) // undated joins position filters
  future.value = null
  future.status = 'insufficient'
  expect(compareValuation(future).baseGap).toBeNull()
  expect(matchValuationFilter('waiting', future)).toBe(true)
})

it('解析记录时拒绝错币种、倒置价格和主锚与结果不一致', () => {
  const record = exampleValuation()
  const doc = (r: unknown) => ({ schemaVersion: 1, asOf: '2026-10-22', records: [r] })
  expect(parseValuationDocument(doc(record), 'us').size).toBe(1)
  expect(parseValuationDocument(doc(record), 'cn').size).toBe(0)
  expect(parseValuationDocument(doc({ ...record, price: { ...record.price, currency: 'HKD' } }), 'us').size).toBe(0)
  expect(parseValuationDocument(doc({ ...record, value: { ...record.value, low: 200 } }), 'us').size).toBe(0)
  expect(parseValuationDocument(doc({ ...record, value: { ...record.value, base: 110 } }), 'us').size).toBe(0)
})

it('位置筛选同时接受present与未定期限，future单列且不进位置筛选，边界属区间内', () => {
  const r = exampleValuation()
  const at = (price: number) => ({ price, priceDate: '2026-10-22', currency: 'USD' }) as never
  r.value = { ...r.value!, kind: 'undated', date: null }
  expect(matchValuationFilter('below', r, at(89.99))).toBe(true)
  expect(matchValuationFilter('within', r, at(90))).toBe(true)
  expect(matchValuationFilter('within', r, at(120))).toBe(true)
  expect(matchValuationFilter('above', r, at(120.01))).toBe(true)
  expect(matchValuationFilter('within', r)).toBe(true)
  r.value = { ...r.value!, kind: 'future', date: '2028-10-22' }
  for (const f of ['below', 'within', 'above'] as const) expect(matchValuationFilter(f, r, at(50))).toBe(false)
  expect(matchValuationFilter('future', r)).toBe(true)
  expect(VALUATION_FILTERS.map(f => f.id)).toEqual(['all', 'below', 'within', 'above', 'future', 'unreliable', 'waiting'])
})

it('筛选不被tradability=unverified的刷新价绕过，零base不产生位置', () => {
  const r = exampleValuation()
  r.value = { ...r.value!, kind: 'undated', date: null }
  expect(matchValuationFilter('below', r, { price: 50, priceDate: '2026-10-22', currency: 'USD', tradability: 'unverified' } as never)).toBe(false)
  r.value = { low: 0, base: 0, high: 0, kind: 'undated', date: null, primaryMethod: 'PE' }
  expect(compareValuation(r).position).toBeNull()
  expect(matchValuationFilter('above', r)).toBe(false)
})

it('记录自带的非正/非有限现价不产生比较或位置', () => {
  for (const value of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const r = exampleValuation()
    r.price = { ...r.price, value }
    const c = compareValuation(r)
    expect([c.current, c.baseGap, c.position]).toEqual([null, null, null])
  }
})

describe('valuationReliability', () => {
  it('三种原因：pe / eps / gap；真实夹具三六零与英伟达不可信，苹果可信', () => {
    const qihoo = valuationReliability(fixtureQihoo360())
    expect(qihoo.ok).toBe(false)
    if (!qihoo.ok) {
      expect(qihoo.reasons.map(r => r.code)).toEqual(['pe', 'eps', 'gap'])
      expect(qihoo.reasons[0].text).toMatch(/市盈率 .* 倍|前瞻盈利不为正/)
      expect(qihoo.reasons[1].short).toBe('盈利预测跨度过大')
      expect(qihoo.reasons[2].short).toBe('现价与基准相差过大')
    }
    const nvda = valuationReliability(fixtureNvidia())
    expect(nvda.ok).toBe(false)
    if (!nvda.ok) {
      expect(nvda.reasons.map(r => r.code)).toEqual(['gap'])
      expect(nvda.reasons[0].text).toMatch(/现价只有基准的 \d+%/)
    }
    expect(valuationReliability(fixtureApple()).ok).toBe(true)
  })

  it('边界：恰好 2 倍、恰好 60 倍、恰好 3 倍不标记', () => {
    const at2 = exampleValuation()
    at2.price.value = 200
    at2.value = { ...at2.value!, low: 80, base: 100, high: 120 }
    at2.methods[0] = { ...at2.methods[0], inputs: { epsForward: 10, epsTrailingTwelveMonths: 10 } }
    expect(valuationReliability(at2).ok).toBe(true)

    const at60 = exampleValuation()
    at60.price.value = 60
    at60.value = { ...at60.value!, low: 50, base: 55, high: 70 }
    at60.methods[0] = { ...at60.methods[0], inputs: { epsForward: 1, epsTrailingTwelveMonths: 1 } }
    expect(valuationReliability(at60).ok).toBe(true)

    const at3 = exampleValuation()
    at3.price.value = 100
    at3.value = { ...at3.value!, low: 90, base: 100, high: 120 }
    at3.methods[0] = { ...at3.methods[0], inputs: { epsForward: 3, epsTrailingTwelveMonths: 1 } }
    expect(valuationReliability(at3).ok).toBe(true)

    const overPe = exampleValuation()
    overPe.price.value = 61
    overPe.value = { ...overPe.value!, low: 50, base: 55, high: 70 }
    overPe.methods[0] = { ...overPe.methods[0], inputs: { epsForward: 1, epsTrailingTwelveMonths: 1 } }
    expect(valuationReliability(overPe).ok).toBe(false)
  })

  it('未来情景与 insufficient 不参与；无现价返回 ok', () => {
    const future = exampleValuation()
    future.value = { ...future.value!, kind: 'future', date: '2028-10-22' }
    future.price.value = 1
    future.methods[0] = { ...future.methods[0], inputs: { epsForward: 0.01, epsTrailingTwelveMonths: 1 } }
    expect(valuationReliability(future).ok).toBe(true)

    const waiting = exampleValuation()
    waiting.status = 'insufficient'
    waiting.value = null
    expect(valuationReliability(waiting).ok).toBe(true)

    const noPrice = exampleValuation()
    noPrice.price = { ...noPrice.price, value: null, date: null }
    expect(valuationReliability(noPrice).ok).toBe(true)
  })

  it('筛选：unreliable 命中不可信；below/within/above 排除不可信', () => {
    const r = fixtureNvidia()
    expect(matchValuationFilter('unreliable', r)).toBe(true)
    expect(matchValuationFilter('below', r)).toBe(false)
    expect(matchValuationFilter('within', r)).toBe(false)
    expect(matchValuationFilter('above', r)).toBe(false)
    expect(matchValuationFilter('unreliable', fixtureApple())).toBe(false)
    expect(matchValuationFilter('within', fixtureApple())).toBe(true)
  })
})
