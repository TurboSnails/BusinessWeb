import assert from 'node:assert/strict'
import { test } from 'node:test'
import { beijingToday, checkFreshness, checkLedgerFrozen, checkSnapshotDividend, previousMonth } from './check-strategy-freshness.mjs'
import { SNAPSHOT_DISCLOSURE } from './macro-posture.mjs'

test('previousMonth 跨年', () => {
  assert.equal(previousMonth('2027-01'), '2026-12')
  assert.equal(previousMonth('2026-11'), '2026-10')
})

test('checkFreshness：本月 4 日起，定档仍停在更早月份才算过期', () => {
  assert.deepEqual(checkFreshness('2026-10', '2026-11-25'), { stale: false, expected: '2026-10' })
  assert.equal(checkFreshness('2026-10', '2026-12-03').stale, false)
  assert.equal(checkFreshness('2026-10', '2026-12-04').stale, true)
  assert.equal(checkFreshness('2026-11', '2026-12-04').stale, false)
  assert.equal(checkFreshness(null, '2026-11-25').stale, true)
})

test('beijingToday 按东八区换日', () => {
  assert.equal(beijingToday(new Date('2026-11-30T16:30:00Z')), '2026-12-01')
})

test('checkLedgerFrozen：4 日起上个月必须已冻结；前推起点之前的月份不查', () => {
  const official = { d: '2026-11', status: 'official' }
  const estimate = { d: '2026-11', status: 'estimate' }
  assert.equal(checkLedgerFrozen([estimate], '2026-12-03').missing, false)
  assert.equal(checkLedgerFrozen([estimate], '2026-12-04').missing, true)
  assert.equal(checkLedgerFrozen([], '2026-12-04').missing, true)
  assert.equal(checkLedgerFrozen([official], '2026-12-04').missing, false)
  assert.equal(checkLedgerFrozen([], '2026-11-25').missing, false)
})

test('checkSnapshotDividend：只在用快照时检查，离 12 个月上限不到 3 个月提醒', () => {
  const using = [`${SNAPSHOT_DISCLOSURE}快照价格到 2026-10。`]
  assert.deepEqual(checkSnapshotDividend(using, '2026-06', '2027-03-04'), { due: false, age: 8 })
  assert.deepEqual(checkSnapshotDividend(using, '2026-06', '2027-04-04'), { due: true, age: 9 })
  assert.equal(checkSnapshotDividend(['其他说明'], '2026-06', '2027-06-04').due, false)
})
