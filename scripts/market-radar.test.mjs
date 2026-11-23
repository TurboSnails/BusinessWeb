import assert from 'node:assert/strict'
import { test } from 'node:test'
import { alignRadar, blendEquity } from './lib/market-radar/backtest.mjs'
import { aggregateScores, buildIndicators, rankAt, scoreAt, scoreIndicator } from './lib/market-radar/indicators.mjs'
import { buildRadarSeries, parseShillerEps } from './lib/market-radar/sources.mjs'
import { marketSeries } from './lib/macro-posture-market/data.mjs'
import { makePanel } from './lib/macro-posture/panel.mjs'

test('雷达计分阈值含边界，保留中间区间的零分', () => {
  const byValue = {
    baaChange: [[-0.15, 1], [-0.149, 0], [0.199, 0], [0.20, -1]],
    finraDebtYoy: [[-20, 1], [-19.99, 0], [29.99, 0], [30, -1]],
    breadth: [[40, -1], [40.01, 0], [59.99, 0], [60, 1]],
    epsYoy: [[-10, -1], [-9.99, 0], [9.99, 0], [10, 1]],
  }
  for (const [id, cases] of Object.entries(byValue)) {
    for (const [value, expected] of cases) assert.equal(scoreIndicator(id, { value }, null), expected, id)
    assert.equal(scoreIndicator(id, null, null), null, id)
  }
  for (const [id, lowScore] of [['erp', -1], ['pe', 1], ['cape', 1], ['equityShare', 1], ['cashShare', -1]]) {
    const point = { value: 25 }
    assert.equal(scoreIndicator(id, point, 20), lowScore, id)
    assert.equal(scoreIndicator(id, point, 20.01), 0, id)
    assert.equal(scoreIndicator(id, point, 79.99), 0, id)
    assert.equal(scoreIndicator(id, point, 80), -lowScore, id)
    assert.equal(scoreIndicator(id, point, null), null, id)
  }
  assert.equal(scoreIndicator('volume', { value: 1.099, below: true }, null), 0)
  assert.equal(scoreIndicator('volume', { value: 1.10, below: true }, null), -1)
  assert.equal(scoreIndicator('volume', { value: 1.10, below: false }, null), 1)
  assert.equal(scoreIndicator('volume', { value: 1.10, below: null }, null), null)
})

test('扩张百分位按可得日截断并对并列取中位排名', () => {
  const pe = marketSeries([
    ['1972-06-30', 10], ['1972-07-31', 10], ['1972-08-31', 15], ['1972-09-30', 20],
    ['1972-10-31', 12], ['1972-11-30', 12], ['1972-12-31', 12], ['1973-01-31', 12],
  ], 3)
  assert.equal(rankAt(pe, '1972-09-29'), null)
  assert.equal(rankAt(pe, '1972-10-31').percentile, 50)
  assert.equal(rankAt(pe, '1972-12-31').percentile, 87.5)
  assert.equal(scoreAt({ pe }, '1972-12-31'), -1)
  assert.equal(scoreAt({ pe }, '1973-01-31'), 0)
  const currentPe = buildIndicators({ pe }, {}, '1972-12-31').find(row => row.id === 'pe')
  assert.equal(currentPe.percentileSince, '1972-06-30')
  // 历史不足 3 年：不给百分位与冷热
  assert.equal(currentPe.percentile, null)
  assert.equal(currentPe.heat, 'na')
  assert.match(currentPe.note, /历史不足 3 年/)
  assert.deepEqual(currentPe.history.map(([d]) => d), pe.slice(0, 4).map(row => row.observedOn))
})

test('当前 PE 使用已发布读数，历史 PE、家庭配置和盈利遵守各自滞后', () => {
  const shillerEps = parseShillerEps([
    'date,P,D,E,CPI,GS10', '1871-01,4.44,0.26,0.4,12.46,5.32', '1872-01,4.80,0.30,0.45,12.46,5.32',
    '2025-07,1,1,100,1,1', '2026-07,1,1,110,1,1', '2026-08,1,1,,1,1',
  ].join('\n'))
  const cashRows = [['2026-01-01', 8], ['2026-04-01', 9], ['2026-07-01', 10]]
  const fetched = {
    CDCABSHNO: cashRows, TSDABSHNO: cashRows, MMFSABSHNO: cashRows, TFAABSHNO: [
      ['2026-01-01', 100], ['2026-04-01', 100], ['2026-07-01', 100],
    ], vix: [], vix3m: [],
  }
  const core = { GS10: [['2026-10-01', 4]], price: [] }
  const { current, historical } = buildRadarSeries({
    local: { spxPe: { history: [['2026-07-01', 10], ['2026-08-01', 15], ['2026-10-01', 20], ['2026-11-20', 25]] } },
    macroUs: { equityShare: { long: cashRows } }, marketCache: { breadth: [], volume: [] }, fetched, shillerEps,
    panel: makePanel(core), currentPanel: makePanel(core, { mode: 'current' }), today: '2026-11-23', lastComplete: '2026-10-31',
  })
  assert.equal(rankAt(current.pe, '2026-11-23').point.value, 25)
  assert.equal(rankAt(current.erp, '2026-11-23').point.value, 0)
  assert.equal(rankAt(historical.pe, '2026-10-31').point.value, 10)
  assert.equal(rankAt(historical.cashShare, '2026-11-23').point.value, 27)
  assert.equal(rankAt(historical.cashShare, '2026-12-31').point.value, 30)
  assert.equal(rankAt(historical.equityShare, '2026-11-23').point.observedOn, '2026-06-30')
  assert.equal(rankAt(historical.epsYoy, '2026-10-30').point.observedOn, '1872-01-31')
  assert.equal(rankAt(historical.epsYoy, '2026-10-31').point.value, 10)
})

test('先算维度均值，再等权合成；零分计入、空维度略过', () => {
  const make = (dimension, score, inScore = true) => ({ dimension, score, inScore })
  const current = aggregateScores([
    make('liquidity', -1), make('liquidity', 1, false), make('valuation', 1),
    make('valuation', 1), make('valuation', 1), make('earnings', 0), make('crowding', null),
  ])
  assert.deepEqual(current.dimensions.map(row => row.score), [-1, 1, null, null, 0])
  assert.equal(current.score, 0)
  assert.equal(current.tier, 'neutral')
  assert.equal(aggregateScores([make('liquidity', -1), make('valuation', 0)]).score, -0.5)
  assert.equal(aggregateScores([make('liquidity', null)]).tier, null)
  for (const [earnings, trading, expected] of [
    [1, 0, 'offense'], [1, -1, 'neutral'], [0, -1, 'lean-defense'], [-1, -1, 'defense'],
  ]) {
    assert.equal(aggregateScores([make('earnings', earnings), make('trading', trading)]).tier, expected)
  }
})

test('月末信号只用于 t+2 收益，平均股票仓位无需再次分档', () => {
  const signals = [
    { d: '1999-10', radar: 'offense', masters: 'defense' },
    { d: '1999-11', radar: 'lean-offense', masters: 'neutral' },
    { d: '1999-12', radar: 'neutral', masters: 'lean-defense' },
  ]
  const returns = new Map([
    ['1999-11', { spx: 1, cash: 0.01 }],
    ['1999-12', { spx: 0.03, cash: 0.01 }],
    ['2000-01', { spx: 0.05, cash: 0.01 }],
  ])
  const aligned = alignRadar(signals, returns, row => blendEquity(row.radar, row.masters))
  assert.deepEqual(aligned.map(row => row.d), ['1999-12', '2000-01'])
  assert.ok(Math.abs(aligned[0].equity - 0.65) < 1e-12)
  assert.ok(Math.abs(aligned[1].equity - 0.775) < 1e-12)
  assert.ok(Math.abs(aligned[0].portfolio - 0.023) < 1e-12)
  assert.ok(Math.abs(aligned[1].portfolio - 0.041) < 1e-12)
  assert.equal(blendEquity('neutral', null), null)
})

test('只展示项目触发阈值时仍不计入评分', () => {
  const date = '2026-11-20'
  const examples = [
    ['netLiquidity', { value: 2 }, /流动性偏强/],
    ['netLiquidity', { value: -2 }, /流动性偏弱/],
    ['hy', { value: 500, change: 49 }, /已达信用压力/],
    ['hy', { value: 499, change: 50 }, /已达信用压力/],
    ['naaim', { value: 90 }, /敞口偏高/],
    ['naaim', { value: 30 }, /敞口偏低/],
    ['vixTerm', { value: 1.05, vix: 21, vix3m: 20 }, /显著高于/],
  ]
  for (const [id, input, signal] of examples) {
    const indicators = buildIndicators({ [id]: [{ observedOn: date, availableOn: date, ...input }] }, {}, date)
    const row = indicators.find(row => row.id === id)
    assert.match(row.display, signal)
    assert.equal(row.inScore, false)
    assert.equal(row.score, null)
    assert.equal(aggregateScores(indicators).score, null)
  }
})

test('冷热按风险偏好定向：现金比例极低为偏热，长历史才给百分位', () => {
  const rows = Array.from({ length: 48 }, (_, i) => {
    const d = new Date(Date.UTC(2020, i, 28)).toISOString().slice(0, 10)
    return [d, 20 - i * 0.2]
  })
  const cashShare = marketSeries(rows, 0)
  const last = rows.at(-1)[0]
  const row = buildIndicators({ cashShare }, {}, last).find(item => item.id === 'cashShare')
  assert.ok(row.percentile != null && row.percentile <= 5)
  assert.equal(row.heat, 'hot')
})

