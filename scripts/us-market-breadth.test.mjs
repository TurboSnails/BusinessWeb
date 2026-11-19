import { test } from 'node:test'
import assert from 'node:assert/strict'
import { completedSessions, computeBreadth, computeMatchedComparison, mergeBreadth, parseNdxMembers, parseSpxMembers, parseYahooAdjusted } from './us-market-breadth.mjs'

const day = i => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)
const sessions = Array.from({ length: 200 }, (_, i) => day(i))
const members = Array.from({ length: 20 }, (_, i) => `M${i}`)
const bars = (last = 20) => sessions.map((date, i) => [date, i === 199 ? last : 10])

test('same-session coverage rejects missing days and keeps an explicit denominator', () => {
  const quotes = new Map(members.map((symbol, i) => [symbol, i === 19 ? bars().slice(0, -1) : bars(i < 10 ? 20 : 5)]))
  const breadth = computeBreadth(members, quotes, sessions)
  assert.deepEqual(breadth, { date: day(199), covered: 19, total: 20, above50: 52.63, above200: 52.63 })
  quotes.set('M18', bars().filter(([date]) => date !== day(5)))
  assert.equal(computeBreadth(members, quotes, sessions), null)
})

test('parses quoted GICS rows and rejects a duplicate symbol', () => {
  const header = 'Symbol,Security,GICS Sector,Date added\n'
  const row = 'BRK.B,"Berkshire, Inc",Financials,2010-02-16'
  assert.deepEqual(parseSpxMembers(header + row), [{ symbol: 'BRK-B', sector: 'sector-xlf', added: '2010-02-16' }])
  assert.throws(() => parseSpxMembers(header + row + '\n' + row), /Duplicate/)
})

test('uses adjusted closes and validates provider identity', () => {
  const body = { chart: { result: [{ meta: { symbol: 'AAPL', exchangeTimezoneName: 'America/New_York' }, timestamp: [Date.parse('2026-01-05T14:30:00Z') / 1000], indicators: { adjclose: [{ adjclose: [250] }], quote: [{ close: [270] }] } }] } }
  assert.deepEqual(parseYahooAdjusted(body, 'AAPL'), [['2026-01-05', 250]])
  assert.throws(() => parseYahooAdjusted(body, 'MSFT'), /identity/)
  assert.throws(() => parseYahooAdjusted({ chart: { result: [{ ...body.chart.result[0], indicators: {} }] } }, 'AAPL'), /adjusted/)
})

test('drops a current US session until provider-reported close with a settlement buffer', () => {
  const time = iso => Date.parse(iso) / 1000
  const body = { chart: { result: [{
    meta: { symbol: '^GSPC', exchangeTimezoneName: 'America/New_York', currentTradingPeriod: { regular: { start: time('2026-11-27T14:30:00Z'), end: time('2026-11-27T18:00:00Z') } } },
    timestamp: ['2026-11-25T14:30:00Z', '2026-11-27T14:30:00Z'].map(time),
    indicators: { quote: [{ close: [100, 101] }] },
  }] } }
  assert.deepEqual(completedSessions(body, '^GSPC', new Date('2026-11-27T18:10:00Z')), ['2026-11-25'])
  assert.deepEqual(completedSessions(body, '^GSPC', new Date('2026-11-27T18:15:00Z')), ['2026-11-25', '2026-11-27'])
})

test('requires a complete Nasdaq provider response and retains dual share classes', () => {
  const aaData = [{ Symbol: 'GOOG' }, { Symbol: 'GOOGL' }, ...Array.from({ length: 99 }, (_, i) => ({ Symbol: `S${i}` }))]
  const parsed = parseNdxMembers({ aaData, iTotalRecords: 101, iTotalDisplayRecords: 101 })
  assert.equal(parsed.length, 101)
  assert.deepEqual(parsed.slice(0, 2), [{ symbol: 'GOOG' }, { symbol: 'GOOGL' }])
  assert.throws(() => parseNdxMembers({ aaData, iTotalRecords: 102, iTotalDisplayRecords: 101 }), /Nasdaq/)
})

test('protects last good observations and resets incompatible accumulated history', () => {
  const base = { date: day(198), above200: 60, above50: 60, total: 20, covered: 19, source: 'https://example.test', scope: 'Sample', universe: 'aaa' }
  const next = { ...base, date: day(199), above200: 65 }
  const first = mergeBreadth({}, { spx: base }).spx
  assert.deepEqual(mergeBreadth({ spx: first }, {}).spx.history, [[day(198), 60]])
  assert.deepEqual(mergeBreadth({ spx: first }, { spx: next }).spx.history, [[day(198), 60], [day(199), 65]])
  assert.deepEqual(mergeBreadth({ spx: first }, { spx: { ...next, universe: 'bbb' } }).spx.history, [[day(199), 65]])
  assert.equal(mergeBreadth({ spx: next }, { spx: base }).spx.date, day(199))
})

test('compares exactly five sessions using one matched, verifiably preexisting current pool', () => {
  const dates = Array.from({ length: 205 }, (_, i) => day(i))
  const known = Array.from({ length: 39 }, (_, i) => `K${i}`)
  const constituents = [
    ...known.map(symbol => ({ symbol, added: day(0) })),
    { symbol: 'NEW', added: day(201) },
    { symbol: 'UNKNOWN', added: null },
  ]
  const quotes = new Map(known.map((symbol, i) => [symbol, dates.flatMap((date, j) => i === 19 && j === 0 ? [] : [[date, j === 199 ? 20 : j === 204 ? 5 : 10]])]))
  const comparison = computeMatchedComparison(constituents, quotes, dates)
  assert.equal(comparison.date, day(199))
  assert.equal(comparison.covered, 38)
  assert.equal(comparison.total, 40)
  assert.equal(comparison.above200, 100)
  assert.equal(comparison.currentAbove200, 0)
  assert.equal(comparison.basis, 'matched-current-membership')
  quotes.delete('K18')
  assert.equal(computeMatchedComparison(constituents, quotes, dates), null)
})
