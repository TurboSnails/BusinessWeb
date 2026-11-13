import { test } from 'node:test'
import assert from 'node:assert/strict'
import { forwardPeFacts } from './market-cycle-us-valuation.mjs'

const weekly = (start, n, value) => Array.from({ length: n }, (_, i) => [new Date(Date.parse(start) + i * 7 * 864e5).toISOString().slice(0, 10), value(i)])

test('Forward PE 分位只用最新点之前5年的周度样本', () => {
  // 10 years rising 10→30: an old window would put the latest at 100%, as does the 5-year one; then drop the last point.
  const points = weekly('2016-01-01', 520, i => 10 + i / 26)
  points.push(['2026-01-02', 22]) // below most of the last 5 years (≈20–30)
  const [pe, pct] = forwardPeFacts('spx', points)
  assert.equal(pe.metricId, 'fwd_pe'); assert.equal(pe.value, 22); assert.equal(pe.observationDate, '2026-01-02')
  assert.equal(pct.metricId, 'fwd_pe_5y_percentile'); assert.equal(pct.frequency, 'weekly'); assert.equal(pct.market, 'spx')
  assert.ok(pct.value > 15 && pct.value < 25, `got ${pct.value}`)
})

test('近5年周度点不足时拒绝给分位', () => {
  assert.throws(() => forwardPeFacts('ndx', weekly('2025-01-03', 60, () => 20)), /近5年/)
  assert.throws(() => forwardPeFacts('ndx', []), /无Forward PE/)
})
