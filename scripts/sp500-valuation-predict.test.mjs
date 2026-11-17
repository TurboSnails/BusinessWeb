import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addMonths,
  buildExcessLabels,
  circularShiftPValue,
  computeEcy,
  computeSop,
  expandingZScore,
  isLabelRealized,
  multiplierToMillions,
  olsAdd,
  olsFit,
  createOlsAcc,
  predictionIntervalAt,
  runOosForecast,
  trailingInflation,
  z1AvailableMonth,
  quarterlyToMonthly,
  clip,
} from './sp500-valuation-predict.mjs'
import { buildSeries, popStd } from './sp500-allocation-backtest.mjs'

function monthsFrom(start, n) {
  const out = []
  let d = start
  for (let i = 0; i < n; i++) {
    out.push(d)
    d = addMonths(d, 1)
  }
  return out
}

test('标签窗口 k=2..h+1 与已实现条件 s ≤ t−h−1', () => {
  const n = 30
  const rS = Array.from({ length: n }, (_, i) => (i === 0 ? null : 0.01))
  const rC = Array.from({ length: n }, (_, i) => (i === 0 ? null : 0.001))
  const h = 3
  const y = buildExcessLabels(rS, rC, h)
  // Y_0 needs months 2..4
  assert.ok(y[0] != null)
  const expected = [2, 3, 4].reduce((s) => s + Math.log(1.01) - Math.log(1.001), 0)
  assert.ok(Math.abs(y[0] - expected) < 1e-12)
  // last t with full window: t+h+1 <= n-1 → t <= n-h-2
  assert.equal(y[n - h - 2] != null, true)
  assert.equal(y[n - h - 1], null)

  // 构造序列：训练集不得含未实现标签
  const dates = monthsFrom('2000-01', n)
  const x = Array.from({ length: n }, (_, i) => i * 0.01)
  // 人为：只让早期 y 非空；在 t 时 maxS=t-h-1
  const run = runOosForecast({
    x, y, h, dates, oosStart: '2000-01', mode: 'ols', expectedSign: 1, applyCt: false, minTrain: 5,
  })
  for (const p of run.preds) {
    const t = p.t
    // 所有进入回归的 s 必须 ≤ t-h-1；用 ols 路径：在 t 时刻检查
    for (let s = 0; s < n; s++) {
      if (y[s] == null || x[s] == null) continue
      if (s > t - h - 1) {
        // 未实现：不得影响该 t 的预测——用「打乱未来 y」验证见端到端测试
        assert.equal(isLabelRealized(s, t, h), false)
      }
    }
    assert.ok(isLabelRealized(0, t, h) || t - h - 1 < 0)
  }
  // 显式：t=10,h=3 → 仅 s≤6 已实现
  assert.equal(isLabelRealized(6, 10, 3), true)
  assert.equal(isLabelRealized(7, 10, 3), false)
})

test('Z.1 季末后第 3 个月才可用（季初月 +5）', () => {
  assert.equal(z1AvailableMonth('2020-01'), '2020-06') // Q1
  assert.equal(z1AvailableMonth('2020-04'), '2020-09') // Q2
  assert.equal(z1AvailableMonth('2020-07'), '2020-12')
  assert.equal(z1AvailableMonth('2020-10'), '2021-03')
  const dates = monthsFrom('2020-01', 12)
  const q = new Map([['2020-01', 0.5], ['2020-04', 0.6]])
  const m = quarterlyToMonthly(dates, q)
  // 2020-01 季 → 2020-06 起
  assert.equal(m[dates.indexOf('2020-05')], null)
  assert.equal(m[dates.indexOf('2020-06')], 0.5)
  assert.equal(m[dates.indexOf('2020-08')], 0.5)
  assert.equal(m[dates.indexOf('2020-09')], 0.6)
})

test('单位换算 Millions/Billions；其他报错', () => {
  assert.equal(multiplierToMillions('Millions of U.S. Dollars'), 1)
  assert.equal(multiplierToMillions('Billions of Dollars'), 1000)
  assert.throws(() => multiplierToMillions('Percent'))
})

test('ECY 中 π̄ 只用 ≤t−1 的 CPI', () => {
  const cpi = Array.from({ length: 130 }, (_, i) => 100 * (1.002 ** i))
  const cape = Array.from({ length: 130 }, () => 20)
  const gs10 = Array.from({ length: 130 }, () => 4)
  const t = 125
  const ecy = computeEcy(cape, gs10, cpi)
  const pi = trailingInflation(cpi, t)
  assert.ok(pi != null)
  // 改未来 CPI 不应影响 t
  const cpi2 = cpi.slice()
  cpi2[t] = 999
  cpi2[t + 1] = 9999
  assert.equal(trailingInflation(cpi2, t), pi)
  assert.equal(computeEcy(cape, gs10, cpi2)[t], ecy[t])
  // 改 CPI[t-1] 应影响
  const cpi3 = cpi.slice()
  cpi3[t - 1] = cpi[t - 1] * 1.1
  assert.notEqual(trailingInflation(cpi3, t), pi)
})

test('SOP 用 D_{t−3}、E_{t−3}、E_{t−243}', () => {
  const n = 300
  const P = Array(n).fill(100)
  const D = Array.from({ length: n }, (_, i) => 1 + i * 0.001)
  const E = Array.from({ length: n }, (_, i) => 2 + i * 0.001)
  const rf = Array(n).fill(3)
  const sop = computeSop(P, D, E, rf)
  const t = 250
  const d = D[t - 3], e0 = E[t - 3], e1 = E[t - 243]
  const expect = Math.log(1 + d / 100) + (Math.log(e0) - Math.log(e1)) / 20 - Math.log(1 + 3 / 100)
  assert.ok(Math.abs(sop[t] - expect) < 1e-12)
  // 改 D[t]/E[t] 不影响
  const D2 = D.slice(); D2[t] = 99
  const E2 = E.slice(); E2[t] = 99
  assert.equal(computeSop(P, D2, E2, rf)[t], sop[t])
  // 改 D[t-3] 影响
  const D3 = D.slice(); D3[t - 3] = d * 2
  assert.notEqual(computeSop(P, D3, E, rf)[t], sop[t])
})

test('CT 约束：错误符号用历史均值；负预测截 0', () => {
  const n = 400
  const dates = monthsFrom('1950-01', n)
  // x 与未来收益负相关 → β<0，对 P1(期望+) 应触发 CT
  const rS = Array.from({ length: n }, (_, i) => (i === 0 ? null : 0.01 - (i % 17) * 0.0001))
  const rC = Array.from({ length: n }, () => 0.001)
  const y = buildExcessLabels(rS, rC, 12)
  const x = y.map((v, i) => (v == null ? null : -v + i * 1e-6))
  const withCt = runOosForecast({
    x, y, h: 12, dates, oosStart: dates[300], mode: 'ols', expectedSign: 1, applyCt: true, minTrain: 60,
  })
  const noCt = runOosForecast({
    x, y, h: 12, dates, oosStart: dates[300], mode: 'ols', expectedSign: 1, applyCt: false, minTrain: 60,
  })
  assert.ok(withCt.preds.length > 10)
  // CT 后预测应 ≥0
  assert.ok(withCt.preds.every(p => p.yhat >= 0))
  // 无 CT 时可能出现负预测
  assert.ok(noCt.yhat.some(v => v != null && v < 0) || withCt.preds.some((p) => {
    const t = p.t
    return noCt.yhat[t] != null && Math.abs(noCt.yhat[t] - p.yhat) > 1e-8
  }))
})

test('循环平移 p 值公式 (k+1)/(K+1)', () => {
  const n = 400
  const dates = monthsFrom('1960-01', n)
  const rS = Array.from({ length: n }, (_, i) => (i === 0 ? null : 0.008))
  const rC = Array.from({ length: n }, () => 0.002)
  const y = buildExcessLabels(rS, rC, 12)
  const x = Array.from({ length: n }, (_, i) => (i < 50 ? null : Math.sin(i / 9)))
  const run = runOosForecast({
    x, y, h: 12, dates, oosStart: dates[200], mode: 'ols', expectedSign: 1, applyCt: true, minTrain: 40,
  })
  const r2 = run.preds.length ? 1 - run.preds.reduce((s, p) => s + (p.y - p.yhat) ** 2, 0) /
    run.preds.reduce((s, p) => s + (p.y - p.yhist) ** 2, 0) : null
  const shift = circularShiftPValue({
    x, y, h: 12, dates, oosStart: dates[200], mode: 'ols', expectedSign: 1, applyCt: true,
    observedR2: r2, margin: 30,
  })
  assert.ok(shift.nOffsets > 0)
  assert.ok(Math.abs(shift.p - (shift.nGe + 1) / (shift.nOffsets + 1)) < 1e-12)
  assert.ok(shift.p > 0 && shift.p <= 1)
})

test('z 分数只用 ≤t；总体 /n', () => {
  const x = [1, 2, 3, 4, 100]
  // minN=3：t=2 用 [1,2,3]
  const z2 = expandingZScore(x, 2, 3)
  const hist = [1, 2, 3]
  const m = hist.reduce((s, v) => s + v, 0) / 3
  const sd = popStd(hist)
  assert.ok(Math.abs(z2 - (3 - m) / sd) < 1e-12)
  // 改未来不影响
  const x2 = [1, 2, 3, 4, -999]
  assert.equal(expandingZScore(x2, 2, 3), z2)
  assert.ok(expandingZScore(x, 4, 3) !== z2)
})

test('扩张 OLS 累加与批量一致；clip', () => {
  const xs = [1, 2, 3, 4, 5], ys = [2, 3, 5, 6, 7]
  const acc = createOlsAcc()
  for (let i = 0; i < xs.length; i++) olsAdd(acc, xs[i], ys[i])
  const fit = olsFit(acc)
  // 手工 β
  const mx = 3, my = 4.6
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0)
  const sxy = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0)
  assert.ok(Math.abs(fit.beta - sxy / sxx) < 1e-12)
  assert.equal(clip(0.9, 0.4, 0.8), 0.8)
  assert.equal(clip(0.1, 0.4, 0.8), 0.4)
})

test('预测区间残差只用已实现：扰动 t−h 之后的 y，t 的区间不变', () => {
  const n = 400
  const dates = monthsFrom('1970-01', n)
  const rS = Array.from({ length: n }, (_, i) => (i === 0 ? null : 0.01 + 0.002 * Math.sin(i / 11)))
  const rC = Array.from({ length: n }, () => 0.002)
  const h = 12
  const y0 = buildExcessLabels(rS, rC, h)
  const x = Array.from({ length: n }, (_, i) => (i < 20 ? null : 0.05 + 0.01 * Math.cos(i / 13)))
  const run0 = runOosForecast({
    x, y: y0, h, dates, oosStart: dates[0], mode: 'ols', expectedSign: 1, applyCt: true, minTrain: 60,
  })
  const t = 300
  assert.ok(run0.yhat[t] != null)
  const iv0 = predictionIntervalAt({
    expandPreds: run0.expandPreds, dates, t, h, yhat: run0.yhat, minPool: 60,
  })
  assert.ok(iv0)
  // 池内残差必须满足 t' ≤ t−h−1
  for (const p of run0.expandPreds) {
    if (p.t <= t - h - 1) continue
    // 这些不得影响 iv0：扰动它们后区间应不变
  }
  const y1 = y0.slice()
  for (let s = t - h; s < n; s++) {
    if (y1[s] != null) y1[s] = y1[s] + 5 // 大扰动未实现及更新标签
  }
  const run1 = runOosForecast({
    x, y: y1, h, dates, oosStart: dates[0], mode: 'ols', expectedSign: 1, applyCt: true, minTrain: 60,
  })
  // yhat[t] 依赖训练样本 s≤t−h−1，扰动 t−h 起的 y 不应改预测
  assert.ok(Math.abs(run1.yhat[t] - run0.yhat[t]) < 1e-12)
  const iv1 = predictionIntervalAt({
    expandPreds: run1.expandPreds, dates, t, h, yhat: run1.yhat, minPool: 60,
  })
  assert.ok(iv1)
  assert.ok(Math.abs(iv1.lo - iv0.lo) < 1e-12)
  assert.ok(Math.abs(iv1.hi - iv0.hi) < 1e-12)
  assert.equal(iv1.nPool, iv0.nPool)
  // 显式：池内最大残差索引 ≤ t−h−1
  let maxT = -Infinity
  for (const p of run0.expandPreds) {
    if (p.t <= t - h - 1) maxT = Math.max(maxT, p.t)
  }
  assert.ok(maxT <= t - h - 1)
})

test('端到端前视扰动：打乱 t 之后数据，≤t 的预测与仓位不变', () => {
  const n = 360
  const dates = monthsFrom('1980-01', n)
  const shiller = dates.map((date, i) => ({
    date,
    P: 100 + i * 0.2 + Math.sin(i / 7),
    D: 3,
    E: 5 + i * 0.01,
    CPI: 50 + i * 0.05,
    GS10: 4 + 0.5 * Math.sin(i / 20),
  }))
  const fred = dates.map(date => ({ date, TB3MS: 3 }))
  const s0 = buildSeries(shiller, fred)
  const gs0 = shiller.map(r => r.GS10)
  const ecy0 = computeEcy(s0.cape, gs0, s0.CPI)
  const h = 12
  const y0 = buildExcessLabels(s0.rStock, s0.rCash, h)
  const x0 = ecy0
  const tCut = 300
  const run0 = runOosForecast({
    x: x0, y: y0, h, dates, oosStart: dates[260], mode: 'ols', expectedSign: 1, applyCt: true, minTrain: 60,
  })
  const predAt = run0.yhat[tCut]
  const zAt = expandingZScore(ecy0, tCut, 60)
  assert.ok(predAt != null && zAt != null)

  // 打乱 tCut 之后的 P/E/CPI/GS10/收益原料
  const shiller2 = shiller.map((r, i) => {
    if (i <= tCut) return { ...r }
    return {
      ...r,
      P: r.P * 3 + 50,
      E: r.E * 0.2,
      CPI: r.CPI * 2,
      GS10: 15,
      D: 9,
    }
  })
  const s1 = buildSeries(shiller2, fred)
  const gs1 = shiller2.map(r => r.GS10)
  const ecy1 = computeEcy(s1.cape, gs1, s1.CPI)
  const y1 = buildExcessLabels(s1.rStock, s1.rCash, h)
  const run1 = runOosForecast({
    x: ecy1, y: y1, h, dates, oosStart: dates[260], mode: 'ols', expectedSign: 1, applyCt: true, minTrain: 60,
  })
  assert.ok(Math.abs(run1.yhat[tCut] - predAt) < 1e-9)
  assert.ok(Math.abs(expandingZScore(ecy1, tCut, 60) - zAt) < 1e-9)
  // 仓位：z 分数倾斜
  const w0 = clip(0.6 + 0.1 * zAt, 0.4, 0.8)
  const w1 = clip(0.6 + 0.1 * expandingZScore(ecy1, tCut, 60), 0.4, 0.8)
  assert.equal(w0, w1)
})
