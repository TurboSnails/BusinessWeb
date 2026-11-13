import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseBars, parseYahooBars, buildSnapshot } from './market-cycle-snapshot.mjs'

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
  assert.equal(result.warnings.length, 5)
})
test('雅虎K线：跳过空收盘，同日去重，按日期升序', () => {
  const t = d => Date.parse(`${d}T13:30:00Z`) / 1000
  const body = { chart: { result: [{ timestamp: [t('2026-11-02'), t('2026-11-09'), t('2026-11-13'), t('2026-10-26')], indicators: { quote: [{ close: [7376.861, null, 7533.37, 7580.07], volume: [100, 5, 50, null] }] } }] } }
  assert.deepEqual(parseYahooBars(body, '^GSPC'), [{ date: '2026-10-26', close: 7580.07, volume: 0 }, { date: '2026-11-02', close: 7376.86, volume: 100 }, { date: '2026-11-13', close: 7533.37, volume: 50 }])
  assert.throws(() => parseYahooBars({ chart: { result: [] } }, '^GSPC'))
})
