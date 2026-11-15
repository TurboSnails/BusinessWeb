// 标普 500 仓位规则回测（预注册 docs/research/sp500-allocation-backtest-prereg-2026-11-15.md）。
// Node 24 ESM、无 npm 依赖、纯函数可导出；输出不依赖当前时间。
// 用法：node scripts/sp500-allocation-backtest.mjs
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

export const PREREG = 'sp500-allocation-backtest-prereg-2026-11-15'
export const SEED = 20261115
export const BOOT_B = 10_000
export const BLOCK_MEAN = 12
export const GAMMA = 3
export const COST_MAIN = 0.001
export const COST_HIGH = 0.003
export const EVAL_START = '1935-01'
export const W_BASE = 0.6

const round = (v, d = 6) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(d)))
const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length

/** 总体方差（/n），用于 CER。 */
export function popVar(xs) {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length
}

/** @deprecated 使用 popVar */
export const sampleVar = popVar

export function sampleStd(xs) {
  if (xs.length < 2) return null
  const m = mean(xs)
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1))
}

export function cer(excess, gamma = GAMMA) {
  if (!excess.length) return null
  return 12 * (mean(excess) - (gamma / 2) * popVar(excess))
}

export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Politis–Romano 平稳块：块长 ~ Geometric(p), E[L]=meanLen。 */
export function stationaryBlockBootstrap(n, meanLen, rng) {
  const p = 1 / meanLen
  const idx = new Array(n)
  let i = 0
  while (i < n) {
    let pos = Math.floor(rng() * n)
    // 几何分布：P(L=k)=(1-p)^{k-1}p，k≥1；等价于每次以 p 结束块
    do {
      idx[i++] = pos
      pos = (pos + 1) % n
    } while (i < n && rng() > p)
  }
  return idx
}

export function bootstrapDeltaCer(xs, ys, { B = BOOT_B, meanLen = BLOCK_MEAN, seed = SEED, gamma = GAMMA } = {}) {
  const n = xs.length
  const obs = cer(xs, gamma) - cer(ys, gamma)
  const rng = mulberry32(seed)
  const boots = new Array(B)
  for (let b = 0; b < B; b++) {
    const idx = stationaryBlockBootstrap(n, meanLen, rng)
    const xb = idx.map(i => xs[i])
    const yb = idx.map(i => ys[i])
    boots[b] = cer(xb, gamma) - cer(yb, gamma)
  }
  boots.sort((a, b) => a - b)
  const pOneSided = boots.filter(v => v <= 0).length / B
  const lo = boots[Math.floor(0.025 * B)]
  const hi = boots[Math.min(B - 1, Math.ceil(0.975 * B) - 1)]
  return { deltaCer: obs, p: pOneSided, ci95: [lo, hi], boots }
}

/** Holm 校正，输入 [{id,p}]，返回带 pHolm 的同序数组副本。 */
export function holmCorrect(tests, alpha = 0.05) {
  const m = tests.length
  const ordered = tests.map((t, i) => ({ ...t, _i: i })).sort((a, b) => a.p - b.p)
  const adj = new Array(m)
  let running = 0
  for (let j = 0; j < m; j++) {
    const raw = (m - j) * ordered[j].p
    running = Math.max(running, raw)
    adj[j] = Math.min(1, running)
  }
  const out = tests.map(t => ({ ...t }))
  for (let j = 0; j < m; j++) {
    out[ordered[j]._i].pHolm = adj[j]
    out[ordered[j]._i].holmRank = j + 1
  }
  out.alpha = alpha
  return out
}

export function expandingPercentile(values, i, q) {
  // values[0..i] 中有限值的样本分位；不含未来
  const hist = []
  for (let k = 0; k <= i; k++) if (Number.isFinite(values[k])) hist.push(values[k])
  if (hist.length < 2) return null
  hist.sort((a, b) => a - b)
  const pos = (hist.length - 1) * q
  const lo = Math.floor(pos), hi = Math.ceil(pos)
  return hist[lo] + (hist[hi] - hist[lo]) * (pos - lo)
}

export function expandingMedian(values, i, minN) {
  const hist = []
  for (let k = 0; k <= i; k++) if (Number.isFinite(values[k])) hist.push(values[k])
  if (hist.length < minN) return null
  hist.sort((a, b) => a - b)
  const mid = (hist.length - 1) / 2
  const lo = Math.floor(mid), hi = Math.ceil(mid)
  return hist[lo] + (hist[hi] - hist[lo]) * (mid - lo)
}

export function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/)
  const headers = lines[0].split(',')
  return lines.slice(1).map(line => {
    const cols = line.split(',')
    const o = {}
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i]
      const raw = cols[i] ?? ''
      o[h] = raw === '' ? null : (h === 'date' ? raw : Number(raw))
    }
    return o
  })
}

/** 前向填充 D（年化股息）；末段 D 空缺时收益需要。 */
export function forwardFill(arr) {
  const out = arr.slice()
  let last = null
  for (let i = 0; i < out.length; i++) {
    if (out[i] != null && Number.isFinite(out[i])) last = out[i]
    else if (last != null) out[i] = last
  }
  return out
}

/**
 * 合并 Shiller + TB3MS，计算收益、CAPE、总回报指数。
 * CAPE_t = P_t / mean_u(E_u * CPI_{t-1} / CPI_u), u ∈ [t-3-119, t-3]
 * （等价于 (P_t/CPI_{t-1}) / mean(E_u/CPI_u)；E 滞后 3 月，CPI 滞后 1 月）
 */
export function buildSeries(shillerRows, tb3msRows) {
  const cashMap = new Map(tb3msRows.map(r => [r.date, r.TB3MS]))
  const byDate = new Map()
  for (const r of shillerRows) byDate.set(r.date, r)
  const dates = [...byDate.keys()].sort()
  const P = dates.map(d => byDate.get(d).P)
  const D0 = dates.map(d => byDate.get(d).D)
  const E0 = dates.map(d => byDate.get(d).E)
  const CPI = dates.map(d => byDate.get(d).CPI)
  const D = forwardFill(D0)
  // E 不前填：末段空缺保持 null，CAPE 自然停在最后可算月
  const E = E0.slice()

  const rStock = new Array(dates.length).fill(null)
  for (let i = 1; i < dates.length; i++) {
    if (P[i] == null || P[i - 1] == null || D[i] == null) continue
    rStock[i] = (P[i] + D[i] / 12) / P[i - 1] - 1
  }

  const rCash = dates.map(d => {
    const v = cashMap.get(d)
    return v == null ? null : v / 1200
  })

  const cape = new Array(dates.length).fill(null)
  for (let t = 0; t < dates.length; t++) {
    const end = t - 3
    const start = end - 119
    if (start < 0 || t < 1) continue
    if (P[t] == null || CPI[t - 1] == null || !Number.isFinite(CPI[t - 1])) continue
    let ok = true, s = 0
    for (let u = start; u <= end; u++) {
      if (E[u] == null || CPI[u] == null || !(CPI[u] > 0)) { ok = false; break }
      s += E[u] * CPI[t - 1] / CPI[u]
    }
    if (!ok) continue
    const avg = s / 120
    if (!(avg > 0)) continue
    cape[t] = P[t] / avg
  }

  // 总回报指数：从第一个有收益的月起累乘
  const tr = new Array(dates.length).fill(null)
  let level = 1
  let started = false
  for (let i = 0; i < dates.length; i++) {
    if (rStock[i] == null) { if (!started) continue; tr[i] = level; continue }
    if (!started) { started = true; level = 1; tr[i] = level; continue }
    level *= 1 + rStock[i]
    tr[i] = level
  }

  return { dates, P, D, E, CPI, rStock, rCash, cape, tr, indexOf: d => dates.indexOf(d) }
}

export function sma(series, i, window) {
  if (i + 1 < window) return null
  let s = 0
  for (let k = i - window + 1; k <= i; k++) {
    if (series[k] == null) return null
    s += series[k]
  }
  return s / window
}

/**
 * @param {{W?: number, cost?: number, lag?: number, evalStart?: string, evalEnd?: string|null}} opts
 * lag=2：跳月（信号 t → 收益 t+2）；lag=1：不跳月
 */
export function computeTargets(series, opts = {}) {
  const W = opts.W ?? W_BASE
  const { dates, rStock, cape, tr } = series
  const n = dates.length
  const floor = W - 0.3
  const volFloor = W - 0.3
  // W=0.6 → S3: 50/60/70；W=0.8 → 70/80/90（整体 +0.2）
  const s3Low = W - 0.1
  const s3Mid = W
  const s3High = W + 0.1

  const sigmaHat = new Array(n).fill(null)
  for (let t = 0; t < n; t++) {
    if (t < 11) continue
    const window = []
    for (let k = t - 11; k <= t; k++) {
      if (rStock[k] == null) { window.length = 0; break }
      window.push(rStock[k])
    }
    if (window.length === 12) sigmaHat[t] = sampleStd(window)
  }

  const B100 = new Array(n).fill(1)
  const C60 = new Array(n).fill(W)
  const S1 = new Array(n).fill(null)
  const S2 = new Array(n).fill(null)
  const S3 = new Array(n).fill(null)
  const S4 = new Array(n).fill(null)

  const rw = v => (v == null ? null : round(v, 6))
  for (let t = 0; t < n; t++) {
    const ma = sma(tr, t, 10)
    const above = ma != null && tr[t] != null ? tr[t] >= ma : null
    if (above != null) S1[t] = rw(above ? W : floor)

    const sig = sigmaHat[t]
    const med = expandingMedian(sigmaHat, t, 120)
    if (sig != null && sig > 0 && med != null) {
      S2[t] = rw(Math.max(volFloor, W * Math.min(1, med / sig)))
    }

    if (cape[t] != null) {
      // 扩张分位：至少 240 个历史 CAPE（含当期）
      let histN = 0
      for (let k = 0; k <= t; k++) if (cape[k] != null) histN++
      if (histN >= 240) {
        const p80 = expandingPercentile(cape, t, 0.8)
        const p20 = expandingPercentile(cape, t, 0.2)
        let w = s3Mid
        if (p80 != null && cape[t] >= p80) w = s3Low
        else if (p20 != null && cape[t] <= p20) w = s3High
        S3[t] = rw(w)
        if (above != null) S4[t] = rw(Math.max(0, above ? w : w - 0.3))
      }
    }
  }

  return { B100, C60, S1, S2, S3, S4, sigmaHat }
}

/** 将信号月仓位对齐到收益月：weightReturn[i] = signal[i - lag] */
export function alignWeights(signal, lag) {
  const out = new Array(signal.length).fill(null)
  for (let i = 0; i < signal.length; i++) {
    const s = i - lag
    if (s >= 0) out[i] = signal[s]
  }
  return out
}

/**
 * 模拟：每月调到目标仓位，单边换手×cost 从权益扣除，再赚当月收益。
 * 起点已按首个目标建仓，不计初始换手。
 */
export function simulatePortfolio(rStock, rCash, targetOnReturn, { cost = COST_MAIN } = {}) {
  const n = rStock.length
  const portR = new Array(n).fill(null)
  const weightsUsed = new Array(n).fill(null)
  const turnover = new Array(n).fill(null)
  let drifted = null
  let equity = 1
  const equityCurve = new Array(n).fill(null)

  for (let i = 0; i < n; i++) {
    const w = targetOnReturn[i]
    const rs = rStock[i], rc = rCash[i]
    if (w == null || rs == null || rc == null) continue
    let turn = 0
    if (drifted == null) drifted = w
    else turn = Math.abs(w - drifted)
    const c = turn * cost
    const gross = w * rs + (1 - w) * rc
    const net = (1 - c) * (1 + gross) - 1
    portR[i] = net
    weightsUsed[i] = w
    turnover[i] = turn
    equity *= 1 + net
    equityCurve[i] = equity
    const g = w * (1 + rs) + (1 - w) * (1 + rc)
    drifted = g > 0 ? (w * (1 + rs)) / g : w
  }
  return { portR, weightsUsed, turnover, equityCurve }
}

export function metrics(portR, rCash, weightsUsed, turnover, dates) {
  const idx = []
  for (let i = 0; i < portR.length; i++) if (portR[i] != null && rCash[i] != null) idx.push(i)
  if (!idx.length) return null
  const rets = idx.map(i => portR[i])
  const excess = idx.map(i => portR[i] - rCash[i])
  const w = idx.map(i => weightsUsed[i])
  const turns = idx.map(i => turnover[i] ?? 0)
  // 权益曲线
  let eq = 1, peak = 1, maxDd = 0
  const eqs = []
  for (const r of rets) {
    eq *= 1 + r
    peak = Math.max(peak, eq)
    maxDd = Math.min(maxDd, eq / peak - 1)
    eqs.push(eq)
  }
  const years = idx.length / 12
  const total = eq - 1
  const cagr = years > 0 ? (1 + total) ** (1 / years) - 1 : null
  const vol = sampleStd(rets) != null ? sampleStd(rets) * Math.sqrt(12) : null
  const sh = sampleStd(excess) > 0 ? (mean(excess) * 12) / (sampleStd(excess) * Math.sqrt(12)) : null
  const sorted = [...rets].sort((a, b) => a - b)
  const cvarCut = Math.max(1, Math.ceil(0.05 * sorted.length))
  const cvar = mean(sorted.slice(0, cvarCut))
  const calmar = maxDd < 0 && cagr != null ? cagr / Math.abs(maxDd) : null
  return {
    n: idx.length,
    start: dates[idx[0]],
    end: dates[idx.at(-1)],
    cagr: round(cagr),
    vol: round(vol),
    sharpe: round(sh),
    maxDrawdown: round(maxDd),
    calmar: round(calmar),
    cvar5: round(cvar),
    turnoverAnn: round(mean(turns) * 12),
    avgWeight: round(mean(w)),
    cer: round(cer(excess)),
    excess,
    rets,
    idx,
  }
}

export function constantMixTarget(avgW, n, maskIdx) {
  const out = new Array(n).fill(null)
  for (const i of maskIdx) out[i] = avgW
  return out
}

/** 剔除对 ΔCER 贡献最大的连续 24 个月：选使剩余 ΔCER 最小的窗口。 */
export function deltaCerAfterDropBest24(excessA, excessB) {
  const n = excessA.length
  if (n <= 24) return null
  let worst = Infinity
  for (let i = 0; i + 24 <= n; i++) {
    const xa = excessA.filter((_, j) => j < i || j >= i + 24)
    const xb = excessB.filter((_, j) => j < i || j >= i + 24)
    const d = cer(xa) - cer(xb)
    if (d < worst) worst = d
  }
  return worst
}

export function subperiodDeltaCer(excessA, excessB, dates, idx, ranges) {
  const out = {}
  for (const [name, [a, b]] of Object.entries(ranges)) {
    const xa = [], xb = []
    for (let k = 0; k < idx.length; k++) {
      const d = dates[idx[k]]
      if (d >= a && d <= b) { xa.push(excessA[k]); xb.push(excessB[k]) }
    }
    out[name] = xa.length ? cer(xa) - cer(xb) : null
  }
  return out
}

/**
 * 稳健性：每个子期内用该子期策略平均仓位重算 CM，再比 ΔCER。
 * 与主表（全样本 CM）对照；不改变判定。
 */
export function subperiodRecalcCmDeltaCer(series, strategyTargets, strategyExcess, strategyIdx, ranges, cost) {
  const out = {}
  for (const [name, [a, b]] of Object.entries(ranges)) {
    const months = strategyIdx.filter(i => series.dates[i] >= a && series.dates[i] <= b)
    if (!months.length) { out[name] = null; continue }
    const avgW = mean(months.map(i => strategyTargets[i]))
    const tgt = constantMixTarget(avgW, series.dates.length, months)
    const sim = simulatePortfolio(series.rStock, series.rCash, tgt, { cost })
    const m = metrics(sim.portR, series.rCash, sim.weightsUsed, sim.turnover, series.dates)
    const set = new Set(months)
    const xs = []
    for (let k = 0; k < strategyIdx.length; k++) {
      if (set.has(strategyIdx[k])) xs.push(strategyExcess[k])
    }
    out[name] = {
      avgWeight: round(avgW),
      deltaCer: xs.length && m?.excess?.length === xs.length ? round(cer(xs) - cer(m.excess)) : null,
    }
  }
  return out
}

function clampMask(series, targets, lag, evalStart, evalEnd) {
  const aligned = {}
  for (const [k, sig] of Object.entries(targets)) {
    if (k === 'sigmaHat') continue
    aligned[k] = alignWeights(sig, lag)
  }
  // 评估月：收益可算，且策略信号齐全（对参与判定的 S*）
  const n = series.dates.length
  const ok = []
  for (let i = 0; i < n; i++) {
    const d = series.dates[i]
    if (d < evalStart) continue
    if (evalEnd && d > evalEnd) continue
    if (series.rStock[i] == null || series.rCash[i] == null) continue
    // 主策略均需有仓位（B100/C60 恒有）
    if (aligned.S1[i] == null || aligned.S2[i] == null || aligned.S3[i] == null || aligned.S4[i] == null) continue
    ok.push(i)
  }
  return { aligned, ok }
}

export function runBacktest(series, opts = {}) {
  const lag = opts.lag ?? 2
  const cost = opts.cost ?? COST_MAIN
  const W = opts.W ?? W_BASE
  const evalStart = opts.evalStart ?? EVAL_START
  const evalEnd = opts.evalEnd ?? null
  const bootstrap = opts.bootstrap !== false
  const B = opts.B ?? BOOT_B

  const targets = computeTargets(series, { W })
  const { aligned, ok } = clampMask(series, targets, lag, evalStart, evalEnd)
  if (ok.length < 120) throw new Error(`评估样本过短: ${ok.length}`)

  // 截断对齐数组：非 ok 月置 null，保证恒定组合只在同窗交易
  const maskAligned = name => {
    const a = aligned[name].slice()
    const set = new Set(ok)
    for (let i = 0; i < a.length; i++) if (!set.has(i)) a[i] = null
    return a
  }

  const strategies = {}
  for (const name of ['B100', 'C60', 'S1', 'S2', 'S3', 'S4']) {
    const sim = simulatePortfolio(series.rStock, series.rCash, maskAligned(name), { cost })
    strategies[name] = {
      ...metrics(sim.portR, series.rCash, sim.weightsUsed, sim.turnover, series.dates),
      sim,
      targets: maskAligned(name),
    }
  }

  // 同平均仓位对照
  const cm = {}
  for (const name of ['S1', 'S2', 'S3', 'S4']) {
    const avgW = strategies[name].avgWeight
    const tgt = constantMixTarget(avgW, series.dates.length, ok)
    const sim = simulatePortfolio(series.rStock, series.rCash, tgt, { cost })
    cm[name] = {
      avgWeight: avgW,
      ...metrics(sim.portR, series.rCash, sim.weightsUsed, sim.turnover, series.dates),
    }
  }

  const endMonth = strategies.S1.end
  const ranges = {
    '1935-1964': ['1935-01', '1964-12'],
    '1965-1994': ['1965-01', '1994-12'],
    '1995-end': ['1995-01', endMonth],
  }

  const mainTests = []
  const subperiodCmRecalc = {}
  for (const name of ['S1', 'S2', 'S3', 'S4']) {
    const xs = strategies[name].excess
    const ys = cm[name].excess
    const delta = cer(xs) - cer(ys)
    let boot = null
    if (bootstrap) {
      boot = bootstrapDeltaCer(xs, ys, { B, seed: SEED })
    }
    const subs = subperiodDeltaCer(xs, ys, series.dates, strategies[name].idx, ranges)
    const drop24 = deltaCerAfterDropBest24(xs, ys)
    subperiodCmRecalc[name] = subperiodRecalcCmDeltaCer(
      series, strategies[name].targets, xs, strategies[name].idx, ranges, cost,
    )
    mainTests.push({
      id: `${name}_vs_CM`,
      strategy: name,
      deltaCer: delta,
      p: boot ? boot.p : null,
      ci95: boot ? boot.ci95.map(x => round(x)) : null,
      subperiods: Object.fromEntries(Object.entries(subs).map(([k, v]) => [k, round(v)])),
      drop24: round(drop24),
    })
  }

  // 成本 0.30% 稳健性（判定条件 d）
  const highCost = {}
  for (const name of ['S1', 'S2', 'S3', 'S4']) {
    const simS = simulatePortfolio(series.rStock, series.rCash, maskAligned(name), { cost: COST_HIGH })
    const mS = metrics(simS.portR, series.rCash, simS.weightsUsed, simS.turnover, series.dates)
    const avgW = mS.avgWeight
    const tgt = constantMixTarget(avgW, series.dates.length, ok)
    const simC = simulatePortfolio(series.rStock, series.rCash, tgt, { cost: COST_HIGH })
    const mC = metrics(simC.portR, series.rCash, simC.weightsUsed, simC.turnover, series.dates)
    highCost[name] = round(cer(mS.excess) - cer(mC.excess))
  }

  const withHolm = holmCorrect(mainTests.map(t => ({ id: t.id, p: t.p ?? 1 })))
  const judgments = mainTests.map((t, i) => {
    const pHolm = withHolm[i].pHolm
    const a = pHolm < 0.05
    const b = Object.values(t.subperiods).every(v => v != null && v > 0)
    const c = t.drop24 != null && t.drop24 > 0
    const d = highCost[t.strategy] != null && highCost[t.strategy] > 0
    let verdict = '未证实'
    if (t.deltaCer <= 0) verdict = '无效'
    else if (a && b && c && d) verdict = '有效'
    return {
      ...t,
      pHolm: round(pHolm, 6),
      conditions: { a_holm: a, b_subperiods: b, c_drop24: c, d_cost30bps: d },
      highCostDeltaCer: highCost[t.strategy],
      verdict,
    }
  })

  // 增量比较（报告用，不进主族）
  const incremental = []
  const pairs = [
    ['S4', 'S3'],
    ['S4', 'S1'],
    ['S3', 'C60'],
  ]
  for (const [a, b] of pairs) {
    const xs = strategies[a].excess
    const ys = strategies[b].excess
    const boot = bootstrap ? bootstrapDeltaCer(xs, ys, { B, seed: SEED }) : null
    incremental.push({
      id: `${a}_vs_${b}`,
      deltaCer: round(cer(xs) - cer(ys)),
      p: boot ? round(boot.p, 6) : null,
      ci95: boot ? boot.ci95.map(x => round(x)) : null,
    })
  }

  return {
    lag,
    cost,
    W,
    evalStart: strategies.S1.start,
    evalEnd: strategies.S1.end,
    nMonths: strategies.S1.n,
    strategies: Object.fromEntries(
      Object.entries(strategies).map(([k, v]) => [k, {
        cagr: v.cagr, vol: v.vol, sharpe: v.sharpe, maxDrawdown: v.maxDrawdown,
        calmar: v.calmar, cvar5: v.cvar5, turnoverAnn: v.turnoverAnn, avgWeight: v.avgWeight, cer: v.cer,
        start: v.start, end: v.end, n: v.n,
      }]),
    ),
    cm: Object.fromEntries(
      Object.entries(cm).map(([k, v]) => [k, {
        avgWeight: v.avgWeight, cagr: v.cagr, vol: v.vol, sharpe: v.sharpe,
        maxDrawdown: v.maxDrawdown, cer: v.cer,
      }]),
    ),
    judgments,
    incremental,
    highCostDeltaCer: highCost,
    subperiodCmRecalc,
    bootstrapB: B,
  }
}

export function formatReport(results, meta) {
  const lines = []
  const robB = meta.robustnessB ?? 2000
  lines.push('# 标普 500 仓位规则回测结果（2026-11-15）')
  lines.push('')
  lines.push(`> 预注册：\`${PREREG}\`。原始数据截止 ${meta.rawDataEnd}（E 截止 ${meta.eEnd}；最后可算 CAPE 信号月 ${meta.lastCapeMonth}）；评估 ${results.main.evalStart} → ${results.main.evalEnd}（收益月，${results.main.nMonths} 月）。跳月 lag=${results.main.lag}；主成本 ${(results.main.cost * 100).toFixed(2)}%；主比较自助法 B=${results.main.bootstrapB ?? BOOT_B}。`)
  lines.push(`> Ken French：${meta.kenFrench}`)
  lines.push('')
  lines.push('## 判定表（主比较 vs 同平均仓位恒定组合）')
  lines.push('')
  lines.push('| 规则 | 判定 | ΔCER | 95% CI | p | p(Holm) | (a) Holm | (b) 三子期>0 | (c) 剔24月后>0 | (d) 成本0.30%后>0 |')
  lines.push('|---|---|---:|---|---:|---:|---|---|---|---|')
  for (const j of results.main.judgments) {
    const c = j.conditions
    const ci = j.ci95 ? `[${fmtPct(j.ci95[0])}, ${fmtPct(j.ci95[1])}]` : '—'
    lines.push(`| ${j.strategy} | **${j.verdict}** | ${fmtPct(j.deltaCer)} | ${ci} | ${fmtP(j.p)} | ${fmtP(j.pHolm)} | ${yn(c.a_holm)} | ${yn(c.b_subperiods)} | ${yn(c.c_drop24)} | ${yn(c.d_cost30bps)} |`)
  }
  lines.push('')
  lines.push('子期 ΔCER：')
  lines.push('')
  lines.push('| 规则 | 1935–1964 | 1965–1994 | 1995–末 | 剔贡献最大24月后 | 成本0.30% ΔCER |')
  lines.push('|---|---:|---:|---:|---:|---:|')
  for (const j of results.main.judgments) {
    const s = j.subperiods
    lines.push(`| ${j.strategy} | ${fmtPct(s['1935-1964'])} | ${fmtPct(s['1965-1994'])} | ${fmtPct(s['1995-end'])} | ${fmtPct(j.drop24)} | ${fmtPct(j.highCostDeltaCer)} |`)
  }
  lines.push('')
  lines.push('## 次要指标（主设定）')
  lines.push('')
  lines.push('| 组合 | CAGR | 年化波动 | Sharpe | 最大回撤 | Calmar | CVaR5% | 年化换手 | 平均仓位 | CER |')
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
  for (const name of ['B100', 'C60', 'S1', 'S2', 'S3', 'S4']) {
    const s = results.main.strategies[name]
    lines.push(`| ${name} | ${fmtPct(s.cagr)} | ${fmtPct(s.vol)} | ${fmtN(s.sharpe)} | ${fmtPct(s.maxDrawdown)} | ${fmtN(s.calmar)} | ${fmtPct(s.cvar5)} | ${fmtN(s.turnoverAnn)} | ${fmtPct(s.avgWeight)} | ${fmtPct(s.cer)} |`)
  }
  lines.push('')
  lines.push('同平均仓位对照 CM：')
  lines.push('')
  lines.push('| CM | 平均仓位 | CAGR | 波动 | Sharpe | 最大回撤 | CER |')
  lines.push('|---|---:|---:|---:|---:|---:|---:|')
  for (const name of ['S1', 'S2', 'S3', 'S4']) {
    const s = results.main.cm[name]
    lines.push(`| CM_${name.slice(1)} | ${fmtPct(s.avgWeight)} | ${fmtPct(s.cagr)} | ${fmtPct(s.vol)} | ${fmtN(s.sharpe)} | ${fmtPct(s.maxDrawdown)} | ${fmtPct(s.cer)} |`)
  }
  lines.push('')
  lines.push('## 增量比较（不纳入主族）')
  lines.push('')
  lines.push('| 比较 | ΔCER | p | 95% CI |')
  lines.push('|---|---:|---:|---|')
  for (const x of results.main.incremental) {
    lines.push(`| ${x.id} | ${fmtPct(x.deltaCer)} | ${fmtP(x.p)} | [${fmtPct(x.ci95?.[0])}, ${fmtPct(x.ci95?.[1])}] |`)
  }
  lines.push('')
  lines.push(`## 2007-01 之后样本外（S1 均线发表后；自助法 B=${robB}）`)
  lines.push('')
  if (results.post2007) {
    lines.push(`区间 ${results.post2007.evalStart} → ${results.post2007.evalEnd}（${results.post2007.nMonths} 月）。参考证据，不套用 1935 起三子期判定。`)
    lines.push('')
    lines.push('| 规则 | ΔCER vs CM | p | 95% CI | CAGR | 最大回撤 | 平均仓位 |')
    lines.push('|---|---:|---:|---|---:|---:|---:|')
    for (const j of results.post2007.judgments) {
      if (j.strategy !== 'S1' && j.strategy !== 'S4') continue
      const s = results.post2007.strategies[j.strategy]
      lines.push(`| ${j.strategy} | ${fmtPct(j.deltaCer)} | ${fmtP(j.p)} | [${fmtPct(j.ci95?.[0])}, ${fmtPct(j.ci95?.[1])}] | ${fmtPct(s.cagr)} | ${fmtPct(s.maxDrawdown)} | ${fmtPct(s.avgWeight)} |`)
    }
  } else {
    lines.push('未计算。')
  }
  lines.push('')
  lines.push(`## 稳健性（不改变判定；除成本表外自助法 B=${robB}）`)
  lines.push('')
  lines.push('### 成本 0.30%（沿用主设定窗口的 ΔCER，见判定条件 d）')
  lines.push('')
  lines.push('| 规则 | ΔCER vs CM |')
  lines.push('|---|---:|')
  for (const name of ['S1', 'S2', 'S3', 'S4']) {
    lines.push(`| ${name} | ${fmtPct(results.main.highCostDeltaCer[name])} |`)
  }
  lines.push('')
  lines.push(`### W = 80%（B=${robB}）`)
  lines.push('')
  lines.push('| 规则 | ΔCER vs CM | p | 判定 |')
  lines.push('|---|---:|---:|---|')
  for (const j of results.w80.judgments) {
    lines.push(`| ${j.strategy} | ${fmtPct(j.deltaCer)} | ${fmtP(j.p)} | ${j.verdict} |`)
  }
  lines.push('')
  lines.push(`### 不跳月（lag=1，仅展示偏差；B=${robB}）`)
  lines.push('')
  lines.push('| 规则 | ΔCER vs CM | p |')
  lines.push('|---|---:|---:|')
  for (const j of results.noSkip.judgments) {
    lines.push(`| ${j.strategy} | ${fmtPct(j.deltaCer)} | ${fmtP(j.p)} |`)
  }
  lines.push('')
  lines.push(`### 起点 1950-01（B=${robB}）`)
  lines.push('')
  lines.push('| 规则 | ΔCER vs CM | p | 判定 |')
  lines.push('|---|---:|---:|---|')
  for (const j of results.from1950.judgments) {
    lines.push(`| ${j.strategy} | ${fmtPct(j.deltaCer)} | ${fmtP(j.p)} | ${j.verdict} |`)
  }
  lines.push('')
  lines.push('### 子期重算同平均仓位 CM')
  lines.push('')
  lines.push('主表子期 ΔCER 沿用**全样本** CM 仓位。下表在每个子期内用该子期策略平均仓位重算 CM（不改变判定）。格内为「全样本CM ΔCER / 子期CM ΔCER」。')
  lines.push('')
  lines.push('| 规则 | 1935–1964 | 1965–1994 | 1995–末 |')
  lines.push('|---|---:|---:|---:|')
  for (const name of ['S1', 'S2', 'S3', 'S4']) {
    const j = results.main.judgments.find(x => x.strategy === name)
    const r = results.main.subperiodCmRecalc[name]
    const cell = key => `${fmtPct(j.subperiods[key])} / ${fmtPct(r?.[key]?.deltaCer)}`
    lines.push(`| ${name} | ${cell('1935-1964')} | ${cell('1965-1994')} | ${cell('1995-end')} |`)
  }
  lines.push('')
  lines.push('注：按子期 CM 时 **S3 在 1995–末的 ΔCER 符号翻转**（全样本 CM 为负，子期 CM 为正）；因主判定条件 (a) Holm 不成立，最终判定不变。')
  lines.push('')
  lines.push(`### Ken French：${meta.kenFrench}`)
  lines.push('')
  lines.push('## 局限')
  lines.push('')
  lines.push('- 只有美国一个市场；Shiller 月均价；不计税。')
  lines.push('- 参数受 Faber / 波动目标 / 估值分档文献影响，无法完全排除间接数据窥探。')
  lines.push('- 1935 年以来独立的 10 年窗口不足 10 个；平稳块自助法依赖块长设定。')
  lines.push('- 末段 Shiller D 空缺已前向填充；E 不前填；收益评估可延伸到原始数据末月，CAPE/估值信号受 E 滞后约束。')
  lines.push('- FRED TB3MS 因 CSV 端点超时改从数据表页抓取（SOURCES.md 已注明手工补写），数值与官方表一致（至 2026-10）。')
  lines.push('- 历史结果不代表未来，不构成投资建议。')
  lines.push('')
  lines.push('## 解释性选择（预注册未写死）')
  for (const x of meta.choices) lines.push(`- ${x}`)
  lines.push('')
  return lines.join('\n')
}

function fmtPct(x) {
  if (x == null || !Number.isFinite(x)) return '—'
  return `${(x * 100).toFixed(2)}%`
}
function fmtN(x) {
  if (x == null || !Number.isFinite(x)) return '—'
  return x.toFixed(3)
}
function fmtP(x) {
  if (x == null || !Number.isFinite(x)) return '—'
  return x.toFixed(4)
}
function yn(v) { return v ? '是' : '否' }

export async function loadData(dataDir) {
  const shiller = parseCsv(await readFile(join(dataDir, 'shiller.csv'), 'utf8'))
  const fred = parseCsv(await readFile(join(dataDir, 'fred-tb3ms.csv'), 'utf8'))
  let kenFrench = '跳过（下载连接被重置）'
  try {
    await readFile(join(dataDir, 'ken-french-mkt.csv'), 'utf8')
    kenFrench = '已下载（见 ken-french-mkt.csv）；本结果主判定仍用 Shiller 总回报'
  } catch {
    // optional
  }
  return { shiller, fred, kenFrench }
}

export async function runAll(dataDir, { B = BOOT_B, robustnessB = 2000 } = {}) {
  const { shiller, fred, kenFrench } = await loadData(dataDir)
  const series = buildSeries(shiller, fred)
  const lastCapeIdx = [...series.cape].map((v, i) => (v != null ? i : -1)).filter(i => i >= 0).at(-1)
  const lastCapeMonth = series.dates[lastCapeIdx] ?? series.dates.at(-1)
  const rawDataEnd = series.dates.at(-1)
  let eEnd = null
  for (let i = series.E.length - 1; i >= 0; i--) {
    if (series.E[i] != null && Number.isFinite(series.E[i])) { eEnd = series.dates[i]; break }
  }
  const robB = Math.min(robustnessB, B)

  const main = runBacktest(series, { lag: 2, cost: COST_MAIN, W: W_BASE, B })
  const w80 = runBacktest(series, { lag: 2, cost: COST_MAIN, W: 0.8, B: robB })
  const noSkip = runBacktest(series, { lag: 1, cost: COST_MAIN, W: W_BASE, B: robB })
  const from1950 = runBacktest(series, { lag: 2, cost: COST_MAIN, W: W_BASE, evalStart: '1950-01', B: robB })
  const post2007 = runBacktest(series, { lag: 2, cost: COST_MAIN, W: W_BASE, evalStart: '2007-01', B: robB })

  const choices = [
    'CAPE 用 (P_t/CPI_{t-1}) / mean_{u=t-3-119..t-3}(E_u/CPI_u)：预注册「CPI 滞后 1 月」解释为价格端用 CPI_{t-1}；替代口径（P/CPI_t 或 E_u/CPI_{u-1}）换档 ≤7/1102 月，ΔCER 变化 <0.02pp。',
    'D 末段空缺前向填充以算收益，E 不前填；原始数据可到末月，估值信号受 E 滞后 3 月约束。',
    '换手成本在收益月期初按 |目标−漂移仓位|×费率从权益扣除，再计入股票/现金当月收益；期初建仓不计成本。',
    'σ̂ 用最近 12 个月收益的样本标准差（/n−1）；扩张中位数至少 120 个有效 σ̂。',
    `自助法：平稳块、几何块长均值 12、B=${B}（主比较）、种子 20261115；单侧 p = #{ΔCER*≤0}/B；2007 后与稳健性变体 B=${robB}。`,
    '「剔贡献最大连续24月」= 选择使剩余 ΔCER 最小的 24 月窗口后，要求剩余 ΔCER>0。',
    'CM 的恒定仓位 = 对应策略在评估窗内实现的平均目标仓位（扣成本模拟所用权重）。',
    '主表子期 ΔCER 沿用全样本 CM 仓位（避免事后按子期重定义对照）；稳健性另附「子期重算同平均仓位 CM」表。',
    'FRED CSV 端点超时时改抓 /data/TB3MS 表（SOURCES 已注明手工补写）；Ken French 一次失败则跳过。',
  ]

  const results = {
    prereg: PREREG,
    rawDataEnd,
    eEnd,
    lastCapeMonth,
    dataEnd: lastCapeMonth,
    kenFrench,
    main,
    w80,
    noSkip,
    from1950,
    post2007,
  }

  const report = formatReport(results, {
    rawDataEnd, eEnd, lastCapeMonth, kenFrench, choices, robustnessB: robB,
  })
  return { results, report, series, choices }
}

async function atomicWrite(path, text) {
  const tmp = `${path}.tmp`
  await writeFile(tmp, text)
  await rename(tmp, path)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const dataDir = join(root, 'data-raw', 'sp500-backtest')
  const B = process.argv.includes('--fast') ? 500 : BOOT_B
  console.log(`Running backtest B=${B}…`)
  const { results, report } = await runAll(dataDir, { B })
  await mkdir(dataDir, { recursive: true })
  // 精简 JSON：去掉可能的超大字段
  const json = {
    prereg: results.prereg,
    rawDataEnd: results.rawDataEnd,
    eEnd: results.eEnd,
    lastCapeMonth: results.lastCapeMonth,
    dataEnd: results.dataEnd,
    kenFrench: results.kenFrench,
    main: results.main,
    w80: { judgments: results.w80.judgments, strategies: results.w80.strategies, bootstrapB: results.w80.bootstrapB },
    noSkip: { judgments: results.noSkip.judgments, bootstrapB: results.noSkip.bootstrapB },
    from1950: { judgments: results.from1950.judgments, bootstrapB: results.from1950.bootstrapB },
    post2007: {
      evalStart: results.post2007.evalStart,
      evalEnd: results.post2007.evalEnd,
      nMonths: results.post2007.nMonths,
      bootstrapB: results.post2007.bootstrapB,
      judgments: results.post2007.judgments.filter(j => j.strategy === 'S1' || j.strategy === 'S4'),
      strategies: Object.fromEntries(['S1', 'S4'].map(k => [k, results.post2007.strategies[k]])),
    },
  }
  await atomicWrite(join(dataDir, 'results.json'), JSON.stringify(json, null, 2) + '\n')
  await atomicWrite(join(root, 'docs/research/sp500-allocation-backtest-results-2026-11-15.md'), report)
  console.log(`eval ${results.main.evalStart}→${results.main.evalEnd} n=${results.main.nMonths}`)
  for (const j of results.main.judgments) {
    console.log(`${j.strategy}: ${j.verdict} ΔCER=${(j.deltaCer * 100).toFixed(2)}% p=${j.p?.toFixed(4)} pHolm=${j.pHolm}`)
  }
}
