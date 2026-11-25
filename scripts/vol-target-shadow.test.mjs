import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildShadow, frozenViolations, volReadings } from './lib/vol-target-shadow.mjs'

const closes = JSON.parse(readFileSync(fileURLToPath(new URL('../data-raw/macro-posture-daily/spx-daily.json', import.meta.url)), 'utf8')).rows

test('与研究结果一致：2026-11-24 的 20 日波动约 31.8%、参照约 11.5%、k 约 0.36', () => {
  const upTo = closes.filter(([d]) => d <= '2026-11-24')
  const last = volReadings(upTo).at(-1)
  assert.equal(last.d, '2026-11-24')
  assert.ok(Math.abs(last.sigma - 0.318) < 0.001)
  assert.ok(Math.abs(last.sigmaStar - 0.115) < 0.001)
  assert.ok(Math.abs(last.k - 0.36) < 0.005)
})

test('只冻结已结束的月份，当月只给预估', () => {
  const upTo = closes.filter(([d]) => d <= '2026-11-24')
  const out = buildShadow({ previous: null, closes: upTo, liveRows: [{ d: '2026-11', final: 'lean-offense', status: 'estimate' }], today: '2026-11-25', generatedAt: 'x' })
  assert.equal(out.rows.length, 0)
  assert.equal(out.current.tier, 'lean-offense')
  assert.ok(Math.abs(out.current.equityShare - 0.85 * out.current.k) < 1e-4)
})

test('月份结束后追加一行，已冻结的行不被改写', () => {
  const novPlus = [...closes.filter(([d]) => d <= '2026-11-24'), ['2026-11-25', 7300], ['2026-11-27', 7350], ['2026-12-01', 7400]]
  const first = buildShadow({ previous: null, closes: novPlus, liveRows: [{ d: '2026-11', final: 'lean-offense', status: 'official' }], today: '2026-12-02', generatedAt: 'x' })
  assert.deepEqual(first.rows.map(r => r.month), ['2026-11'])
  assert.equal(first.rows[0].lastDay, '2026-11-27')
  assert.equal(first.rows[0].tier, 'lean-offense')
  const again = buildShadow({ previous: first, closes: [...novPlus, ['2026-12-02', 7000]], liveRows: [], today: '2026-12-03', generatedAt: 'y' })
  assert.deepEqual(again.rows, first.rows)
  assert.deepEqual(frozenViolations(first, again), [])
  const tampered = { ...again, rows: [{ ...again.rows[0], k: 0.99 }] }
  assert.deepEqual(frozenViolations(first, tampered), ['2026-11'])
})
