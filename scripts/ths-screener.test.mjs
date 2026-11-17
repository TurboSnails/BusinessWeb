import test from 'node:test'
import assert from 'node:assert/strict'
import { PRESETS, breadthDay, buildScreener, buildSeries, ema, expectedDate, indicators, rsi, screenDay, sma, upStreak } from './ths-screener-lib.mjs'
import { isTradingDay } from './market-mood-lib.mjs'

// 连续交易日（2026-07 起，跳过周末）
function tradingDates(n, from = '2026-07-01') {
  const out = []
  let t = Date.parse(`${from}T00:00:00Z`)
  while (out.length < n) { const d = new Date(t).toISOString().slice(0, 10); if (isTradingDay(d)) out.push(d); t += 864e5 }
  return out
}
/** bars: {code: [[o,h,l,c,p?], ...]}，每只股票从第 0 天开始（null 表示停牌） */
function mkDays(bars, n, source = 'em-kline-qfq') {
  const dates = tradingDates(n)
  return dates.map((date, i) => ({ date, source, rows: new Map(Object.entries(bars).filter(([, b]) => b[i]).map(([code, b]) => { const [o, h, l, c, p] = b[i]; return [code, p === undefined ? { o, h, l, c } : { o, h, l, c, p }] })) }))
}
const flat = (c, n) => Array.from({ length: n }, () => [c, c, c, c])
const line = (closes) => closes.map((c) => [c, c, c, c])

test('复权：除权日之前的价格按 昨收 ÷ 前收盘 缩放到最新基准', () => {
  // 第 2 天 10 送 10：前收 20，昨收 10
  const days = mkDays({ '600000': [[19, 20, 19, 20], [20, 21, 19, 20], [10, 11, 10, 10.5, 10]] }, 3)
  const s = buildSeries(days).get('600000')
  assert.deepEqual([...s.c], [10, 10, 10.5])
  assert.deepEqual([...s.h], [10, 10.5, 11])
  assert.equal(s.at[2], 2)
})

test('停牌：序列跳过无记录的天，at = −1', () => {
  const days = mkDays({ '000001': [[1, 1, 1, 1], null, [1, 1, 1, 1.1]] }, 3)
  const s = buildSeries(days).get('000001')
  assert.deepEqual([...s.at], [0, -1, 1])
  assert.deepEqual(s.day, [0, 2])
})

test('均线 / EMA / RSI / 连涨', () => {
  assert.deepEqual([...sma(Float64Array.from([1, 2, 3, 4]), 2)].map((x) => (Number.isNaN(x) ? null : x)), [null, 1.5, 2.5, 3.5])
  const e = ema(Float64Array.from([10, 20]), 3)
  assert.equal(e[0], 10); assert.equal(e[1], 15)
  const r = rsi(Float64Array.from([10, 11, 12, 11]), 14)
  assert.ok(Number.isNaN(r[0])); assert.equal(r[1], 100)
  // 第 3 天：up = (0 + 13*((1+13*1)/14))/14，all = (1 + 13*1)/14 = 1
  assert.ok(Math.abs(r[3] - (13 / 14) * 100) < 1e-9)
  assert.ok(Number.isNaN(rsi(Float64Array.from([5, 5, 5]))[2])) // 全平：分母为 0 记缺失
  assert.deepEqual([...upStreak(Float64Array.from([1, 2, 3, 3, 4]))], [0, 1, 2, 0, 1])
})

const P = Object.fromEntries(PRESETS.map((p) => [p.id, p]))
const hitOf = (closesOrBars, id) => {
  const bars = Array.isArray(closesOrBars[0]) ? closesOrBars : line(closesOrBars)
  const days = mkDays({ '600000': bars }, bars.length)
  const ind = new Map([...buildSeries(days)].map(([c, s]) => [c, indicators(s)]))
  return screenDay(ind, days.length - 1).get(id)
}

test('站上 / 跌破 20 日线：只认今日穿越', () => {
  const base = Array(20).fill(10)
  assert.equal(hitOf([...base, 11], 'up20').hits.length, 1)
  assert.equal(hitOf([...base, 11, 11.5], 'up20').hits.length, 0) // 昨日已在线上
  assert.equal(hitOf([...base, 9], 'down20').hits.length, 1)
  assert.equal(hitOf([...base], 'up20').eligible, 0) // 不足 21 条
})

test('均线多头：5>10>20>60 且收盘在 5 日线上', () => {
  const up = Array.from({ length: 70 }, (_, i) => 10 + i * 0.1)
  const r = hitOf(up, 'bull')
  assert.equal(r.hits.length, 1)
  assert.equal(hitOf(Array(70).fill(10), 'bull').hits.length, 0)
})

test('MACD 金叉 / 死叉与预热', () => {
  const down = Array.from({ length: 70 }, (_, i) => 20 - i * 0.1)
  const series = [...down]
  let gold = null
  for (let x = series.at(-1); series.length < 120; ) { x += 0.3; series.push(x); const r = hitOf(series, 'golden'); if (r.hits.length) { gold = series.length; break } }
  assert.ok(gold, '下跌后持续上涨应出现金叉')
  assert.equal(hitOf(series.slice(0, gold - 1), 'golden').hits.length, 0)
  assert.equal(hitOf(series.slice(0, 50), 'golden').eligible, 0) // 不足 60 条不判定
})

test('20 日新高 / 新低按最高 / 最低价，60 日新高', () => {
  const bars = [...flat(10, 19), [10, 10.5, 10, 10.2]]
  assert.equal(hitOf(bars, 'high20').hits.length, 1)
  assert.equal(hitOf([...flat(10, 19), [10, 10, 10, 10]], 'high20').hits.length, 0) // 持平不算
  assert.equal(hitOf([...flat(10, 19), [10, 10, 9.5, 9.8]], 'low20').hits.length, 1)
  assert.equal(hitOf([...flat(10, 59), [10, 11, 10, 11]], 'high60').hits.length, 1)
  assert.equal(hitOf([...flat(10, 58), [10, 11, 10, 11]], 'high60').eligible, 0)
})

test('连续上涨、跳空缺口、锤子线', () => {
  const s = hitOf([10, 10.1, 10.2, 10.3, 10.4, 10.5], 'streak')
  assert.deepEqual(s.hits, [['600000', 5]])
  assert.equal(hitOf([10, 10.1, 10.2, 10.3, 10.4], 'streak').hits.length, 0)
  assert.deepEqual(hitOf([[10, 10.2, 9.9, 10], [10.5, 10.8, 10.4, 10.7]], 'gap').hits, [['600000', 1.96]])
  assert.equal(hitOf([[10, 10.2, 9.9, 10], [10.5, 10.8, 10.2, 10.7]], 'gap').hits.length, 0) // 盘中回补
  assert.deepEqual(hitOf([[10, 10, 10, 10], [10, 10.1, 9.5, 10.1]], 'hammer').hits, [['600000', 5]]) // 下影 0.5 ≥ 2×实体 0.1，上影 0
  assert.equal(hitOf([[10, 10, 10, 10], [10, 10.4, 9.5, 10.1]], 'hammer').hits.length, 0) // 上影长于实体
  assert.equal(hitOf([[10, 10, 10, 10], [10, 10.01, 9.95, 10.01]], 'hammer').hits.length, 0) // 下影不足 2%
})

test('穿越类条件要求上一条记录正好是上一交易日', () => {
  const bars = [...line(Array(20).fill(10)), null, [11, 11, 11, 11]]
  const days = mkDays({ '600000': bars }, bars.length)
  const ind = new Map([...buildSeries(days)].map(([c, s]) => [c, indicators(s)]))
  assert.equal(screenDay(ind, days.length - 1).get('up20').eligible, 0)
})

test('市场宽度：不足 1000 只记缺失，涨跌按复权收盘', () => {
  const bars = {}
  for (let n = 0; n < 1200; n++) bars[String(600000 + n)] = line([...Array(19).fill(10), n % 3 === 0 ? 11 : n % 3 === 1 ? 9 : 10])
  const days = mkDays(bars, 20)
  const ind = new Map([...buildSeries(days)].map(([c, s]) => [c, indicators(s)]))
  const b = breadthDay(ind, 19)
  assert.equal(b.up, 400); assert.equal(b.down, 400); assert.equal(b.flat, 400); assert.equal(b.ratio, 1)
  assert.equal(b.above20, 33.3); assert.equal(b.above60, null); assert.equal(b.high20, 400); assert.equal(b.low20, 400)
  const small = breadthDay(new Map([...ind].slice(0, 10)), 19)
  assert.equal(small.above20, null); assert.equal(small.high20, null)
})

test('buildScreener：输出结构、名称行业、近 20 日走势与回算标记', () => {
  const bars = { '600000': line(Array.from({ length: 70 }, (_, i) => 10 + i * 0.1)), '000001': line(Array(70).fill(5)) }
  const days = mkDays(bars, 70)
  days[69].source = 'sina'
  const r = buildScreener(days, 69, new Map([['600000', { name: '浦发银行', industry: '银行' }]]))
  assert.equal(r.universe, 2)
  const bull = r.presets.find((p) => p.id === 'bull')
  assert.equal(bull.count, 1); assert.equal(bull.history.length, 20); assert.equal(bull.history.at(-1).date, days[69].date)
  assert.deepEqual(r.stocks['600000'].slice(0, 3), ['浦发银行', '银行', 16.9])
  assert.equal(r.breadth[0].date, days[19].date)
  assert.equal(r.breadth.at(-1).seeded, false); assert.equal(r.breadth.at(-2).seeded, true)
  assert.equal(r.presets.length, PRESETS.length)
  assert.ok(P.low20.asc && !P.high20.asc)
})

test('目标交易日：15:10 前取上一交易日，周末取周五', () => {
  assert.equal(expectedDate(new Date('2026-11-17T07:00:00Z'), isTradingDay), '2026-11-16') // 北京 15:00
  assert.equal(expectedDate(new Date('2026-11-17T07:15:00Z'), isTradingDay), '2026-11-17') // 北京 15:15
  assert.equal(expectedDate(new Date('2026-11-17T17:00:00Z'), isTradingDay), '2026-11-17') // 北京 11-18 01:00
  assert.equal(expectedDate(new Date('2026-11-22T04:00:00Z'), isTradingDay), '2026-11-20') // 周日
})
