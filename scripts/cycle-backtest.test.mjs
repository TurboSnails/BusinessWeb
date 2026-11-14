import { test } from 'node:test'
import assert from 'node:assert/strict'
import { backtestMarket, buildBacktest, distribution, episodes, forwardReturns, simulate, stats } from './cycle-backtest.mjs'
import { technicalEvidence } from '../src/features/market-cycle/engine.ts'

const DAY = 86400000
/** 合成周K：周五日期，收盘按给定函数生成；月K取每月最后一根周K。 */
function synthetic(weeks, closeAt, firstFriday = '2010-01-01') {
  const t0 = Date.parse(`${firstFriday}T00:00:00Z`)
  const week = Array.from({ length: weeks }, (_, i) => ({ date: new Date(t0 + i * 7 * DAY).toISOString().slice(0, 10), close: closeAt(i), volume: 1 }))
  const byMonth = new Map()
  for (const b of week) byMonth.set(b.date.slice(0, 7), b)
  return { week, month: [...byMonth.values()], source: 'https://example.com/', fetchedAt: '2026-01-01T00:00:00Z' }
}
const wave = i => 100 * (1 + 0.004 * i) * (1 + 0.15 * Math.sin(i / 9))
const saturdayAfter = date => new Date(Date.parse(`${date}T00:00:00Z`) + DAY).toISOString().slice(0, 10)

test('simulate：信号滞后一周生效，切换扣成本，买入持有同窗口', () => {
  const closes = [100, 100, 100, 110, 99, 99, 108.9]
  const signals = [false, false, true, false, false, false, false]
  // start=0 → 评估窗口从第 2 周的收益开始；lag=1：第 2 周收盘确认的防守作用于第 4 周收益
  const r = simulate(closes, signals, 0, { lag: 1, cost: 0.01 })
  assert.deepEqual(r.invested, [1, 1, 0, 1, 1])
  assert.equal(r.switches, 2)
  assert.ok(Math.abs(r.bh.at(-1) - 1.089) < 1e-9)
  // 1.1（第3周）→ 卖出扣 1% → 第4周空仓不受 −10% → 买回扣 1% → 0% → +10%
  assert.ok(Math.abs(r.def.at(-1) - 1.1 * 0.99 * 0.99 * 1.1) < 1e-9)
  const l0 = simulate(closes, signals, 0, { lag: 0 })
  assert.deepEqual(l0.invested, [1, 0, 1, 1, 1]) // 周一开盘口径：第 2 周收盘的信号作用于第 3 周收益
})

test('stats：回撤、CAGR、波动按定义计算', () => {
  const s = stats([1, 1.2, 0.9, 1.21], ['2020-01-03', '2020-07-03', '2021-01-01', '2022-01-01'])
  assert.equal(s.maxDrawdown, -0.25)
  assert.equal(s.totalReturn, 0.21)
  assert.ok(Math.abs(s.cagr - 0.1) < 0.002)
  assert.ok(s.volatility > 0)
  assert.deepEqual(distribution([]), { n: 0 })
  assert.equal(distribution([-1, 0, 1, 2]).negativeShare, 0.25)
})

test('episodes：起点已在防守中不计“进入”；买回价不低于卖出价记为打脸', () => {
  const closes = [10, 10, 9, 8, 9, 10, 11, 12, 11, 10]
  const signals = [true, false, true, true, false, false, false, true, false, false]
  const dates = closes.map((_, i) => `2020-01-${String(i + 1).padStart(2, '0')}`)
  const eps = episodes(closes, dates, signals, 0, 1)
  assert.equal(eps.length, 2)
  assert.deepEqual([eps[0].entry, eps[0].exit, eps[0].weeks, eps[0].sellPrice, eps[0].buyPrice, eps[0].whipsaw], ['2020-01-03', '2020-01-05', 2, 8, 10, true])
  assert.deepEqual([eps[1].weeks, eps[1].sellPrice, eps[1].buyPrice, eps[1].whipsaw], [1, 11, 10, false])
  const fwd = forwardReturns(closes, [2], 0, [2])
  assert.equal(fwd[2].afterEntry.n, 1)
  assert.equal(fwd[2].afterEntry.mean, 0)
  assert.equal(fwd[2].allWeeks.n, 8)
})

test('无未来函数：改动未来价格不影响此前任何一周的持仓与净值', () => {
  const base = synthetic(300, wave)
  const a = backtestMarket(base, '2016-01-01')
  const shocked = { ...base, week: base.week.map((b, i) => (i >= 250 ? { ...b, close: b.close * (i % 2 ? 0.5 : 1.7) } : b)) }
  const b = backtestMarket(shocked, '2016-01-01')
  const cut = a.curve.findIndex(p => p[0] >= base.week[250].date)
  assert.ok(cut > 100)
  assert.deepEqual(b.curve.slice(0, cut), a.curve.slice(0, cut))
  // 截断输入（只给到某周）得到的曲线是完整曲线的前缀
  const truncated = backtestMarket(base, saturdayAfter(base.week[200].date))
  assert.deepEqual(truncated.curve.map(p => p[3]), a.curve.slice(0, truncated.curve.length).map(p => p[3]))
})

test('防守判定与面板 technicalEvidence 的“风险”一致（月线门槛满足时）', () => {
  const price = synthetic(420, wave)
  const r = backtestMarket(price, '2018-12-31')
  // 曲线第 i 点的持仓由第 i-2 周信号决定（lag=1）；直接逐周对照面板判定
  const weeks = price.week.slice(330, 400)
  let compared = 0
  for (const w of weeks) {
    const e = technicalEvidence(price, saturdayAfter(w.date)).evidence
    if (e.signal === 'missing') continue
    const idx = r.curve.findIndex(p => p[0] === w.date)
    const later = r.curve[idx + 2]
    if (!later) continue
    assert.equal(later[3] === 0, e.signal === 'risk', w.date)
    compared++
  }
  assert.ok(compared > 30)
})

test('buildBacktest 确定性：同一输入两次输出完全相同；坏输入拒绝', () => {
  const snapshot = { schemaVersion: 1, generatedAt: '2016-01-02T08:00:00Z', markets: { csi300: synthetic(300, wave), hsi: synthetic(40, wave) }, warnings: [] }
  const one = JSON.stringify(buildBacktest(snapshot)), two = JSON.stringify(buildBacktest(snapshot))
  assert.equal(one, two)
  const parsed = JSON.parse(one)
  assert.deepEqual(Object.keys(parsed.markets), ['csi300']) // 历史太短的市场不出结果
  assert.equal(parsed.asOf, parsed.markets.csi300.end)
  assert.ok(parsed.limitations.length >= 5)
  assert.throws(() => buildBacktest({ schemaVersion: 2 }))
  assert.throws(() => buildBacktest({ schemaVersion: 1, markets: {} }))
})
