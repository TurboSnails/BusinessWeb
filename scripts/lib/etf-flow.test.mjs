import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runSnapshot } from '../etf-flow-snapshot.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  beijingDayUnix, secToBeijingDate, toYi, parseFlowGateway, parseSinaKline,
  mergeSeries, kpiOf,
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
    { date: '2024-01-03', flow_all: null, flow_broad: null, index: null },
    { date: '2024-01-04', flow_all: -2, flow_broad: null, index: 3010 },
  ])
})

test('60-record window requires complete coverage and counts genuine zeroes', () => {
  const series = Array.from({ length: 61 }, () => ({ flow_broad: 1 }))
  series[0].flow_broad = 100
  series[60].flow_broad = 0
  assert.deepEqual(kpiOf(series, 'flow_broad'), { yesterday: 0, cum60: 59, covered: 60 })
  series[60].flow_broad = null
  assert.deepEqual(kpiOf(series, 'flow_broad'), { yesterday: null, cum60: null, covered: 59 })
  assert.deepEqual(kpiOf(series.slice(1, 4), 'flow_broad'), { yesterday: 1, cum60: null, covered: 3 })
})

test('gateway retains unknown amounts separately from zero', () => {
  const sec = beijingDayUnix('2024-01-02')
  const amounts = [' ', false, 'N/A', null, '0', '-100']
  const rows = parseFlowGateway({ status_code: 0, data: {
    time_range: amounts.map((_, i) => sec + i * 86400), data: [{ values: [{ values: amounts }] }],
  } })
  assert.deepEqual(rows.map(r => r.yuan), [null, null, null, null, 0, -100])
})

test('parseSinaKline drops non-positive', () => {
  const m = parseSinaKline([{ day: '2024-01-02', close: 100 }, { day: '2024-01-03', close: 0 }])
  assert.equal(m.get('2024-01-02'), 100)
  assert.equal(m.has('2024-01-03'), false)
})

test('partial refresh preserves archived fields only on matching dates', async t => {
  const root = await mkdtemp(join(tmpdir(), 'etf-flow-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const dates = ['2024-01-02', '2024-01-03', '2024-01-04']
  await runSnapshot({ root, flowFn: async () => dates.slice(0, 2).map(date => ({ date, yuan: 1e8 })),
    indexFn: async () => new Map([[dates[1], 3000]]) })
  await runSnapshot({ root, flowFn: async ({ index }) => index.startsWith('broad') ? [] : dates.slice(1).map(date => ({ date, yuan: 2e8 })),
    indexFn: async () => { throw new Error('offline') } })
  const { series } = JSON.parse(await readFile(join(root, 'public/data/etf-flow.json'), 'utf8'))
  assert.deepEqual(series, [
    { date: dates[0], flow_all: 1, flow_broad: 1, index: null },
    { date: dates[1], flow_all: 2, flow_broad: 1, index: 3000 },
    { date: dates[2], flow_all: 2, flow_broad: null, index: null },
  ])
})
