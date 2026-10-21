import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectSinaMarket } from '../server/market-sentiment-sources.mjs'
import { buildDailyAnalysis } from '../server/daily-analysis.mjs'
import { canReplaceSnapshot } from '../src/features/daily-analysis/quality.mjs'
import { BLUE_CHIP_SYMBOLS, WEIGHT_INDEX_SYMBOLS } from '../server/market-sentiment.mjs'

import { rawStock, fixtureFetch } from './fixtures/market-sentiment.mjs'

test('paged market collection retries failed pages, caps concurrency at four and validates final short page', async () => {
  let active = 0, peak = 0, retried = false
  const get = async url => {
    const u = new URL(url)
    if (u.pathname.includes('StockCount')) return '9'
    const page = Number(u.searchParams.get('page'))
    active++; peak = Math.max(peak, active)
    await new Promise(resolve => setTimeout(resolve, 1))
    active--
    if (page === 2 && !retried) { retried = true; throw new Error('temporary') }
    return Array.from({ length: page === 5 ? 1 : 2 }, (_, i) => rawStock((page - 1) * 2 + i))
  }
  const result = await collectSinaMarket({ get, minTotal: 1, pageSize: 2 })
  assert.equal(result.rows.length, 9)
  assert.ok(retried)
  assert.ok(peak <= 4)
})
test('short, duplicate, invalid, or drifting totals never produce complete breadth', async () => {
  for (const mode of ['short', 'duplicate', 'abnormal', 'drift', 'malformed']) {
    let counts = 0
    const get = async url => {
      if (url.includes('StockCount')) return mode === 'abnormal' ? '0' : mode === 'drift' && counts++ ? '5' : '4'
      if (mode === 'malformed') return { error: 'denied' }
      return mode === 'short' ? [rawStock(0)] : [rawStock(0), rawStock(1)]
    }
    const result = await collectSinaMarket({ get, minTotal: 1, pageSize: 2 })
    assert.equal(result.status, 'incomplete', mode)
    assert.equal(result.rows, undefined)
  }
})
test('fixtures build all blocks, record source times and keep old snapshots replaceable', async () => {
  const result = await buildDailyAnalysis({ fetchImpl: fixtureFetch(), now: new Date('2026-10-21T08:00:00Z'), history: [] })
  for (const key of ['breadth', 'turnover', 'limitUp', 'drawdown', 'weight']) assert.equal(result.sentiment[key].status, 'ready', key)
  assert.equal(result.sentiment.asOf, '2026-10-21')
  assert.equal(result.sentiment.breadth.total, 4000)
  assert.equal(result.sentiment.drawdown.consecutiveCount, 1)
  assert.equal(result.sentiment.turnover.amount, 200)
  assert.equal(result.sentiment.weight.blueChips.length, BLUE_CHIP_SYMBOLS.length)
  assert.equal(result.sentiment.weight.indices.length, WEIGHT_INDEX_SYMBOLS.length)
  assert.ok(result.sentiment.sources.every(row => row.fetchedAt === result.fetchedAt))
  const { sentiment: _ignored, ...old } = result
  old.fetchedAt = '2026-10-21T07:59:00Z'
  assert.equal(canReplaceSnapshot(old, result), true)
  assert.equal(canReplaceSnapshot(result, { ...old, fetchedAt: '2026-10-21T09:00:00Z' }), true)
  assert.equal(result.sources.length, 7)
})
test('failed breadth and broken pool leave turnover, drawdown and blue-chip prices usable', async () => {
  const result = await buildDailyAnalysis({ fetchImpl: fixtureFetch({ failBreadth: true, failBroken: true }), now: new Date('2026-10-21T08:00:00Z'), history: [] })
  assert.equal(result.sentiment.breadth.status, 'error')
  assert.equal(result.sentiment.limitUp.status, 'error')
  assert.equal(result.sentiment.drawdown.count, 1)
  assert.equal(result.sentiment.turnover.status, 'ready')
  assert.equal(result.sentiment.weight.status, 'ready')
  assert.equal(result.sentiment.weight.strength, null)
})
test('empty yesterday pool needs no stock quotes and is a valid zero-size cohort', async () => {
  const result = await buildDailyAnalysis({ fetchImpl: fixtureFetch({ yesterday: [] }), now: new Date('2026-10-21T08:00:00Z'), history: [] })
  assert.equal(result.sentiment.limitUp.averagePct, null)
  assert.equal(result.sentiment.drawdown.count, 0)
})

test('raw breadth handles suspended, missing and empty pct without manufacturing flat stocks', async () => {
  const rows = [
    { ...rawStock(0), trade: '0', changepercent: '0' },
    { ...rawStock(1), changepercent: null },
    { ...rawStock(2), changepercent: '' },
    { ...rawStock(3), changepercent: '0' },
    { ...rawStock(4), symbol: 'bj920001', changepercent: '2' },
  ]
  const value = await collectSinaMarket({ minTotal: 1, get: async url => url.includes('StockCount') ? '5' : rows })
  assert.equal(value.status, 'ready')
  assert.deepEqual(value.rows.map(row => row.pct), [null, null, null, 0, 2])
})
test('pool API errors affect only the two yesterday-cohort blocks; weight failures stay isolated', async () => {
  for (const target of ['getYesterdayZTPool', 'weight']) {
    const base = fixtureFetch()
    const fetchImpl = async (url, options) => target === 'weight' ? url.includes('sh000300') ? new Response('{}', { status: 503 }) : base(url, options)
      : url.includes(target) ? new Response(JSON.stringify({ rc: -1, data: null })) : base(url, options)
    const { sentiment } = await buildDailyAnalysis({ fetchImpl, now: new Date('2026-10-21T08:00:00Z'), history: [] })
    assert.equal(sentiment.turnover.status, 'ready')
    assert.equal(sentiment.breadth.status, 'ready')
    assert.equal(sentiment.weight.status, target === 'weight' ? 'error' : 'ready')
    assert.equal(sentiment.limitUp.status, target === 'weight' ? 'ready' : 'error')
    assert.equal(sentiment.drawdown.status, target === 'weight' ? 'ready' : 'error')
  }
})
test('missing yesterday boards are null without a verified preceding-day archive', async () => {
  const fetchImpl = fixtureFetch({ yesterday: [{ c: '600000', n: '浦发银行' }] })
  const args = { fetchImpl, now: new Date('2026-10-21T08:00:00Z') }
  assert.equal((await buildDailyAnalysis({ ...args, history: [] })).sentiment.drawdown.consecutiveCount, null)
  const previous = { dataDate: '2026-10-20', sources: [{ id: 'limitUp', status: 'ready' }], upStocks: [{ code: '600000', boards: 2 }] }
  assert.equal((await buildDailyAnalysis({ ...args, history: [previous] })).sentiment.drawdown.consecutiveCount, 1)
})

test('callers can configure blue chips and drawdown threshold without changing other blocks', async () => {
  const result = await buildDailyAnalysis({ fetchImpl: fixtureFetch(), now: new Date('2026-10-21T08:00:00Z'), history: [], sentimentOptions: { blueChipSymbols: ['sh600519', 'sz300750'], drawdownThreshold: -7 } })
  assert.equal(result.sentiment.weight.blueChips.length, 2)
  assert.equal(result.sentiment.drawdown.threshold, -7)
  assert.equal(result.sentiment.drawdown.count, 0)
  assert.equal(result.sentiment.limitUp.averagePct, -6)
})

test('Beijing 920 codes use Tencent bj symbols, and stale cohort quotes are rejected', async () => {
  const base = fixtureFetch({ yesterday: [{ c: '920001', n: '北交所股票', lbc: 2 }] })
  const fetchImpl = (url, options) => url.includes('/q=sh920001') ? Promise.resolve(new Response('')) : base(url, options)
  const result = await buildDailyAnalysis({ fetchImpl, now: new Date('2026-10-21T08:00:00Z'), history: [] })
  assert.equal(result.sentiment.limitUp.status, 'ready')
  const normal = fixtureFetch()
  const staleFetch = async (url, options) => {
    const response = await normal(url, options)
    return url.endsWith('/q=sh600000') ? new Response((await response.text()).replace('20261021', '20261020')) : response
  }
  const stale = await buildDailyAnalysis({ fetchImpl: staleFetch, now: new Date('2026-10-21T08:00:00Z'), history: [] })
  assert.equal(stale.sentiment.limitUp.status, 'error')
  assert.equal(stale.sentiment.drawdown.status, 'error')
  assert.equal(stale.sentiment.weight.status, 'ready')
})
