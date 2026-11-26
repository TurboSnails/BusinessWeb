// L-027 计算引擎：标定（1951–2026，已用数据）与主检验（1872–1934）共用。定义逐条对应 PREREG.md。
export const mean = a => a.reduce((s, x) => s + x, 0) / a.length
export const sampleVar = a => { const m = mean(a); return a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1) }
export const sd = a => Math.sqrt(sampleVar(a))
export const mAfter = (d, k) => { const [y, m] = d.split('-').map(Number); const t = y * 12 + m - 1 + k; return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, '0')}` }
export const range = (from, to) => { const xs = []; for (let t = from; t <= to; t = mAfter(t, 1)) xs.push(t); return xs }

// mulberry32（与 L-016 引擎同一实现）
export function mulberry32(seed) {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

/** 破位：P_s < 含当月的 n 个月 P 算术平均（严格小于）。缺数据返回 null。 */
export function belowMA(P, s, n = 10) {
  const xs = Array.from({ length: n }, (_, k) => P.get(mAfter(s, -k)))
  if (xs.some(x => x == null)) return null
  return P.get(s) < mean(xs)
}

// A2：收益月 t 的权重来自信号月 t−2；1914 年停市的覆盖（PREREG「组合与执行」）
const OVERRIDE_1914 = new Map([['1914-09', '1914-06'], ['1914-10', '1914-06'], ['1914-11', '1914-06'], ['1914-12', '1914-06'], ['1915-01', '1914-07']])
export const signalMonthFor = (t, { closure1914 = false } = {}) => (closure1914 && OVERRIDE_1914.has(t) ? OVERRIDE_1914.get(t) : mAfter(t, -2))

/** 目标权重序列：weightFn(信号月) → 权重。 */
export function targetWeights(months, weightFn, opts = {}) {
  return months.map(t => { const w = weightFn(signalMonthFor(t, opts)); if (w == null || !Number.isFinite(w)) throw new Error(`缺 ${t} 的信号`); return w })
}

/** 毛收益、净收益（成本 κ × |Δw|，首月不计）。 */
export function returnsOf(w, r, c, kappa) {
  const g = w.map((x, i) => x * r[i] + (1 - x) * c[i])
  const n = g.map((x, i) => (i === 0 ? x : x - kappa * Math.abs(w[i] - w[i - 1])))
  return { g, n }
}

/** 同波动 w_M：二分 [0, 1.5]，60 次，取中点；用解析的样本方差（与逐月计算一致）。 */
export function makeSameVol(r, c) {
  const n = r.length; const mr = mean(r); const mc = mean(c)
  let vr = 0; let vc = 0; let cv = 0
  for (let i = 0; i < n; i++) { vr += (r[i] - mr) ** 2; vc += (c[i] - mc) ** 2; cv += (r[i] - mr) * (c[i] - mc) }
  vr /= n - 1; vc /= n - 1; cv /= n - 1
  const sdOf = w => Math.sqrt(Math.max(0, w * w * vr + 2 * w * (1 - w) * cv + (1 - w) * (1 - w) * vc))
  return target => { let lo = 0; let hi = 1.5; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (sdOf(m) < target) lo = m; else hi = m } return (lo + hi) / 2 }
}

export const navOf = n => { const v = [1]; for (const x of n) v.push(v.at(-1) * (1 + x)); return v }

/**
 * 全部指标。ctx：{ months, r, c, events: [{ id, p, q, sub }], w0 }；w：候选目标权重；kappa：成本率。
 * 事件位置：V[pos(p)+1] 为收益月 p 结束时净值。
 */
export function metrics(ctx, w, kappa, { sameVol } = {}) {
  const { months, r, c, events, w0 } = ctx
  const pos = new Map(months.map((t, i) => [t, i]))
  const { g, n } = returnsOf(w, r, c, kappa)
  const solve = sameVol ?? makeSameVol(r, c)
  const wM = solve(sd(g))
  const nM = r.map((x, i) => wM * x + (1 - wM) * c[i])
  const nB0 = r.map((x, i) => w0 * x + (1 - w0) * c[i])
  const V = navOf(n); const VM = navOf(nM)
  const at = (vec, t) => vec[pos.get(t) + 1]
  const ev = events.map(e => {
    const end = mAfter(e.q, 12)
    const downC = at(V, e.q) / at(V, e.p) - 1; const downM = at(VM, e.q) / at(VM, e.p) - 1
    const fullC = at(V, end) / at(V, e.p) - 1; const fullM = at(VM, end) / at(VM, e.p) - 1
    return { ...e, downC, downM, fullC, fullM, win: downC > downM, dE: fullC - fullM }
  })
  const L = list => list.reduce((s, e) => s + e.downC, 0) / list.reduce((s, e) => s + e.downM, 0)
  const dE = list => list.reduce((s, e) => s + e.dE, 0)
  const inEvent = new Set(); for (const e of events) for (let t = mAfter(e.p, 1); t <= mAfter(e.q, 12); t = mAfter(t, 1)) inEvent.add(t)
  const calmIdx = months.map((t, i) => (inEvent.has(t) ? -1 : i)).filter(i => i >= 0)
  const calm = arr => mean(calmIdx.map(i => arr[i]))
  const x = n.map((v, i) => v - c[i]); const xM = nM.map((v, i) => v - c[i])
  const cer = a => 12 * (mean(a) - 1.5 * sampleVar(a))
  const years = months.length / 12
  let switches = 0; let turnover = 0
  for (let i = 1; i < w.length; i++) { if (w[i] !== w[i - 1]) switches++; turnover += Math.abs(w[i] - w[i - 1]) }
  const subs = [...new Set(events.map(e => e.sub))]
  const sharpe = a => Math.sqrt(12) * mean(a) / sd(a)
  return {
    wM, L: L(ev), Lm29: events.some(e => e.id === 'E8') ? L(ev.filter(e => e.id !== 'E8')) : null,
    wins: ev.filter(e => e.win).length, dE: dE(ev), posE: ev.filter(e => e.dE > 0).length, nEvents: ev.length,
    calmVsM: 12 * (calm(n) - calm(nM)), calmVsB0: 12 * (calm(n) - calm(nB0)), calmMonths: calmIdx.length,
    sub: Object.fromEntries(subs.map(s => { const list = ev.filter(e => e.sub === s); return [s, { L: L(list), dE: dE(list) }] })),
    dCER: cer(x) - cer(xM), sharpe: sharpe(x), sharpeM: sharpe(xM), switchesPerYear: switches / years, turnoverPerYear: turnover / years,
    avgW: mean(w), events: ev,
  }
}

/** 判定 G1–G4、G6、G7（主口径 m、压力 m30）。降幅 drop。 */
export function gates(m, m30, w0, drop) {
  const Lstar = (w0 - 0.65 * drop) / m.wM
  const g1 = mm => mm.L <= (w0 - 0.65 * drop) / mm.wM && (mm.Lm29 == null || mm.Lm29 <= 1) && mm.wins >= Math.ceil(mm.nEvents * 5 / 8)
  const g2 = mm => mm.dE >= 0 && mm.posE >= Math.ceil(mm.nEvents * 5 / 8)
  const g3 = mm => mm.calmVsM >= 0
  const G4 = Object.values(m.sub).every(s => s.L < 1 && s.dE >= 0)
  return {
    Lstar, G1: g1(m), G2: g2(m), G3: g3(m), G4, G6: m.dCER >= -0.0025,
    G7: m.switchesPerYear <= 1.5 && g1(m30) && g2(m30) && g3(m30),
  }
}

/** 配对循环分块自助法：夏普差的 90% 区间（报告项）。 */
export function bootSharpeDiff(x, y, { seed = 20261127, draws = 10000, block = 12 } = {}) {
  const rng = mulberry32(seed); const n = x.length; const out = []
  const sh = a => Math.sqrt(12) * mean(a) / sd(a)
  for (let b = 0; b < draws; b++) {
    const idx = []; while (idx.length < n) { const s = Math.floor(rng() * n); for (let k = 0; k < block && idx.length < n; k++) idx.push((s + k) % n) }
    out.push(sh(idx.map(i => x[i])) - sh(idx.map(i => y[i])))
  }
  out.sort((a, b) => a - b)
  const q = p => { const k = (out.length - 1) * p; const lo = Math.floor(k); return out[lo] + (out[Math.ceil(k)] - out[lo]) * (k - lo) }
  return { point: sh(x) - sh(y), lo90: q(0.05), hi90: q(0.95) }
}

/** 防守段（收益月上权重 < w0 的连续月份）。 */
export function spellsOf(w, w0) {
  const spells = []; let start = -1
  w.forEach((x, i) => { if (x < w0 && start < 0) start = i; if (!(x < w0) && start >= 0) { spells.push(i - start); start = -1 } })
  if (start >= 0) spells.push(w.length - start)
  return spells
}

/** 安慰剂放置（附录 A）：返回每次放置的防守指示数组生成器。 */
export function* placebos(N, lengths, { seed = 20261127, draws = 10000 } = {}) {
  const rng = mulberry32(seed); const k = lengths.length; const F = N - lengths.reduce((s, x) => s + x, 0) - (k - 1)
  if (F < 0) throw new Error('防守段放不下')
  for (let d = 0; d < draws; d++) {
    const slots = Array.from({ length: F + k }, (_, i) => i)
    for (let i = slots.length - 1; i >= 1; i--) { const j = Math.floor(rng() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]] }
    const bars = slots.slice(0, k).sort((a, b) => a - b)
    const gaps = []; let prev = -1
    for (const b of bars) { gaps.push(b - prev - 1); prev = b }
    gaps.push(F + k - 1 - prev)
    for (let i = 1; i < k; i++) gaps[i] += 1
    const order = lengths.slice()
    for (let i = order.length - 1; i >= 1; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]] }
    const def = new Array(N).fill(false); let p = gaps[0]
    for (let i = 0; i < k; i++) { for (let q = 0; q < order[i]; q++) def[p + q] = true; p += order[i] + gaps[i + 1] }
    yield def
  }
}
