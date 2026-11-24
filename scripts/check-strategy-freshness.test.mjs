import assert from 'node:assert/strict'
import { test } from 'node:test'
import { beijingToday, checkFreshness, previousMonth } from './check-strategy-freshness.mjs'

test('previousMonth 跨年', () => {
  assert.equal(previousMonth('2027-01'), '2026-12')
  assert.equal(previousMonth('2026-11'), '2026-10')
})

test('checkFreshness：本月 3 日起，定档仍停在更早月份才算过期', () => {
  assert.deepEqual(checkFreshness('2026-10', '2026-11-25'), { stale: false, expected: '2026-10' })
  assert.equal(checkFreshness('2026-10', '2026-12-02').stale, false)
  assert.equal(checkFreshness('2026-10', '2026-12-03').stale, true)
  assert.equal(checkFreshness('2026-11', '2026-12-03').stale, false)
  assert.equal(checkFreshness(null, '2026-11-25').stale, true)
})

test('beijingToday 按东八区换日', () => {
  assert.equal(beijingToday(new Date('2026-11-30T16:30:00Z')), '2026-12-01')
})
