import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  alignWeights,
  bootstrapDeltaCer,
  buildSeries,
  cer,
  computeTargets,
  expandingPercentile,
  holmCorrect,
  mulberry32,
  simulatePortfolio,
  stationaryBlockBootstrap,
} from './sp500-allocation-backtest.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function monthsFrom(start, n) {
  const [y0, m0] = start.split('-').map(Number)
  const out = []
  let y = y0, m = m0
  for (let i = 0; i < n; i++) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return out
}

test('跳月执行对齐：信号 t → 收益月 t+2（lag=2）', () => {
  const sig = [0.6, 0.3, 0.6, 0.3, 0.6]
  const a = alignWeights(sig, 2)
  assert.deepEqual(a, [null, null, 0.6, 0.3, 0.6])
  assert.deepEqual(alignWeights(sig, 1), [null, 0.6, 0.3, 0.6, 0.3])
})

test('E 滞后 3 月与 CPI 滞后 1 月：CAPE 公式', () => {
  const dates = monthsFrom('1900-01', 130)
  const shiller = dates.map((date, i) => ({
    date,
    P: 20,
    D: 1,
    E: i < 127 ? 1 : null,
    CPI: 100,
  }))
  const fred = dates.map(date => ({ date, TB3MS: 1.2 }))
  const s = buildSeries(shiller, fred)
  const t = 122
  assert.ok(s.cape[t] != null)
  assert.ok(Math.abs(s.cape[t] - 20) < 1e-9)
  assert.ok(s.cape[129] != null)
  const shortE = dates.map((date, i) => ({
    date, P: 20, D: 1, E: i < 120 ? 1 : null, CPI: 100,
  }))
  const sShort = buildSeries(shortE, fred)
  const lastOk = sShort.cape.map((v, i) => (v != null ? i : -1)).filter(i => i >= 0).at(-1)
  assert.equal(lastOk, 122)
  const shiller2 = shiller.map((r, i) => i === t ? { ...r, CPI: 200 } : { ...r })
  assert.equal(buildSeries(shiller2, fred).cape[t], s.cape[t])
  const shiller3 = shiller.map((r, i) => i === t - 1 ? { ...r, CPI: 200 } : { ...r })
  assert.ok(Math.abs(buildSeries(shiller3, fred).cape[t] - 10) < 1e-9)
})

test('扩张分位不含未来数据', () => {
  const values = [1, 2, 3, 4, 100]
  const p80_at3 = expandingPercentile(values, 3, 0.8)
  const withFuture = expandingPercentile(values, 4, 0.8)
  assert.ok(p80_at3 < 5)
  assert.ok(withFuture > p80_at3)
  assert.equal(expandingPercentile([1, 2, 3, 4, -100], 3, 0.8), p80_at3)
})

test('换手成本：单边换手 × 费率从权益扣除', () => {
  const rS = [null, 0.1, 0, 0]
  const rC = [null, 0, 0, 0]
  const tgt = [null, 1, 0, 0]
  const sim = simulatePortfolio(rS, rC, tgt, { cost: 0.01 })
  assert.ok(Math.abs(sim.portR[1] - 0.1) < 1e-12)
  assert.ok(Math.abs(sim.portR[2] - ((1 - 0.01) * 1 - 1)) < 1e-12)
  assert.equal(sim.turnover[2], 1)
})

test('同平均仓位对照：恒定仓位 = 平均目标', () => {
  const rS = [null, 0.01, 0.02, -0.01, 0.03]
  const rC = [null, 0.001, 0.001, 0.001, 0.001]
  const tgt = [null, 0.6, 0.3, 0.6, 0.3]
  const avg = (0.6 + 0.3 + 0.6 + 0.3) / 4
  const cm = tgt.map(v => (v == null ? null : avg))
  const a = simulatePortfolio(rS, rC, tgt, { cost: 0 })
  const b = simulatePortfolio(rS, rC, cm, { cost: 0 })
  const used = a.weightsUsed.filter(v => v != null)
  assert.ok(Math.abs(used.reduce((s, x) => s + x, 0) / used.length - avg) < 1e-12)
  assert.notEqual(a.equityCurve[4], b.equityCurve[4])
})

test('自助法同种子结果一致', () => {
  const xs = Array.from({ length: 100 }, (_, i) => 0.01 + 0.001 * Math.sin(i))
  const ys = Array.from({ length: 100 }, (_, i) => 0.008 + 0.001 * Math.cos(i))
  const a = bootstrapDeltaCer(xs, ys, { B: 200, seed: 20261115 })
  const b = bootstrapDeltaCer(xs, ys, { B: 200, seed: 20261115 })
  assert.equal(a.p, b.p)
  assert.deepEqual(a.ci95, b.ci95)
  assert.equal(a.deltaCer, b.deltaCer)
  const c = bootstrapDeltaCer(xs, ys, { B: 200, seed: 1 })
  assert.notDeepEqual(a.ci95, c.ci95)
})

test('Holm 校正：乘子、累计 max、排序单调', () => {
  const tests = [{ id: 'a', p: 0.01 }, { id: 'b', p: 0.04 }, { id: 'c', p: 0.03 }, { id: 'd', p: 0.02 }]
  const out = holmCorrect(tests)
  // 排序 p: a0.01, d0.02, c0.03, b0.04 → ×4,3,2,1 → 0.04,0.06,0.06,0.04 → running max 0.04,0.06,0.06,0.06
  assert.ok(Math.abs(out.find(t => t.id === 'a').pHolm - 0.04) < 1e-12)
  assert.ok(Math.abs(out.find(t => t.id === 'd').pHolm - 0.06) < 1e-12)
  assert.ok(Math.abs(out.find(t => t.id === 'c').pHolm - 0.06) < 1e-12)
  assert.ok(Math.abs(out.find(t => t.id === 'b').pHolm - 0.06) < 1e-12)
  const ordered = [...out].sort((a, b) => a.holmRank - b.holmRank)
  for (let i = 1; i < ordered.length; i++) {
    assert.ok(ordered[i].pHolm + 1e-12 >= ordered[i - 1].pHolm)
  }
  assert.ok(out.every(t => t.pHolm >= t.p - 1e-12))
  assert.ok(out.every(t => t.pHolm <= 1))
})

test('平稳块索引长度与种子可复现；CER 定义', () => {
  const rng = mulberry32(42)
  const idx = stationaryBlockBootstrap(50, 12, rng)
  assert.equal(idx.length, 50)
  assert.deepEqual(stationaryBlockBootstrap(50, 12, mulberry32(42)), idx)
  assert.ok(Math.abs(cer([0.01, 0.01, 0.01]) - 12 * 0.01) < 1e-12)
})

test('computeTargets：趋势档与 CAPE 三档；P 保持为正', () => {
  const dates = monthsFrom('1880-01', 500)
  const shiller = dates.map((date, i) => ({
    date,
    // 缓升后温和回撤，P 始终 > 1
    P: Math.max(1.5, 10 + i * 0.05 + 2 * Math.sin(i / 9) - (i > 400 ? (i - 400) * 0.02 : 0)),
    D: 0.5,
    E: 1,
    CPI: 50 + i * 0.01,
  }))
  assert.ok(shiller.every(r => r.P > 0))
  const fred = dates.map(date => ({ date, TB3MS: 2 }))
  const series = buildSeries(shiller, fred)
  const t = computeTargets(series, { W: 0.6 })
  const last = dates.length - 1
  assert.ok(t.S1[last] === 0.3 || t.S1[last] === 0.6)
  assert.ok(t.S3[last] === 0.5 || t.S3[last] === 0.6 || t.S3[last] === 0.7)
  const shocked = shiller.map((r, i) => (i >= last - 5 ? { ...r, P: r.P * 5 } : r))
  const t2 = computeTargets(buildSeries(shocked, fred), { W: 0.6 })
  assert.equal(t.S3[last - 10], t2.S3[last - 10])
})

test('端到端前视：打乱 t 之后 P/D/E/CPI，≤t 的 S1–S4 目标不变', () => {
  const dates = monthsFrom('1880-01', 500)
  const shiller = dates.map((date, i) => ({
    date,
    P: Math.max(2, 12 + i * 0.04 + 1.5 * Math.sin(i / 7)),
    D: 0.4 + 0.05 * Math.sin(i / 13),
    E: 1 + 0.02 * Math.sin(i / 11),
    CPI: 40 + i * 0.02,
  }))
  const fred = dates.map(date => ({ date, TB3MS: 2 }))
  const base = computeTargets(buildSeries(shiller, fred), { W: 0.6 })
  for (const cut of [220, 310, 420]) {
    const shocked = shiller.map((r, i) => (i > cut
      ? {
          ...r,
          P: r.P * (i % 2 ? 0.55 : 1.8),
          D: r.D * 1.4,
          E: r.E * 0.6,
          CPI: r.CPI * 1.25,
        }
      : r))
    const alt = computeTargets(buildSeries(shocked, fred), { W: 0.6 })
    for (let i = 0; i <= cut; i++) {
      assert.equal(alt.S1[i], base.S1[i], `S1@${dates[i]}`)
      assert.equal(alt.S2[i], base.S2[i], `S2@${dates[i]}`)
      assert.equal(alt.S3[i], base.S3[i], `S3@${dates[i]}`)
      assert.equal(alt.S4[i], base.S4[i], `S4@${dates[i]}`)
    }
  }
})

test('parse_shiller_date：1871.1 → 10 月（fetch.py --self-test）', () => {
  const py = process.env.TMPDIR
    ? `${process.env.TMPDIR}/sp500-venv/bin/python`
    : 'python3'
  const script = join(root, 'scripts/sp500-backtest-fetch.py')
  const r = spawnSync(py, ['-I', script, '--self-test'], { encoding: 'utf8' })
  // venv 可能不在；回退系统 python3
  if (r.status !== 0) {
    const r2 = spawnSync('python3', ['-I', script, '--self-test'], { encoding: 'utf8' })
    assert.equal(r2.status, 0, r2.stderr || r2.stdout)
    assert.match(r2.stdout, /self-test ok/)
  } else {
    assert.match(r.stdout, /self-test ok/)
  }
})
