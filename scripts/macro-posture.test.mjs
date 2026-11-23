import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance as clock } from 'node:perf_hooks'
import test from 'node:test'
import {
  applyTactical, baseTier, buildCurrent, classify, COMPONENTS, evaluate, evaluateV21, evaluateWithoutNfci, pillarScore, scoreComponent,
} from './lib/macro-posture/model.mjs'
import {
  alignVariants, backtestMonthEnds, buildBacktest, DISCLOSURES, drawdown, falseAlarms, horizon, HOURS_LATE_SHARPE_IMPROVEMENT, monthlyReturns,
  performance, recessionCapture, transactionCosts, updateLive,
} from './lib/macro-posture/backtest.mjs'
import { addDays, FRED_SPX, makePanel, makeSeries, monthEnd, panelAt, valueAt } from './lib/macro-posture/panel.mjs'
import { remainingSessions } from './lib/macro-posture/calendar.mjs'
import { buildOuter } from './lib/macro-posture/outer.mjs'
import { formatDate, formatReading } from './lib/macro-posture/format.mjs'
import { loadVintages, panelWithVintages, selectVintage } from './lib/macro-posture/vintages.mjs'
import {
  buildDaily, dailyTactical, extendDailyCache, loadDailyCloses, mergeDailyCloses, priorNine, serializeDailyCache, tierCode,
} from './lib/macro-posture/daily.mjs'
import { FRED_IDS, mergeSpxCloses, parseMonthlyTable, refreshMacroPosture, validateComposite } from './macro-posture.mjs'

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} ≠ ${expected}`)
const components = Object.fromEntries(COMPONENTS.map(def => [def.id, def]))
const score = (id, value, fields) => scoreComponent(components[id], { value, ...fields })

const boundaries = {
  sahm: [[0.1999, 1], [0.20, 0], [0.2999, 0], [0.30, -1], [0.4999, -1], [0.50, -2]],
  claims: [[5, 1], [5.0001, 0], [14.9999, 0], [15, -1], [29.9999, -1], [30, -2]],
  payrolls: [[-0.0001, -2], [0, -1], [0.0499, -1], [0.05, 0], [0.12, 0], [0.1201, 1]],
  indpro: [[-2.0001, -1], [-2, 0], [2, 0], [2.0001, 1]],
  hours: [[-0.5001, -1], [-0.5, -1], [-0.4999, 0], [0.2999, 0], [0.3, 1], [0.3001, 1]],
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

test('v21 and v20 diverge only when repair fires', () => {
  const components = {
    sahm: { value: 0.6 },
    payrolls: { value: 0.14 },
    hours: { value: 0 },
    baaLevel: { value: 50 },
    baaChange: { value: 0 },
    nfciCredit: { value: 0, delta: 0 },
  }
  const signals = [
    { components, tactical: { below: false } },
    { components: { ...components, nfciCredit: { value: 0, delta: 0.01 } }, tactical: { below: false } },
    { components, tactical: { below: true } },
  ].map((frame, i) => {
    const v21 = evaluateV21(frame)
    const full = evaluate(frame)
    return {
      d: `2025-0${i + 1}`, final: full.final.tier, regime: full.regime.tier,
      v21Final: v21.final.tier, v21Regime: v21.regime.tier, below: frame.tactical.below,
    }
  })
  const returns = new Map(['2025-03', '2025-04', '2025-05'].map(d => [d, { spx: 0.01, cash: 0.002 }]))
  assert.deepEqual(alignVariants(signals, returns).map(row => row.weights.slice(1, 3)), [
    [0.7, 0.5], [0.5, 0.5], [0.3, 0.3],
  ])
})

test('v21 and full differ only by the manufacturing hours component', () => {
  const frame = {
    components: {
      sahm: { value: 0.6 }, claims: { value: 7 }, payrolls: { value: 0.14 }, indpro: { value: 1 },
      baaLevel: { value: 50 }, baaChange: { value: 0 }, nfciCredit: { value: 0, delta: 0 },
      hours: { value: 0.3 },
    },
    tactical: { below: false },
  }
  const v21 = evaluateV21(frame)
  const full = evaluate(frame)
  const { hours, ...rest } = full.scores
  assert.equal(hours, 1)
  assert.deepEqual(rest, v21.scores)
  assert.equal(v21.pillars.growth, -0.25)
  assert.equal(full.pillars.growth, 0)
  assert.deepEqual({ ...full.pillars, growth: v21.pillars.growth }, v21.pillars)
  assert.deepEqual(evaluateV21({ ...frame, components: { ...frame.components, hours: { value: -0.5 } } }), v21)
})

test('manufacturing hours respect the next month end in revised and ALFRED data', () => {
  const march = '2025-03-01'
  const september = '2025-09-01'
  const october = '2025-10-01'
  const asOf = '2025-10-31'
  const rows = [['2025-02-01', 40], [march, 40.1], [september, 40.5], [october, 41]]
  const panel = makePanel({ AWHMAN: rows })
  assert.equal(panelAt(panel, '2025-10-30').components.hours.value, null)
  assert.deepEqual(panelAt(panel, asOf).components.hours, {
    observedOn: september, availableOn: asOf, value: 0.4, stale: false,
  })
  const reading = buildCurrent(asOf, panelAt(panel, asOf), [], []).pillars[0].components.find(({ id }) => id === 'hours')
  assert.equal(reading.display, '半年变化 +0.4 小时（2025 年 9 月）')
  const vintages = Object.fromEntries(['PAYEMS', 'INDPRO', 'PCEPILFE', 'IC4WSA'].map(id => [id, { [asOf]: null }]))
  const realtime = panelWithVintages(panel, {
    ...vintages, AWHMAN: { [asOf]: { vintage: '2025-10-15', rows: [[march, 40.1], [september, 39.6], [october, 999]] } },
  }, asOf)
  assert.deepEqual(panelAt(realtime, asOf).components.hours, {
    observedOn: september, availableOn: asOf, value: -0.5, stale: false,
  })
  const fallback = panelWithVintages(panel, { ...vintages, AWHMAN: { [asOf]: { fallback: 'revised' } } }, asOf)
  assert.deepEqual(panelAt(fallback, asOf).components.hours, panelAt(panel, asOf).components.hours)
})

test('manufacturing hours disclosure matches the preregistered late-sample result', async () => {
  const report = JSON.parse(await readFile(new URL('../public/data/macro-posture-candidates.json', import.meta.url), 'utf8'))
  const hours = report.candidates.find(({ id }) => id === 'hours')
  assert.equal(hours.verdict, 'adopt')
  assert.deepEqual(components.hours.masters, hours.masters)
  const delta = hours.withCandidate.late.sharpe - hours.baseline.late.sharpe
  assert.equal(HOURS_LATE_SHARPE_IMPROVEMENT, Number(delta.toFixed(3)))
  assert.ok(DISCLOSURES.some(line => line.includes(`夏普改善约 ${HOURS_LATE_SHARPE_IMPROVEMENT}`)))
})

test('noNfci excludes only both NFCI components and keeps repair on trend and corporate spreads', () => {
  const frame = {
    components: {
      sahm: { value: 0.6 }, payrolls: { value: 0.14 }, hours: { value: 0 },
      baaLevel: { value: 50 }, baaChange: { value: 0 },
      nfci: { value: 0.8, delta: 0.1 }, nfciCredit: { value: 0.1, delta: 0.1 },
      fedPath: { value: -0.1, delta6: -0.5 },
    },
    tactical: { below: false },
  }
  const full = evaluate(frame)
  const noNfci = evaluateWithoutNfci(frame)
  assert.deepEqual(Object.keys(full.scores).filter(id => !Object.hasOwn(noNfci.scores, id)), ['nfciCredit', 'nfci'])
  for (const [id, reading] of Object.entries(noNfci.scores)) assert.equal(reading, full.scores[id])
  assert.equal(noNfci.pillars.credit, full.pillars.credit)
  assert.equal(full.repair.active, false)
  assert.equal(noNfci.repair.active, true)
  assert.equal(evaluateWithoutNfci({ ...frame, tactical: { below: true } }).repair.active, false)
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

test('backtest release dates govern historical reads and derived windows', () => {
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

test('both panel modes expire readings by observation period at the same boundaries', () => {
  const input = {
    SAHMREALTIME: [['2026-06-01', 0.1]],
    PCEPILFE: [['2026-06-01', 100]],
    IC4WSA: [['2026-06-27', 100]],
  }
  for (const panel of [makePanel(input), makePanel(input, { mode: 'current' })]) {
    for (const [id, expiry] of [['sahm', '2026-09-13'], ['corePce', '2026-10-13'], ['claims', '2026-07-18']]) {
      assert.equal(panelAt(panel, expiry).components[id].stale, false)
      assert.equal(panelAt(panel, addDays(expiry, 1)).components[id].stale, true)
    }
  }
})

test('risk warnings lower confidence without altering tiers; stale overrides agreement', () => {
  const frame = {
    components: {
      sahm: { value: 0.19, observedOn: '2025-01-01' },
      claims: { value: 4, observedOn: '2025-01-04' },
      hours: { value: 0.4, observedOn: '2025-01-01' },
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
    since: '2026-11-23', ruleVersion: 'v2.2',
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
    { d: '2025-01', final: 'defense', regime: 'lean-defense', v21Final: 'defense', v21Regime: 'lean-defense', below: true },
    { d: '2025-02', final: 'offense', regime: 'offense', v21Final: 'offense', v21Regime: 'offense', below: false },
  ], returns)
  assert.equal(first.d, '2025-03')
  assert.deepEqual(first.weights, [0.3, 0.3, 0.3, 0.5, 0.5, 0.7, 1])
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

async function seedVintageFixtures(directory, asOf) {
  const vintageDirectory = join(directory, 'macro-posture-vintages')
  const ends = backtestMonthEnds(asOf)
  await mkdir(vintageDirectory)
  await Promise.all(['PAYEMS', 'INDPRO', 'PCEPILFE', 'IC4WSA', 'AWHMAN'].map(id => {
    const cache = Object.fromEntries(ends.map(date => [date, id === 'IC4WSA' ? null : [
      date, Array.from({ length: 15 }, (_, i) => [monthEnd(date, i - 15).slice(0, 7) + '-01', 100]),
    ]]))
    return writeFile(join(vintageDirectory, id + '.json'), JSON.stringify(cache))
  }))
}

test('ALFRED chooses the latest month-end vintage and rechecks a recently filled latest month once', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'macro-posture-vintages-test-'))
  const jan = '2025-01-31'
  const feb = '2025-02-28'
  const vintage = '2025-02-28'
  const calendar = ['2025-01-20', '2025-02-05', vintage, '2025-03-01']
  assert.equal(selectVintage(calendar, jan), '2025-01-20')
  assert.equal(selectVintage(calendar, feb), vintage)
  assert.equal(selectVintage(calendar, '2024-12-31'), null)
  try {
    await Promise.all(['PAYEMS', 'INDPRO', 'PCEPILFE', 'IC4WSA'].map(id => writeFile(
      join(directory, id + '.json'), JSON.stringify(id === 'PAYEMS'
        ? { [jan]: ['2025-01-20', [['2024-12-01', 90]]] } : { [jan]: null, [feb]: null }),
    )))
    const calls = []
    const early = new Date('2025-03-01T05:00:00Z')
    const retry = new Date('2025-03-02T05:00:00Z')
    function load(now, releaseDates, value) {
      return loadVintages([jan, feb], { directory, now, fetcher: async url => {
        const query = new URL(url).searchParams
        calls.push({ query, time: clock.now() })
        if (query.has('seid')) {
          const options = releaseDates.map(date => `<option value="${date}">${date}</option>`).join('')
          return new Response(`<select id="form_selected_vintage_dates">${options}</select>`)
        }
        const day = query.get('vintage_date').replaceAll('-', '')
        return new Response(`observation_date,PAYEMS_${day}\n2025-01-01,100\n2025-02-01,${value}\n2025-03-01,999\n`)
      } })
    }
    const { vintages, requests } = await load(early, calendar.slice(0, 2), 98)
    assert.equal(requests, 2)
    assert.equal(calls[0].query.get('seid'), 'PAYEMS')
    assert.equal(calls[1].query.get('vintage_date'), '2025-02-05')
    assert.ok(calls[1].time - calls[0].time >= 999)
    const panel = makePanel({ PAYEMS: [['2025-02-01', 900]] })
    assert.equal(valueAt(panelWithVintages(panel, vintages, jan).PAYEMS, jan).value, 90)
    assert.equal(valueAt(panelWithVintages(panel, vintages, feb).PAYEMS, feb).value, 98)
    assert.equal(vintages.PAYEMS[feb].fetchedAt, early.toISOString())
    const refreshed = await load(retry, calendar, 101)
    assert.equal(refreshed.requests, 2)
    assert.equal(calls[3].query.get('vintage_date'), vintage)
    assert.equal(valueAt(panelWithVintages(panel, refreshed.vintages, feb).PAYEMS, jan), null)
    assert.deepEqual(refreshed.vintages.PAYEMS[feb], {
      vintage, rows: [['2025-01-01', 100], ['2025-02-01', 101]], fetchedAt: retry.toISOString(), rechecked: true,
    })
    const offline = await loadVintages([jan, feb], {
      directory, now: new Date('2025-03-03T05:00:00Z'), fetcher: () => assert.fail('cache hit requested ALFRED'),
    })
    assert.deepEqual(offline, { vintages: refreshed.vintages, requests: 0 })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('ALFRED marks missing early archives and uses revised points only once released', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'macro-posture-vintages-test-'))
  const day = '1999-12-31'
  const now = new Date('2000-01-10T12:00:00Z')
  try {
    await Promise.all(['PAYEMS', 'INDPRO', 'PCEPILFE'].map(id =>
      writeFile(join(directory, id + '.json'), JSON.stringify({ [day]: null }))))
    const { vintages, requests } = await loadVintages([day], {
      directory, now, fetcher: async url => {
        assert.equal(new URL(url).searchParams.get('seid'), 'IC4WSA')
        return new Response('<select id="form_selected_vintage_dates"><option value="2009-05-28"></option></select>')
      },
    })
    assert.equal(requests, 1)
    assert.deepEqual(JSON.parse(await readFile(join(directory, 'PCEPILFE.json'), 'utf8'))[day], { fallback: 'revised' })
    assert.deepEqual(JSON.parse(await readFile(join(directory, 'IC4WSA.json'), 'utf8'))[day], {
      fallback: 'revised', fetchedAt: now.toISOString(),
    })
    const panel = makePanel({
      PCEPILFE: Array.from({ length: 30 }, (_, i) => [monthEnd('1998-01', i), 100 + i]),
      IC4WSA: Array.from({ length: 75 }, (_, i) => [addDays('1998-11-07', i * 7), 200 + i]),
      FEDFUNDS: [[day, 4]],
    })
    const snapshot = panelWithVintages(panel, vintages, day)
    assert.equal(snapshot.PCEPILFE.length, 15)
    assert.equal(snapshot.IC4WSA.length, 53)
    assert.equal(snapshot.PCEPILFE.at(-1).observedOn, '1999-10-31')
    assert.equal(snapshot.IC4WSA.at(-1).observedOn, '1999-12-25')
    const { corePce, realRate, claims } = panelAt(panel, day).components
    assert.ok([corePce, realRate, claims].every(reading => reading.value != null))
    const revised = panelAt(snapshot, day).components
    assert.deepEqual([revised.corePce, revised.realRate, revised.claims], [corePce, realRate, claims])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('failed ALFRED keeps the previous realtime comparisons while refreshing the current reading and other backtests', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'macro-posture-test-'))
  const output = join(directory, 'macro-posture.json')
  const fetchCore = fixtureFetcher([], 193)
  const warn = () => {}
  try {
    await seedVintageFixtures(directory, '1975-01-16')
    const previous = await refreshMacroPosture({ directory, now: new Date('1975-01-16T12:00:00Z'), fetcher: fetchCore, warn })
    assert.ok(!previous.failedSources.includes('历史版本数据'))
    let attempts = 0
    const fetcher = async url => {
      const { hostname, pathname, searchParams } = new URL(url)
      if (hostname === 'alfred.stlouisfed.org') {
        attempts += 1
        return new Response('', { status: 503 })
      }
      if (searchParams.get('id') === 'SAHMREALTIME') {
        return new Response('observation_date,SAHMREALTIME\n1975-01-01,0.6\n')
      }
      if (pathname.includes('dividend-yield')) {
        const response = await fetchCore(url)
        return new Response((await response.text()).replaceAll('100.00', '80.00'))
      }
      return fetchCore(url)
    }
    const refreshed = await refreshMacroPosture({ directory, now: new Date('1975-02-16T12:00:00Z'), fetcher, warn })
    assert.equal(attempts, 2)
    assert.ok(refreshed.failedSources.includes('历史版本数据'))
    assert.equal(refreshed.generatedAt, '1975-02-16T12:00:00.000Z')
    assert.notDeepEqual(refreshed.current, previous.current)
    assert.equal(refreshed.backtest.end, '1975-01')
    assert.notEqual(refreshed.backtest.variants[0].cagr, previous.backtest.variants[0].cagr)
    assert.deepEqual(refreshed.backtest.variants.slice(1, 3), previous.backtest.variants.slice(1, 3))
    assert.ok(refreshed.backtest.disclosures.some(line => line.includes('沿用上次成功计算')))
    const disclosures = file => file.backtest.disclosures.filter(line => line.startsWith('实时数据'))
    assert.deepEqual(disclosures(refreshed), disclosures(previous))
    assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), refreshed)

    await rm(output)
    const first = await refreshMacroPosture({ directory, now: new Date('1975-02-16T12:00:00Z'), fetcher, warn })
    assert.ok(first.failedSources.includes('历史版本数据'))
    assert.equal(first.backtest.variants.length, 7)
    assert.deepEqual(first.current, refreshed.current)
    assert.equal(first.backtest.end, refreshed.backtest.end)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('refresh uses published observations now and preserves historical and live signals', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'macro-posture-test-'))
  const output = join(directory, 'macro-posture.json')
  const fetcher = fixtureFetcher([], 817)
  const latest = {
    SAHMREALTIME: ['2026-10-01', 0.6], PAYEMS: ['2026-10-01', 102],
    INDPRO: ['2026-10-01', 102], AWHMAN: ['2026-10-01', 99], PCEPILFE: ['2026-09-01', 102],
    NFCI: ['2026-11-21', -0.6],
  }
  const novemberFetcher = async url => {
    const id = new URL(url).searchParams.get('id')
    const response = await fetcher(url)
    if (!Object.hasOwn(latest, id)) return response
    const [day, value] = latest[id]
    const [header, ...rows] = (await response.text()).split('\n')
    return new Response([header, ...rows.filter(row => row.slice(0, 10) < day), `${day},${value}`].join('\n'))
  }
  try {
    await seedVintageFixtures(directory, '2027-02-01')
    await writeFile(output, JSON.stringify({
      backtest: { live: { rows: [{
        d: '2026-11', final: 'offense', equityShare: 1, spxReturn: null, portfolioReturn: null,
      }] } },
    }))
    await writeFile(join(directory, 'us-market-slices.json'), JSON.stringify({
      slices: [{ id: 'spx', symbol: '^GSPC', history: [['2026-11-20', 90]] }],
    }))
    const november = await refreshMacroPosture({
      directory, now: new Date('2026-11-23T12:00:00Z'), fetcher: novemberFetcher,
    })
    const { live, ...historical } = november.backtest
    // Exact output of this fixture with the pre-r7 engine, including both realtime comparisons.
    assert.equal(createHash('sha256').update(JSON.stringify(historical)).digest('hex'),
      '5aa43eab00d499d12ba80319d1638b35b6a8ab1fd13022fb6a22895d00344a60')
    const current = Object.fromEntries(november.current.pillars.flatMap(pillar =>
      pillar.components.map(component => [component.id, component])))
    for (const id of ['sahm', 'payrolls', 'indpro', 'hours', 'corePce', 'nfci']) {
      const day = id === 'corePce' ? '2026-09-01' : id === 'nfci' ? '2026-11-21' : '2026-10-01'
      assert.equal(current[id].observedOn, day, id)
      assert.equal(current[id].availableOn, day, id)
      assert.equal(current[id].stale, false, id)
    }
    assert.match(current.payrolls.display, /2026 年 10 月/)
    assert.match(current.corePce.display, /2026 年 9 月/)
    assert.equal(current.sahm.score, -2)
    assert.equal(current.hours.score, -1)
    assert.equal(november.current.asOf, '2026-11-21')
    assert.deepEqual(november.current.tactical.mtd.lastClose, { date: '2026-11-20', value: 90 })
    assert.match(november.current.tactical.mtd.source, /Yahoo Finance.*FRED/)
    assert.deepEqual(november.current.dates, [
      { label: '宏观月度', date: '2026 年 10 月' },
      { label: '宏观周度', date: '11 月 21 日当周' },
      { label: '企业债利差', date: '2026 年 10 月' },
      { label: '标普收盘', date: '11 月 20 日' },
      { label: '外圈市场数据', date: '11 月 20 日' },
    ])
    assert.deepEqual(live.rows, [{
      d: '2026-11', final: november.current.final.tier, equityShare: november.current.final.equityShare,
      spxReturn: null, portfolioReturn: null,
    }])
    assert.notEqual(live.rows[0].final, 'offense')
    const february = await refreshMacroPosture({ directory, now: new Date('2027-02-01T12:00:00Z'), fetcher })
    const disk = JSON.parse(await readFile(output, 'utf8'))
    assert.deepEqual(disk.backtest.live, february.backtest.live)
    const [settled, februaryRow] = disk.backtest.live.rows
    assert.equal(settled.final, november.current.final.tier)
    assert.equal(settled.equityShare, november.current.final.equityShare)
    near(settled.spxReturn, 100 / 1200)
    near(settled.portfolioReturn, 100 / 1200 * settled.equityShare + 2 / 1200 * (1 - settled.equityShare))
    assert.equal(februaryRow.d, '2027-02')
    assert.equal(februaryRow.spxReturn, null)
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
    await seedVintageFixtures(directory, '1975-01-16')
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
    await seedVintageFixtures(directory, '1975-01-16')
    const valid = await refreshMacroPosture({
      directory, now: new Date('1975-01-16T00:00:00Z'), fetcher: fixtureFetcher(['SP500']),
    })
    assert.equal(validateComposite(valid), true)
    assert.throws(() => validateComposite({ ...valid, backtest: undefined }), /root\.backtest/)
    const broken = structuredClone(valid)
    delete broken.current.pillars[0].components[0].rule
    assert.throws(() => validateComposite(broken), /root\.current\.pillars\[0\]\.components\[0\]\.rule/)
    assert.equal(valid.backtest.timeline.length, valid.backtest.months)
    assert.deepEqual(valid.backtest.variants.map(v => v.id), ['full', 'realtime', 'noNfci', 'v21', 'v20', 'macro', 'trend', 'static70', 'buyhold'])
    assert.ok(valid.tiers.every(tier => tier.actions.length >= 2 && tier.actions.length <= 4))
    assert.equal(valid.outer.find(item => item.id === 'hyOas').status, 'na')
    assert.equal(valid.current.tactical.mtd, undefined)
    assert.ok(valid.failedSources.includes('标普日线与 200 日均线'))
    assert.ok(valid.failedSources.includes('标普指数日收盘价'))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

// ---- 每日档位（设计第 14 节） ----

function dailyFixture({ from = '1995-01', through = '2000-12', spike, closeFor = () => 100 } = {}) {
  const months = []
  for (let date = monthEnd(from); date <= monthEnd(through); date = monthEnd(date, 1)) months.push(date.slice(0, 8) + '01')
  const monthly = value => months.map(day => [day, value])
  const weeks = weekday => {
    const out = []
    const start = new Date(Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5)) - 1, 1))
    while (start.getUTCDay() !== weekday) start.setUTCDate(start.getUTCDate() + 1)
    for (let day = start.toISOString().slice(0, 10); day <= monthEnd(through); day = addDays(day, 7)) out.push(day)
    return out
  }
  const closes = []
  for (let day = months[0]; day <= monthEnd(through); day = addDays(day, 1)) {
    const dow = new Date(day + 'T00:00:00Z').getUTCDay()
    if (dow !== 0 && dow !== 6) closes.push([day, closeFor(day)])
  }
  const averages = new Map()
  for (const [day, value] of closes) {
    const entry = averages.get(day.slice(0, 7)) ?? { sum: 0, count: 0 }
    averages.set(day.slice(0, 7), { sum: entry.sum + value, count: entry.count + 1 })
  }
  const observations = {
    SAHMREALTIME: monthly(0.1), PAYEMS: monthly(100), INDPRO: monthly(100), AWHMAN: monthly(40), PCEPILFE: monthly(100),
    BAA: monthly(5), AAA: monthly(4), FEDFUNDS: monthly(2), GS10: monthly(4), TB3MS: monthly(2), USREC: monthly(0),
    IC4WSA: weeks(6).map(day => [day, day === spike ? 200 : 100]),
    NFCI: weeks(5).map(day => [day, -0.5]), NFCICREDIT: weeks(5).map(day => [day, 0]),
    price: months.map(day => [day, averages.get(day.slice(0, 7)).sum / averages.get(day.slice(0, 7)).count]),
    yield: monthly(2), SP500: closes,
  }
  return { observations, closes, panel: makePanel(observations) }
}

test('daily tiers see a weekly release on its available date, not the day before', () => {
  // 1999-06-05（周六）的初请四周均值按观测日后 5 天，即 6 月 10 日（周四）才可得。
  const { panel, closes } = dailyFixture({ spike: '1999-06-05' })
  const { file } = buildDaily({ closes, panel, start: '1999-01-04', generatedAt: 'x', ruleVersion: 'v' })
  const row = day => file.rows.find(r => r[0] === day)
  assert.equal(row('1999-06-09')[2], 1)
  assert.equal(row('1999-06-10')[2], 2)
  assert.equal(row('1999-06-16')[2], 2)
  assert.equal(row('1999-06-17')[2], 1)
  const change = file.changes.find(c => c.d === '1999-06-10' && c.layer === 'regime')
  assert.deepEqual([change.from, change.to], [1, 2])
  assert.match(change.reason, /^初请失业救济较一年低点升幅 100\.0%，增长与就业转弱/)
  const final = file.changes.find(c => c.d === '1999-06-10' && c.layer === 'final')
  assert.match(final.reason, /^周期档位转为中性：初请/)
  assert.ok(file.changes.some(c => c.d === '1999-06-17' && c.layer === 'regime' && /增长与就业转强/.test(c.reason)))
})

test('daily tactical compares the month-to-date average with the prior nine complete monthly averages', () => {
  assert.deepEqual(dailyTactical(90, 100), { below: true, sma10: 99 })
  assert.deepEqual(dailyTactical(100, 100), { below: false, sma10: 100 })
  assert.deepEqual(dailyTactical(90, null), { below: null, sma10: null })
  // 3 月前两个交易日收 90、之后收 120：均价 90、90、100 → 前两天预估跌破，第三天回到均线。
  const closeFor = day => day.startsWith('1999-03') ? (day <= '1999-03-02' ? 90 : 120) : 100
  const { panel, closes } = dailyFixture({ closeFor })
  near(priorNine(panel, '1999-03-15'), 100)
  assert.equal(priorNine(panel, '1995-06-15'), null)
  const { file } = buildDaily({ closes, panel, start: '1999-01-04', generatedAt: 'x', ruleVersion: 'v' })
  const row = day => file.rows.find(r => r[0] === day)
  assert.deepEqual([row('1999-02-26')[3], row('1999-03-01')[3], row('1999-03-02')[3], row('1999-03-03')[3]], [1, 2, 2, 1])
  assert.ok(file.rows.every(r => r[2] === 1))
  const [down, up] = file.changes.filter(c => c.layer === 'final' && c.d.startsWith('1999-03'))
  assert.deepEqual([down.d, down.reason], ['1999-03-01', '月内均价跌破 10 个月均线预估，战术下调一档'])
  assert.deepEqual([up.d, up.reason], ['1999-03-03', '月内均价回到 10 个月均线预估上方，战术下调取消'])
  assert.equal(row('1999-02-26')[4], 1)
  assert.equal(row('1999-03-01')[4], 0)
})

test('month-end daily tiers match the monthly backtest and the last row matches the current reading', () => {
  // 价格先涨后跌再涨，月末交易日按月均价表与 10 个月均线比较，与月度回测逐月一致。
  const closeFor = day => {
    const t = (Date.parse(day) - Date.parse('1995-01-01')) / 86_400_000
    return 100 + 20 * Math.sin(t / 180) + (t % 7)
  }
  const { panel, closes, observations } = dailyFixture({ closeFor, through: '2000-06' })
  const asOf = '2000-06-21'
  const { backtest, historical } = buildBacktest(panel, asOf)
  const currentPanel = makePanel(observations, { mode: 'current' })
  const recent = closes.filter(([day]) => day <= asOf)
  const currentFrame = panelAt(currentPanel, asOf, asOf)
  const current = buildCurrent(asOf, currentFrame, historical, [])
  const { file, stats } = buildDaily({
    closes: recent, panel, currentFrame, timeline: backtest.timeline, start: '1996-01-02', generatedAt: 'x', ruleVersion: 'v',
  })
  const finals = new Set(backtest.timeline.map(row => row.final))
  assert.ok(finals.size >= 2, 'fixture should exercise the tactical adjustment')
  const monthEnds = file.rows.filter(r => r[4] === 1)
  assert.equal(stats.officialCount, backtest.timeline.filter(row => row.d >= '1996-01' && row.d < '2000-06').length)
  assert.equal(stats.mismatches.length, 0)
  assert.ok(stats.officialCount >= 24, String(stats.officialCount))
  for (const [day, , regime, final] of monthEnds) {
    const monthly = backtest.timeline.find(row => row.d === day.slice(0, 7))
    if (!monthly) continue
    assert.deepEqual([regime, final], [tierCode(monthly.regime), tierCode(monthly.final)], day)
  }
  const last = file.rows.at(-1)
  assert.equal(last[0], '2000-06-21')
  assert.deepEqual([last[2], last[3]], [tierCode(current.regime.tier), tierCode(current.final.tier)])
  assert.match(file.disclosures.join(''), /月末核对：\d+ 个月末交易日中，0 个月/)
})

test('daily changes keep only the latest 200 and month-end mismatches are explained', () => {
  const closeFor = day => 100 + (Number(day.slice(8)) % 2 ? 15 : -15) * (day.slice(5, 7) % 2 ? 1 : -1)
  const { panel, closes } = dailyFixture({ closeFor })
  const { file, stats } = buildDaily({ closes, panel, start: '1996-01-02', generatedAt: 'x', ruleVersion: 'v', maxChanges: 5 })
  assert.ok(stats.changes > 5)
  assert.equal(file.changes.length, 5)
  assert.ok(file.changes.every((c, i) => i === 0 || c.d >= file.changes[i - 1].d))
  assert.ok(file.changes.every(c => c.from !== c.to && ['regime', 'final'].includes(c.layer) && c.reason.length > 4))
  // 月度回测给出不同的档位时，统计为不一致并给出原因。
  const timeline = [{ d: '1999-03', regime: 'lean-offense', final: 'defense', spx: 100, rec: 0 }]
  const checked = buildDaily({ closes, panel, timeline, start: '1999-03-01', generatedAt: 'x', ruleVersion: 'v' })
  assert.equal(checked.stats.officialCount, 1)
  assert.equal(checked.stats.mismatches.length, 1)
  assert.equal(checked.stats.mismatches[0].d, '1999-03')
  assert.match(checked.file.disclosures.join(''), /1 个月的最终档位与月度回测不同.*1999 年 3 月/)
})

test('daily price cache only appends new closes, never creates itself, and recent closes win overlaps', async () => {
  assert.deepEqual(mergeDailyCloses([['2020-01-02', 1], ['2020-01-03', 2]], [['2020-01-03', 3], ['bad', 4], ['2020-01-06', 0]]),
    [['2020-01-02', 1], ['2020-01-03', 3]])
  assert.deepEqual(extendDailyCache([['2020-01-02', 1]], [['2020-01-01', 9], ['2020-01-02', 5], ['2020-01-03', 2.345]]),
    { rows: [['2020-01-02', 1], ['2020-01-03', 2.35]], added: 1 })
  const directory = await mkdtemp(join(tmpdir(), 'macro-posture-daily-'))
  try {
    const missing = await loadDailyCloses([['2020-01-03', 3]], { directory })
    assert.deepEqual(missing, { closes: [['2020-01-03', 3]], cached: false, added: 0 })
    await assert.rejects(readFile(join(directory, 'spx-daily.json')), { code: 'ENOENT' })
    await writeFile(join(directory, 'spx-daily.json'), serializeDailyCache({ source: 's', fetchedAt: '2020-01-02', rows: [['2020-01-02', 1]] }))
    const loaded = await loadDailyCloses([['2020-01-02', 1.5], ['2020-01-03', 3]], { directory, today: '2020-01-04' })
    assert.equal(loaded.added, 1)
    assert.deepEqual(loaded.closes, [['2020-01-02', 1.5], ['2020-01-03', 3]])
    const disk = JSON.parse(await readFile(join(directory, 'spx-daily.json'), 'utf8'))
    assert.deepEqual(disk, { source: 's', fetchedAt: '2020-01-02', updatedAt: '2020-01-04', rows: [['2020-01-02', 1], ['2020-01-03', 3]] })
    const unsettled = await loadDailyCloses([['2020-01-06', 4], ['2020-01-07', 5]], { directory, appendBefore: '2020-01-07' })
    assert.equal(unsettled.added, 1)
    assert.deepEqual(unsettled.closes.slice(-2), [['2020-01-06', 4], ['2020-01-07', 5]])
    assert.deepEqual(JSON.parse(await readFile(join(directory, 'spx-daily.json'), 'utf8')).rows.at(-1), ['2020-01-06', 4])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('refresh writes the daily file with the current reading last, and a daily failure keeps the main output', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'macro-posture-test-'))
  const warnings = []
  try {
    await seedVintageFixtures(directory, '1975-01-16')
    const options = { directory, now: new Date('1975-01-16T12:00:00Z'), fetcher: fixtureFetcher(), warn: message => warnings.push(message) }
    const file = await refreshMacroPosture(options)
    const daily = JSON.parse(await readFile(join(directory, 'macro-posture-daily.json'), 'utf8'))
    assert.deepEqual(Object.keys(daily), ['generatedAt', 'ruleVersion', 'start', 'end', 'rows', 'changes', 'disclosures'])
    assert.equal(daily.ruleVersion, file.ruleVersion)
    assert.equal(daily.generatedAt, file.generatedAt)
    const last = daily.rows.at(-1)
    assert.deepEqual([last[2], last[3]], [tierCode(file.current.regime.tier), tierCode(file.current.final.tier)])
    assert.ok(daily.rows.every(row => row.length === 6 && [0, 1].includes(row[4]) && [0, 1].includes(row[5])))
    await mkdir(join(directory, 'macro-posture-daily'))
    await writeFile(join(directory, 'macro-posture-daily', 'spx-daily.json'), '{broken')
    await rm(join(directory, 'macro-posture.json'))
    const again = await refreshMacroPosture(options)
    assert.equal(again.current.headline, file.current.headline)
    assert.ok(JSON.parse(await readFile(join(directory, 'macro-posture.json'), 'utf8')).current)
    assert.ok(warnings.some(message => message.startsWith('每日档位生成失败')))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('published daily file stays compact and well-formed', async () => {
  let body
  try {
    body = await readFile(new URL('../public/data/macro-posture-daily.json', import.meta.url), 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return
    throw error
  }
  assert.ok(Buffer.byteLength(body) < 700 * 1024, `${Buffer.byteLength(body)} bytes`)
  const daily = JSON.parse(body)
  assert.equal(daily.start, '1973-01-02')
  assert.ok(daily.rows.length > 13_000)
  assert.ok(daily.changes.length <= 200)
  assert.ok(daily.rows.every(([day, close, regime, final]) => /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    Number(close.toFixed(2)) === close && regime >= -1 && regime <= 4 && final >= -1 && final <= 4))
  assert.ok(daily.rows.every((row, i) => i === 0 || row[0] > daily.rows[i - 1][0]))
})
