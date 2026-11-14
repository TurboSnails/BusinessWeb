import { describe, expect, it } from 'vitest'
import { addDays, alertProblem, anchorOptions, buildAlertRule, evaluatePriceAlert, manualAnchor, pickObservation, priceObservations, tradingDaysBetween, type PriceObservation } from './priceAlert'
import type { CandidateAlertRule } from './validation'

const TODAY = '2026-11-16' // 周一
const rule = (over: Partial<CandidateAlertRule> = {}): CandidateAlertRule => ({
  kind: 'price-below', threshold: 100, currency: 'CNY', anchor: { type: 'research-bear', value: 100, asOf: '2026-11-13' },
  enabled: true, createdAt: '2026-11-10T00:00:00.000Z', ...over,
})
const obs = (price: number, over: Partial<PriceObservation> = {}): PriceObservation => ({ price, currency: 'CNY', date: '2026-11-13', source: '测试', ...over })

describe('evaluatePriceAlert', () => {
  it('收盘价 ≤ 条件价时触及；高于时不触及', () => {
    expect(evaluatePriceAlert(rule(), [obs(95)], TODAY)).toMatchObject({ status: 'hit', observation: { price: 95 } })
    expect(evaluatePriceAlert(rule(), [obs(101)], TODAY).status).toBe('clear')
  })
  it('相等算触及（两个方向都是）', () => {
    expect(evaluatePriceAlert(rule(), [obs(100)], TODAY).status).toBe('hit')
    expect(evaluatePriceAlert(rule({ kind: 'price-above' }), [obs(100)], TODAY).status).toBe('hit')
    expect(evaluatePriceAlert(rule({ kind: 'price-above' }), [obs(99.99)], TODAY).status).toBe('clear')
  })
  it('行情超过 2 个交易日没更新：不判断，说明原因', () => {
    // 周五 11-13 的价：周二 2 个交易日仍可判断，周三 3 个交易日暂停
    expect(evaluatePriceAlert(rule(), [obs(90)], '2026-11-17').status).toBe('hit')
    expect(evaluatePriceAlert(rule(), [obs(90)], '2026-11-18')).toMatchObject({ status: 'skipped', reason: 'stale', observation: { price: 90 } })
  })
  it('币种不同不比较；没有价格时说明没有价格', () => {
    expect(evaluatePriceAlert(rule(), [obs(1, { currency: 'HKD' })], TODAY)).toEqual({ status: 'skipped', reason: 'currency-mismatch' })
    expect(evaluatePriceAlert(rule(), [], TODAY)).toEqual({ status: 'skipped', reason: 'no-price' })
  })
  it('盘中价、未来日期、非正价格都不用', () => {
    expect(evaluatePriceAlert(rule(), [obs(90, { intraday: true })], TODAY).status).toBe('skipped')
    expect(evaluatePriceAlert(rule(), [obs(90, { date: '2026-11-17' })], TODAY).status).toBe('skipped')
    expect(evaluatePriceAlert(rule(), [obs(0)], TODAY).status).toBe('skipped')
  })
  it('多个来源时用同币种里日期最新的一条', () => {
    const r = evaluatePriceAlert(rule(), [obs(110, { date: '2026-11-12', source: '旧' }), obs(99, { source: '新' }), obs(50, { currency: 'USD', date: '2026-11-16' })], TODAY)
    expect(r).toMatchObject({ status: 'hit', observation: { source: '新' } })
  })
  it('暂停期内不提醒，恢复日当天恢复', () => {
    expect(evaluatePriceAlert(rule({ snoozedUntil: '2026-11-20' }), [obs(90)], TODAY)).toEqual({ status: 'skipped', reason: 'snoozed' })
    expect(evaluatePriceAlert(rule({ snoozedUntil: TODAY }), [obs(90)], TODAY).status).toBe('hit')
  })
  it('已看过：同一行情日不再列出，新的行情日仍触及会再列出', () => {
    const seen = rule({ lastSeenAt: '2026-11-14T03:00:00.000Z' })
    expect(evaluatePriceAlert(seen, [obs(90)], TODAY)).toMatchObject({ status: 'skipped', reason: 'seen' })
    expect(evaluatePriceAlert(seen, [obs(90, { date: '2026-11-16' })], TODAY).status).toBe('hit')
  })
  it('关闭或不合规的提醒不判断', () => {
    expect(evaluatePriceAlert(rule({ enabled: false }), [obs(90)], TODAY)).toEqual({ status: 'skipped', reason: 'disabled' })
    expect(evaluatePriceAlert(rule({ threshold: 5000 }), [obs(90)], TODAY)).toEqual({ status: 'skipped', reason: 'invalid' })
  })
})

describe('辅助函数', () => {
  it('交易日按工作日计；加天数', () => {
    expect(tradingDaysBetween('2026-11-13', '2026-11-15')).toBe(0)
    expect(tradingDaysBetween('2026-11-13', '2026-11-18')).toBe(3)
    expect(addDays('2026-11-28', 7)).toBe('2026-12-05')
  })
  it('预填来源：悲观价、基准价、自动 DCF 买入参考价，都带日期；缺日期的 DCF 不给', () => {
    const options = anchorOptions({
      valuation: { currency: 'CNY', asOf: '2026-11-13', value: { low: 22.5, base: 30, date: null, primaryMethod: 'PE' } },
      autoDcf: { buyBelow: 16.7, currency: 'CNY', credibility: 'low', priceDate: '2026-11-13' },
    })
    expect(options.map(o => [o.type, o.value, o.asOf])).toEqual([['research-bear', 22.5, '2026-11-13'], ['research-base', 30, '2026-11-13'], ['dcf-buy-below', 16.7, '2026-11-13']])
    expect(options[0].researchVersion).toBe('valuation:2026-11-13:PE')
    expect(options[2].note).toContain('可信度低')
    expect(anchorOptions({ autoDcf: { buyBelow: 16.7, currency: 'CNY', credibility: 'm', priceDate: null } })).toEqual([])
    expect(anchorOptions({ valuation: { currency: 'EUR', asOf: '2026-11-13', value: { low: 1, base: 2, date: null, primaryMethod: 'PE' } } })).toEqual([])
  })
  it('价格来源：预填库现价与价格锚点；未核实可交易性的锚点不用', () => {
    const list = priceObservations({ venueCurrency: 'HKD', autoDcf: { current: 10, currency: 'HKD', priceDate: '2026-11-13' }, marketRefresh: { price: 11, priceDate: '2026-11-12', source: 'snap' } })
    expect(list.map(o => [o.price, o.currency, o.date])).toEqual([[10, 'HKD', '2026-11-13'], [11, 'HKD', '2026-11-12']])
    expect(priceObservations({ venueCurrency: 'HKD', marketRefresh: { price: 11, priceDate: '2026-11-12', source: 's', tradability: 'unverified' } })).toEqual([])
    expect(priceObservations({ venueCurrency: 'HKD', autoDcf: { current: 10, currency: 'HKD', priceDate: null } })).toEqual([])
    expect(pickObservation(list, 'HKD', TODAY)?.price).toBe(10)
  })
  it('手动锚点以现价为参照；alertProblem 给出人话原因', () => {
    const anchor = manualAnchor(obs(50), 45, TODAY)
    expect(anchor).toEqual({ type: 'manual', value: 50, asOf: TODAY })
    const ok = buildAlertRule({ kind: 'price-below', threshold: 45, currency: 'CNY', anchor, enabled: true, createdAt: '2026-11-16T00:00:00.000Z' })
    expect(alertProblem(ok)).toBeNull()
    expect(alertProblem({ ...ok, threshold: 600 })).toContain('10 倍')
    expect(alertProblem({ ...ok, threshold: 0 })).toContain('大于 0')
  })
})
