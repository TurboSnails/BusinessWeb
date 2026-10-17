import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseBars, buildSnapshot } from './market-cycle-snapshot.mjs'

test('解析真实行情字段，拒绝坏值、重复日期和乱序', () => {
  assert.deepEqual(parseBars({ data: { hkHSI: { week: [['2026-10-09', '10', '12', '13', '9', '500']] } } }, 'hkHSI', 'week'), [{ date: '2026-10-09', close: 12, volume: 500 }])
  for (const rows of [[['2026-10-09', '10', null, '13', '9', '500']], [['2026-02-30', '10', '12', '13', '9', '500']], [['2026-10-09', '10', '12', '13', '9', '500'], ['2026-10-09', '10', '12', '13', '9', '500']]]) {
    assert.throws(() => parseBars({ data: { hkHSI: { week: rows } } }, 'hkHSI', 'week'))
  }
})
test('部分取数失败保留该指数原快照和原日期，不重标为本次成功', async () => {
  const old = { schemaVersion: 1, markets: { hsi: { fetchedAt: '2026-10-01', source: 'old', week: [], month: [] } } }
  const result = await buildSnapshot(old, async () => { throw new Error('offline') }, '2026-10-17T00:00:00Z')
  assert.equal(result.markets.hsi.fetchedAt, '2026-10-01')
  assert.equal(result.markets.hstech, undefined)
  assert.equal(result.warnings.length, 3)
})
