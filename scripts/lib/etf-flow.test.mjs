import test from 'node:test'
import assert from 'node:assert/strict'
import {
  beijingDayUnix, secToBeijingDate, toYi, parseFlowGateway, parseSinaKline,
  mergeSeries, kpiOf, cumulative,
} from './etf-flow.mjs'

test('beijing day unix roundtrip', () => {
  assert.equal(secToBeijingDate(beijingDayUnix('2024-01-02')), '2024-01-02')
})

test('toYi', () => {
  assert.equal(toYi(1.234e8), 1.23)
  assert.equal(toYi(-5e7), -0.5)
})

test('parseFlowGateway skips bad status', () => {
  assert.deepEqual(parseFlowGateway({ status_code: 1 }), [])
})

test('parseFlowGateway maps time_range', () => {
  const sec = beijingDayUnix('2024-06-03')
  const rows = parseFlowGateway({
    status_code: 0,
    data: { time_range: [sec], data: [{ values: [{ values: [2.5e8] }] }] },
  })
  assert.deepEqual(rows, [{ date: '2024-06-03', yuan: 2.5e8 }])
})

test('mergeSeries aligns broad and index', () => {
  const series = mergeSeries(
    [{ date: '2024-01-02', yuan: 1e8 }, { date: '2024-01-03', yuan: null }, { date: '2024-01-04', yuan: -2e8 }],
    [{ date: '2024-01-02', yuan: 5e7 }],
    new Map([['2024-01-02', 3000], ['2024-01-04', 3010]]),
  )
  assert.deepEqual(series, [
    { date: '2024-01-02', flow_all: 1, flow_broad: 0.5, index: 3000 },
    { date: '2024-01-04', flow_all: -2, flow_broad: null, index: 3010 },
  ])
})

test('kpiOf yesterday and cum60', () => {
  const series = Array.from({ length: 3 }, (_, i) => ({ flow_all: i + 1 }))
  assert.deepEqual(kpiOf(series, 'flow_all'), { yesterday: 3, cum60: 6 })
  assert.equal(cumulative([1, 2, 3, 4], 2), 7)
})

test('parseSinaKline drops non-positive', () => {
  const m = parseSinaKline([{ day: '2024-01-02', close: 100 }, { day: '2024-01-03', close: 0 }])
  assert.equal(m.get('2024-01-02'), 100)
  assert.equal(m.has('2024-01-03'), false)
})
