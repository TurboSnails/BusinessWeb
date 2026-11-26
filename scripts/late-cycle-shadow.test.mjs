import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildShadow, frozenViolations, lastByMonth, monthAfter, monthlyMean, readingFor } from './lib/late-cycle-shadow.mjs'

const read = p => JSON.parse(readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), 'utf8'))
const R = 'docs/research/late-cycle-warning-2026-11-26/'
const research = read(R + 'results.json')
const tiers = new Map(read('docs/research/macro-significance-2026-11-25/inputs.json').tiers)
const heat = new Map(read(R + 'inputs/heat.json').timeline.map(r => [r.d, r.heat]))
const series = {
  baa: new Map(read(R + 'inputs-baa.json').baaChange),
  vix: monthlyMean(read(R + 'inputs/vix.json')),
  close: lastByMonth(read(R + 'inputs/spx-daily.json').rows),
  highs: new Map(read(R + 'inputs/industry-trend.json').map(([d, , h]) => [d.slice(0, 7), h])),
  industry: new Map(read('docs/research/trend-overlay-2026-11-25/inputs-industry.json').returns),
}
const at = t => readingFor(t, { tier: tiers.get(t), heat: heat.get(t), ...series })

test('与研究 L-023 一致：1991-01 至 2026-08 的 W1 预警月份完全相同', () => {
  const expected = research.describe.find(r => r.label.startsWith('W 预警')).list
  const got = []
  for (let t = '1991-01'; t <= '2026-08'; t = monthAfter(t, 1)) if (at(t).flags.W1) got.push(t)
  assert.deepEqual(got, expected)
})

test('与研究一致：最近四个月的五道裂缝', () => {
  for (const c of research.current) {
    const r = at(c.d)
    assert.deepEqual({ C1: r.cracks.C1, C2: r.cracks.C2, C3: r.cracks.C3, C4: r.cracks.C4, C5: r.cracks.C5 }, c.c, c.d)
    assert.equal(r.counts.n, c.n, c.d)
    assert.deepEqual(r.missing, [], c.d)
  }
})

test('数据不齐不冻结；超过 3 个月仍缺则带缺项冻结；已冻结的行不被改写', () => {
  const timeline = [{ d: '2026-11', macro: 'lean-offense', heat: 'hot' }]
  const empty = { baa: new Map(), vix: new Map(), close: new Map(), highs: new Map(), industry: new Map() }
  const early = buildShadow({ previous: null, timeline, series: empty, today: '2026-12-05', generatedAt: 'x' })
  assert.equal(early.rows.length, 0)
  assert.ok(early.current.missing.length > 0)
  const late = buildShadow({ previous: early, timeline, series: empty, today: '2027-02-05', generatedAt: 'x' })
  assert.deepEqual(late.rows.map(r => r.month), ['2026-11'])
  assert.ok(late.rows[0].missing.includes('C1 利差'))
  const again = buildShadow({ previous: late, timeline, series, today: '2027-03-05', generatedAt: 'x' })
  assert.deepEqual(frozenViolations(late, again), [])
  const tampered = { ...again, rows: again.rows.map(r => (r.month === '2026-11' ? { ...r, tier: 'offense' } : r)) }
  assert.deepEqual(frozenViolations(again, tampered), ['2026-11'])
})

test('L-027 C2 破位封顶：月均价低于含当月 10 个月均线时最高到偏防守', () => {
  const avgPrice = new Map(Array.from({ length: 10 }, (_, k) => [monthAfter('2026-11', -k), k === 0 ? 90 : 100]))
  const r = readingFor('2026-11', { tier: 'offense', heat: 'hot', baa: new Map(), vix: new Map(), close: new Map(), highs: new Map(), industry: new Map(), avgPrice })
  assert.equal(r.trendCap.below, true)
  assert.equal(r.trendCap.c2Tier, 'lean-defense')
  assert.equal(r.trendCap.triggerPrice, 100)
  const up = new Map([...avgPrice].map(([m, v]) => [m, m === '2026-11' ? 110 : v]))
  const r2 = readingFor('2026-11', { tier: 'lean-offense', heat: 'hot', baa: new Map(), vix: new Map(), close: new Map(), highs: new Map(), industry: new Map(), avgPrice: up })
  assert.equal(r2.trendCap.below, false)
  assert.equal(r2.trendCap.c2Tier, 'lean-offense')
  const def = readingFor('2026-11', { tier: 'defense', heat: 'hot', baa: new Map(), vix: new Map(), close: new Map(), highs: new Map(), industry: new Map(), avgPrice })
  assert.equal(def.trendCap.c2Tier, 'defense')
})
