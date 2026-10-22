import { expect, it } from 'vitest'
import { compareValuation, parseValuationDocument, matchValuationFilter, VALUATION_FILTERS } from './model'
import { exampleValuation } from './testFixture'

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
  expect(VALUATION_FILTERS.map(f => f.id)).toEqual(['all', 'below', 'within', 'above', 'future', 'waiting'])
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
