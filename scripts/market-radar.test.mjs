import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  alignRadar, blendEquity, buildBacktestVerdict, DISCLOSURES,
  resolveMastersTiers, STRATEGY_ROWS,
} from './lib/market-radar/backtest.mjs'
import { aggregateScores, buildIndicators, rankAt, scoreAt, scoreIndicator } from './lib/market-radar/indicators.mjs'
import { buildRadarSeries, parseShillerEps, priceAdjustedPe } from './lib/market-radar/sources.mjs'
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

test('当前 PE 使用已发布读数，历史 PE 按价格折算，家庭配置和盈利遵守各自滞后', () => {
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
  const core = {
    GS10: [['2026-10-01', 4]],
    price: [['2026-07-01', 100], ['2026-08-01', 105], ['2026-10-01', 110]],
  }
  const { current, historical } = buildRadarSeries({
    local: { spxPe: { history: [['2026-07-01', 10], ['2026-08-01', 15], ['2026-10-01', 20], ['2026-11-20', 25]] } },
    macroUs: { equityShare: { long: cashRows } }, marketCache: { breadth: [], volume: [] }, fetched, shillerEps,
    panel: makePanel(core), currentPanel: makePanel(core, { mode: 'current' }), today: '2026-11-23', lastComplete: '2026-10-31',
  })
  assert.equal(rankAt(current.pe, '2026-11-23').point.value, 25)
  assert.equal(rankAt(current.erp, '2026-11-23').point.value, 0)
  // 7 月市盈率 10 × P(10 月)/P(7 月) = 10 × 110/100 = 11，observedOn 落在 10 月
  assert.equal(rankAt(historical.pe, '2026-10-31').point.value, 11)
  assert.equal(rankAt(historical.pe, '2026-10-31').point.observedOn, '2026-10-01')
  assert.equal(rankAt(historical.cashShare, '2026-11-23').point.value, 27)
  assert.equal(rankAt(historical.cashShare, '2026-12-31').point.value, 30)
  assert.equal(rankAt(historical.equityShare, '2026-11-23').point.observedOn, '2026-06-30')
  assert.equal(rankAt(historical.epsYoy, '2026-10-30').point.observedOn, '1872-01-31')
  assert.equal(rankAt(historical.epsYoy, '2026-10-31').point.value, 10)
})

test('priceAdjustedPe：正常折算、缺价格跳过、availableOn 为 t 月末', () => {
  const peRows = [['2020-01-01', 20], ['2020-02-01', 25], ['2020-03-01', 30]]
  const price = makePanel({
    price: [['2020-01-01', 100], ['2020-02-01', 100], ['2020-04-01', 110], ['2020-05-01', 120]],
  }).price
  const rows = priceAdjustedPe(peRows, price)
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0], {
    value: 22, observedOn: '2020-04-01', availableOn: '2020-04-30', earningsOn: '2020-01-01',
  })
  assert.deepEqual(rows[1], {
    value: 30, observedOn: '2020-05-01', availableOn: '2020-05-31', earningsOn: '2020-02-01',
  })
  // 3 月缺 P(m) 与 P(t=6 月) → 跳过
  assert.equal(rows.some(row => row.earningsOn === '2020-03-01'), false)
  assert.deepEqual(priceAdjustedPe(peRows, []), [])
})

test('buildBacktestVerdict：高于 / 接近 / 低于，雷达优于大师时无末句', () => {
  const metrics = (sharpe, maxDd = -0.2) => ({
    cagr: 0.1, vol: 0.15, maxDd, sharpe, avgEquity: 0.7, switchesPerYear: 1,
  })
  const rowsOf = (radar, static70, trend, masters) => [
    { id: 'radar', full: metrics(radar, -0.312) },
    { id: 'static70', full: metrics(static70) },
    { id: 'trend', full: metrics(trend) },
    { id: 'masters', full: metrics(masters, -0.2) },
  ]
  const higher = buildBacktestVerdict(rowsOf(0.59, 0.55, 0.64, 0.7))
  assert.match(higher, /高于恒定七成股票的 0\.55/)
  assert.match(higher, /低于十个月均线的 0\.64 和大师方案的 0\.70/)
  assert.match(higher, /最大回撤 −31\.2%，大师方案为 −20\.0%。/)
  assert.match(higher, /仓位仍以宏观攻守为准。$/)

  const near = buildBacktestVerdict(rowsOf(0.56, 0.55, 0.555, 0.57))
  assert.match(near, /接近恒定七成股票的 0\.55、十个月均线的 0\.56 和大师方案的 0\.57/)
  assert.match(near, /仓位仍以宏观攻守为准。$/)

  const lower = buildBacktestVerdict(rowsOf(0.4, 0.55, 0.64, 0.7))
  assert.match(lower, /低于恒定七成股票的 0\.55、十个月均线的 0\.64 和大师方案的 0\.70/)
  assert.match(lower, /仓位仍以宏观攻守为准。$/)

  const beatsMasters = buildBacktestVerdict(rowsOf(0.8, 0.55, 0.64, 0.7))
  assert.match(beatsMasters, /高于恒定七成股票的 0\.55、十个月均线的 0\.64 和大师方案的 0\.70/)
  assert.equal(beatsMasters.includes('仓位仍以宏观攻守为准'), false)
})

test('mastersTimeline 有月采用、缺月回退实时帧；策略 6 行；blend 用 masters', () => {
  const map = new Map([['2020-01', 'defense']])
  assert.equal(resolveMastersTiers('2020-01', map, 'lean-defense'), 'defense')
  assert.equal(resolveMastersTiers('2020-02', map, 'lean-offense'), 'lean-offense')
  assert.deepEqual(STRATEGY_ROWS.map(row => row.id), [
    'radar', 'masters', 'blend', 'trend', 'buyhold', 'static70',
  ])
  assert.match(STRATEGY_ROWS[1].label, /宏观攻守页/)
  assert.equal(STRATEGY_ROWS.some(row => row.id === 'mastersRealtime'), false)
  const signal = { radar: 'offense', masters: 'defense' }
  assert.equal(blendEquity(signal.radar, signal.masters), (tierEquity('offense') + tierEquity('defense')) / 2)
  assert.match(DISCLOSURES[4], /当月标普月均价/)
  assert.match(DISCLOSURES[5], /折算后的市盈率/)
  assert.match(DISCLOSURES[8], /大师方案直接取宏观攻守页的月度时间线/)
  assert.match(DISCLOSURES[8], /实时数据口径/)
  assert.match(DISCLOSURES.at(-1), /2026 年 11 月 24 日修正/)
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
  assert.equal(chartHistory(monthly, { dimension: 'valuation' }).length, 120)
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
