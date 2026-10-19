import test from 'node:test'
import assert from 'node:assert/strict'
import { parsePoolBars, computePoolTurnoverRatio, loadHsiUniverse } from './market-cycle-hsi-pool.mjs'

const TODAY = '2026-10-19'
const calendar = []
for (let t = Date.parse('2025-09-01'); t <= Date.parse('2026-10-16'); t += 864e5) {
  const d = new Date(t)
  if (d.getUTCDay() > 0 && d.getUTCDay() < 6) calendar.push(d.toISOString().slice(0, 10))
}
const bars = (amount, from = calendar[0]) => calendar.filter(d => d >= from).map(d => [d, amount(d)])
const inWeek = d => d >= '2026-10-12'
const official = (pool, dates = calendar.filter(inWeek)) => new Map(dates.map(d => [d, [...pool.values()].reduce((s, b) => s + (b.find(r => r[0] === d)?.[1] ?? 0), 0)]))

test('amount is read by position for both 9- and 11-field Tencent rows', () => {
  const body = { code: 0, data: { hk00700: { qfqday: [
    ['2026-10-15', '1', '1', '1', '1', '100', {}, '0.1', '598355.801'],
    ['2026-10-16', '1', '1', '1', '1', '100', {}, '0.26', '20472.59', '0.000', '0.000'],
  ] } } }
  assert.deepEqual(parsePoolBars(body, '700', TODAY), [['2026-10-15', 5983558010], ['2026-10-16', 204725900]])
  assert.throws(() => parsePoolBars({ code: 0, data: { hk00700: { day: [['2026-10-16', '1', '1', '1', '1', '100', {}, '0.1']] } } }, '700', TODAY), /成交额缺失/)
  assert.throws(() => parsePoolBars({ code: 0, data: { hk00005: { day: [] } } }, '700', TODAY), /身份/)
})

test('ratio uses the seasoned pool and requires the completed week to match official turnover', () => {
  const pool = new Map([['1', bars(d => inWeek(d) ? 60 : 100)], ['2', bars(d => inWeek(d) ? 60 : 100)]])
  const out = computePoolTurnoverRatio(pool, calendar, official(pool), TODAY)
  assert.equal(out.value, 0.6)
  assert.equal(out.observationDate, '2026-10-16')
  assert.equal(out.seasoned, 2)
  assert.equal(out.checks.length, 5)
})

test('a membership change shows up as an official mismatch and blocks publication', () => {
  const pool = new Map([['1', bars(() => 100)], ['2', bars(() => 100)]])
  const off = official(pool)
  off.set('2026-10-14', 260)
  assert.throws(() => computePoolTurnoverRatio(pool, calendar, off, TODAY), /2026-10-14 偏差-23\.08%/)
  const partial = official(pool)
  partial.delete('2026-10-13')
  assert.throws(() => computePoolTurnoverRatio(pool, calendar, partial, TODAY), /缺少官方日报/)
})

test('a recent listing is kept out of the baseline, and blocks when it carries too much turnover', () => {
  const small = new Map([['1', bars(() => 100)], ['new', bars(() => 2, '2026-06-01')]])
  const out = computePoolTurnoverRatio(small, calendar, official(small), TODAY)
  assert.equal(out.seasoned, 1)
  assert.equal(out.value, 1)
  const big = new Map([['1', bars(() => 100)], ['new', bars(() => 50, '2026-06-01')]])
  assert.throws(() => computePoolTurnoverRatio(big, calendar, official(big), TODAY), /低于95%/)
})

test('universe must be the confirmed, fresh HSI list', () => {
  const ok = { schemaVersion: 1, universes: { hsi: { status: 'ok', date: '2026-10-16', source: 'https://x', codes: Array.from({ length: 80 }, (_, i) => String(i + 1)) } } }
  assert.equal(loadHsiUniverse(ok, TODAY).codes.length, 80)
  assert.throws(() => loadHsiUniverse({ ...ok, universes: { hsi: { ...ok.universes.hsi, date: '2026-09-01' } } }, TODAY), /超过14天/)
  assert.throws(() => loadHsiUniverse({ ...ok, universes: { hsi: { ...ok.universes.hsi, status: 'missing' } } }, TODAY), /无效/)
})
