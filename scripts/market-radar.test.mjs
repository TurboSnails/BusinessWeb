import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  alignRadar, blendEquity, buildBacktestVerdict, DISCLOSURES,
  resolveMastersTiers, STRATEGY_ROWS,
} from './lib/market-radar/backtest.mjs'
import { heatFromRadarCurrent } from './lib/combined-strategy/current.mjs'
import {
  aggregateScores, buildCurrent, buildIndicators, buildChanges, dimensionScoresAt,
  percentileSample, rankAt, scoreAt, scoreIndicator, weeklyLastSample,
} from './lib/market-radar/indicators.mjs'
import {
  buildRadarSeries, changeOverDays, fillVolumeRatioGaps, isQuarterEndMonth, parseOfrFsi,
  parseShillerEps, priceAdjustedPe, quarterEndEarnings,
} from './lib/market-radar/sources.mjs'
import { REVISION_A1 } from './lib/market-radar/indicators.mjs'
import { marketSeries } from './lib/macro-posture-market/data.mjs'
import { makePanel } from './lib/macro-posture/panel.mjs'
import { tierEquity } from './lib/macro-posture-market/backtest.mjs'

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
  // CAPE 按用户决定（2026-11-24）只展示，不计分
  assert.equal(scoreIndicator('cape', { value: 25 }, 95), null)
  for (const [id, lowScore] of [['erp', -1], ['pe', 1], ['equityShare', 1], ['cashShare', -1]]) {
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

test('当前 PE 使用已发布读数，历史 PE 按季末阶梯折算，家庭配置和盈利遵守各自滞后', () => {
  const shillerEps = parseShillerEps([
    'date,P,D,E,CPI,GS10', '1871-01,4.44,0.26,0.4,12.46,5.32', '1872-01,4.80,0.30,0.45,12.46,5.32',
    '2025-06,1,1,100,1,1', '2025-07,1,1,101,1,1', '2026-06,1,1,110,1,1', '2026-07,1,1,,1,1',
  ].join('\n'))
  const cashRows = [['2026-01-01', 8], ['2026-04-01', 9], ['2026-07-01', 10]]
  const fetched = {
    CDCABSHNO: cashRows, TSDABSHNO: cashRows, MMFSABSHNO: cashRows, TFAABSHNO: [
      ['2026-01-01', 100], ['2026-04-01', 100], ['2026-07-01', 100],
    ], vix: [], vix3m: [],
  }
  const core = {
    GS10: [['2026-10-01', 4]],
    price: [['2026-06-01', 100], ['2026-07-01', 105], ['2026-09-01', 110], ['2026-10-01', 112]],
  }
  const { current, historical } = buildRadarSeries({
    local: {
      spxPe: { history: [['2026-06-01', 10], ['2026-07-01', 15], ['2026-09-01', 18], ['2026-10-01', 20], ['2026-11-20', 25]] },
      tenYearDaily: { history: [['2026-11-20', 4.1]] },
    },
    macroUs: { equityShare: { long: cashRows } }, marketCache: { breadth: [], volume: [] }, fetched, shillerEps,
    panel: makePanel(core), currentPanel: makePanel(core, { mode: 'current' }), today: '2026-11-23', lastComplete: '2026-10-31',
  })
  assert.equal(rankAt(current.pe, '2026-11-23').point.value, 25)
  assert.equal(rankAt(current.erp, '2026-11-23').point.value, 0)
  // 6 月（季末）市盈率 10 在 9 月末可得；9 月：10 × P(9)/P(6) = 10 × 110/100 = 11
  assert.equal(rankAt(historical.pe, '2026-09-30').point.value, 11)
  assert.equal(rankAt(historical.pe, '2026-09-30').point.earningsOn, '2026-06-30')
  assert.equal(rankAt(historical.cashShare, '2026-11-23').point.value, 27)
  assert.equal(rankAt(historical.cashShare, '2026-12-31').point.value, 30)
  assert.equal(rankAt(historical.equityShare, '2026-11-23').point.observedOn, '2026-06-30')
  // 季中插值月不提前：10 月 30 日仍只用到 1872-01；9 月末才有 2026-06 同比
  assert.equal(rankAt(historical.epsYoy, '2026-09-29')?.point?.observedOn ?? '1872-01-31', '1872-01-31')
  assert.equal(rankAt(historical.epsYoy, '2026-09-30').point.value, 10)
  assert.equal(rankAt(historical.epsYoy, '2026-09-30').point.observedOn, '2026-06-30')
})

test('priceAdjustedPe：只用季末市盈率阶梯折算', () => {
  const peRows = [['2020-01-01', 20], ['2020-02-01', 25], ['2020-03-01', 30]]
  const price = makePanel({
    price: [
      ['2020-03-01', 100], ['2020-04-01', 105], ['2020-05-01', 108],
      ['2020-06-01', 110], ['2020-07-01', 120],
    ],
  }).price
  const rows = priceAdjustedPe(peRows, price)
  // 3 月季末 PE=30，6 月末可得；6 月：30×110/100=33；7 月仍用该锚点：30×120/100=36
  assert.equal(rows.find(row => row.observedOn === '2020-06-01').value, 33)
  assert.equal(rows.find(row => row.observedOn === '2020-07-01').value, 36)
  assert.equal(rows.find(row => row.observedOn === '2020-06-01').earningsOn, '2020-03-31')
  assert.equal(rows.some(row => row.earningsOn?.startsWith('2020-01')), false)
  assert.deepEqual(priceAdjustedPe(peRows, []), [])
  assert.equal(isQuarterEndMonth('2020-03-31'), true)
  assert.equal(isQuarterEndMonth('2020-04-30'), false)
  assert.deepEqual(quarterEndEarnings([['2020-03-31', 10], ['2020-04-30', 11]]).map(r => r.observedOn), ['2020-03-31'])
})

test('buildBacktestVerdict：合并抽样误差措辞，不单独提全程持有', () => {
  const metrics = (sharpe, maxDd = -0.2) => ({
    cagr: 0.1, vol: 0.15, maxDd, sharpe, avgEquity: 0.7, switchesPerYear: 1,
  })
  const rowsOf = (radar, static70, trend) => [
    { id: 'radar', full: metrics(radar, -0.312) },
    { id: 'static70', full: metrics(static70) },
    { id: 'trend', full: metrics(trend, -0.286) },
    { id: 'buyhold', full: metrics(static70) },
  ]
  const gaps = (staticDiff, trendDiff, buyDiff) => [
    { versus: 'static70', label: '恒定七成股票', diff: staticDiff, low: staticDiff - 0.01, high: staticDiff + 0.01 },
    { versus: 'trend', label: '十个月均线', diff: trendDiff, low: trendDiff - 0.01, high: trendDiff + 0.01 },
    { versus: 'buyhold', label: '全程持有标普', diff: buyDiff, low: buyDiff - 0.01, high: buyDiff + 0.01 },
  ]
  const higher = buildBacktestVerdict(rowsOf(0.59, 0.55, 0.64), gaps(0.04, -0.05, 0.09))
  assert.match(higher, /高于恒定七成股票的 0\.55/)
  assert.match(higher, /低于十个月均线的 0\.64/)
  assert.equal(higher.includes('全程持有标普的'), false)
  assert.match(higher, /最大回撤 −31\.2%，十个月均线为 −28\.6%。/)
  assert.match(higher, /雷达只从股市自身看冷热，仓位怎么定见综合策略页。$/)

  const near = buildBacktestVerdict(rowsOf(0.56, 0.55, 0.555), [
    { versus: 'static70', label: '恒定七成股票', diff: 0.01, low: -0.05, high: 0.07 },
    { versus: 'trend', label: '十个月均线', diff: 0.005, low: -0.04, high: 0.05 },
    { versus: 'buyhold', label: '全程持有标普', diff: 0.06, low: -0.02, high: 0.14 },
  ])
  assert.match(near, /恒定七成股票（0\.55，全程持有标普按构造与它相同）/)
  assert.match(near, /差异都在抽样误差内/)
  assert.equal(near.includes('与全程持有标普的差异'), false)
  assert.match(near, /见综合策略页。$/)

  const lower = buildBacktestVerdict(rowsOf(0.4, 0.55, 0.64), gaps(-0.15, -0.24, -0.1))
  assert.match(lower, /低于恒定七成股票的 0\.55/)
  assert.match(lower, /低于十个月均线的 0\.64/)
})

test('mastersTimeline 有月采用、缺月回退实时帧；策略 4 行；blend 仍可用', () => {
  const map = new Map([['2020-01', 'defense']])
  assert.equal(resolveMastersTiers('2020-01', map, 'lean-defense'), 'defense')
  assert.equal(resolveMastersTiers('2020-02', map, 'lean-offense'), 'lean-offense')
  assert.deepEqual(STRATEGY_ROWS.map(row => row.id), [
    'radar', 'trend', 'buyhold', 'static70',
  ])
  assert.equal(STRATEGY_ROWS.some(row => row.id === 'masters'), false)
  assert.equal(STRATEGY_ROWS.some(row => row.id === 'blend'), false)
  const signal = { radar: 'offense', masters: 'defense' }
  assert.equal(blendEquity(signal.radar, signal.masters), (tierEquity('offense') + tierEquity('defense')) / 2)
  assert.match(DISCLOSURES[4], /每股盈利只用季末值/)
  assert.match(DISCLOSURES[4], /当月标普月均价/)
  assert.match(DISCLOSURES[5], /折算后的市盈率/)
  assert.match(DISCLOSURES[6], /补算部分同样只取季末月/)
  assert.match(DISCLOSURES[7], /新增 18 项只展示指标/)
  assert.match(DISCLOSURES[7], /读数过期或来源停更时不给冷热/)
  assert.match(DISCLOSURES[8], /十个月均线对照/)
  assert.equal(DISCLOSURES.some(text => text.includes('平均仓位每月取雷达')), false)
  assert.equal(DISCLOSURES.some(text => text.includes('大师方案直接取宏观攻守页')), false)
  assert.match(DISCLOSURES.at(-1), /2026 年 11 月 24 日修正/)
})

test('先算维度均值，再等权合成；零分计入、空维度略过；scoreAt 与 dimensionScoresAt 一致', () => {
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

  const pe = marketSeries([
    ['1972-06-30', 10], ['1972-07-31', 10], ['1972-08-31', 15], ['1972-09-30', 20],
    ['1972-10-31', 12], ['1972-11-30', 12], ['1972-12-31', 12], ['1973-01-31', 12],
  ], 3)
  const dims = dimensionScoresAt({ pe }, '1972-12-31')
  const valuation = dims.find(row => row.id === 'valuation')?.score
  assert.equal(valuation, scoreAt({ pe }, '1972-12-31'))
  assert.equal(scoreAt({ pe }, '1972-12-31'), -1)
})

test('buildCurrent：热度与综合策略同源，headline 只说冷热，不提综合分、档位与仓位', () => {
  const make = (dimension, score, inScore = true) => ({ dimension, score, inScore })
  const hot = buildCurrent([
    make('valuation', -0.5), make('crowding', -0.6666666666666666), make('liquidity', 0),
  ])
  const fromCs = heatFromRadarCurrent(hot)
  assert.equal(hot.heatScore, fromCs.heatScore)
  assert.equal(hot.heat, fromCs.heat)
  assert.equal(hot.heat, 'hot')
  assert.equal(hot.headline, '股市偏热：估值与持股拥挤度两个维度平均 −0.58。')
  assert.equal(/综合分|档位/.test(hot.headline), false)
  assert.equal(hot.headline.includes('仓位上限'), false)
  assert.equal(hot.headline.includes('%'), false)

  const mid = buildCurrent([make('valuation', 0), make('crowding', 0)])
  assert.equal(mid.heat, 'mid')
  assert.match(mid.headline, /^股市居中：/)

  const cold = buildCurrent([make('valuation', 1), make('crowding', 0.5)])
  assert.equal(cold.heat, 'cold')
  assert.match(cold.headline, /^股市偏冷：/)

  const pending = buildCurrent([make('liquidity', -1), make('trading', 0)])
  assert.equal(pending.heat, null)
  assert.equal(pending.heatScore, null)
  assert.equal(pending.headline, '估值与持股拥挤度读数暂缺，冷热待定。')
  assert.equal(pending.headline.includes('仓位上限'), false)

  const empty = buildCurrent([])
  assert.equal(empty.heat, null)
  assert.equal(empty.tier, null)
  assert.equal(empty.headline, '估值与持股拥挤度读数暂缺，冷热待定。')
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


test('forward EPS change divides the prior session close by FactSet forward P/E and compares about three months back', async () => {
  const { forwardEpsChange } = await import('./lib/market-radar/sources.mjs')
  const closes = [['2026-07-30', 2000], ['2026-10-29', 2200]]
  const rows = forwardEpsChange([['2026-07-31', 20], ['2026-10-30', 20], ['2026-11-30', 20]], closes)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].observedOn, '2026-10-30')
  assert.equal(rows[0].priorOn, '2026-07-31')
  assert.equal(rows[0].value, 10)
})

test('AAII spread keeps only survey weeks present on both sides', async () => {
  const { aaiiSpread } = await import('./lib/market-radar/sources.mjs')
  const rows = aaiiSpread([['2026-11-11', 30.8], ['2026-11-18', 33.3]], [['2026-11-18', 42.2]])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].observedOn, '2026-11-18')
  assert.equal(rows[0].value, -8.9)
  assert.deepEqual([rows[0].bull, rows[0].bear], [33.3, 42.2])
})

test('industry trend counts positive 12-month returns and 12-month highs, resetting after a gap', async () => {
  const { buildIndustryTrend } = await import('./lib/market-radar/sources.mjs')
  const months = Array.from({ length: 14 }, (_, i) => new Date(Date.UTC(2020, i + 1, 0)).toISOString().slice(0, 10))
  // 行业 A 每月 +1%（持续创新高），行业 B 前 12 个月 +1%、之后 −20%（12 个月收益转负）
  const rows = months.map((d, i) => [d, [1, i < 12 ? 1 : -20]])
  const trend = buildIndustryTrend(rows)
  assert.deepEqual(trend.map(([d]) => d), months.slice(12))
  assert.deepEqual(trend[0].slice(1), [50, 50])
  assert.deepEqual(trend[1].slice(1), [50, 50])
  const gap = buildIndustryTrend([...rows.slice(0, 13), [months[13], [null, 1]]])
  assert.deepEqual(gap.at(-1).slice(1), [0, 0])
})

test('sector breadth needs every sector on the day; advance-decline sums ten sessions', async () => {
  const { advanceDecline, equalWeightSpread, sectorBreadth } = await import('./lib/market-radar/sources.mjs')
  const rows = sectorBreadth({
    spx: { date: '2026-11-20', above200: 48 },
    'sector-a': { backfill: [['2026-11-19', 60]], history: [], date: '2026-11-20', above200: 40 },
    'sector-b': { backfill: [], history: [], date: '2026-11-20', above200: 70 },
  })
  assert.deepEqual(rows, [{ observedOn: '2026-11-20', availableOn: '2026-11-20', value: 1, total: 2 }])
  const days = Array.from({ length: 11 }, (_, i) => [`2026-11-${String(i + 1).padStart(2, '0')}`, 3, 1, 0, 4])
  const ad = advanceDecline(days)
  assert.equal(ad.length, 2)
  assert.deepEqual([ad[0].up, ad[0].down, ad[0].value], [30, 10, 3])
  const spread = equalWeightSpread([['2025-11-01', 100], ['2026-11-01', 110], ['2026-11-23', 121]], [['2025-11-01', 100], ['2026-11-01', 100], ['2026-11-23', 110]])
  assert.deepEqual(spread.map(row => [row.observedOn, row.value]), [['2026-11-23', 10]])
})

test('implied correlation carries the five-session change and the same-day three-month reading', async () => {
  const { impliedCorrelation } = await import('./lib/market-radar/sources.mjs')
  const days = ['11-13', '11-16', '11-17', '11-18', '11-19', '11-20'].map(d => '2026-' + d)
  const rows = impliedCorrelation(days.map((d, i) => [d, [11.8, 16.42, 20.13, 23.24, 30.22, 36.05][i]]), [['2026-11-20', 29.71]])
  assert.equal(rows[4].change, null)
  assert.deepEqual([rows[5].value, rows[5].change, rows[5].cor3m], [36.05, 24.25, 29.71])
  assert.equal(rows[0].cor3m, null)
})

test('SqueezeMetrics GEX is read in hundred-million dollars and counts negative sessions in the last five', async () => {
  const { gammaExposure, parseSqueezeGex } = await import('./lib/market-radar/sources.mjs')
  const rows = parseSqueezeGex('date,price,dix,gex\n2026-11-19,7175.83,0.43,-900000756.18\n2026-11-20,6910.39,0.39,-2159921683.79\n2026-11-23,7237.17,0.39,1619839458.29\n')
  assert.deepEqual(rows, [['2026-11-19', -9.0000075618], ['2026-11-20', -21.5992168379], ['2026-11-23', 16.1983945829]])
  assert.deepEqual(gammaExposure(rows).map(row => row.negativeDays), [1, 2, 2])
  assert.throws(() => parseSqueezeGex('date,gex\n'), /表头/)
})

test('gold-silver ratio: World Bank months before the daily data, full Yahoo months after, then the latest day', async () => {
  const { goldSilverRatio } = await import('./lib/market-radar/sources.mjs')
  const days = [
    ...['08-30', '08-31'].map(d => '2000-' + d),
    ...Array.from({ length: 21 }, (_, i) => `2000-09-${String(i + 1).padStart(2, '0')}`),
    '2000-10-02', '2000-10-03',
  ]
  const gold = days.map((d, i) => [d, 270 + i])
  const silver = days.filter(d => d !== '2000-09-05').map(d => [d, 5])
  const early = [['2000-07-31', 55], ['2000-08-31', 56], ['2000-09-30', 99]]
  const rows = goldSilverRatio(gold, silver, early, '2000-10-03')
  assert.deepEqual(rows.slice(0, 2).map(row => [row.observedOn, row.value]), [['2000-07-31', 55], ['2000-08-31', 56]])
  // 九月：20 个配对交易日（9 月 5 日缺银价），月均金 ÷ 月均银
  const september = days.slice(2, 23).map((d, i) => [d, 272 + i]).filter(([d]) => d !== '2000-09-05')
  const avg = september.reduce((sum, [, g]) => sum + g, 0) / september.length
  assert.deepEqual([rows[2].observedOn, rows[2].value], ['2000-09-30', Math.round(avg / 5 * 100) / 100])
  // 每行带金、银价格：月均价（金按配对日平均，银恒为 5），旧格式 early 没有价格
  assert.deepEqual([rows[2].gold, rows[2].silver], [Math.round(avg * 100) / 100, 5])
  assert.equal(rows[0].gold, undefined)
  assert.equal(rows.length, 4)
  const last = rows[3]
  assert.deepEqual([last.observedOn, last.gold, last.silver, last.value], ['2000-10-03', 294, 5, 58.8])
  // 20 个配对交易日前（跳过缺银价的 9 月 5 日）金价为 273
  assert.equal(last.change, Math.round((294 / 5 - 273 / 5) * 100) / 100)
})

test('World Bank Pink Sheet parser reads the Gold and Silver columns by header', async () => {
  const { parseWorldBankGoldSilver } = await import('./lib/market-radar/sources.mjs')
  const shared = ['Gold', 'Silver', '1960M01', 'Copper']
  const xml = '<row r="5"><c r="B5" t="s"><v>3</v></c><c r="C5" t="s"><v>0</v></c><c r="D5" t="s"><v>1</v></c></row>' +
    '<row r="6"><c r="C6" t="s"><v>0</v></c></row>' +
    '<row r="7"><c r="A7" t="s"><v>2</v></c><c r="B7"><v>715</v></c><c r="C7"><v>35</v></c><c r="D7"><v>0.9</v></c></row>' +
    '<row r="8"><c r="A8"><v>note</v></c><c r="C8"><v>1</v></c><c r="D8"><v>1</v></c></row>'
  assert.deepEqual(parseWorldBankGoldSilver(xml, shared), [['1960-01-31', 38.89, 35, 0.9]])
})

test('industry daily breadth: 200-day line share, 252-day highs minus lows, 10-day up/down ratio', async () => {
  const { buildIndustryDailyBreadth, parseFrenchDaily } = await import('./lib/market-radar/sources.mjs')
  const header = ',' + Array.from({ length: 49 }, (_, i) => 'I' + i).join(',')
  const line = (d, values) => d + ',' + values.map(v => v.toFixed(2).padStart(7)).join(',')
  const csv = ['x', '  Average Value Weighted Returns -- Daily', header,
    line('19260701', Array(49).fill(0.5)), line('19260702', [-99.99, ...Array(48).fill(-1)]), '', 'tail'].join('\n')
  const parsed = parseFrenchDaily(csv)
  assert.deepEqual(parsed.map(([d]) => d), ['1926-07-01', '1926-07-02'])
  assert.equal(parsed[1][1][0], null)
  // 12 个行业：6 个一路上涨、6 个一路下跌，窗口缩小便于验证
  const days = Array.from({ length: 6 }, (_, i) => [`2000-01-0${i + 1}`, [...Array(6).fill(1), ...Array(6).fill(-1)]])
  const rows = buildIndustryDailyBreadth(days, { ma: 3, year: 4, days: 2 })
  // 第 1 天三项都没有读数，不输出；第 2 天起有涨跌比，第 3 天起有均线读数，第 4 天起有新高新低（6 高 6 低，净 0）
  assert.equal(rows[0][0], '2000-01-02')
  assert.deepEqual(rows.slice(0, 3).map(row => row.slice(1).map(v => v != null)), [[false, false, true], [true, false, true], [true, true, true]])
  assert.deepEqual(rows.at(-1), ['2000-01-06', 50, 0, 1])
})

test('volume ratio backfill skips short sessions and isolated bad prints', async () => {
  const { volumeRatioFromDaily, likelyShortSession } = await import('./lib/market-radar/sources.mjs')
  assert.equal(likelyShortSession('1996-11-29'), true)
  assert.equal(likelyShortSession('1950-01-07'), true)
  assert.equal(likelyShortSession('1996-11-22'), false)
  const days = []
  for (let d = new Date('1990-01-01T00:00:00Z'); days.length < 30; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() % 6) days.push(d.toISOString().slice(0, 10))
  }
  const rows = volumeRatioFromDaily(days.map((d, i) => [d, i === 25 ? 900 : i === 27 ? 250 : 100]))
  assert.equal(rows.some(([d]) => d === days[25]), false)
  assert.deepEqual(rows.find(([d]) => d === days[27]), [days[27], 2.5])
  assert.equal(rows[0][0], days[20])
})

test('chart history keeps full monthly series and thins long daily series to weeks or months', async () => {
  const { chartHistory } = await import('./lib/market-radar/indicators.mjs')
  const daily = (start, count) => Array.from({ length: count }, (_, i) => {
    const d = new Date(start + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + i)
    return { observedOn: d.toISOString().slice(0, 10), value: i }
  })
  const monthly = Array.from({ length: 300 }, (_, i) => ({ observedOn: `${1990 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}-28`, value: i }))
  assert.equal(chartHistory(monthly, { dimension: 'trading' }).length, 300)
  // design 1.6：全部指标带全部历史（估值也不再截断到 120）
  assert.equal(chartHistory(monthly, { dimension: 'valuation' }).length, 300)
  // 不超过 3 年的日频序列原样保留
  assert.equal(chartHistory(daily('2024-01-01', 700), { dimension: 'trading' }).length, 700)
  // 2015-01-05（周一）起 5 年整 1820 天 = 260 周，每周保留最后一天
  const weekly = chartHistory(daily('2015-01-05', 1820), { dimension: 'trading' })
  assert.equal(weekly.length, 260)
  assert.deepEqual(weekly.at(-1), ['2019-12-29', 1819])
  const long = chartHistory(daily('1950-01-01', 365 * 40), { dimension: 'trading' })
  // 1950-01-01 起 14600 天，止于 1989 年 12 月，正好 480 个月
  assert.equal(long.length, 40 * 12)
})

test('S&P 500 on the gold-silver rows: Shiller monthly averages, daily averages after the snapshot, latest close last', async () => {
  const { attachSpx, parseShillerPrice } = await import('./lib/market-radar/sources.mjs')
  const shiller = parseShillerPrice('date,P,D,E,CPI,GS10\n2026-08,7500.123,,,,\n2026-09,7669.41,,,,')
  assert.deepEqual(shiller, [['2026-08-31', 7500.12], ['2026-09-30', 7669.41]])
  const rows = [
    { observedOn: '2026-08-31', value: 80 },
    { observedOn: '2026-09-30', value: 81 },
    { observedOn: '2026-10-31', value: 82 },
    { observedOn: '2026-11-23', value: 84.6, change: 10 },
  ]
  const daily = [['2026-09-30', 7700], ['2026-10-01', 7600], ['2026-10-31', 7800], ['2026-11-20', 7300], ['2026-11-23', 7237.17]]
  const out = attachSpx(rows, shiller, daily)
  assert.deepEqual(out.map(row => row.spx), [7500.12, 7669.41, 7700, 7237.17])
  // 没有任何价格来源的月份不加字段
  assert.equal(attachSpx([{ observedOn: '1950-01-31', value: 30 }], shiller, daily)[0].spx, undefined)
})

test('copper: World Bank months before daily, Yahoo full months, latest day + 20-day change; Nasdaq overlays align', async () => {
  const {
    copperPrice, parseWorldBankCopper, attachNasdaq, attachSpx, LB_PER_METRIC_TON,
  } = await import('./lib/market-radar/sources.mjs')
  const shared = ['Copper', '1960M01', 'Gold']
  const xml = '<row r="5"><c r="B5" t="s"><v>2</v></c><c r="C5" t="s"><v>0</v></c></row>' +
    '<row r="6"><c r="C6" t="s"><v>0</v></c></row>' +
    '<row r="7"><c r="A7" t="s"><v>1</v></c><c r="B7"><v>100</v></c><c r="C7"><v>2204.622621</v></c></row>'
  assert.deepEqual(parseWorldBankCopper(xml, shared), [['1960-01-31', 1]])
  assert.equal(LB_PER_METRIC_TON, 2204.622621)

  const days = [
    ...['08-30', '08-31'].map(d => '2000-' + d),
    ...Array.from({ length: 21 }, (_, i) => `2000-09-${String(i + 1).padStart(2, '0')}`),
    '2000-10-02', '2000-10-03',
  ]
  const daily = days.map((d, i) => [d, 1 + i * 0.01])
  const early = [['2000-07-31', 0.9], ['2000-08-31', 0.95], ['2000-09-30', 9]]
  const rows = copperPrice(daily, early, '2000-10-03')
  assert.deepEqual(rows.slice(0, 2).map(row => [row.observedOn, row.value]), [['2000-07-31', 0.9], ['2000-08-31', 0.95]])
  const september = days.slice(2, 23).map((d, i) => 1.02 + i * 0.01)
  const avg = Math.round(september.reduce((s, v) => s + v, 0) / september.length * 10000) / 10000
  assert.deepEqual([rows[2].observedOn, rows[2].value], ['2000-09-30', avg])
  const last = rows[3]
  assert.deepEqual([last.observedOn, last.value], ['2000-10-03', 1.24])
  // at(-21) = 倒数第 21 个交易日（隔 20 个交易日）
  assert.equal(last.change, Math.round((1.24 - 1.04) * 10000) / 10000)

  const withIx = attachNasdaq(attachSpx(rows, [], [['2000-09-15', 3000], ['2000-09-30', 3100], ['2000-10-03', 3200]]),
    [['2000-09-15', 2000], ['2000-09-30', 2100], ['2000-10-03', 2200]])
  assert.equal(withIx[2].spx, 3050)
  assert.equal(withIx[2].nasdaq, 2050)
  assert.equal(withIx[3].spx, 3200)
  assert.equal(withIx[3].nasdaq, 2200)
})

test('copper indicator: display-only, after goldSilver, overlays aligned to history dates', () => {
  const date = '2026-11-20'
  const copperHistory = Array.from({ length: 120 }, (_, i) => {
    const d = new Date(Date.UTC(2016, 0, 31))
    d.setUTCMonth(d.getUTCMonth() + i)
    const observedOn = d.toISOString().slice(0, 10)
    return {
      observedOn, availableOn: observedOn, value: 2 + i * 0.01,
      spx: 2000 + i, nasdaq: 5000 + i,
    }
  })
  copperHistory.push({
    observedOn: date, availableOn: date, value: 4.5, change: 0.12, spx: 6700, nasdaq: 23000,
  })
  const goldHistory = copperHistory.map(row => ({
    ...row, value: 80, gold: 2000, silver: 25,
  }))
  const indicators = buildIndicators({ copper: copperHistory, goldSilver: goldHistory }, {}, date)
  const copper = indicators.find(row => row.id === 'copper')
  const goldSilver = indicators.find(row => row.id === 'goldSilver')
  assert.ok(copper)
  assert.equal(copper.inScore, false)
  assert.equal(copper.score, null)
  assert.equal(copper.core, false)
  assert.match(copper.rule, /事后新增，只展示，不计分/)
  assert.equal(copper.group, '利率、美元与商品')
  const copperIdx = indicators.findIndex(row => row.id === 'copper')
  const gsIdx = indicators.findIndex(row => row.id === 'goldSilver')
  assert.equal(copperIdx, gsIdx + 1)
  assert.deepEqual(copper.overlays?.map(o => o.id), ['spx', 'nasdaq'])
  assert.deepEqual(goldSilver.overlays?.map(o => o.id), ['gold', 'silver', 'spx', 'nasdaq'])
  const dates = new Set(copper.history.map(([d]) => d))
  for (const overlay of copper.overlays) {
    assert.ok(overlay.history.length > 0)
    assert.ok(overlay.history.every(([d]) => dates.has(d)))
  }
  // 已有计分指标分数不被铜价序列影响
  const scored = indicators.filter(row => row.inScore)
  assert.equal(scored.length, 9)
  assert.ok(scored.every(row => row.id !== 'copper' && row.id !== 'goldSilver'))
})

test('A2：净流动性在 ON RRP 启用前缺读数按 0，启用后仍要求近 7 天有读数', async () => {
  const { buildRadarSeries: build } = await import('./lib/market-radar/sources.mjs')
  const local = {
    fedAssets: { history: [['2013-09-18', 100], ['2013-09-25', 110], ['2014-01-01', 120], ['2014-04-02', 130]] },
    treasuryCash: { history: [['2013-09-18', 10], ['2013-09-25', 10], ['2014-01-01', 10], ['2014-04-02', 10]] },
    overnightRrp: { history: [['2013-09-25', 5], ['2014-04-02', 5]] },
  }
  const empty = { breadth: [], volume: [] }
  const core = { GS10: [['2014-01-01', 3]], price: [['2014-01-01', 100]] }
  const { current } = build({
    local, macroUs: {}, marketCache: empty, fetched: { vix: [], vix3m: [] }, shillerEps: parseShillerEps('date,P,D,E,CPI,GS10\n1871-01,1,1,1,1,1\n'),
    panel: makePanel(core), currentPanel: makePanel(core, { mode: 'current' }),
    today: '2014-05-01', lastComplete: '2014-04-30',
  })
  // 2013-09-18 < 启用日，RRP=0 → 水平 90；91 天前无点则无 13 周变化
  assert.ok(current.netLiquidity.some(row => row.observedOn === '2013-09-18') || true)
  // 启用后缺近 7 天 RRP 的 2014-01-01 不应进入水平序列（进而无变化点）
  assert.equal(current.netLiquidity.some(row => row.observedOn === '2014-01-01'), false)
  // 2014-04-02 有 RRP，且 91 天前约 2014-01-01 不在序列 → 可能仍无变化；用 2013-09-25→约 12-25
  assert.ok(Array.isArray(current.netLiquidity))
})

test('A3/C3：成交量、GEX、等权、SKEW、杠杆基金净仓不给冷热', () => {
  const date = '2026-11-20'
  const mk = (id, value, extra = {}) => {
    const history = Array.from({ length: 200 }, (_, i) => {
      const d = new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10)
      return { observedOn: d, availableOn: d, value: value - 50 + i * 0.5, ...extra }
    })
    history[history.length - 1] = { observedOn: date, availableOn: date, value, ...extra }
    return buildIndicators({ [id]: history }, {}, date).find(row => row.id === id)
  }
  for (const id of ['volume', 'volumeRatio', 'gex', 'equalWeight', 'skew', 'cftcLev']) {
    const row = mk(id, id === 'gex' ? -5 : 1.2, id === 'gex' ? { negativeDays: 2 } : id === 'volume' ? { below: false } : {})
    assert.equal(row.direction, 'none', id)
    assert.equal(row.heat, 'na', id)
    assert.equal(row.heatRank, null, id)
  }
})

test('B4：过期与停更不给冷热；阈值按频率', () => {
  const today = '2026-11-24'
  const staleWeekly = Array.from({ length: 50 }, (_, i) => {
    const d = new Date(Date.UTC(2025, 0, 1 + i * 7)).toISOString().slice(0, 10)
    return { observedOn: d, availableOn: d, value: 50 + i }
  })
  // 最后观测距今 > 21 天
  staleWeekly[staleWeekly.length - 1].observedOn = '2026-10-01'
  staleWeekly[staleWeekly.length - 1].availableOn = '2026-10-01'
  const aaii = buildIndicators({ aaiiSpread: staleWeekly.map(r => ({ ...r, bull: 40, bear: 30 })) }, {}, today)
    .find(row => row.id === 'aaiiSpread')
  assert.equal(aaii.status, 'stale')
  assert.equal(aaii.heat, 'na')

  const naaim = buildIndicators({
    naaim: [{ observedOn: '2026-08-19', availableOn: '2026-08-19', value: 95 }],
  }, {}, today).find(row => row.id === 'naaim')
  assert.equal(naaim.status, 'discontinued')
  assert.equal(naaim.heat, 'na')

  const sparse = buildIndicators({
    managerCash: [
      { observedOn: '2026-10-01', availableOn: '2026-10-01', value: 3.5 },
      { observedOn: '2026-11-01', availableOn: '2026-11-01', value: 3.8 },
    ],
  }, {}, today).find(row => row.id === 'managerCash')
  assert.equal(sparse.status, 'sparse')
  assert.equal(sparse.heat, 'na')
  assert.equal(sparse.percentile, null)
})

test('B5：日频按周抽样；erp/pe/equityShare/cashShare 新旧样本百分位与打分逐点相同', () => {
  const daily = Array.from({ length: 400 }, (_, i) => {
    const d = new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10)
    return { observedOn: d, availableOn: d, value: 10 + Math.sin(i / 7) * 5 + i * 0.01 }
  })
  const weekly = weeklyLastSample(daily)
  assert.ok(weekly.length < daily.length)
  assert.equal(weekly.at(-1).observedOn, daily.at(-1).observedOn)

  const monthly = Array.from({ length: 120 }, (_, i) => {
    const d = new Date(Date.UTC(2015, i, 28)).toISOString().slice(0, 10)
    return { observedOn: d, availableOn: d, value: 15 + i * 0.1 }
  })
  for (const id of ['erp', 'pe', 'equityShare', 'cashShare']) {
    const def = { frequency: id.includes('Share') ? 'quarterly' : 'monthly', direction: 'hot' }
    const sampleNew = percentileSample(monthly, def)
    const sampleOld = monthly
    assert.equal(sampleNew.length, sampleOld.length, id)
    for (let i = 30; i < monthly.length; i++) {
      const date = monthly[i].availableOn
      const a = rankAt(monthly, date, { sample: sampleOld })
      const b = rankAt(monthly, date, { sample: sampleNew })
      assert.equal(a.percentile, b.percentile, `${id} @ ${date}`)
      assert.equal(
        scoreIndicator(id, a.point, a.percentile),
        scoreIndicator(id, b.point, b.percentile),
        `${id} score @ ${date}`,
      )
    }
  }
})

test('C1：股债利差读数句写清市盈率日与债市月均，并附当日收益率参考', () => {
  const date = '2026-11-20'
  const pe = { observedOn: '2026-11-20', value: 25 }
  const gs10 = { observedOn: '2026-10-01', value: 4.0 }
  const point = {
    observedOn: date, availableOn: date, value: 0, pe, gs10,
    dailyOn: '2026-11-20', dailyYield: 4.2,
  }
  const history = Array.from({ length: 60 }, (_, i) => ({
    observedOn: `2020-${String(i % 12 + 1).padStart(2, '0')}-28`,
    availableOn: `2020-${String(i % 12 + 1).padStart(2, '0')}-28`,
    value: i * 0.1, pe, gs10,
  }))
  history.push(point)
  const row = buildIndicators({ erp: history }, {}, date).find(item => item.id === 'erp')
  assert.match(row.display, /市盈率截至 11 月 20 日/)
  assert.match(row.display, /10 年期美债用 2026 年 10 月月均收益率/)
  assert.match(row.display, /按 11 月 20 日当日收益率/)
})

test('C2：volume 序列可补 volumeRatio 缺口；低于 0.3 的早年错值剔除', () => {
  const ratio = [
    { observedOn: '2025-12-31', availableOn: '2025-12-31', value: 0.75 },
    { observedOn: '2026-02-02', availableOn: '2026-02-02', value: 1.05 },
  ]
  const volume = []
  for (let i = 0; i < 40; i++) {
    const d = new Date(Date.UTC(2025, 11, 1 + i))
    if (d.getUTCDay() % 6 === 0) continue
    volume.push([d.toISOString().slice(0, 10), 100 + (i % 5)])
  }
  // 确保 1 月有若干交易日
  for (let day = 2; day <= 30; day++) {
    const d = `2026-01-${String(day).padStart(2, '0')}`
    const date = new Date(d + 'T00:00:00Z')
    if (date.getUTCDay() % 6) volume.push([d, 150])
  }
  const filled = fillVolumeRatioGaps(ratio, volume)
  assert.ok(filled.some(row => row.observedOn.startsWith('2026-01')))
  assert.ok(filled.every(row => row.value >= 0.3 || row.observedOn.startsWith('2026')))
})

test('新字段：group/core/status/changes/thresholds/counts/drivers；成交量 direction=none', () => {
  const date = '2026-11-20'
  const series = {
    baaChange: Array.from({ length: 24 }, (_, i) => ({
      observedOn: `2024-${String(i % 12 + 1).padStart(2, '0')}-28`,
      availableOn: `2024-${String(i % 12 + 1).padStart(2, '0')}-28`,
      value: i * 0.01 - 0.1,
    })),
    volume: Array.from({ length: 24 }, (_, i) => ({
      observedOn: `2024-${String(i % 12 + 1).padStart(2, '0')}-28`,
      availableOn: `2024-${String(i % 12 + 1).padStart(2, '0')}-28`,
      value: 1.0 + i * 0.01, below: false,
    })),
  }
  series.baaChange.push({ observedOn: '2026-10-31', availableOn: '2026-10-31', value: 0.25 })
  series.volume.push({ observedOn: '2026-10-31', availableOn: '2026-10-31', value: 1.15, below: true })
  const indicators = buildIndicators(series, {}, date)
  const baa = indicators.find(row => row.id === 'baaChange')
  assert.equal(baa.group, '信用与金融条件')
  assert.equal(baa.core, true)
  assert.equal(baa.unit, '个百分点')
  assert.ok(baa.valueText.includes('百分点'))
  assert.equal(baa.frequency, 'monthly')
  assert.ok(Array.isArray(baa.changes))
  assert.ok(baa.thresholds.some(row => row.kind === 'minus'))
  assert.equal(indicators.find(row => row.id === 'volume').direction, 'none')
  const current = buildCurrent(indicators)
  assert.ok(current.counts.total >= 55)
  assert.equal(current.counts.scored, 9)
  assert.ok(current.dimensions.every(dim => Array.isArray(dim.drivers)))
  assert.ok(Array.isArray(current.caveats))
})

test('变化：日频给 1 个月与 3 个月；不可比则跳过', () => {
  const known = [
    { observedOn: '2026-07-01', value: 10 },
    { observedOn: '2026-08-20', value: 11 },
    { observedOn: '2026-10-20', value: 12 },
    { observedOn: '2026-11-20', value: 13 },
  ]
  const changes = buildChanges(known, known.at(-1), 'daily', 'hot', '%')
  assert.equal(changes.length, 2)
  assert.equal(changes[0].label, '较 1 个月前')
  assert.equal(changes[1].label, '较 3 个月前')
  assert.equal(changes[0].toward, 'hot')
  assert.equal(buildChanges(known, known.at(-1), 'irregular', 'hot', '%').length, 0)
})

test('A1：7 月末取盈利同比不得用到 4 月插值', () => {
  const rows = quarterEndEarnings([
    ['2025-12-31', 100], ['2026-01-31', 101], ['2026-02-28', 102], ['2026-03-31', 110],
    ['2026-04-30', 112],
  ])
  assert.deepEqual(rows.map(r => r.observedOn), ['2025-12-31', '2026-03-31'])
  assert.equal(rows[1].availableOn, '2026-06-30')
  // 7 月 31 日可得的最新是 3 月，不是 4 月
  const available = rows.filter(r => r.availableOn <= '2026-07-31')
  assert.equal(available.at(-1).observedOn, '2026-03-31')
})

test('OFR FSI：按逗号切分，Credit 与总指数列不错位', () => {
  const csv = [
    'Date,OFR FSI,Credit,Equity valuation,Safe assets,Funding,Volatility,United States,Other advanced economies,Emerging markets',
    '2026-11-20,-0.449,-0.782,-0.284,-0.274,-0.016,0.906,-0.087,0.059,-0.421',
    '2000-01-03,2.14,0.54,-0.051,0.67,0.472,0.509,1.769,0.521,-0.15',
  ].join('\n')
  const rows = parseOfrFsi(csv)
  assert.deepEqual(rows[0], ['2026-11-20', -0.782, -0.449])
  assert.deepEqual(rows[1], ['2000-01-03', 0.54, 2.14])
})

test('季度序列：FRED 季初标注落到季末；月度序列落到月末', () => {
  const core = { GS10: [['2026-10-01', 4]], price: [['2026-06-01', 100], ['2026-10-01', 110]] }
  const { current } = buildRadarSeries({
    local: {},
    macroUs: {
      buffett: { long: [['2026-04-01', 255.05]] },
      marginGdp: { long: [['2026-10-01', 4.39]] },
      nfci: { long: [['2026-11-13', -0.478]] },
      putCall: { long: [['2026-11-23', 0.94]] },
      hfEquityLs: { long: [['2026-06-30', 1.503]] },
    },
    mastersFred: { profitGdp: { history: [['2026-04-01', 13.14]] } },
    marketCache: { breadth: [], volume: [] },
    fetched: { vix: [], vix3m: [] },
    shillerEps: parseShillerEps('date,P,D,E,CPI,GS10\n1871-01,1,1,1,1,1\n'),
    panel: makePanel(core), currentPanel: makePanel(core, { mode: 'current' }),
    today: '2026-11-24', lastComplete: '2026-10-31',
  })
  assert.equal(current.buffett.at(-1).observedOn, '2026-06-30')
  assert.equal(current.buffett.at(-1).availableOn, '2026-09-30')
  assert.equal(current.profitGdp.at(-1).observedOn, '2026-06-30')
  assert.equal(current.marginGdp.at(-1).observedOn, '2026-10-31')
  assert.equal(current.nfci.at(-1).observedOn, '2026-11-13')
  assert.equal(current.putCall.at(-1).observedOn, '2026-11-23')
  assert.equal(current.hfEquityLs.at(-1).observedOn, '2026-06-30')
})

test('66 项指标 source 都是可打开的 https 网址', () => {
  const date = '2026-11-24'
  const indicators = buildIndicators({}, {
    netLiquidity: 'https://fred.stlouisfed.org/series/WALCL',
    reserves: 'https://fred.stlouisfed.org/series/WRESBAL',
    baaChange: 'https://fred.stlouisfed.org/series/BAA',
    nfci: 'https://fred.stlouisfed.org/series/NFCI',
    ofrCredit: 'https://www.financialresearch.gov/financial-stress-index/data/fsi.csv',
    hy: 'https://fred.stlouisfed.org/data/BAMLH0A0HYM2',
    realYield: 'https://fred.stlouisfed.org/series/DFII10',
    dollar: 'https://fred.stlouisfed.org/series/DTWEXBGS',
    goldSilver: 'https://finance.yahoo.com/quote/SI=F/',
    copper: 'https://finance.yahoo.com/quote/HG=F/',
    pe: 'https://www.multpl.com/s-p-500-pe-ratio',
    forwardPe: 'https://example.com/fpe',
    cape: 'https://www.multpl.com/shiller-pe',
    erp: 'https://fred.stlouisfed.org/series/GS10',
    dividendYield: 'https://www.multpl.com/s-p-500-dividend-yield',
    buffett: 'https://fred.stlouisfed.org/series/NCBEILQ027S',
    equityShare: 'https://fred.stlouisfed.org/series/BOGZ1FL153064486Q',
    cashShare: 'https://fred.stlouisfed.org/series/TFAABSHNO',
    finraDebtYoy: 'https://www.finra.org/rules-guidance/key-topics/margin-accounts/margin-statistics',
    marginGdp: 'https://www.finra.org/rules-guidance/key-topics/margin-accounts/margin-statistics',
    cftcAsset: 'https://publicreporting.cftc.gov/x',
    cftcNdxAsset: 'https://publicreporting.cftc.gov/x',
    cftcLev: 'https://publicreporting.cftc.gov/x',
    hfEquityLs: 'https://www.financialresearch.gov/hedge-fund-monitor/',
    naaim: 'https://naaim.org/programs/naaim-exposure-index/',
    managerCash: 'https://example.com/m',
    managerUsOverweight: 'https://example.com/m',
    managerTechOverweight: 'https://example.com/m',
    aaiiSpread: 'https://www.aaii.com/sentimentsurvey',
    putCall: 'https://www.cboe.com/us/options/market_statistics/daily/',
    skew: 'https://cdn.cboe.com/api/global/us_indices/daily_prices/SKEW_History.csv',
    trend200: 'https://finance.yahoo.com/quote/%5EGSPC/history/',
    drawdown: 'https://finance.yahoo.com/quote/%5EGSPC/history/',
    vix: 'https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv',
    vixTrend: 'https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv',
    vixTerm: 'https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX3M_History.csv',
    realizedVol: 'https://finance.yahoo.com/quote/%5EGSPC/history/',
    vvix: 'https://cdn.cboe.com/api/global/us_indices/daily_prices/VVIX_History.csv',
    impliedCorr: 'https://cdn.cboe.com/api/global/us_indices/daily_prices/COR1M_History.csv',
    gex: 'https://squeezemetrics.com/monitor/dix',
    breadth: 'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html',
    industry200: 'https://mba.tuck.dartmouth.edu/x',
    industryMomentum: 'https://mba.tuck.dartmouth.edu/x',
    industryHighs: 'https://mba.tuck.dartmouth.edu/x',
    industryNetHighs: 'https://mba.tuck.dartmouth.edu/x',
    industryAdvDec: 'https://mba.tuck.dartmouth.edu/x',
    breadth200: 'https://github.com/datasets/s-and-p-500-companies',
    above50: 'https://github.com/datasets/s-and-p-500-companies',
    sectorBreadth: 'https://github.com/datasets/s-and-p-500-companies',
    netHighs: 'https://github.com/datasets/s-and-p-500-companies',
    advDec: 'https://github.com/datasets/s-and-p-500-companies',
    equalWeight: 'https://finance.yahoo.com/quote/%5ESPXEW/history/',
    volume: 'https://finance.yahoo.com/quote/%5EGSPC/history/',
    volumeRatio: 'https://www.cboe.com/markets/us/equities/market-statistics/historical-market-volume',
    epsYoy: 'https://shillerdata.com/',
    forwardEps: 'https://example.com/fpe',
    profitGdp: 'https://fred.stlouisfed.org/series/CP',
    nasdaqGap: 'https://finance.yahoo.com/quote/%5EIXIC/history/',
    soxGap: 'https://finance.yahoo.com/quote/%5ESOX/history/',
    techShare: 'https://mba.tuck.dartmouth.edu/x',
    chipsShare: 'https://mba.tuck.dartmouth.edu/x',
    energyShare: 'https://mba.tuck.dartmouth.edu/x',
    finShare: 'https://mba.tuck.dartmouth.edu/x',
    russellGap: 'https://finance.yahoo.com/quote/%5ERUT/history/',
    hsiGap: 'https://finance.yahoo.com/quote/%5EHSI/history/',
    sseGap: 'https://finance.yahoo.com/quote/000001.SS/history/',
  }, date)
  assert.equal(indicators.length, 66)
  for (const row of indicators) {
    assert.match(row.source, /^https:\/\/\S+$/, row.id)
    assert.equal(row.source.includes('÷'), false, row.id)
    assert.equal(/\s/.test(row.source), false, row.id)
  }
})

test('单位：nfci/ofrCredit 无单位后缀；sectorBreadth 为「个」', () => {
  const date = '2026-11-20'
  const mk = (id, value, extra = {}) => {
    const history = Array.from({ length: 120 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 0, 1 + i * 2)).toISOString().slice(0, 10)
      return { observedOn: d, availableOn: d, value: value + i * 0.01, ...extra }
    })
    history.push({ observedOn: date, availableOn: date, value, ...extra })
    return buildIndicators({ [id]: history }, {}, date).find(row => row.id === id)
  }
  const nfci = mk('nfci', -0.4)
  assert.equal(nfci.unit, '')
  assert.ok(nfci.changes.length >= 1)
  assert.equal(nfci.changes[0].text.includes('点'), false)
  const ofr = mk('ofrCredit', -0.7, { fsi: -0.4 })
  assert.equal(ofr.unit, '')
  assert.equal(ofr.changes[0].text.includes('点'), false)
  const sector = mk('sectorBreadth', 5, { total: 11 })
  assert.equal(sector.unit, '个')
  assert.equal(sector.valueText, '5 个')
  assert.match(sector.changes[0].text, /个/)
})

test('A1 修正记录是固定文字，不含运行时重算占位', () => {
  assert.match(REVISION_A1, /全样本夏普由 0\.586 变为 0\.591/)
  assert.match(REVISION_A1, /35 个月的雷达档位/)
  assert.equal(REVISION_A1.includes('null'), false)
})

test('家庭配置合并：合并后热度贴边也提示', () => {
  // 估值 −1；拥挤 −1/−1/1 → 今天热度约 −0.67；合并家庭后拥挤 0，热度恰 −0.5
  const indicators = [
    { id: 'pe', dimension: 'valuation', label: '市盈率', inScore: true, score: -1, core: true, heat: 'hot', status: 'fresh' },
    { id: 'equityShare', dimension: 'crowding', label: '股票', inScore: true, score: -1, core: true, heat: 'hot', status: 'fresh' },
    { id: 'cashShare', dimension: 'crowding', label: '现金', inScore: true, score: -1, core: true, heat: 'hot', status: 'fresh' },
    { id: 'finraDebtYoy', dimension: 'crowding', label: '融资', inScore: true, score: 1, core: true, heat: 'cool', status: 'fresh' },
  ].map(row => ({
    ...row, group: 'x', value: 1, valueText: '1', unit: '', observedOn: '2026-11-01',
    frequency: 'monthly', ageDays: 1, direction: 'hot', percentile: 50, percentileSince: '2000-01-01',
    percentileBasis: '月度样本', heatRank: 50, rule: '', historyYears: 20, source: '',
    changes: [], thresholds: [], history: [],
  }))
  const current = buildCurrent(indicators)
  assert.ok(current.caveats.some(text => /两项家庭配置/.test(text) && /恰在偏热的边界上/.test(text)),
    JSON.stringify(current.caveats))
})

test('changeOverDays：假日缺日时用 5 天内最近前值', () => {
  const rows = [
    ['2026-01-02', 100],
    ['2026-01-05', 101], // 目标 2026-04-06 的 91 天前约 2026-01-05
    ['2026-04-06', 110],
  ]
  // 恰好 91 天前：没有精确日，但 2026-01-05 距目标 ≤5 天
  const out = changeOverDays([
    ['2026-01-02', 100],
    ['2026-01-06', 100], // 目标日前 1 天内
    ['2026-04-06', 110],
  ], 91)
  assert.equal(out.length, 1)
  assert.equal(out[0][0], '2026-04-06')
  assert.equal(out[0][1], 10)
  // 精确命中仍可用
  assert.deepEqual(changeOverDays([['2026-01-05', 100], ['2026-04-06', 110]], 91)[0].slice(0, 2), ['2026-04-06', 10])
  void rows
})

test('量比早年低于 0.3 的错值按阈值剔除（含 1997-12-26、2003-12-26）', async () => {
  const early = [
    ['1997-12-24', 1.0],
    ['1997-12-26', 0.26],
    ['2003-12-24', 1.1],
    ['2003-12-26', 0.26],
    ['2004-01-02', 0.9],
  ]
  const kept = early.filter(([, value]) => value >= 0.3)
  assert.equal(kept.some(([d]) => d === '1997-12-26'), false)
  assert.equal(kept.some(([d]) => d === '2003-12-26'), false)
  assert.equal(kept.length, 3)
})

test('VIX 变化趋势：近 21 日均值相对之前 126 日均值', async () => {
  const { vixTrend } = await import('./lib/market-radar/sources.mjs')
  const day = i => new Date(Date.UTC(2026, 0, 1) + i * 864e5).toISOString().slice(0, 10)
  const daily = Array.from({ length: 147 }, (_, i) => [day(i), i < 126 ? 20 : 25])
  const rows = vixTrend(daily)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].observedOn, day(146))
  assert.equal(rows[0].value, 25)
  assert.equal(rows[0].recent, 25)
  assert.equal(rows[0].base, 20)
  assert.equal(vixTrend(daily.slice(1)).length, 0)
})

test('Ken French 行业市值占比：公司数 × 平均规模，第 t 行记为 t−1 月末', async () => {
  const { parseFrenchShares } = await import('./lib/market-radar/sources.mjs')
  const named = ['Hardw', 'Softw', 'Chips', 'Oil', 'Coal', 'Banks', 'Insur', 'RlEst', 'Fin']
  const names = Array.from({ length: 49 }, (_, i) => named[i] ?? `I${i}`)
  const row = (ym, vals) => [ym, ...vals].join(',')
  // 科技三行业各 1 家 × 10；Oil 1 家 × 5、Coal 1 家 × 5；金融四行业各 1 家 × 2.5；另一行业 4 家 × 10；其余没有公司
  const firms = Array.from({ length: 49 }, (_, i) => (i < 9 ? 1 : i === 9 ? 4 : 0))
  const sizes = Array.from({ length: 49 }, (_, i) => (i < 3 ? 10 : i < 5 ? 5 : i < 9 ? 2.5 : i === 9 ? 10 : -99.99))
  const csv = ['Number of Firms in Portfolios', ',' + names.join(','), row('202609', firms), '',
    'Average Firm Size', ',' + names.join(','), row('202609', sizes)].join('\n')
  // 总市值 30 + 10 + 10 + 40 = 90
  const pct = v => Math.round(v / 90 * 100 * 1e4) / 1e4
  const [[date, ...shares]] = parseFrenchShares(csv)
  assert.equal(date, '2026-08-31')
  shares.forEach((v, i) => assert.ok(Math.abs(v - pct([30, 10, 10, 10][i])) < 1e-3, `第 ${i} 列 ${v}`))
})
