import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { completedSessions, computeAdvDec, computeBackfill, computeBreadth, computeHighsLows, computeMatchedComparison, mergeBreadth, parseNdxMembers, parseSpxMembers, parseYahooAdjusted } from './us-market-breadth.mjs'

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

const quoteTime = iso => Date.parse(iso) / 1000
function currentChart(symbol, priorOpen, start, end, lastTrade = end) {
  return { chart: { result: [{
    meta: {
      symbol, exchangeTimezoneName: 'America/New_York', regularMarketTime: quoteTime(lastTrade),
      currentTradingPeriod: { regular: { start: quoteTime(start), end: quoteTime(end) } },
    },
    timestamp: [priorOpen, start].map(quoteTime),
    indicators: { quote: [{ close: [100, 101] }], adjclose: [{ adjclose: [99, 100] }] },
  }] } }
}

test('excludes intraday breadth in winter and summer until the confirmed close and settlement buffer', () => {
  for (const [previous, today, open, close] of [
    ['2026-01-05', '2026-01-06', '14:30', '21'],
    ['2026-07-06', '2026-07-07', '13:30', '20'],
  ]) {
    const body = currentChart('^GSPC', `${previous}T${open}:00Z`, `${today}T${open}:00Z`, `${today}T${close}:00:00Z`)
    assert.deepEqual(completedSessions(body, '^GSPC', new Date(`${today}T19:59:59Z`)), [previous])
    assert.deepEqual(completedSessions(body, '^GSPC', new Date(`${today}T${close}:14:59Z`)), [previous])
    assert.deepEqual(completedSessions(body, '^GSPC', new Date(`${today}T${close}:15:00Z`)), [previous, today])
    assert.deepEqual(parseYahooAdjusted(body, '^GSPC', new Date(`${today}T19:59:59Z`)), [[previous, 99]])
  }
})

test('waits until 16:00 New York time on an early close and excludes stale post-close prices', () => {
  const priorOpen = '2026-11-25T14:30:00Z'
  const open = '2026-11-27T14:30:00Z'
  const close = '2026-11-27T18:00:00Z'
  const fresh = currentChart('AAPL', priorOpen, open, close)
  const stale = currentChart('AAPL', priorOpen, open, close, '2026-11-27T17:59:00Z')
  const beforeFour = new Date('2026-11-27T20:59:59Z')
  const afterFour = new Date('2026-11-27T21:00:00Z')
  assert.deepEqual(completedSessions(fresh, 'AAPL', beforeFour), ['2026-11-25'])
  assert.deepEqual(completedSessions(fresh, 'AAPL', afterFour), ['2026-11-25', '2026-11-27'])
  assert.deepEqual(completedSessions(stale, 'AAPL', afterFour), ['2026-11-25'])
  assert.deepEqual(parseYahooAdjusted(stale, 'AAPL', afterFour), [['2026-11-25', 99]])
  assert.deepEqual(parseYahooAdjusted(fresh, 'AAPL', afterFour), [['2026-11-25', 99], ['2026-11-27', 100]])
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

test('backfills daily breadth only where a full 200-session window exists', () => {
  const long = Array.from({ length: 210 }, (_, i) => day(i))
  const rising = new Map(members.map(symbol => [symbol, long.map((date, i) => [date, 10 + i])]))
  const points = computeBackfill(members, rising, long, 50)
  assert.equal(points.length, 11)
  assert.deepEqual(points[0], [long[199], 100])
  assert.deepEqual(points.at(-1), [long[209], 100])
})

test('counts closing 52-week highs, lows and one-day advancers over covered members', () => {
  const year = Array.from({ length: 252 }, (_, i) => day(i))
  const series = (last, previous = 10) => year.map((date, i) => [date, i === 251 ? last : i === 250 ? previous : 10 + (i % 3)])
  const prices = new Map([['UP', series(20)], ['DOWN', series(5)], ['FLAT', series(11, 11)]])
  assert.deepEqual(computeHighsLows(['UP', 'DOWN', 'FLAT'], prices, year), {
    date: year.at(-1), covered: 3, newHighs: 1, newLows: 1, advancers: 1, decliners: 1, netHighsPct: 0,
  })
  assert.equal(computeHighsLows(['UP', 'MISSING'], prices, year), null)
})

test('counts daily advances, declines, unchanged and coverage using both adjacent closes', () => {
  const dates = ['2026-01-02', '2026-01-05', '2026-01-06']
  const series = (...prices) => dates.map((date, i) => [date, prices[i]])
  const prices = new Map([
    ['UP', series(10, 12, 8)],
    ['DOWN', series(12, 10, 11)],
    ['FLAT', series(10, 10, 10)],
    ['MISSING_TODAY', series(9, null, 10)],
    ['MISSING_PREVIOUS', series(undefined, 8, 9)],
    ['INVALID', series(0, 4, Infinity)],
  ])
  assert.deepEqual(computeAdvDec(['UP', 'DOWN', 'FLAT'], prices, dates), [
    ['2026-01-05', 1, 1, 1, 3],
    ['2026-01-06', 1, 1, 1, 3],
  ])
  assert.deepEqual(computeAdvDec(['MISSING_TODAY'], prices, dates), [])
  assert.deepEqual(computeAdvDec(['MISSING_PREVIOUS'], prices, dates), [['2026-01-06', 1, 0, 0, 1]])
  assert.deepEqual(computeAdvDec(['INVALID'], prices, dates), [])
})

test('backfills 250 daily points and matches latest highs/lows advances and declines despite older gaps', () => {
  const dates = Array.from({ length: 502 }, (_, i) => day(i))
  const prices = new Map(members.map((symbol, i) => [
    symbol,
    dates.flatMap((date, j) => i === 19 && j === 299 ? [] : [[date, j === 501 && i >= 10 ? 11 : 10]]),
  ]))
  const points = computeAdvDec(members, prices, dates)
  const highsLows = computeHighsLows(members, prices, dates)
  assert.equal(points.length, 250)
  assert.equal(points[0][0], dates[252])
  assert.deepEqual(points.at(-1), [dates.at(-1), 10, 0, 10, 20])
  assert.deepEqual(points.at(-1).slice(0, 3), [highsLows.date, highsLows.advancers, highsLows.decliners])
  assert.equal(highsLows.covered, 19)
})

test('daily backfill skips 90% coverage and retains dates with exactly 95% coverage', () => {
  const dates = ['2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07']
  const prices = new Map(members.map((symbol, i) => [
    symbol,
    dates.slice(i === 18 ? 1 : i === 19 ? 2 : 0).map(date => [date, 10]),
  ]))
  assert.deepEqual(computeAdvDec(members, prices, dates), [
    ['2026-01-06', 0, 0, 19, 19],
    ['2026-01-07', 0, 0, 20, 20],
  ])
})

test('breadth publishes in its own concurrency group', () => {
  const workflow = readFileSync(new URL('../.github/workflows/us-market-breadth.yml', import.meta.url), 'utf8')
  assert.match(workflow, /^concurrency:\s*\n +group: us-market-breadth\s*\n +cancel-in-progress: false$/m)
})

test('breadth deploys Pages after a changed publish or a manual dispatch', () => {
  const workflow = readFileSync(new URL('../.github/workflows/us-market-breadth.yml', import.meta.url), 'utf8')
  assert.match(workflow, /- name: Deploy GitHub Pages\s*\n +if: steps\.commit\.outputs\.changed == 'true' \|\| github\.event_name == 'workflow_dispatch'/)
})
