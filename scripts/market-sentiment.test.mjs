import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeBreadth, computeTurnover, computeLimitUp, computeDrawdown, computeWeight } from '../server/market-sentiment.mjs'

const stock = (code, pct, extra = {}) => ({ code, name: code, pct, ...extra })
test('breadth buckets are exclusive at boundaries; suspension is excluded from flat and median', () => {
  const values = [10, 7.01, 7, 5, 3, 0.01, 0, -0.01, -3, -5, -7, -7.01, -10, null]
  const rows = values.map((pct, i) => stock(String(i).padStart(6, '0'), pct))
  const result = computeBreadth({ rows, limitUp: [rows[0]], limitDown: [rows[12]] })
  assert.deepEqual(result.buckets, { limitUp: 1, above7: 1, from5To7: 1, from3To5: 1, from0To3: 2, flat: 1, from0ToMinus3: 2, fromMinus3ToMinus5: 1, fromMinus5ToMinus7: 1, belowMinus7: 1, limitDown: 1 })
  assert.deepEqual([result.up, result.down, result.flat, result.suspended, result.medianPct], [6, 6, 1, 1, 0])
})
test('turnover requires closed history for the actual preceding sessions, not arbitrary available rows', () => {
  const args = { amount: 200, dataDate: '2026-10-21', previousDates: ['2026-10-20', '2026-10-19', '2026-10-16', '2026-10-15', '2026-10-14'] }
  assert.deepEqual(computeTurnover(args), { status: 'ready', amount: 200, vsPreviousPct: null, vsFiveDayAveragePct: null })
  const history = args.previousDates.map(dataDate => ({ dataDate, session: 'closed', metrics: { volume: 100 } }))
  assert.equal(computeTurnover({ ...args, history }).vsFiveDayAveragePct, 100)
  assert.equal(computeTurnover({ ...args, history: history.slice(1) }).vsPreviousPct, null)
  assert.equal(computeTurnover({ ...args, history: history.slice(0, 1) }).vsPreviousPct, 100)
  assert.equal(computeTurnover({ ...args, history: history.map(row => ({ ...row, session: 'intraday' })) }).vsPreviousPct, null)
})
test('empty yesterday pool yields null rates and zero counts', () => {
  assert.deepEqual(computeLimitUp({ yesterday: [], quotes: [], current: [], broken: [] }), { status: 'ready', yesterdayCount: 0, averagePct: null, redRate: null, reLimitUpCount: 0, brokenCount: 0, sealRate: null })
})
test('yesterday performance joins by code, never averages missing quotes as zero', () => {
  const yesterday = [stock('600000', null), stock('000001', null)]
  assert.throws(() => computeLimitUp({ yesterday, quotes: [stock('600000', 10)], current: [], broken: [] }))
  const result = computeLimitUp({ yesterday, quotes: [stock('600000', 10), stock('000001', -6)], current: [yesterday[0]], broken: [yesterday[1]] })
  assert.deepEqual([result.averagePct, result.redRate, result.reLimitUpCount, result.brokenCount, result.sealRate], [2, 50, 1, 1, 50])
})
test('drawdown is strictly below threshold, sorted, capped at 20; unknown boards stay unknown', () => {
  const yesterday = Array.from({ length: 25 }, (_, i) => stock(String(i).padStart(6, '0'), null, { boards: 2 }))
  const quotes = yesterday.map((row, i) => ({ ...row, pct: -5 - i }))
  const result = computeDrawdown({ yesterday, quotes })
  assert.equal(result.count, 24)
  assert.equal(result.consecutiveCount, 24)
  assert.equal(result.stocks.length, 20)
  assert.equal(result.stocks[0].pct, -29)
  assert.equal(computeDrawdown({ yesterday: [stock('000001', null)], quotes: [stock('000001', -6)] }).consecutiveCount, null)
})
test('blue-chip average compares to breadth median and rejects partial quote batches', () => {
  const rows = [stock('600000', 2), stock('000001', -1)]
  const args = { indices: [{ symbol: 'sh000300', change: 1 }], blueChips: rows, expectedSymbols: ['600000', '000001'], medianPct: 0 }
  assert.equal(computeWeight(args).strength, 'strong')
  assert.equal(computeWeight({ ...args, medianPct: null }).strength, null)
  assert.throws(() => computeWeight({ ...args, blueChips: rows.slice(0, 1) }))
})
