import { readFileSync } from 'node:fs'
export const D = JSON.parse(readFileSync(new URL('./dump.json', import.meta.url)))
export const M = D.months
export const DIM = { baaChange: 'liquidity', erp: 'valuation', pe: 'valuation', cape: 'valuation', equityShare: 'crowding', cashShare: 'crowding', finraDebtYoy: 'crowding', breadth: 'trading', volume: 'trading', epsYoy: 'earnings' }
const band = (v, lo, hi, loScore = -1) => v <= lo ? loScore : v >= hi ? -loScore : 0
export const SCORE = {
  baaChange: x => band(x.v, -0.15, 0.20, 1),
  erp: x => x.p == null ? null : band(x.p, 20, 80),
  pe: x => x.p == null ? null : band(x.p, 20, 80, 1),
  cape: x => x.p == null ? null : band(x.p, 20, 80, 1),
  equityShare: x => x.p == null ? null : band(x.p, 20, 80, 1),
  cashShare: x => x.p == null ? null : band(x.p, 20, 80),
  finraDebtYoy: x => band(x.v, -20, 30, 1),
  breadth: x => x.v <= 40 ? -1 : x.v >= 60 ? 1 : 0,
  volume: x => x.v >= 1.10 ? (x.below ? -1 : 1) : 0,
  epsYoy: x => band(x.v, -10, 10),
}
export const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null
export const EQ = { offense: 1, 'lean-offense': 0.85, neutral: 0.7, 'lean-defense': 0.5, defense: 0.3 }
export const TIERS = ['offense', 'lean-offense', 'neutral', 'lean-defense', 'defense']
export function tierOf(s) { return s == null ? null : s >= 0.5 ? 'offense' : s >= 0.15 ? 'lean-offense' : s <= -0.75 ? 'defense' : s <= -0.25 ? 'lean-defense' : 'neutral' }
export function scores(m, ids, score = SCORE) {
  const out = {}
  for (const id of ids) { const x = m.ind[id]; const s = x && Number.isFinite(x.v) ? score[id](x) : null; if (s != null) out[id] = s }
  return out
}
export function radarScore(m, ids, { weights = null, score = SCORE } = {}) {
  const sc = scores(m, ids, score)
  const dims = {}
  for (const [id, s] of Object.entries(sc)) (dims[DIM[id]] ??= []).push(s)
  const entries = Object.entries(dims).map(([k, v]) => [k, avg(v)])
  if (!entries.length) return null
  if (!weights) return Math.round(avg(entries.map(e => e[1])) * 1e10) / 1e10
  const w = entries.reduce((s, [k]) => s + (weights[k] ?? 0), 0)
  return w ? entries.reduce((s, [k, v]) => s + (weights[k] ?? 0) * v, 0) / w : null
}
// equityFn(m, i) -> weight for signal month i; applied to returns at i+2
export function run(equityFn, { from = '1973-03', to = '9999', lag = 2 } = {}) {
  const rows = []
  for (let i = 0; i + lag < M.length; i++) {
    const t = M[i + lag]
    if (!t.ret || t.ret.cash == null || t.d < from || t.d > to) continue
    const w = equityFn(M[i], i)
    if (w == null) continue
    rows.push({ d: t.d, w, r: w * t.ret.spx + (1 - w) * t.ret.cash, c: t.ret.cash })
  }
  return rows
}
export function perf(rows) {
  if (!rows.length) return null
  const r = rows.map(x => x.r), ex = rows.map(x => x.r - x.c)
  const cagr = r.reduce((w, x) => w * (1 + x), 1) ** (12 / r.length) - 1
  let w = 1, pk = 1, dd = 0; for (const x of r) { w *= 1 + x; pk = Math.max(pk, w); dd = Math.min(dd, w / pk - 1) }
  const m = avg(ex), sd = Math.sqrt(ex.reduce((s, x) => s + (x - m) ** 2, 0) / (ex.length - 1))
  const sw = rows.filter((x, i) => i && x.w !== rows[i - 1].w).length * 12 / rows.length
  return { cagr, maxDd: dd, sharpe: Math.sqrt(12) * m / sd, avgEq: avg(rows.map(x => x.w)), sw, n: rows.length }
}
export function report(label, fn, opts) {
  const all = run(fn, opts)
  const f = p => p ? `${(p.cagr * 100).toFixed(2)}% dd ${(p.maxDd * 100).toFixed(1)} sh ${p.sharpe.toFixed(3)} eq ${p.avgEq.toFixed(2)} sw ${p.sw.toFixed(1)}` : 'n/a'
  const tr = perf(all.filter(x => x.d < '2000-01')), te = perf(all.filter(x => x.d >= '2000-01')), fu = perf(all)
  console.log(label.padEnd(34), '| train', f(tr), '| test', f(te), '| full', f(fu))
  return { tr, te, fu }
}
