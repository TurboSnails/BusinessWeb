import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  applyTactical, baseTier, buildCurrent, classify, COMPONENTS, evaluate, pillarScore, scoreComponent,
} from './lib/macro-posture/model.mjs'
import {
  alignVariants, drawdown, falseAlarms, horizon, monthlyReturns, performance, recessionCapture, transactionCosts, updateLive,
} from './lib/macro-posture/backtest.mjs'
import { addDays, FRED_SPX, makePanel, makeSeries, monthEnd, panelAt, valueAt } from './lib/macro-posture/panel.mjs'
import { remainingSessions } from './lib/macro-posture/calendar.mjs'
import { buildOuter } from './lib/macro-posture/outer.mjs'
import { formatDate, formatReading } from './lib/macro-posture/format.mjs'
import { FRED_IDS, mergeSpxCloses, parseMonthlyTable, refreshMacroPosture, validateComposite } from './macro-posture.mjs'

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} ≠ ${expected}`)
const components = Object.fromEntries(COMPONENTS.map(def => [def.id, def]))
const score = (id, value, fields) => scoreComponent(components[id], { value, ...fields })

const boundaries = {
  sahm: [[0.1999, 1], [0.20, 0], [0.2999, 0], [0.30, -1], [0.4999, -1], [0.50, -2]],
  claims: [[5, 1], [5.0001, 0], [14.9999, 0], [15, -1], [29.9999, -1], [30, -2]],
  payrolls: [[-0.0001, -2], [0, -1], [0.0499, -1], [0.05, 0], [0.12, 0], [0.1201, 1]],
  indpro: [[-2.0001, -1], [-2, 0], [2, 0], [2.0001, 1]],
  baaLevel: [[35, 1], [35.0001, 0], [74.9999, 0], [75, -1], [89.9999, -1], [90, -2]],
  baaChange: [[-0.15, 1], [-0.1499, 0], [0.1999, 0], [0.20, -1], [0.3999, -1], [0.40, -2]],
  nfciCredit: [
    [-0.5001, 1, { delta: 0 }], [-0.50, 0, { delta: 0 }], [-0.6, 0, { delta: 0.0001 }],
    [-0.6, 0, { delta: 0.2499 }], [-0.6, -1, { delta: 0.25 }], [0.25, 0, { delta: 0 }],
    [0.2501, -1, { delta: 0 }], [0.75, -1, { delta: -1 }], [0.7501, -2, { delta: -1 }],
  ],
  fedPath: [
    [1.4999, 1, { delta6: -0.50 }], [1.4999, 0, { delta6: -0.4999 }],
    [1.5, -1, { delta6: -0.50 }], [2.9999, -1, { delta6: 0 }], [3, -2, { delta6: -0.50 }],
  ],
  curve: [
    [-0.0001, -1, { inverted12: false, inverted24: false }], [0, 0, { inverted12: false, inverted24: false }],
    [0, -1, { inverted12: true, inverted24: true }], [1, 0, { inverted12: false, inverted24: false }],
    [1.0001, 1, { inverted12: false, inverted24: false }], [1.0001, 0, { inverted12: false, inverted24: true }],
  ],
  nfci: [
    [-0.4001, 1, { delta: 0 }], [-0.40, 0, { delta: 0 }], [-0.5, 0, { delta: 0.0001 }],
    [-0.30, 0, { delta: 0.1501 }], [-0.2999, 0, { delta: 0.15 }], [-0.2999, -1, { delta: 0.1501 }],
    [0, -1, { delta: 0.16 }], [0.0001, -2, { delta: -1 }],
  ],
  realRate: [[-0.0001, 1], [0, 0], [2, 0], [2.0001, -1]],
  corePce: [
    [4, -2, { yoy: 4 }], [3.9999, -1, { yoy: 4 }], [4, -1, { yoy: 3.9999 }],
    [3.5, -1, { yoy: 2.99 }], [3.4999, 0, { yoy: 2.99 }],
    [3.30, 0, { yoy: 3 }], [3.3001, -1, { yoy: 3 }], [3.30, 0, { yoy: 2.9999 }],
    [2.5, 1, { yoy: 2.5 }], [2.5001, 0, { yoy: 2.5001 }], [2.5, 0, { yoy: 2.4999 }],
  ],
}

for (const [id, examples] of Object.entries(boundaries)) {
  test(`${id} honors its published thresholds and equality sides`, () => {
    for (const [value, expected, fields] of examples) {
      assert.equal(score(id, value, fields), expected, JSON.stringify({ value, fields }))
    }
    assert.equal(score(id, null), null)
  })
}

test('unknown compound inputs remain unknown when they can affect the score', () => {
  assert.equal(score('nfciCredit', 0), null)
  assert.equal(score('nfciCredit', 0.8), -2)
  assert.equal(score('fedPath', 0.7), null)
  assert.equal(score('curve', 1.1, { inverted12: false }), null)
  assert.equal(score('nfci', -0.5), null)
  assert.equal(score('corePce', 4), null)
})

test('pillar needs at least half of its components and G and C are both required', () => {
  assert.equal(pillarScore([1, null, null, null]), null)
  assert.equal(pillarScore([1, null, null]), null)
  assert.equal(pillarScore([1, -2, null, null]), -0.5)
  const good = { growth: 1, credit: 1, liquidity: 1, inflation: 1 }
  for (const id of ['growth', 'credit']) {
    const result = classify({ ...good, [id]: null }, {}, true)
    assert.deepEqual(result.final, { tier: null, equityShare: null })
    assert.deepEqual(result.regime, { tier: null, score: null })
    assert.equal(result.driver, 'insufficient')
  }
  near(classify({ ...good, credit: 0, liquidity: null, inflation: null }, {}, false).regime.score, 0.35 / 0.65)
})

test('R tier boundaries', () => {
  for (const [r, tier] of [[0.5, 'offense'], [0.4999, 'lean-offense'], [0.15, 'lean-offense'], [0.1499, 'neutral'],
    [-0.2499, 'neutral'], [-0.25, 'lean-defense'], [-0.7499, 'lean-defense'], [-0.75, 'defense']]) {
    assert.equal(baseTier(r), tier)
  }
})

test('all breakers enforce their caps and preserve the most defensive result', () => {
  const good = { growth: 1, credit: 1, liquidity: 1, inflation: 1 }
  for (const [id, override, sahm, tier] of [
    ['recessionCredit', { growth: -1.25, credit: -0.75 }, 0, 'defense'],
    ['creditStress', { credit: -1.25 }, 0, 'lean-defense'],
    ['sahmTrigger', {}, -2, 'lean-defense'],
    ['inflationSqueeze', { inflation: -2, liquidity: -1 }, 0, 'neutral'],
  ]) {
    const result = classify({ ...good, ...override }, { sahm }, false)
    assert.equal(result.final.tier, tier, id)
    assert.equal(result.driver, 'breaker')
    assert.ok(result.breakers.find(item => item.id === id).active)
  }
  assert.equal(classify({ growth: -2, credit: -2, inflation: -2, liquidity: -2 }, { sahm: -2 }, true).final.tier, 'defense')
})

test('tactical adjustment only lowers one tier and floors at defense', () => {
  const expected = {
    offense: 'lean-offense', 'lean-offense': 'neutral', neutral: 'lean-defense',
    'lean-defense': 'defense', defense: 'defense',
  }
  for (const [tier, down] of Object.entries(expected)) {
    assert.equal(applyTactical(tier, false), tier)
    assert.equal(applyTactical(tier, null), tier)
    assert.equal(applyTactical(tier, true), down)
  }
  assert.equal(applyTactical(null, true), null)
})

test('repair lifts exactly one defensive tier after breakers and tactical adjustment', () => {
  const weak = { growth: -1, credit: 0, liquidity: 0, inflation: 0 }
  const severe = { ...weak, growth: -1.25, credit: -1 }
  const scores = { baaChange: 0 }
  for (const [pillars, before, after] of [[weak, 'lean-defense', 'neutral'], [severe, 'defense', 'lean-defense']]) {
    const result = classify(pillars, scores, false, 0)
    assert.equal(result.regime.tier, before)
    assert.equal(result.final.tier, after)
    assert.equal(result.repair.active, true)
    assert.equal(result.driver, 'repair')
  }
  assert.equal(classify(severe, scores, false, -0.05).breakers[0].active, true)
  assert.match(classify(severe, scores, false, -0.05).repair.rule, /包括经济与信用同时转弱触发的防守/)
  for (const [baaChange, below, delta, tier] of [
    [0, true, 0, 'defense'], [0, null, 0, 'lean-defense'], [0, false, 0.01, 'lean-defense'],
    [-1, false, 0, 'lean-defense'], [null, false, 0, 'lean-defense'], [0, false, null, 'lean-defense'],
  ]) {
    const result = classify(weak, { baaChange }, below, delta)
    assert.equal(result.final.tier, tier)
    assert.equal(result.repair.active, false)
  }
  assert.equal(classify({ ...weak, growth: 0 }, scores, false, -0.05).repair.active, false)
})

test('full and v20 carry identical macro and trend rules and diverge only when repair fires', () => {
  const components = {
    sahm: { value: 0.6 },
    payrolls: { value: 0.14 },
    baaLevel: { value: 50 },
    baaChange: { value: 0 },
    nfciCredit: { value: 0, delta: 0 },
  }
  const signals = [
    { components, tactical: { below: false } },
    { components: { ...components, nfciCredit: { value: 0, delta: 0.01 } }, tactical: { below: false } },
    { components, tactical: { below: true } },
  ].map((frame, i) => {
    const result = evaluate(frame)
    return { d: `2025-0${i + 1}`, final: result.final.tier, regime: result.regime.tier, below: frame.tactical.below }
  })
  const returns = new Map(['2025-03', '2025-04', '2025-05'].map(d => [d, { spx: 0.01, cash: 0.002 }]))
  assert.deepEqual(alignVariants(signals, returns).map(row => row.weights.slice(0, 2)), [
    [0.7, 0.5], [0.5, 0.5], [0.3, 0.3],
  ])
})

test('month-to-date trend uses observed trading closes and the nine prior complete months', () => {
  const price = Array.from({ length: 10 }, (_, i) => [monthEnd('2025-10', -i), i === 9 ? 90 : 100])
    .concat([['2025-11-01', 500]])
  const SP500 = [['2025-10-31', 999], ['2025-11-03', 80], ['2025-11-04', 90], ['2025-11-05', 100], ['2025-11-06', 999]]
  const panel = makePanel({ price, SP500 })
  const frame = panelAt(panel, '2025-11-05')
  assert.deepEqual(frame.tactical.mtd, {
    month: '2025-11', days: 3, remaining: 16, average: 90, prior9: 100, sma10: 99, threshold: 101.875, below: true,
    lastClose: { date: '2025-11-05', value: 100 }, source: FRED_SPX,
    display: '11 月至今 3 个交易日均价 90 点，低于预估 10 个月均线 99 点。',
  })
  assert.equal(frame.tactical.below, false)
  assert.equal(panelAt(panel, '2025-11-30').tactical.mtd, undefined)
  assert.equal(panelAt(makePanel({ price }), '2025-11-05').tactical.mtd, undefined)
  assert.equal(panelAt(makePanel({ price: price.filter(([d]) => d !== '2025-05-31'), SP500 }), '2025-11-05').tactical.mtd, undefined)
  assert.match(buildCurrent('2025-11-05', frame, [], []).distance.tactical, /前 9 个完整月的均价 100 点/)
  const next = panelAt(panel, '2025-11-06')
  assert.equal(next.tactical.mtd.below, false)
})

test('tactical distance counts NYSE sessions and solves for the remaining closes', () => {
  assert.equal(remainingSessions('2026-11-20', '2026-11-30'), 5)
  assert.equal(remainingSessions('2027-12-23', '2027-12-31'), 5)
  assert.equal(remainingSessions('2027-03-24', '2027-03-31'), 4)
  const price = Array.from({ length: 9 }, (_, i) => [monthEnd('2026-10', -i), 100])
  const panel = makePanel({ price, SP500: [['2026-11-19', 120], ['2026-11-20', 90]] })
  const frame = panelAt(panel, '2026-11-23')
  const result = buildCurrent('2026-11-23', frame, [], [])
  assert.equal(frame.tactical.mtd.threshold, (100 * 7 - 120 - 90) / 5)
  assert.match(result.distance.tactical, /剩余 5 个交易日均价低于 98 点/)
  assert.match(result.distance.tactical, /最新收盘 90 点（11 月 20 日）/)
  assert.deepEqual(result.final, evaluate(frame).final)
  const last = panelAt(makePanel({ price: price.map(([d, n]) => [monthEnd(d, 1), n]), SP500: [['2026-12-30', 90]] }), '2026-12-30')
  assert.equal(last.tactical.mtd.remaining, 1)
  assert.equal(last.tactical.mtd.threshold, 110)
  const finished = panelAt(makePanel({ price: price.map(([d, n]) => [monthEnd(d, -12), n]), SP500: [['2025-11-28', 90]] }), '2025-11-29')
  assert.equal(finished.tactical.mtd.remaining, 0)
  assert.equal(finished.tactical.mtd.threshold, null)
  assert.match(buildCurrent('2025-11-29', finished, [], []).distance.tactical, /本月交易日已结束/)
})

test('local S&P closes extend FRED, win overlaps, and warn only above a half-percent difference', () => {
  const warnings = []
  const close = [['2026-11-17', 100], ['2026-11-18', 101], ['2026-11-19', 100]]
  const snapshots = { slices: [{ id: 'spx', symbol: '^GSPC', history: [
    ['2026-11-17', 100.5], ['2026-11-19', 98], ['2026-11-20', 95], ['2026-11-24', 99],
  ] }] }
  const log = line => warnings.push(line)
  const merged = mergeSpxCloses(close, snapshots, '2026-11-23', log)
  assert.deepEqual(merged.rows, [['2026-11-17', 100.5], ['2026-11-18', 101], ['2026-11-19', 98], ['2026-11-20', 95]])
  assert.match(merged.source, /Yahoo Finance.*FRED/)
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /2026-11-19.*2\.00%/)
  assert.equal(mergeSpxCloses([], snapshots, '2026-11-23', log).rows.length, 3)
  assert.equal(mergeSpxCloses(close, null, '2026-11-23', log).source, FRED_SPX)
})

test('display formats percentage scale, percentile, points, basis points, index and dates', () => {
  for (const [value, unit, expected] of [
    [0.0495, '%', '0.05%'], [1.2804, '%', '1.3%'], [4.1955, '%', '4.2%'], [0, '%', '0.0%'],
    [-0.0051, '百分点', '−0.01 个百分点'], [-0.0001, '点', '0.00 点'], [35.891, '点', '35.89 点'],
    [2.5, '百分位', '第 3 百分位'], [95.7077, '百分位', '第 96 百分位'], [241.7, '基点', '242 个基点'],
    [7175.83, '指数', '7,176 点'], [36.44, '倍', '36.4 倍'],
  ]) assert.equal(formatReading(value, unit), expected)
  assert.equal(formatDate('2026-09-01', 'monthly'), '2026 年 9 月')
  assert.equal(formatDate('2026-11-14', 'weekly'), '11 月 14 日当周')
  assert.equal(formatDate('2026-11-20'), '11 月 20 日')
})

test('monthly and weekly release dates govern both current reads and derived windows', () => {
  const panel = makePanel({
    PCEPILFE: [['2024-05-01', 100], ['2024-11-01', 110], ['2025-05-01', 200]],
    SAHMREALTIME: [['2025-06-01', 0.3], ['2025-07-01', 0.6]],
    IC4WSA: Array.from({ length: 52 }, (_, i) => [addDays('2024-08-03', i * 7), i === 0 ? 100 : 105])
      .concat([['2025-08-02', 50]]),
    price: Array.from({ length: 10 }, (_, i) => [monthEnd('2025-07', i - 9), 100 + i])
      .concat([['2025-08-01', 400]]),
  })
  assert.equal(valueAt(panel.PCEPILFE, '2025-06-30').observedOn, '2024-11-01')
  assert.equal(valueAt(panel.PCEPILFE, '2025-07-30').observedOn, '2024-11-01')
  assert.equal(valueAt(panel.PCEPILFE, '2025-07-31').observedOn, '2025-05-01')
  near(panelAt(panel, '2025-06-30').components.corePce.value, 21)
  near(panelAt(panel, '2025-07-31').components.corePce.yoy, 100)
  assert.equal(panelAt(panel, '2025-08-01').components.sahm.value, 0.3)
  assert.equal(panelAt(panel, '2025-08-31').components.sahm.value, 0.6)
  assert.equal(panelAt(panel, '2025-08-06').components.claims.value, 5)
  assert.equal(panelAt(panel, '2025-08-07').components.claims.value, 0)
  assert.equal(panelAt(panel, '2025-08-30').tactical.sma10, 104.5)
  assert.equal(panelAt(panel, '2025-08-31').tactical.sma10, 134.5)
})

test('risk warnings lower confidence without altering tiers; stale overrides agreement', () => {
  const frame = {
    components: {
      sahm: { value: 0.19, observedOn: '2025-01-01' },
      claims: { value: 4, observedOn: '2025-01-04' },
      baaLevel: { value: 34, observedOn: '2025-01-01' },
      baaChange: { value: -0.2, observedOn: '2025-01-01' },
      corePce: { value: 2.4, yoy: 2.6, observedOn: '2025-01-01' },
    },
    tactical: { below: false, price: 100, sma10: 100, display: '持平' },
  }
  const clean = buildCurrent('2025-04-01', frame, [], [])
  const warned = buildCurrent('2025-04-01', frame, [], [
    { grade: 'B', status: 'warn', name: '高收益债' }, { grade: 'B', status: 'clear', name: '波动率' },
    { grade: 'B', status: 'na', name: '市场宽度' }, { grade: 'C', status: 'info', name: '估值' },
  ])
  assert.equal(clean.confidence.level, 'high')
  assert.equal(clean.confidence.agree, 3)
  assert.deepEqual(clean.confidence.counts, { positive: 3, neutral: 0, negative: 0 })
  assert.ok(Math.abs(clean.pillars.reduce((sum, p) => sum + (p.contribution ?? 0), 0) - clean.regime.score) < 1e-9)
  near(clean.pillars[0].contribution, 0.35 / 0.8)
  assert.equal(clean.pillars[2].contribution, null)
  assert.equal(warned.confidence.level, 'medium')
  assert.match(warned.confidence.notes.join(''), /置信度由高降为中/)
  assert.deepEqual(warned.final, clean.final)
  assert.deepEqual(warned.warnings, { on: 1, total: 3, names: ['高收益债'] })
  assert.match(warned.headline, /短线有 1 项预警亮灯，置信度中/)
  assert.equal(clean.pillars[0].components[0].worse.threshold, 0.20)
  assert.equal(clean.pillars[0].components[0].worse.score, 0)
  assert.equal(clean.distance.nearest[0].componentId, 'baaLevel')
  frame.components.claims.stale = true
  assert.equal(buildCurrent('2025-04-01', frame, [], []).confidence.level, 'low')
  frame.components.claims.stale = false
  const warnings = ['高收益债', '波动率', '市场宽度'].map(name => ({ grade: 'B', status: 'warn', name }))
  assert.equal(buildCurrent('2025-04-01', frame, [], warnings.slice(0, 2)).confidence.level, 'medium')
  assert.equal(buildCurrent('2025-04-01', frame, [], warnings).confidence.level, 'low')
  frame.components.corePce.value = 3
  const downgraded = buildCurrent('2025-04-01', frame, [], warnings).confidence
  assert.equal(downgraded.agree, 2)
  assert.deepEqual(downgraded.counts, { positive: 2, neutral: 1, negative: 0 })
  assert.equal(downgraded.level, 'low')
  assert.match(downgraded.notes.join(''), /3 项短线预警亮灯.*置信度由中降为低/)
  frame.components.baaLevel.value = 50
  frame.components.baaChange.value = 0
  const low = buildCurrent('2025-04-01', frame, [], warnings).confidence
  assert.equal(low.agree, 1)
  assert.equal(low.level, 'low')
  assert.match(low.notes.join(''), /置信度维持低档/)
})

test('threshold distances use adjacent cutoffs or derived historical deviations and preserve precision', () => {
  const frame = {
    components: {
      sahm: { value: 0.19, observedOn: '2025-01-01' },
      payrolls: { value: 0.0495, observedOn: '2025-01-01' },
      baaLevel: { value: 34, observedOn: '2025-01-01' },
      fedPath: { value: 0, delta6: -0.4, observedOn: '2025-01-01' },
    },
    tactical: { below: false },
  }
  const historical = Array.from({ length: 120 }, (_, i) => ({
    d: monthEnd('2015-01', i), pillars: {}, components: { fedPath: { delta6: i < 60 ? 50 : 0 } },
  }))
  const current = buildCurrent('2025-04-01', frame, historical, [])
  assert.deepEqual(current.distance.nearest.map(item => item.componentId), ['fedPath', 'payrolls', 'baaLevel'])
  assert.deepEqual(buildCurrent('2025-04-01', frame, historical.slice(-60), []).distance.nearest.map(item => item.componentId),
    ['payrolls', 'baaLevel', 'sahm'])
  const payroll = current.pillars[0].components.find(item => item.id === 'payrolls')
  const fed = current.pillars.find(item => item.id === 'liquidity').components.find(item => item.id === 'fedPath')
  assert.equal(payroll.nearThreshold, true)
  assert.equal(fed.nearThreshold, true)
  assert.match(current.distance.nearest[0].text, /临界，修订或四舍五入就可能翻档/)
  assert.equal(current.pillars[0].components[0].nearThreshold, undefined)
  assert.match(payroll.display, /0\.0495%/)
  assert.match(payroll.better.text, /升至 0\.0500%/)
  assert.equal(current.pillars[0].history.length, 60)
})

test('cost sensitivity subtracts the change in the aligned portfolio weight from each month', () => {
  const full = [
    { portfolio: 0.1, equity: 0.3, cash: 0.01 },
    { portfolio: -0.04, equity: 0.7, cash: 0.01 },
    { portfolio: 0.02, equity: 0.5, cash: 0.01 },
  ]
  const { cagr } = performance(full)
  const costs = transactionCosts(full, cagr)
  near(costs.turnoverPerYear, (0.4 + 0.2) / (3 / 12))
  for (const row of costs.rows) {
    const expected = (1.1 * (0.96 - 0.4 * row.cost) * (1.02 - 0.2 * row.cost)) ** 4 - 1
    near(row.cagr, expected)
    near(row.drag, cagr - expected)
  }
})

test('live retains frozen signals, replaces the current month, and backfills only realized t+2 returns', () => {
  const first = updateLive([], '2026-11-23', { tier: 'offense', equityShare: 1 }, new Map())
  assert.deepEqual(first, {
    since: '2026-11-23', ruleVersion: 'v2.1',
    rows: [{ d: '2026-11', final: 'offense', equityShare: 1, spxReturn: null, portfolioReturn: null }],
  })
  const latest = updateLive(first.rows, '2026-11-27', { tier: 'defense', equityShare: 0.3 }, new Map())
  assert.equal(latest.rows.length, 1)
  assert.equal(latest.rows[0].final, 'defense')
  assert.equal(first.rows[0].final, 'offense')
  const throughDecember = new Map([['2026-12', { spx: 0.9, cash: 0.001 }]])
  const january = updateLive(latest.rows, '2027-01-15', { tier: 'neutral', equityShare: 0.7 }, throughDecember)
  assert.deepEqual(january.rows[0], latest.rows[0])
  const spxOnly = new Map([['2027-01', { spx: 0.11, cash: null }]])
  const february = updateLive(january.rows, '2027-02-01', { tier: 'offense', equityShare: 1 }, spxOnly)
  assert.equal(february.rows[0].spxReturn, 0.11)
  assert.equal(february.rows[0].portfolioReturn, null)
  const returns = new Map([['2027-01', { spx: 0.12, cash: 0.003 }]])
  const updated = updateLive(february.rows, '2027-02-02', { tier: 'offense', equityShare: 1 }, returns)
  assert.equal(updated.rows[0].spxReturn, 0.11)
  near(updated.rows[0].portfolioReturn, 0.11 * 0.3 + 0.003 * 0.7)
  assert.equal(updated.rows[0].equityShare, 0.3)
  assert.equal(updated.rows[1].spxReturn, null)
  assert.deepEqual(updated.rows.map(row => row.d), ['2026-11', '2027-01', '2027-02'])
})

test('t+2 aligns signal with the correct returns and crediting cash', () => {
  const panel = makePanel({
    price: [['2025-01-01', 100], ['2025-02-01', 110], ['2025-03-01', 121], ['2025-04-01', 90]],
    yield: [['2025-02-28', 1.2], ['2025-03-31', 2.4], ['2025-04-30', 8]],
    TB3MS: [['2025-02-01', 1.2], ['2025-03-01', 3.6], ['2025-04-01', 8]],
  })
  const returns = monthlyReturns(panel, '2025-03-31')
  assert.equal(returns.has('2025-04'), false)
  const [first] = alignVariants([
    { d: '2025-01', final: 'defense', regime: 'lean-defense', below: true },
    { d: '2025-02', final: 'offense', regime: 'offense', below: false },
  ], returns)
  assert.equal(first.d, '2025-03')
  assert.deepEqual(first.weights, [0.3, 0.3, 0.5, 0.5, 0.7, 1])
  near(first.spx, 0.102)
  near(first.cash, 0.003)
  near(first.spx * first.weights[0] + first.cash * (1 - first.weights[0]), 0.0327)
  near(horizon(returns, '2025-01', 1).return, 0.102)
  assert.equal(horizon(returns, '2025-01', 2), null)
})

test('CAGR and drawdown include the starting capital and compound monthly returns', () => {
  const returns = [0.1, -0.2, 0.05, -0.1]
  near(drawdown([-0.2, 0.3]), -0.2)
  const result = performance(returns.map(portfolio => ({ portfolio, cash: 0, equity: 1 })))
  near(result.maxDd, (0.8 * 1.05 * 0.9) - 1)
  near(result.cagr, (1.1 * 0.8 * 1.05 * 0.9) ** 3 - 1)
})

test('recession capture finds the earliest defense and false alarms require confirmed clean windows', () => {
  const defensive = new Set(['2020-01', '2020-02', '2020-06', '2021-05', '2021-06', '2021-10',
    '2022-04', '2022-05', '2023-11', '2023-12'])
  const rows = Array.from({ length: 48 }, (_, i) => {
    const d = monthEnd('2020-01', i).slice(0, 7)
    return { d, final: defensive.has(d) ? 'lean-defense' : 'neutral' }
  })
  const recessions = [{ start: '2020-07', end: '2020-08' }, { start: '2023-01', end: '2023-01' }]
  assert.deepEqual(recessionCapture(rows, recessions).map(r => [r.firstDefensive, r.leadMonths]), [['2020-01', 6], ['2022-04', 9]])
  const returns = new Map(rows.map(row => [row.d, { spx: row.d === '2021-07' ? -0.1 : 0 }]))
  const alarms = falseAlarms(rows, recessions, returns)
  assert.equal(alarms.length, 1)
  const [alarm] = alarms
  assert.deepEqual([alarm.start, alarm.end, alarm.months], ['2021-05', '2021-06', 2])
  near(alarm.spxFwd12, -0.1)
  near(alarm.maxDd12, -0.1)
})

test('recession capture ignores one-month flashes and marks defense already active at the window opening', () => {
  const recession = { start: '2020-07', end: '2020-09' }
  const row = d => ({ d, final: 'lean-defense' })
  const capture = months => recessionCapture(months.map(row), [recession])[0]
  assert.deepEqual(capture(['2019-07', '2020-01']), { ...recession, firstDefensive: null, leadMonths: null })
  assert.deepEqual(capture(['2019-07', '2020-01', '2020-02']), { ...recession, firstDefensive: '2020-01', leadMonths: 6 })
  assert.deepEqual(capture(['2019-05', '2019-06', '2019-07', '2020-01', '2020-02']), {
    ...recession, firstDefensive: '2019-07', leadMonths: 12, note: '窗口开始前已持续防守（自 2019-05 起）',
  })
})

test('multpl keeps comma-formatted prices and excludes duplicate unfinished-month estimates', () => {
  const table = [
    '<tr><td>Nov 20, 2026</td><td><abbr>†</abbr>6,955.54</td></tr>',
    '<tr><td>Nov 1, 2026</td><td>7,599.65</td></tr>',
    '<tr><td>Oct 1, 2026</td><td>&#x2002;7,726.69</td></tr>',
  ].join('\n')
  assert.deepEqual(parseMonthlyTable(table, '2026-10-31'), [['2026-10-01', 7726.69]])
})

test('outer source loss degrades to na and records failures; long SP500 history is used only for its warning', () => {
  const panel = { SP500: makeSeries('SP500', Array.from({ length: 200 }, (_, i) => [addDays('2025-01-01', i), i < 199 ? 100 : 90])) }
  const { outer, failedSources } = buildOuter({}, panel, '2025-07-30')
  assert.equal(outer.find(x => x.id === 'spx200').status, 'warn')
  assert.equal(outer.find(x => x.id === 'hyOas').status, 'na')
  assert.deepEqual(failedSources.slice(0, 5), ['美股市场快照', '大师宏观序列', '美股市场宽度', '美国宏观快照', '美股股债利差'])
  assert.ok(failedSources.includes('高收益债信用利差'))
  assert.ok(!failedSources.includes('ISM 制造业采购经理指数'))
})

test('B warnings expire after 14 days or 21 days for weekly liquidity', () => {
  const market = { series: {
    vixDaily: { history: [['2026-11-01', 35]] },
    fedAssets: { history: [['2026-08-02', 100], ['2026-11-01', 90]] },
    treasuryCash: { history: [['2026-08-02', 0], ['2026-11-01', 0]] },
    overnightRrp: { history: [['2026-08-02', 0], ['2026-11-01', 0]] },
  } }
  const indicators = date => buildOuter({ 'us-market-data': market }, {}, date).outer
    .filter(item => ['vix', 'netLiquidity'].includes(item.id))
  assert.deepEqual(indicators('2026-11-15').map(item => item.status), ['warn', 'warn'])
  assert.deepEqual(indicators('2026-11-16').map(item => item.status), ['na', 'warn'])
  assert.deepEqual(indicators('2026-11-22').map(item => item.status), ['na', 'warn'])
  const expired = indicators('2026-11-23')
  assert.deepEqual(expired.map(item => item.status), ['na', 'na'])
  for (const item of expired) assert.equal(item.signal, '读数过旧（最新为 11 月 1 日），暂不参与预警')
})

test('C-level history produces position bands and interpretation at both thresholds', () => {
  const rows = values => values.map((value, i) => [`2025-01-0${i + 1}`, value])
  const { outer } = buildOuter({
    'us-market-data': { series: {
      shillerCape: { history: rows([10, 15, 20, 36.44, 36.44]) },
      finraDebtYoy: { history: rows([12, 10, 0, 12, 0]) },
      naaim: { history: rows([80, 90, 10, 22, 60]) },
    } },
  }, {}, '2025-01-05')
  const [cape, debt, exposure] = ['cape', 'finraDebtYoy', 'naaim'].map(id => outer.find(item => item.id === id))
  assert.deepEqual([cape.level, debt.level, exposure.level], ['high', 'low', 'neutral'])
  assert.equal(cape.value, '第 80 百分位（36.4 倍）')
  assert.match(cape.signal, /长期回报预期/)
})

test('two failed fetch attempts fail the job and preserve the previous output', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'macro-posture-test-'))
  const output = join(directory, 'macro-posture.json')
  const calls = new Map()
  try {
    await writeFile(output, '{"previous":true}\n')
    await assert.rejects(refreshMacroPosture({
      directory, now: new Date('1975-01-16T00:00:00Z'),
      fetcher: async (url, { signal }) => {
        assert.ok(signal instanceof AbortSignal)
        const id = new URL(url).searchParams.get('id')
        calls.set(url, 1 + (calls.get(url) ?? 0))
        if (id === 'PCEPILFE') return new Response('', { status: 503 })
        if (id) return new Response(`observation_date,${id}\n1974-12-01,100\n`)
        return new Response('<tr><td>Dec 1, 1974</td><td>100.00</td></tr>')
      },
    }), /PCEPILFE 抓取失败：HTTP 503/)
    assert.equal(calls.size, FRED_IDS.length + 2)
    assert.deepEqual([...calls.entries()].filter(([, count]) => count === 2).map(([url]) => new URL(url).searchParams.get('id')), ['PCEPILFE'])
    assert.equal(await readFile(output, 'utf8'), '{"previous":true}\n')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

function fixtureFetcher(failures = [], months = 192) {
  const dates = Array.from({ length: months }, (_, i) => monthEnd('1959-01', i))
  const table = dates.map(day => {
    const date = new Date(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    return `<tr><td>${date}</td><td>100.00</td></tr>`
  }).join('\n')
  const levels = { SAHMREALTIME: 0.1, BAA: 5, AAA: 4, GS10: 4, TB3MS: 2, USREC: 0 }
  return async url => {
    const id = new URL(url).searchParams.get('id')
    if (failures.includes(id)) return new Response('', { status: 503 })
    return new Response(id ? [`observation_date,${id}`, ...dates.map(day => `${day},${levels[id] ?? 100}`)].join('\n') : table)
  }
}

test('refresh merges the local S&P slice and retains the prior live rows across output writes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'macro-posture-test-'))
  const output = join(directory, 'macro-posture.json')
  const fetcher = fixtureFetcher([], 817)
  try {
    await writeFile(join(directory, 'us-market-slices.json'), JSON.stringify({
      slices: [{ id: 'spx', symbol: '^GSPC', history: [['2026-11-20', 90]] }],
    }))
    const november = await refreshMacroPosture({ directory, now: new Date('2026-11-23T12:00:00Z'), fetcher })
    assert.deepEqual(november.current.tactical.mtd.lastClose, { date: '2026-11-20', value: 90 })
    assert.match(november.current.tactical.mtd.source, /Yahoo Finance.*FRED/)
    assert.deepEqual(november.current.dates, [
      { label: '宏观月度', date: '2026 年 10 月' },
      { label: '宏观周度', date: '10 月 31 日当周' },
      { label: '企业债利差', date: '2026 年 10 月' },
      { label: '标普收盘', date: '11 月 20 日' },
      { label: '外圈市场数据', date: '11 月 20 日' },
    ])
    assert.deepEqual(november.backtest.live.rows.map(row => row.d), ['2026-11'])
    const february = await refreshMacroPosture({ directory, now: new Date('2027-02-01T12:00:00Z'), fetcher })
    const disk = JSON.parse(await readFile(output, 'utf8'))
    assert.deepEqual(disk.backtest.live, february.backtest.live)
    const [settled, current] = disk.backtest.live.rows
    assert.equal(settled.final, november.current.final.tier)
    assert.equal(settled.equityShare, november.current.final.equityShare)
    near(settled.spxReturn, 100 / 1200)
    near(settled.portfolioReturn, 100 / 1200 * settled.equityShare + 2 / 1200 * (1 - settled.equityShare))
    assert.equal(current.d, '2027-02')
    assert.equal(current.spxReturn, null)
    assert.ok(Math.abs(disk.current.pillars.reduce((sum, p) => sum + (p.contribution ?? 0), 0) - disk.current.regime.score) < 1e-9)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('failed USREC reuses only matching valid monthly marks and can refresh without earlier marks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'macro-posture-test-'))
  const output = join(directory, 'macro-posture.json')
  const options = { directory, now: new Date('1975-01-16T00:00:00Z'), fetcher: fixtureFetcher(['USREC']) }
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const first = await refreshMacroPosture(options)
      assert.deepEqual(first.backtest.recessions, [])
      assert.deepEqual(first.backtest.falseAlarms, [])
      assert.ok(first.backtest.timeline.every(item => item.rec === 0))
      assert.ok(first.failedSources.includes('美国衰退标记'))
      assert.ok(first.backtest.disclosures.some(line => line.includes('暂不统计衰退捕捉及误报')))
    }
    await writeFile(output, JSON.stringify({ backtest: { timeline: [
      { d: '1974-08', rec: 1 }, { d: '1973-10', rec: 1 }, { d: '1974-09', rec: '1' },
    ] } }))
    const cached = await refreshMacroPosture(options)
    assert.deepEqual(cached.backtest.timeline.filter(item => item.rec === 1).map(item => item.d), ['1973-10', '1974-08'])
    assert.ok(cached.backtest.recessions.length > 0)
    assert.equal(cached.backtest.timeline.at(-1).rec, 0)
    assert.ok(cached.failedSources.includes('美国衰退标记'))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('validateComposite accepts a full output and rejects missing root and nested fields', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'macro-posture-test-'))
  try {
    const valid = await refreshMacroPosture({
      directory, now: new Date('1975-01-16T00:00:00Z'), fetcher: fixtureFetcher(['SP500']),
    })
    assert.equal(validateComposite(valid), true)
    assert.throws(() => validateComposite({ ...valid, backtest: undefined }), /root\.backtest/)
    const broken = structuredClone(valid)
    delete broken.current.pillars[0].components[0].rule
    assert.throws(() => validateComposite(broken), /root\.current\.pillars\[0\]\.components\[0\]\.rule/)
    assert.equal(valid.backtest.timeline.length, valid.backtest.months)
    assert.deepEqual(valid.backtest.variants.map(v => v.id), ['full', 'v20', 'macro', 'trend', 'static70', 'buyhold'])
    assert.equal(valid.outer.find(item => item.id === 'hyOas').status, 'na')
    assert.equal(valid.current.tactical.mtd, undefined)
    assert.ok(valid.failedSources.includes('标普日线与 200 日均线'))
    assert.ok(valid.failedSources.includes('标普指数日收盘价'))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
