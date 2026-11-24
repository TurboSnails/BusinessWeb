import { D, M, DIM, avg, EQ, run, perf } from './lib.mjs'
const R = D.raw
const ym = d => d.slice(0, 7)
const addM = (m, k) => { const y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1 + k; const yy = y + Math.floor(mo / 12), mm = ((mo % 12) + 12) % 12; return `${yy}-${String(mm + 1).padStart(2, '0')}` }
const pct = (v, ref) => ref.length < 2 ? null : (ref.filter(x => x < v).length + ref.filter(x => x === v).length / 2) / ref.length * 100
const price = new Map(R.price.map(([o, , v]) => [ym(o), v]))
const peObs = new Map(R.pe.map(([o, , v]) => [ym(o), v]))
const gs10 = new Map(R.GS10.map(([o, , v]) => [ym(o), v]))
// D1: peFix(t) = PE(t-3) * P(t)/P(t-3)
const peFix = new Map(), erpFix = new Map()
for (const [m3, pe] of peObs) { const t = addM(m3, 3); if (price.has(t) && price.has(m3)) { const v = pe * price.get(t) / price.get(m3); peFix.set(t, v); if (gs10.has(t)) erpFix.set(t, 100 / v - gs10.get(t)) } }
// monthly series -> percentile at t with window years (null = expanding)
function pctMonthly(map, t, years) {
  const v = map.get(t); if (v == null) return null
  const lo = years ? addM(t, -12 * years) : '0000'
  const ref = []; for (const [m, x] of map) if (m <= t && m > lo) ref.push(x)
  return pct(v, ref)
}
function pctQuarterly(rows, t, years) { // rows [obs, avail, v]; t = 'YYYY-MM' signal month end
  const known = rows.filter(([, a]) => ym(a) <= t); if (!known.length) return null
  const [o, , v] = known.at(-1); const lo = years ? addM(ym(o), -12 * years) : '0000'
  return pct(v, known.filter(([oo]) => ym(oo) > lo).map(r => r[2]))
}
const band = (v, lo, hi, loScore = -1) => v <= lo ? loScore : v >= hi ? -loScore : 0
const TH = { T0: [0.5, 0.15, -0.25, -0.75], T1: [0.4, 0.15, -0.15, -0.4] }
const tier = (s, [a, b, c, d]) => s == null ? null : s >= a ? 'offense' : s >= b ? 'lean-offense' : s <= d ? 'defense' : s <= c ? 'lean-defense' : 'neutral'
const cache = new Map()
export function signal(m, cfg) {
  const key = m.d + JSON.stringify(cfg); if (cache.has(key)) return cache.get(key)
  const { d1 = true, T = 'T0', P = null, E = 0, C = 0, G = 0 } = cfg
  const s = {}
  const I = m.ind
  if (I.baaChange) s.baaChange = band(I.baaChange.v, -0.15, 0.20, 1)
  let peP, erpP
  if (d1) { peP = pctMonthly(peFix, m.d, P); erpP = pctMonthly(erpFix, m.d, P) }
  else if (P == null) { peP = I.pe?.p ?? null; erpP = I.erp?.p ?? null }
  else throw new Error('rolling window only with d1')
  const epsBad = E && I.epsYoy && I.epsYoy.v <= -10
  if (peP != null && !epsBad) s.pe = band(peP, 20, 80, 1)
  if (erpP != null && !epsBad) s.erp = band(erpP, 20, 80)
  const eqP = pctQuarterly(R.equityShare, m.d, P), caP = pctQuarterly(R.cashShare, m.d, P)
  if (eqP != null) s.equityShare = band(eqP, 20, 80, 1)
  if (caP != null) s.cashShare = band(caP, 20, 80)
  if (I.finraDebtYoy) s.finraDebtYoy = band(I.finraDebtYoy.v, -20, 30, 1)
  if (I.breadth) s.breadth = I.breadth.v <= 40 ? -1 : I.breadth.v >= 60 ? 1 : 0
  if (I.volume) s.volume = I.volume.v >= 1.10 ? (I.volume.below ? -1 : 1) : 0
  if (I.epsYoy) s.epsYoy = band(I.epsYoy.v, -10, 10)
  const dims = {}
  const push = (dim, v) => (dims[dim] ??= []).push(v)
  for (const [id, v] of Object.entries(s)) {
    if (C && (id === 'equityShare' || id === 'cashShare')) continue
    push(DIM[id], v)
  }
  if (C) { const hh = [s.equityShare, s.cashShare].filter(x => x != null); if (hh.length) push('crowding', avg(hh)) }
  const dimScore = Object.fromEntries(Object.entries(dims).map(([k, v]) => [k, avg(v)]))
  if (G) for (const k of ['valuation', 'crowding']) if (dimScore[k] != null && dimScore[k] < 0 && !m.below) dimScore[k] = 0
  const vals = Object.values(dimScore)
  const score = vals.length ? Math.round(avg(vals) * 1e10) / 1e10 : null
  const out = { score, tier: tier(score, TH[T]), s, dimScore }
  cache.set(key, out); return out
}
export function evalCfg(cfg) {
  const rows = run(m => EQ[signal(m, cfg).tier])
  return { tr: perf(rows.filter(x => x.d < '2000-01')), te: perf(rows.filter(x => x.d >= '2000-01')), fu: perf(rows) }
}
export const fmt = p => `${(p.cagr * 100).toFixed(2)}% dd ${(p.maxDd * 100).toFixed(1)} sh ${p.sharpe.toFixed(3)} eq ${p.avgEq.toFixed(2)} sw ${p.sw.toFixed(1)}`
