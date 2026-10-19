import test from 'node:test'
import assert from 'node:assert/strict'
import { parseTencentIndexTurnover, computeWeeklyTurnoverRatio, collectHkLiquidity } from './market-cycle-liquidity.mjs'
const rows = () => {
  const out = []
  for (let t = Date.parse('2025-09-01'); t <= Date.parse('2026-10-19'); t += 864e5) {
    const d = new Date(t)
    if (d.getUTCDay() > 0 && d.getUTCDay() < 6 && d.toISOString().slice(0, 10) !== '2026-10-14') out.push({ date: d.toISOString().slice(0, 10), amount: d >= new Date('2026-10-12') ? 200 : 100 })
  }
  return out
}
test('full prior week uses real sessions; prior 52 weeks exclude current week and partial current day', () => {
  const result = computeWeeklyTurnoverRatio(rows(), rows().map(r => r.date), '2026-10-19')
  assert.equal(result.value, 2)
  assert.equal(result.weekStart, '2026-10-12')
  assert.equal(result.observationDate, '2026-10-16')
  assert.equal(result.days, 4)
  assert.equal(result.baselineStart, '2025-10-13')
  assert.equal(result.baselineDays, 260)
})
test('missing a calendar session and incomplete 52 week coverage fail closed', () => {
  assert.throws(() => computeWeeklyTurnoverRatio(rows().filter(r => r.date !== '2026-10-13'), rows().map(r => r.date), '2026-10-19'), /交易日/)
  assert.throws(() => computeWeeklyTurnoverRatio(rows().slice(80), rows().map(r => r.date), '2026-10-19'), /52周/)
})
test('Tencent parser validates index, HKD unit, unique dates and finite positive amounts', () => {
  const data = { code: 0, data: { hkHSTECH: { day: [['2026-10-16', '1', '1', '1', '1', '40120147808']], qt: { hkHSTECH: ['100', '恒生科技指数', 'HSTECH', ...Array(72).fill(''), 'HKD'] } } } }
  // Currency lives in the quote at index 75, verified on the actual response.
  assert.equal(parseTencentIndexTurnover(data, 'HSTECH')[0].amount, 40120147808)
  data.data.hkHSTECH.day[0][5] = ''
  assert.throws(() => parseTencentIndexTurnover(data, 'HSTECH'), /成交额/)
})
test('collector never publishes HSI all-market turnover as index turnover', async () => {
  const facts = await collectHkLiquidity({ now: '2026-10-19T01:00:00.000Z', get: async () => { throw Error('offline') }, issue: () => {} })
  assert.deepEqual(facts, [])
})
test('a full Friday or Saturday report observes the week that just ended; Monday uses last week', () => {
  const input = rows(), dates = input.map(r => r.date)
  assert.equal(computeWeeklyTurnoverRatio(input, dates, '2026-10-16').weekStart, '2026-10-12')
  assert.equal(computeWeeklyTurnoverRatio(input, dates, '2026-10-17').observationDate, '2026-10-16')
  assert.equal(computeWeeklyTurnoverRatio(input, dates, '2026-10-19').weekStart, '2026-10-12')
})
