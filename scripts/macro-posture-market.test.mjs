import assert from 'node:assert/strict'
import test from 'node:test'
import { buildBreadth, marketSeries, parseFrenchMonthly, parseYahooVolume } from './lib/macro-posture-market/data.mjs'
import { configurations, marketScore, readMarket, scoreMarket } from './lib/macro-posture-market/components.mjs'
import { alignMarket, runStage1 } from './lib/macro-posture-market/backtest.mjs'
import { classify, evaluate, PILLARS } from './lib/macro-posture/model.mjs'
import { makePanel, monthEnd, panelAt, valueAt } from './lib/macro-posture/panel.mjs'
import { evaluateFifthPillar, judgeWeights, scaleWeights } from './lib/macro-posture-market/stage2.mjs'

test('每个变体的预注册阈值包含等号，窄幅领涨宽度要求严格小于 50%', () => {
  for (const [id, variant, cutoff, score, inner] of [
    ['breadth', 'a', 30, -1, 30.01], ['breadth', 'a', 70, 1, 69.99],
    ['breadth', 'b', 40, -1, 40.01], ['breadth', 'b', 60, 1, 59.99],
    ['erp', 'a', 0, -1, 0.01], ['erp', 'a', 3, 1, 2.99],
    ['erp', 'b', 1, -1, 1.01], ['erp', 'b', 4, 1, 3.99],
    ['cape', 'a', 90, -1, 89.99], ['cape', 'a', 30, 1, 30.01],
    ['cape', 'b', 80, -1, 79.99], ['cape', 'b', 20, 1, 20.01],
  ]) {
    assert.equal(scoreMarket(id, variant, { [id]: { value: cutoff } }), score)
    assert.equal(scoreMarket(id, variant, { [id]: { value: inner } }), 0)
    assert.equal(scoreMarket(id, variant, {}), null)
  }
  for (const [variant, cutoff] of [['a', 1.10], ['b', 1.20]]) {
    assert.equal(scoreMarket('volume', variant, { volume: { value: cutoff, below: true } }), -1)
    assert.equal(scoreMarket('volume', variant, { volume: { value: cutoff, below: false } }), 1)
    assert.equal(scoreMarket('volume', variant, { volume: { value: cutoff - 0.001, below: true } }), 0)
    assert.equal(scoreMarket('volume', variant, { volume: { value: cutoff, below: null } }), null)
  }
  assert.equal(scoreMarket('narrow', null, { narrow: { value: 5, breadth: 49.99 } }), -1)
  assert.equal(scoreMarket('narrow', null, { narrow: { value: 5, breadth: 50 } }), 0)
  assert.equal(scoreMarket('narrow', null, { narrow: { value: 5.01, breadth: 49.99 } }), 0)
})

test('只解析行业月度市值加权段，缺失行业排除且历史发布日为 m+2', () => {
  const header = ',' + Array.from({ length: 49 }, (_, i) => '行业' + i).join(',')
  const rows = Array.from({ length: 10 }, (_, i) =>
    '2000' + String(i + 1).padStart(2, '0') + ',1,-1,' + Array(46).fill('-99.99').join(',') + ',-999')
  const csv = ['Average Value Weighted Returns -- Monthly', header, ...rows, '', 'Average Equal Weighted Returns -- Monthly', header, ...rows].join('\n')
  const breadth = buildBreadth(parseFrenchMonthly(csv))
  assert.deepEqual(breadth, [['2000-10-31', 50]])
  assert.equal(valueAt(marketSeries(breadth, 2), '2000-12-30'), null)
  assert.equal(valueAt(marketSeries(breadth, 2), '2000-12-31').value, 50)
  assert.equal(valueAt(marketSeries(breadth, 2, true), '2000-10-31').value, 50)
})

test('PE 等到 m+3，CAPE 百分位只含当时历史，窄幅领涨使用已可得宽度', () => {
  const price = Array.from({ length: 12 }, (_, i) => [monthEnd('2000-01', i), i === 11 ? 95 : 100])
  const panel = makePanel({ price, GS10: [['2000-12-01', 3]] })
  const data = {
    breadth: marketSeries([['2000-10-31', 49], ['2000-11-30', 60]], 2),
    pe: marketSeries([['2000-09-30', 20], ['2000-10-31', 10]], 3),
    cape: marketSeries([['2000-11-30', 10], ['2000-12-01', 15], ['2000-12-31', 20], ['2001-01-31', 30]], 0),
    volume: [],
  }
  const now = readMarket(data, panel, '2000-12-31')
  assert.equal(now.narrow.value, 5)
  assert.equal(now.narrow.breadth, 49)
  assert.equal(now.erp.value, 2)
  assert.equal(now.cape.value, 75)
})

test('Yahoo 只缓存已完成月的有效日成交量均值', () => {
  const timestamp = ['2000-01-03', '2000-01-04', '2000-01-05', '2000-02-01'].map(d => Date.parse(d) / 1000)
  const json = { chart: { result: [{ timestamp, indicators: { quote: [{ volume: [10, null, 30, 40] }] } }] } }
  assert.deepEqual(parseYahooVolume(json, '2000-01-31'), [['2000-01-31', 20]])
})

test('仅枚举实际用到的变体，所有已知分数含零参与构造均值', () => {
  const configs = configurations()
  assert.deepEqual(['A', 'B', 'C', 'D'].map(c => configs.filter(v => v.construction === c).length), [4, 8, 8, 16])
  assert.equal(new Set(configs.map(c => c.id)).size, 36)
  assert.equal(marketScore(configs[0], { breadth: { value: 30 }, narrow: { value: 7, breadth: 0 } }), -0.5)
  assert.equal(marketScore(configs[0], {}), null)
})

test('按收益月份切分，仅改验证月收益不会改变第一阶段选中组合', () => {
  const days = ['1999-05', '1999-06', '1999-07', '1999-08', '1999-09', '1999-10', '1999-11', '1999-12', '2000-01']
  const reads = [35, 65, 45, 35, 65, 45, 35, 65, 45]
  const signals = days.map((d, i) => ({ d, below: false, readings: { breadth: { value: reads[i] } } }))
  const returns = new Map(days.map((d, i) => [monthEnd(d, 2).slice(0, 7), { cash: 0, spx: [0.06, -0.04, 0.01][i % 3] }]))
  assert.equal(alignMarket(signals, returns, () => 1, '1999-01')[0].d, '1999-07')
  const initial = runStage1(signals, returns)
  returns.set('2000-01', { cash: 0, spx: -0.99 })
  const altered = runStage1(signals, returns)
  assert.equal(initial.chosenId, altered.chosenId)
  assert.deepEqual(initial.configs.map(c => c.train), altered.configs.map(c => c.train))
  assert.notDeepEqual(initial.configs[0].test, altered.configs[0].test)
})

test('第五支柱保留原四支柱的相对权重，已知权重之和为 1', () => {
  const pillars = Object.fromEntries(PILLARS.map(({ id }) => [id, 0]))
  for (const w of [0.1, 0.15, 0.2, 0.25]) {
    const scaled = scaleWeights(pillars, 0, w)
    assert.ok(Math.abs(Object.values(scaled).reduce((a, b) => a + b, 0) - 1) < 1e-12)
    assert.equal(scaled.market, w)
    assert.ok(Math.abs(scaled.growth / scaled.credit - pillarsRatio()) < 1e-12)
    const partial = scaleWeights({ ...pillars, inflation: null }, 0, w)
    assert.ok(Math.abs(Object.values(partial).reduce((a, b) => a + b, 0) - 1) < 1e-12)
  }
  const frame = panelAt(makePanel({}), '2000-01-31', null)
  const baseline = evaluate(frame)
  assert.equal(evaluateFifthPillar(frame, baseline, 1, 0.25), baseline.final.tier)
})

const pillarsRatio = () => PILLARS.find(p => p.id === 'growth').weight / PILLARS.find(p => p.id === 'credit').weight

test('第五支柱带来的新档位仍受熔断、战术下调与修复确认约束', () => {
  const frame = (below, delta) => ({ tactical: { below }, components: { nfciCredit: { delta } } })
  const baseline = (below, delta, scores) => {
    const pillars = { growth: 0, credit: 0, liquidity: 0, inflation: 0 }
    return { ...classify(pillars, scores, below, delta), pillars, scores }
  }
  assert.equal(evaluateFifthPillar(frame(true, 0), baseline(true, 0, { baaChange: 0 }), -1, 0.25), 'defense')
  assert.equal(evaluateFifthPillar(frame(false, 0), baseline(false, 0, { baaChange: 0 }), -1, 0.25), 'neutral')
  assert.equal(evaluateFifthPillar(frame(false, 1), baseline(false, 1, { baaChange: 0 }), -1, 0.25), 'lean-defense')
  assert.equal(evaluateFifthPillar(frame(false, 1), baseline(false, 1, { sahm: -2 }), 1, 0.25), 'lean-defense')
})

test('采用判定覆盖各条、第 13.4 节边界和缺失衰退标记', () => {
  const results = (train, validation, full) => ({ train, test: validation, full })
  const base = results({ sharpe: 0.6, maxDd: -0.3 }, { sharpe: 0.5, maxDd: -0.3 },
    { cagr: 0.08, recessionsCaught: 3, falseAlarmMonths: 10 })
  const candidate = results({ sharpe: 0.6, maxDd: -0.31 }, { sharpe: 0.51, maxDd: -0.31 },
    { cagr: 0.077, recessionsCaught: 3, falseAlarmMonths: 12 })
  assert.equal(judgeWeights(base, candidate).verdict, 'adopt')
  for (const [slice, key, value] of [
    ['train', 'sharpe', 0.599], ['train', 'maxDd', -0.311],
    ['test', 'sharpe', 0.509], ['test', 'maxDd', -0.311],
    ['full', 'cagr', 0.0769], ['full', 'recessionsCaught', 2],
    ['full', 'falseAlarmMonths', 13], ['full', 'falseAlarmMonths', undefined],
  ]) {
    const changed = { ...candidate, [slice]: { ...candidate[slice], [key]: value } }
    assert.equal(judgeWeights(base, changed).verdict, 'reference')
  }
})

test('localMultplTable reshapes cached Multpl readings into one row per month plus the latest reading', async () => {
  const { localMultplTable } = await import('./lib/macro-posture-market/data.mjs')
  const rows = [['2026-10-01', 26.16], ['2026-11-01', 25.73], ['2026-11-18', 24.96], ['2026-11-19', 24.46], ['2026-11-20', 23.55], ['2026-11-30', 1]]
  assert.deepEqual(localMultplTable(rows, '2026-11-24'), [['2026-10-01', 26.16], ['2026-11-01', 25.73], ['2026-11-20', 23.55]])
})
