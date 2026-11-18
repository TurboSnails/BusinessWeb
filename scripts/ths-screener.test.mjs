import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PRESETS, SNAP_PRESETS, boll, breadthDay, buildScreener, buildSeries, buildSnapshot, downStreak, ema, expectedDate, indicators, isCloseTs, kdj, mergeSnapHistory,
  parseSnapPage, rsi, screenDay, sma, snapNum, snapUrl, snapshotWindow, upStreak, validateSnapshot,
} from './ths-screener-lib.mjs'
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

test('连续下跌、BOLL（样本标准差）、KDJ', () => {
  assert.deepEqual([...downStreak(Float64Array.from([5, 4, 3, 3, 2]))], [0, 1, 2, 0, 1])
  const c = Float64Array.from([1, 2, 3, 4])
  const b = boll(c, 4, 2)
  assert.ok(Number.isNaN(b.up[2]))
  const sd = Math.sqrt((1.5 ** 2 + 0.5 ** 2 + 0.5 ** 2 + 1.5 ** 2) / 3) // 除以 N−1
  assert.ok(Math.abs(b.up[3] - (2.5 + 2 * sd)) < 1e-12 && Math.abs(b.lo[3] - (2.5 - 2 * sd)) < 1e-12)
  assert.ok(Math.abs(b.bw[3] - (4 * sd / 2.5) * 100) < 1e-9)
  // KDJ：第 0 天 H=L=C 时 RSV 沿用 50；第 1 天 RSV = (12−10)/(12−10)=100
  const k = kdj(Float64Array.from([10, 12]), Float64Array.from([10, 10]), Float64Array.from([10, 12]))
  assert.equal(k.k[0], 50); assert.equal(k.d[0], 50)
  assert.ok(Math.abs(k.k[1] - (100 + 100) / 3) < 1e-12)
  assert.ok(Math.abs(k.d[1] - (k.k[1] + 100) / 3) < 1e-12)
  assert.ok(Math.abs(k.j[1] - (3 * k.k[1] - 2 * k.d[1])) < 1e-12)
})

test('布林上穿 / 跌破、收口、均线粘合', () => {
  const wob = Array.from({ length: 20 }, (_, i) => 10 + (i % 2 ? 0.1 : -0.1))
  assert.equal(hitOf([...wob, 11], 'bollUp').hits.length, 1)
  assert.equal(hitOf([...wob, 10.05], 'bollUp').hits.length, 0)
  assert.equal(hitOf([...wob, 9], 'bollDown').hits.length, 1)
  assert.equal(hitOf(wob, 'bollUp').eligible, 0) // 不足 21 条
  // 收口：前面大幅波动，最后 10 天几乎不动 → 带宽处于最低 10%
  const wide = Array.from({ length: 109 }, (_, i) => 10 + (i % 2 ? 1 : -1))
  const calm = Array.from({ length: 30 }, (_, i) => 10 + (i % 2 ? 0.01 : -0.01))
  assert.equal(hitOf([...wide, ...calm].slice(-119), 'squeeze').eligible, 1)
  assert.equal(hitOf([...wide, ...calm].slice(-119), 'squeeze').hits.length, 1)
  assert.equal(hitOf([...calm, ...wide].slice(-119), 'squeeze').hits.length, 0)
  assert.equal(hitOf(wide.slice(0, 118), 'squeeze').eligible, 0) // 不足 119 条
  assert.equal(hitOf(Array(20).fill(10), 'tangle').hits.length, 1)
  assert.equal(hitOf(Array.from({ length: 20 }, (_, i) => 10 + i), 'tangle').hits.length, 0)
})

test('KDJ 金叉 / 死叉与预热，120 日新高 / 60、120 日新低，连续下跌', () => {
  const down = Array.from({ length: 40 }, (_, i) => 20 - i * 0.2)
  let gold = null
  const series = [...down]
  for (let x = series.at(-1); series.length < 60;) { x += 0.3; series.push(x); if (hitOf(series, 'kdjGold').hits.length) { gold = series.length; break } }
  assert.ok(gold, '下跌后上涨应出现 KDJ 金叉')
  assert.equal(hitOf(down.slice(0, 29), 'kdjGold').eligible, 0)
  assert.equal(hitOf([...flat(10, 119), [10, 11, 10, 11]], 'high120').hits.length, 1)
  assert.equal(hitOf([...flat(10, 118), [10, 11, 10, 11]], 'high120').eligible, 0)
  assert.equal(hitOf([...flat(10, 59), [10, 10, 9, 9]], 'low60').hits.length, 1)
  assert.equal(hitOf([...flat(10, 119), [10, 10, 9, 9]], 'low120').hits.length, 1)
  assert.deepEqual(hitOf([10, 9.9, 9.8, 9.7, 9.6, 9.5], 'dstreak').hits, [['600000', 5]])
})

// ── 当日量能快照 ──
const D = '2026-11-18'
const ts = (date, hm) => Date.parse(`${date}T${hm}:00+08:00`) / 1000
test('快照字段：- / 空 / null 为缺失，行情时间须为当日 15:00 后', () => {
  assert.equal(snapNum('-'), null); assert.equal(snapNum(''), null); assert.equal(snapNum(null), null); assert.equal(snapNum('1.5'), 1.5); assert.equal(snapNum(0), 0)
  assert.ok(isCloseTs(ts(D, '15:00'), D)); assert.ok(isCloseTs(ts(D, '15:34'), D))
  assert.ok(!isCloseTs(ts(D, '14:59'), D)); assert.ok(!isCloseTs(ts('2026-11-17', '15:34'), D)); assert.ok(!isCloseTs('-', D))
  const p = parseSnapPage({ rc: 0, data: { total: 2, diff: [{ f12: '600000', f14: ' 浦发 ', f2: 10, f3: 3.2, f6: 1e8, f7: 5, f8: 2, f10: 2.5, f124: ts(D, '15:00') }, { f12: '000001', f14: '停牌', f2: '-', f3: '-', f6: '-', f7: '-', f8: '-', f10: '-' }] } })
  assert.equal(p.total, 2); assert.equal(p.rows[0].name, '浦发'); assert.equal(p.rows[1].close, null); assert.equal(p.rows[1].volRatio, null)
  assert.throws(() => parseSnapPage({ rc: 0, data: null })); assert.throws(() => parseSnapPage('<html>'))
  assert.match(snapUrl(3), /push2delay\.eastmoney\.com.*pn=3&pz=100/)
})

const snapRows = (n, date = D, over = {}) => Array.from({ length: n }, (_, i) => ({ code: String(600000 + i).padStart(6, '0'), name: `股${i}`, close: 10, pct: 0, amount: 1e7, amp: 2, turnover: 1, volRatio: 1, ts: ts(date, '15:30'), ...over }))
const storeOf = (rows, c = 10) => new Map(rows.map((r) => [r.code, { c }]))
test('快照校验：总数、分页完整、行情时间、与快照仓收盘一致', () => {
  const rows = snapRows(4500)
  assert.equal(validateSnapshot(rows, 4500, D, storeOf(rows)).ok, true)
  assert.match(validateSnapshot(rows.slice(0, 3000), 3000, D, storeOf(rows)).reason, /少于/)
  assert.match(validateSnapshot(rows.slice(0, 4400), 4500, D, storeOf(rows)).reason, /分页不完整/)
  assert.match(validateSnapshot([...rows.slice(0, 4499), rows[0]], 4500, D, storeOf(rows)).reason, /分页不完整/) // 重页
  assert.match(validateSnapshot(snapRows(4500, '2026-11-17'), 4500, D, storeOf(rows)).reason, /收盘后行情/)
  assert.match(validateSnapshot(rows, 4500, D, storeOf(rows, 9.5)).reason, /不是同一天/)
  const sus = [...snapRows(4400), ...snapRows(100, D, { close: null, amount: null }).map((r, i) => ({ ...r, code: String(700000 + i) }))]
  const v = validateSnapshot(sus, 4500, D, storeOf(sus))
  assert.equal(v.ok, true); assert.equal(v.valid.size, 4400) // 停牌股不计入
})

test('量能条件与区块输出；历史只取真实采集日', () => {
  const valid = new Map([
    ['600001', { code: '600001', name: '甲', close: 10, pct: 5, amount: 2.5e8, amp: 12, turnover: 15, volRatio: 3 }],
    ['600002', { code: '600002', name: '乙', close: 8, pct: -4, amount: 1e8, amp: 6, turnover: 3, volRatio: 2 }],
    ['600003', { code: '600003', name: '丙', close: 8, pct: 2, amount: 1e8, amp: 3, turnover: 1, volRatio: null }],
  ])
  const hist = { days: { '2026-11-16': { volUp: 7 }, '2026-11-18': { volUp: 99 } } }
  const s = buildSnapshot(valid, D, new Set(['600001', '600003']), new Map([['600001', { industry: '银行' }]]), hist)
  const by = Object.fromEntries(s.presets.map((p) => [p.id, p]))
  assert.deepEqual(by.volUp.hits, [['600001', 3]]); assert.equal(by.volUp.eligible, 2) // 量比缺失不参与
  assert.deepEqual(by.volDown.hits, [['600002', 2]])
  assert.deepEqual(by.volBreak.hits, [['600001', 3]]) // 600003 新高但量比缺失
  assert.deepEqual(by.turnover.hits, [['600001', 15]]); assert.deepEqual(by.amp.hits, [['600001', 12]])
  assert.deepEqual(by.volUp.history, [{ date: '2026-11-16', count: 7 }, { date: D, count: 1 }]) // 当日以本次为准
  assert.deepEqual(by.turnover.history, [{ date: '2026-11-16', count: null }, { date: D, count: 1 }])
  assert.deepEqual(s.stocks['600001'], ['甲', '银行', 10, 5, 3, 15, 2.5, 12])
  assert.equal(s.presets.length, SNAP_PRESETS.length); assert.equal(s.eligible, 3)
  const m = mergeSnapHistory({ days: Object.fromEntries(Array.from({ length: 70 }, (_, i) => [`2026-0${1 + Math.floor(i / 28)}-${String(1 + (i % 28)).padStart(2, '0')}`, {}])) }, D, { volUp: 1 })
  assert.equal(Object.keys(m.days).length, 60); assert.equal(Object.keys(m.days).at(-1), D)
})

test('快照采集时段：只在目标日当天北京时间 15:10 之后', () => {
  assert.equal(snapshotWindow(new Date('2026-11-18T07:15:00Z'), D, isTradingDay), true)
  assert.equal(snapshotWindow(new Date('2026-11-18T07:05:00Z'), D, isTradingDay), false)
  assert.equal(snapshotWindow(new Date('2026-11-18T17:00:00Z'), D, isTradingDay), false) // 北京次日凌晨
  assert.equal(snapshotWindow(new Date('2026-11-18T07:15:00Z'), '2026-11-17', isTradingDay), false)
})
