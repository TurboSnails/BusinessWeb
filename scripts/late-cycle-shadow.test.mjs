import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  buildShadow, capeByMonth, capePercentileAt, frozenViolations, lastByMonth, monthAfter,
  monthlyMean, panicReading, readingFor,
} from './lib/late-cycle-shadow.mjs'

const read = p => JSON.parse(readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), 'utf8'))
const R = 'docs/research/late-cycle-warning-2026-11-26/'
const research = read(R + 'results.json')
const tiers = new Map(read('docs/research/macro-significance-2026-11-25/inputs.json').tiers)
const heat = new Map(read(R + 'inputs/heat.json').timeline.map(r => [r.d, r.heat]))
const cape = capeByMonth(read('public/data/market-radar.json').indicators.find(x => x.id === 'cape').history)
const series = {
  baa: new Map(read(R + 'inputs-baa.json').baaChange),
  vix: monthlyMean(read(R + 'inputs/vix.json')),
  close: lastByMonth(read(R + 'inputs/spx-daily.json').rows),
  highs: new Map(read(R + 'inputs/industry-trend.json').map(([d, , h]) => [d.slice(0, 7), h])),
  industry: new Map(read('docs/research/trend-overlay-2026-11-25/inputs-industry.json').returns),
  avgPrice: monthlyMean(read(R + 'inputs/spx-daily.json').rows),
  cape,
}
const at = t => readingFor(t, { tier: tiers.get(t), heat: heat.get(t), ...series })
const empty = { baa: new Map(), vix: new Map(), close: new Map(), highs: new Map(), industry: new Map(), avgPrice: new Map(), cape: new Map() }

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
  const base = { heat: 'hot', baa: new Map(), vix: new Map(), close: new Map(), highs: new Map(), industry: new Map(), cape: new Map() }
  const r = readingFor('2026-11', { tier: 'offense', ...base, avgPrice })
  assert.equal(r.trendCap.below, true)
  assert.equal(r.trendCap.c2Tier, 'lean-defense')
  assert.equal(r.trendCap.triggerPrice, 100)
  const up = new Map([...avgPrice].map(([m, v]) => [m, m === '2026-11' ? 110 : v]))
  const r2 = readingFor('2026-11', { tier: 'lean-offense', ...base, avgPrice: up })
  assert.equal(r2.trendCap.below, false)
  assert.equal(r2.trendCap.c2Tier, 'lean-offense')
  const def = readingFor('2026-11', { tier: 'defense', ...base, avgPrice })
  assert.equal(def.trendCap.c2Tier, 'defense')
})

test('panicValueTrend：已知过线与未过线月份；缺数据为 null；旧冻结行不回填', () => {
  // 2020-03：r4-episodes 过线（baa 0.39、volTrend ≈2.81）；用构造序列精确断言阈值
  const hitMonth = '2020-03'
  const missMonth = '2019-06'
  const baa = new Map([[hitMonth, 0.39], [missMonth, 0.05]])
  const vixHit = new Map([[hitMonth, 57.74], ...[1, 2, 3, 4, 5, 6].map(k => [monthAfter(hitMonth, -k), 15])])
  const vixMiss = new Map([[missMonth, 15], ...[1, 2, 3, 4, 5, 6].map(k => [monthAfter(missMonth, -k), 15])])
  const vix = new Map([...vixHit, ...vixMiss])
  const avgPrice = new Map(Array.from({ length: 10 }, (_, k) => [monthAfter(hitMonth, -k), k === 0 ? 90 : 100]))
  const capeMap = new Map([['1900-01', 10], ['1900-02', 20], [hitMonth, 24.82], [missMonth, 30]])
  const hit = readingFor(hitMonth, {
    tier: 'defense', heat: 'cold', baa, vix, close: new Map([[hitMonth, 2500]]),
    highs: new Map(), industry: new Map(), avgPrice, cape: capeMap,
  })
  assert.equal(hit.panicValueTrend.panic.hit, true)
  assert.equal(hit.panicValueTrend.panic.baaChange, 0.39)
  assert.ok(hit.panicValueTrend.panic.volTrend >= 0.20)
  assert.equal(hit.panicValueTrend.valuation.cape, 24.82)
  assert.equal(hit.panicValueTrend.trend.below, true)
  assert.equal(hit.panicValueTrend.macroTier, 'defense')
  assert.equal(hit.tier, 'defense')

  const miss = panicReading(missMonth, { baa, vix })
  assert.equal(miss.hit, false)
  assert.equal(miss.baaChange, 0.05)
  assert.ok(miss.volTrend < 0.20)

  const bare = readingFor('2026-11', { tier: null, heat: null, ...empty })
  assert.equal(bare.panicValueTrend.panic.baaChange, null)
  assert.equal(bare.panicValueTrend.panic.volTrend, null)
  assert.equal(bare.panicValueTrend.panic.hit, null)
  assert.equal(bare.panicValueTrend.valuation.cape, null)
  assert.equal(bare.panicValueTrend.valuation.percentile, null)
  assert.equal(bare.panicValueTrend.trend.below, null)
  assert.ok(bare.panicValueTrend.missing.includes('恐慌利差'))
  assert.ok(bare.panicValueTrend.missing.includes('CAPE'))
  assert.ok(bare.panicValueTrend.missing.includes('趋势均线'))
  // 新字段缺失不进顶层 missing（与改动前同源项：档位/冷热/C1–C5）
  assert.ok(!bare.missing.includes('恐慌利差'))
  assert.ok(!bare.missing.includes('CAPE'))
  assert.ok(!bare.missing.includes('趋势均线'))
  assert.deepEqual(bare.missing, ['档位', '冷热', 'C1 利差', 'C2 VIX', 'C3 新高行业', 'C4 防守轮动', 'C5 6 个月涨幅'])

  // 旧冻结行无 panicValueTrend：不回填；仅多出新字段不算改写；改其它字段仍违规
  const oldRow = { month: '2026-11', tier: 'lean-offense', missing: ['C1 利差'], frozenAt: '2027-02-05' }
  const prev = { rows: [oldRow] }
  const next = buildShadow({ previous: prev, timeline: [{ d: '2026-11', macro: 'lean-offense', heat: 'hot' }], series, today: '2027-03-05', generatedAt: 'x' })
  assert.equal(next.rows[0].panicValueTrend, undefined)
  assert.deepEqual(frozenViolations(prev, next), [])
  const withNew = { rows: [{ ...oldRow, panicValueTrend: hit.panicValueTrend }] }
  assert.deepEqual(frozenViolations(prev, withNew), [])
  assert.deepEqual(frozenViolations(prev, { rows: [{ ...oldRow, tier: 'offense' }] }), ['2026-11'])

  // CAPE 分位不用未来数据：加入更晚更高的点不改变当月分位
  const early = capePercentileAt(hitMonth, capeMap)
  const withFuture = new Map([...capeMap, ['2021-01', 100]])
  assert.deepEqual(capePercentileAt(hitMonth, withFuture), early)
})

test('panicValueTrend 缺失不进顶层 missing；只缺 CAPE 仍按原规则冻结', () => {
  // 构造：原有裂缝数据齐全（顶层 missing 空），仅缺 CAPE；SHADOW_SINCE=2026-11
  const t = '2026-11'
  const months = Array.from({ length: 14 }, (_, k) => monthAfter(t, -k))
  const close = new Map(months.map((m, i) => [m, 100 + i]))
  const avgPrice = new Map(months.slice(0, 10).map((m, i) => [m, 100 + i]))
  const vix = new Map(months.slice(0, 7).map(m => [m, 15]))
  const baa = new Map([[t, 0.05]])
  // C3 用 highs 的 monthAfter(t, -2-k)，需覆盖 t-2 … t-13
  const highs = new Map(Array.from({ length: 16 }, (_, k) => [monthAfter(t, -k), 10]))
  // C4 用 industry 的 monthAfter(t, -2/-3/-4)
  const industry = new Map(Array.from({ length: 6 }, (_, k) => [monthAfter(t, -k), Array(49).fill(1)]))
  const full = { baa, vix, close, avgPrice, highs, industry, cape: new Map() }
  const r = readingFor(t, { tier: 'lean-offense', heat: 'hot', ...full })
  assert.deepEqual(r.missing, [])
  assert.ok(r.panicValueTrend.missing.includes('CAPE'))
  assert.equal(r.panicValueTrend.valuation.cape, null)

  const timeline = [{ d: t, macro: 'lean-offense', heat: 'hot' }]
  const out = buildShadow({
    previous: null, timeline, series: full, today: '2026-12-05', generatedAt: 'x',
  })
  assert.deepEqual(out.rows.map(x => x.month), [t])
  assert.ok(out.rows[0].panicValueTrend.missing.includes('CAPE'))
  assert.deepEqual(out.rows[0].missing, [])
})
