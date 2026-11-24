import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BOOTSTRAP_DRAWS,
  BOOTSTRAP_SEED,
  alignRadar,
  buildBacktestVerdict,
  buildDisclosures,
  buildEquityCurves,
  buildForwardGroupStats,
  buildRadarBacktest,
  buildSharpeGaps,
  monthEndReturns,
  mulberry32,
} from './lib/market-radar/backtest.mjs'
import { forward12 } from './lib/combined-strategy/matrix.mjs'
import { performance } from './lib/macro-posture/backtest.mjs'
import { makePanel, monthEnd } from './lib/macro-posture/panel.mjs'
import { monthAfter, tierEquity } from './lib/macro-posture-market/backtest.mjs'

const metrics = (sharpe, maxDd = -0.2) => ({
  cagr: 0.1, vol: 0.15, maxDd, sharpe, avgEquity: 0.7, switchesPerYear: 1,
})

function rowsOf(radar, static70, trend, buyhold = 0.5) {
  return [
    { id: 'radar', label: '市场雷达', full: metrics(radar, -0.312), test: metrics(radar), train: metrics(radar) },
    { id: 'static70', label: '恒定七成股票', full: metrics(static70), test: metrics(static70), train: metrics(static70) },
    { id: 'trend', label: '10 个月均线', full: metrics(trend, -0.286), test: metrics(trend), train: metrics(trend) },
    { id: 'buyhold', label: '全程持有标普', full: metrics(buyhold), test: metrics(buyhold), train: metrics(buyhold) },
  ]
}

function gapsOf(entries) {
  return entries.map(([versus, label, diff, low, high]) => ({ versus, label, diff, low, high }))
}

test('净值曲线起点为 1，末值与 performance 年化一致', () => {
  const signals = [
    { d: '2020-01', radar: 'offense', below: false },
    { d: '2020-02', radar: 'offense', below: false },
    { d: '2020-03', radar: 'defense', below: true },
    { d: '2020-04', radar: 'neutral', below: false },
  ]
  const returns = new Map([
    ['2020-03', { spx: 0.02, cash: 0.001 }],
    ['2020-04', { spx: -0.01, cash: 0.001 }],
    ['2020-05', { spx: 0.03, cash: 0.001 }],
    ['2020-06', { spx: 0.01, cash: 0.001 }],
  ])
  const equity = row => tierEquity(row.radar)
  const aligned = alignRadar(signals, returns, equity)
  const curves = buildEquityCurves(signals, returns)
  assert.equal(curves.length, aligned.length)
  assert.ok(curves.every(row => row.radar > 0))
  let wealth = 1
  for (const row of aligned) wealth *= 1 + row.portfolio
  assert.equal(curves.at(-1).radar, Number(wealth.toFixed(4)))
  const cagr = performance(aligned).cagr
  const years = aligned.length / 12
  const fromExact = wealth ** (1 / years) - 1
  assert.ok(Math.abs(fromExact - cagr) < 1e-12)
})

test('sharpeGaps：相同输入两次结果完全相同', () => {
  const make = (seed, n = 36) => {
    const rng = mulberry32(seed)
    return Array.from({ length: n }, (_, i) => {
      const spx = (rng() - 0.45) * 0.08
      const cash = 0.002
      const equity = 0.5 + (i % 5) * 0.1
      return {
        d: monthAfter('2000-01', i),
        cash,
        equity,
        portfolio: equity * spx + (1 - equity) * cash,
        spx,
      }
    })
  }
  const radar = make(1)
  const static70 = radar.map(row => ({ ...row, equity: 0.7, portfolio: 0.7 * row.spx + 0.3 * row.cash }))
  const trend = radar.map((row, i) => {
    const equity = i % 7 < 2 ? 0.5 : 1
    return { ...row, equity, portfolio: equity * row.spx + (1 - equity) * row.cash }
  })
  const buyhold = radar.map(row => ({ ...row, equity: 1, portfolio: row.spx }))
  const a = buildSharpeGaps({ radar, static70, trend, buyhold })
  const b = buildSharpeGaps({ radar, static70, trend, buyhold })
  assert.deepEqual(a, b)
  assert.equal(a.length, 3)
  assert.deepEqual(a.map(row => row.versus), ['static70', 'trend', 'buyhold'])
  for (const row of a) {
    assert.equal(Object.is(row.diff, Number(row.diff.toFixed(3))), true)
    assert.equal(Object.is(row.low, Number(row.low.toFixed(3))), true)
    assert.equal(Object.is(row.high, Number(row.high.toFixed(3))), true)
    assert.ok(row.low <= row.diff && row.diff <= row.high)
  }
  assert.equal(BOOTSTRAP_DRAWS, 2000)
  assert.equal(typeof BOOTSTRAP_SEED, 'number')
})

test('verdict：区间含 0 合并措辞；不单独提全程持有；高于/低于分写', () => {
  const rows = rowsOf(0.52, 0.49, 0.54, 0.48)
  const within = buildBacktestVerdict(rows, gapsOf([
    ['static70', '恒定七成股票', 0.03, -0.06, 0.15],
    ['trend', '十个月均线', -0.02, -0.1, 0.05],
    ['buyhold', '全程持有标普', 0.04, -0.02, 0.12],
  ]))
  assert.match(within, /与恒定七成股票（0\.49，全程持有标普按构造与它相同）、十个月均线（0\.54）的差异都在抽样误差内/)
  assert.equal(within.includes('与全程持有标普的差异'), false)
  assert.equal(/高于|低于/.test(within), false)
  assert.match(within, /雷达全样本夏普 0\.52/)
  assert.match(within, /最大回撤 −31\.2%/)
  assert.match(within, /雷达只从股市自身看冷热，仓位怎么定见综合策略页。$/)

  const above = buildBacktestVerdict(rows, gapsOf([
    ['static70', '恒定七成股票', 0.08, 0.02, 0.14],
    ['trend', '十个月均线', -0.05, -0.12, -0.01],
    ['buyhold', '全程持有标普', 0.1, 0.03, 0.2],
  ]))
  assert.match(above, /高于恒定七成股票的 0\.49/)
  assert.match(above, /低于十个月均线的 0\.54/)
  assert.equal(above.includes('全程持有标普的 0.48'), false)
  assert.equal(above.includes('抽样误差内'), false)

  const below = buildBacktestVerdict(rows, gapsOf([
    ['static70', '恒定七成股票', -0.08, -0.14, -0.02],
    ['trend', '十个月均线', -0.1, -0.2, -0.03],
    ['buyhold', '全程持有标普', -0.05, -0.11, -0.01],
  ]))
  assert.match(below, /低于恒定七成股票的 0\.49/)
  assert.match(below, /低于十个月均线的 0\.54/)
  assert.equal(below.includes('全程持有标普的 0.48'), false)
})

test('没有样本的档位与冷热：months 为 0，其余 null', () => {
  const signals = [
    { d: '2010-01', radar: 'offense', heat: 'hot' },
    { d: '2010-02', radar: 'offense', heat: 'hot' },
  ]
  const returns = new Map([
    ['2010-03', { spx: 0.01, cash: 0 }],
    ['2010-04', { spx: 0.02, cash: 0 }],
    ['2010-05', { spx: -0.01, cash: 0 }],
    ['2010-06', { spx: 0.01, cash: 0 }],
    ['2010-07', { spx: 0.01, cash: 0 }],
    ['2010-08', { spx: 0.01, cash: 0 }],
    ['2010-09', { spx: 0.01, cash: 0 }],
    ['2010-10', { spx: 0.01, cash: 0 }],
    ['2010-11', { spx: 0.01, cash: 0 }],
    ['2010-12', { spx: 0.01, cash: 0 }],
    ['2011-01', { spx: 0.01, cash: 0 }],
    ['2011-02', { spx: 0.01, cash: 0 }],
    ['2011-03', { spx: 0.01, cash: 0 }],
    ['2011-04', { spx: 0.01, cash: 0 }],
  ])
  const { tierStats, heatStats } = buildForwardGroupStats(signals, returns)
  assert.equal(tierStats.length, 5)
  assert.equal(heatStats.length, 3)
  const emptyTier = tierStats.find(row => row.tier === 'defense')
  assert.deepEqual(emptyTier.all, { months: 0, fwd12: null, neg12: null, maxDd12: null })
  assert.deepEqual(emptyTier.since2000, { months: 0, fwd12: null, neg12: null, maxDd12: null })
  const emptyHeat = heatStats.find(row => row.heat === 'cold')
  assert.deepEqual(emptyHeat.all, { months: 0, fwd12: null, neg12: null, maxDd12: null })
  const offense = tierStats.find(row => row.tier === 'offense')
  assert.equal(offense.all.months, 2)
  assert.ok(Number.isFinite(offense.all.fwd12))
  const expected = forward12(returns, '2010-01')
  assert.ok(expected)
})

test('月末收盘口径只换标普月回报、不换信号；股息与现金沿用 panel', () => {
  const price = [
    ['2019-12-01', 100], ['2020-01-01', 102], ['2020-02-01', 101], ['2020-03-01', 105],
  ]
  const panel = makePanel({
    price,
    yield: [['2019-12-01', 2.4], ['2020-01-01', 2.4], ['2020-02-01', 2.4], ['2020-03-01', 2.4]],
    TB3MS: [['2019-12-01', 1.2], ['2020-01-01', 1.2], ['2020-02-01', 1.2], ['2020-03-01', 1.2]],
  })
  const dailyRows = [
    ['2019-12-31', 110],
    ['2020-01-31', 121],
    ['2020-02-28', 115],
    ['2020-03-31', 130],
  ]
  const lastComplete = '2020-03-31'
  const me = monthEndReturns(panel, dailyRows, lastComplete)
  assert.ok(me.has('2020-01'))
  assert.ok(me.has('2020-02'))
  // 121/110 - 1 + 2.4/1200
  assert.ok(Math.abs(me.get('2020-01').spx - (121 / 110 - 1 + 2.4 / 1200)) < 1e-12)
  assert.equal(me.get('2020-01').cash, 1.2 / 1200)
  // 月均价回报不同
  const avgSpx = 102 / 100 - 1 + 2.4 / 1200
  assert.notEqual(me.get('2020-01').spx, avgSpx)
})

test('buildDisclosures：动态数字 + 固定条文 + revisionNotes 原样追加，无内部编号重复条', () => {
  const monthEndRows = [
    { id: 'buyhold', label: '全程持有标普', full: metrics(0.479, -0.5), test: metrics(0.4) },
    { id: 'radar', label: '市场雷达', full: metrics(0.52, -0.4), test: metrics(0.45) },
    { id: 'trend', label: '10 个月均线', full: metrics(0.535, -0.35), test: metrics(0.5) },
    { id: 'static70', label: '恒定七成股票', full: metrics(0.49, -0.36), test: metrics(0.42) },
  ]
  const note = '2026 年 11 月 24 日修正了回测里每股盈利与市盈率的取数时点。'
  const text = buildDisclosures({
    monthEndRows,
    household: { corr: 0.84, sameShare: 0.737, opposite: 0 },
    revisionNotes: [note],
  })
  assert.ok(text.some(line => /月末收盘口径/.test(line) && /0\.48/.test(line) && /0\.52/.test(line)))
  assert.ok(text.some(line => /家庭配置/.test(line) && /0\.84/.test(line) && /73\.7%/.test(line) && /从不相反|0 个月份相反/.test(line)))
  assert.equal(text.some(line => /A1、A2、B5 修正记录/.test(line)), false)
  assert.ok(text.some(line => /新增 18 项只展示指标/.test(line)))
  assert.ok(text.some(line => /读数过期或来源停更时不给冷热/.test(line)))
  assert.ok(text.some(line => /每股盈利只用季末值/.test(line)))
  assert.equal(text.at(-1), note)
})

test('buildRadarBacktest 输出 curves / tierStats / heatStats / monthEndRows / sharpeGaps / score·dims', () => {
  // 跨过 2000-01，保证 train / test 都有样本；预造 signals，不依赖正在改的 sources
  const months = 60
  const price = Array.from({ length: months + 2 }, (_, i) => [monthEnd('1998-01', i), 100 + i])
  const yieldRows = price.map(([d]) => [d, 2])
  const cashRows = price.map(([d]) => [d, 1])
  const panel = makePanel({ price, yield: yieldRows, TB3MS: cashRows })
  const dailyRows = price.map(([d], i) => [d, 100 + i * 1.5])
  const signals = Array.from({ length: months }, (_, i) => {
    const d = monthAfter('1998-01', i)
    const radar = ['offense', 'lean-offense', 'neutral', 'lean-defense', 'defense'][i % 5]
    const heat = ['hot', 'mid', 'cold'][i % 3]
    return {
      d, radar, masters: 'neutral', below: i % 11 === 0, spx: 100 + i,
      heatScore: heat === 'hot' ? -0.6 : heat === 'cold' ? 0.6 : 0,
      heat, score: (i % 5) * 0.1 - 0.2, dims: [0.1, -0.2, 0, 0.3, null],
    }
  })
  const out = buildRadarBacktest({
    historical: {}, panel, vintages: {}, dailyRows, today: '2003-02-15', signals,
  })
  assert.ok(out.curves.length > 0)
  assert.deepEqual(Object.keys(out.curves[0]).sort(), ['buyhold', 'd', 'radar', 'static70', 'trend'].sort())
  assert.equal(out.tierStats.length, 5)
  assert.equal(out.heatStats.length, 3)
  assert.equal(out.monthEndRows.length, 4)
  assert.ok(out.monthEndRows.every(row => row.full && row.test && !row.train))
  assert.equal(out.sharpeGaps.length, 3)
  assert.deepEqual(out.timeline[0].dims, signals[0].dims)
  assert.equal(out.timeline[0].score, signals[0].score)
  assert.match(out.verdict, /抽样误差内|高于|低于/)
  assert.equal(out.verdict.includes('与全程持有标普的差异'), false)
  assert.ok(out.disclosures.some(line => /月末收盘口径/.test(line)))
  assert.ok(out.disclosures.some(line => /新增 18 项只展示指标/.test(line)))
  assert.equal(out.disclosures.some(line => /A1、A2、B5 修正记录/.test(line)), false)
})
