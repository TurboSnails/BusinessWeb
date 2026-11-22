import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AVGO_SPLIT_DATE,
  bootstrapDeltaCer,
  buildTotalReturnSeries,
  cer,
  dailyTotalReturn,
  mulberry32,
  parseMoney,
  parseNasdaqDividends,
  parseNasdaqHistorical,
  parseUsDate,
  popVar,
  runStrategy,
  shouldTriggerThreshold,
  stationaryBlockBootstrap,
  isAtThresholdBoundary,
} from './stock5-rebalance-backtest.mjs'

function makePrices(dates, series) {
  const symbols = Object.keys(series)
  const prices = {}
  for (const s of symbols) prices[s] = series[s]
  return { dates, prices, stocks: symbols }
}

/** 构造等权起步后一只相对大涨、使其权重越过阈值的路径。 */
function pathCrossThreshold() {
  const dates = ['2021-08-25', '2021-08-26', '2021-08-27', '2021-08-30', '2021-08-31']
  const A = [100, 100, 100, 150, 150]
  const flat = [100, 100, 100, 100, 100]
  return makePrices(dates, { A, B: flat, C: flat, D: flat, E: flat })
}

test('次日成交无前视：触发日不调仓，次日才调回等权', () => {
  const { dates, prices, stocks } = pathCrossThreshold()
  const sim = runStrategy(dates, prices, stocks, {
    mode: 'threshold',
    thresholdAbs: 0.05,
    cost: 0,
    execLag: 1,
    startDate: '2021-08-25',
  })
  assert.equal(sim.decideFlags[3], true)
  assert.equal(sim.rebalanced[3], false)
  assert.equal(sim.firstDecisionDate, '2021-08-30')
  assert.equal(sim.rebalanced[4], true)
  assert.equal(sim.firstExecDate, '2021-08-31')
  assert.ok(sim.weightsPath[4].every(w => Math.abs(w - 0.2) < 1e-12))
  assert.ok(sim.weightsPath[3][0] > 0.25)
})

test('触发判定边界：恰好偏离 5 个百分点触发', () => {
  assert.equal(shouldTriggerThreshold([0.25, 0.1875, 0.1875, 0.1875, 0.1875], 0.2, 0.05), true)
  assert.equal(shouldTriggerThreshold([0.15, 0.2125, 0.2125, 0.2125, 0.2125], 0.2, 0.05), true)
  assert.equal(isAtThresholdBoundary(0.25, 0.2, 0.05), true)
  assert.equal(isAtThresholdBoundary(0.15, 0.2, 0.05), true)
  assert.equal(shouldTriggerThreshold([0.249999, 0.18750025, 0.18750025, 0.18750025, 0.18750025], 0.2, 0.05), false)

  const dates = ['2021-08-25', '2021-08-26', '2021-08-27']
  const A = [100, 100 * (4 / 3), 100 * (4 / 3)]
  const flat = [100, 100, 100]
  const prices = { A, B: flat, C: flat, D: flat, E: flat }
  const stocks = ['A', 'B', 'C', 'D', 'E']
  const sim = runStrategy(dates, prices, stocks, {
    mode: 'threshold', thresholdAbs: 0.05, cost: 0, execLag: 1, startDate: '2021-08-25',
  })
  assert.ok(Math.abs(sim.weightsPath[1][0] - 0.25) < 1e-12)
  assert.equal(sim.decideFlags[1], true)
  assert.equal(sim.rebalanced[1], false)
  assert.equal(sim.rebalanced[2], true)
})

test('第一次触发日前 BH 与 T5 净值相同（扣成本前）', () => {
  const { dates, prices, stocks } = pathCrossThreshold()
  const bh = runStrategy(dates, prices, stocks, {
    mode: 'BH', cost: 0, execLag: 1, startDate: '2021-08-25',
  })
  const t5 = runStrategy(dates, prices, stocks, {
    mode: 'threshold', thresholdAbs: 0.05, cost: 0, execLag: 1, startDate: '2021-08-25',
  })
  const iDec = dates.indexOf(t5.firstDecisionDate)
  assert.ok(iDec > 0)
  for (let i = 0; i <= iDec; i++) {
    assert.ok(Math.abs(bh.equity[i] - t5.equity[i]) < 1e-12, `equity mismatch at ${dates[i]}`)
  }
  assert.ok(dates.indexOf(t5.firstExecDate) > iDec)
})

test('成本扣减：单边换手 × 费率从净值扣除', () => {
  const { dates, prices, stocks } = pathCrossThreshold()
  const gross = runStrategy(dates, prices, stocks, {
    mode: 'threshold', thresholdAbs: 0.05, cost: 0, execLag: 1, startDate: '2021-08-25',
  })
  const net = runStrategy(dates, prices, stocks, {
    mode: 'threshold', thresholdAbs: 0.05, cost: 0.01, execLag: 1, startDate: '2021-08-25',
  })
  assert.ok(Math.abs(gross.equity[3] - net.equity[3]) < 1e-12)
  const w = gross.weightsPath[3]
  const turn = 0.5 * w.reduce((s, wi) => s + Math.abs(wi - 0.2), 0)
  assert.ok(Math.abs(net.equity[4] - gross.equity[4] * (1 - turn * 0.01)) < 1e-10)
  assert.ok(Math.abs(net.cumCost - turn * 0.01) < 1e-10)
})

test('分红日总回报：r=(P_t+D_t)/P_{t-1}-1；TR 指数累乘', () => {
  assert.ok(Math.abs(dailyTotalReturn(100, 99, 2) - ((99 + 2) / 100 - 1)) < 1e-15)
  const prices = [
    { date: '2021-08-25', close: 100 },
    { date: '2021-08-26', close: 99 },
    { date: '2021-08-27', close: 101 },
  ]
  const divs = [{ date: '2021-08-26', amount: 2 }]
  const tr = buildTotalReturnSeries(prices, divs)
  assert.equal(tr[0].adjclose, 100)
  assert.ok(Math.abs(tr[1].adjclose - 100 * (101 / 100)) < 1e-12) // (99+2)/100
  assert.ok(Math.abs(tr[2].adjclose - tr[1].adjclose * (101 / 99)) < 1e-12)
})

test('AVGO 拆股前分红金额除以 10', () => {
  const json = {
    data: {
      dividends: {
        rows: [
          { exOrEffDate: '06/24/2024', type: 'Cash', amount: '$5.25' },
          { exOrEffDate: '09/21/2026', type: 'Cash', amount: '$0.65' },
          { exOrEffDate: '01/01/2023', type: 'Stock', amount: '$1.00' },
        ],
      },
    },
  }
  const { rows, missing } = parseNasdaqDividends(json, { symbol: 'AVGO' })
  assert.equal(missing, false)
  assert.equal(rows.length, 2)
  const pre = rows.find(r => r.date === '2024-06-24')
  const post = rows.find(r => r.date === '2026-09-21')
  assert.ok(pre.date < AVGO_SPLIT_DATE)
  assert.ok(Math.abs(pre.amount - 0.525) < 1e-12)
  assert.ok(Math.abs(post.amount - 0.65) < 1e-12)
})

test('分红文件 data 为 null 时退化为价格收益', () => {
  const { rows, missing } = parseNasdaqDividends({
    data: null,
    status: { rCode: 200, bCodeMessage: [{ code: 3004, errorMessage: 'Error while calling vendor' }] },
  })
  assert.equal(missing, true)
  assert.deepEqual(rows, [])
  const prices = [
    { date: '2021-08-25', close: 50 },
    { date: '2021-08-26', close: 55 },
  ]
  const tr = buildTotalReturnSeries(prices, rows)
  assert.ok(Math.abs(tr[1].adjclose / tr[0].adjclose - 55 / 50) < 1e-12)
})

test('Nasdaq historical 解析：日期与美元字符串', () => {
  assert.equal(parseUsDate('11/20/2026'), '2026-11-20')
  assert.equal(parseMoney('$1,234.56'), 1234.56)
  const json = {
    data: {
      tradesTable: {
        rows: [
          { date: '11/20/2026', close: '$304.41' },
          { date: '07/01/2021', close: '$46.964' },
        ],
      },
    },
  }
  const rows = parseNasdaqHistorical(json)
  assert.equal(rows[0].date, '2021-07-01')
  assert.equal(rows[1].date, '2026-11-20')
  assert.ok(Math.abs(rows[0].close - 46.964) < 1e-9)
})

test('自助法种子可复现；CER 用总体方差与 252 年化', () => {
  const xs = Array.from({ length: 80 }, (_, i) => 0.001 + 0.0005 * Math.sin(i))
  const ys = Array.from({ length: 80 }, (_, i) => 0.0008 + 0.0005 * Math.cos(i))
  const a = bootstrapDeltaCer(xs, ys, { B: 300, seed: 20261121, meanLen: 20 })
  const b = bootstrapDeltaCer(xs, ys, { B: 300, seed: 20261121, meanLen: 20 })
  assert.equal(a.p, b.p)
  assert.deepEqual(a.ci95, b.ci95)
  assert.equal(a.deltaCer, b.deltaCer)
  const c = bootstrapDeltaCer(xs, ys, { B: 300, seed: 1, meanLen: 20 })
  assert.notDeepEqual(a.ci95, c.ci95)
  const idx = stationaryBlockBootstrap(40, 20, mulberry32(20261121))
  assert.equal(idx.length, 40)
  assert.deepEqual(stationaryBlockBootstrap(40, 20, mulberry32(20261121)), idx)
  const r = [0.01, 0.01, 0.01]
  assert.ok(Math.abs(cer(r) - 252 * (0.01 - 1.5 * popVar(r))) < 1e-12)
})
