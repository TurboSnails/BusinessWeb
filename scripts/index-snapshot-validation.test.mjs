import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertIndexSnapshot, assertRetained, keepRegressedMonthly } from './lib/index-snapshot-validation.mjs'

const months = n => Array.from({ length: n }, (_, i) => [new Date(Date.UTC(2024, i + 1, 0)).toISOString().slice(0, 10), 100 + i])
const index = (monthly, extra = {}) => ({
  name: extra.name ?? '指数', latest: { date: monthly.at(-1)[0], value: monthly.at(-1)[1] }, monthly, fpe: [], priceSource: extra.priceSource ?? 'Yahoo', ...extra,
})

test('assertRetained rejects shorter coverage and rewritten settled months but allows the open month to move', () => {
  const old = months(30)
  assert.doesNotThrow(() => assertRetained(old, [...old.slice(0, -1), [old.at(-1)[0], 999]], '上证 月线', 'month'))
  assert.throws(() => assertRetained(old, old.slice(5), '上证 月线', 'month'), /历史覆盖退化/)
  const rewritten = old.map(([d, v], i) => [d, i === 3 ? v + 1 : v])
  assert.throws(() => assertRetained(old, rewritten, '上证 月线', 'month'), /历史观测被改写/)
})

test('keepRegressedMonthly keeps only the regressed index on its old monthly series and the snapshot then validates', () => {
  const old = months(30)
  const previous = { indexes: { sse: index(old, { name: '上证指数' }), spx: index(old, { name: '标普 500' }) } }
  const fresher = [...old, ['2026-07-31', 200]]
  const next = {
    generatedAt: '2026-08-01',
    indexes: {
      sse: index(old.slice(6), { name: '上证指数', priceSource: 'Yahoo 截断', fpe: [['2026-07-31', 13]] }),
      spx: index(fresher, { name: '标普 500' }),
    },
  }
  const warnings = keepRegressedMonthly(next, previous)
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /^上证指数：sse 月线 历史覆盖退化，沿用旧月线$/)
  assert.deepEqual(next.indexes.sse.monthly, old)
  assert.deepEqual(next.indexes.sse.latest, previous.indexes.sse.latest)
  assert.equal(next.indexes.sse.priceSource, 'Yahoo')
  assert.deepEqual(next.indexes.sse.fpe, [['2026-07-31', 13]])
  assert.deepEqual(next.indexes.spx.monthly, fresher)
  assert.doesNotThrow(() => assertIndexSnapshot(next, previous, '2026-08-01'))
})

test('keepRegressedMonthly leaves an index untouched when its old entry was reused after a fetch failure', () => {
  const old = index(months(30))
  const next = { indexes: { sse: old } }
  assert.deepEqual(keepRegressedMonthly(next, { indexes: { sse: old } }), [])
  assert.equal(next.indexes.sse, old)
})
