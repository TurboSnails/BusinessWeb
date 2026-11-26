// 第四轮：企业债利差 + VIX 变化趋势。先读 PREREG-round4-vix-credit.md（L-022，提交 d36a999f）。
import { readFileSync } from 'node:fs'
import { M, DIM, avg, EQ, TIERS, run, perf } from './lib.mjs'
import { baseScores, signal } from './r2.mjs'
const ROOT = new URL('../../../', import.meta.url)
const ym = d => d.slice(0, 7)
const addM = (m, k) => { const y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1 + k; return `${y + Math.floor(mo / 12)}-${String(((mo % 12) + 12) % 12 + 1).padStart(2, '0')}` }
const monthlyMean = rows => { const g = new Map(); for (const [d, v] of rows) if (Number.isFinite(v)) (g.get(ym(d)) ?? g.set(ym(d), []).get(ym(d))).push(v); return new Map([...g].map(([k, a]) => [k, avg(a)])) }

// VIX：Cboe 日线 1990-01 起
const vixDaily = JSON.parse(readFileSync(new URL('data-raw/market-radar/VIX.json', ROOT)))
export const VIX = monthlyMean(vixDaily)
// 已实现波动：标普近 20 个交易日日对数收益年化标准差
const spx = JSON.parse(readFileSync(new URL('public/data/macro-posture-daily.json', ROOT))).rows.map(([d, c]) => [d, c])
const rv = []
for (let i = 20; i < spx.length; i++) {
  const r = []; for (let k = i - 19; k <= i; k++) r.push(Math.log(spx[k][1] / spx[k - 1][1]))
  const m = avg(r); rv.push([spx[i][0], Math.sqrt(r.reduce((s, x) => s + (x - m) ** 2, 0) / 19) * Math.sqrt(252) * 100])
}
export const RV = monthlyMean(rv)
const trendIn = (S, t) => { const prior = [1, 2, 3, 4, 5, 6].map(k => S.get(addM(t, -k))); return S.has(t) && prior.every(x => x != null) ? S.get(t) / avg(prior) - 1 : null }
export const VIX_FROM = '1990-07'
export const volTrend = t => t >= VIX_FROM ? trendIn(VIX, t) : trendIn(RV, t)

const band = (v, lo, hi, loScore = -1) => v <= lo ? loScore : v >= hi ? -loScore : 0
const T0 = s => s == null ? null : s >= 0.5 ? 'offense' : s >= 0.15 ? 'lean-offense' : s <= -0.75 ? 'defense' : s <= -0.25 ? 'lean-defense' : 'neutral'
const volScore = v => v == null ? null : v >= 0.20 ? -1 : v <= -0.15 ? 1 : 0
const repair = (baa, v) => baa >= 0.20 ? (v == null ? -1 : v > 0 ? -1 : 1) : baa <= -0.15 ? 1 : 0
const joint = (baa, v) => v == null ? band(baa, -0.15, 0.20, 1) : baa >= 0.20 && v >= 0.20 ? -1 : baa <= -0.15 && v <= -0.15 ? 1 : 0

export function radar(m, { k1 = false, k2 = false, e2 = false } = {}) {
  const s = baseScores(m), v = volTrend(m.d), baa = m.ind.baaChange?.v
  if (baa != null && k2) s.baaChange = repair(baa, v)
  if (baa != null && e2) s.baaChange = joint(baa, v)
  const dimOf = { ...DIM, volTrend: 'liquidity' }
  if (k1 && v != null) s.volTrend = volScore(v)
  const dims = {}
  for (const [id, x] of Object.entries(s)) (dims[dimOf[id]] ??= []).push(x)
  const score = avg(['liquidity', 'valuation', 'crowding', 'trading', 'earnings'].map(k => dims[k] && avg(dims[k])).filter(x => x != null))
  return T0(score == null ? null : Math.round(score * 1e10) / 1e10)
}
const idx = t => TIERS.indexOf(t)
export const RULES = {
  '基线 radar-v1': m => radar(m),
  'K1 VIX 趋势并入流动性': m => radar(m, { k1: true }),
  'K2 利差走阔看 VIX 趋势': m => radar(m, { k2: true }),
  'E1 K1+K2（探索）': m => radar(m, { k1: true, k2: true }),
  'E2 联合压力（探索）': m => radar(m, { e2: true }),
}
export const MACRO = {
  '宏观攻守（参照）': m => m.mastersRt,
  'E3 宏观防守侧+修复上调（探索）': m => { const i = idx(m.mastersRt), baa = m.ind.baaChange?.v, v = volTrend(m.d); return i >= 3 && baa >= 0.20 && v != null && v <= 0 ? TIERS[i - 1] : m.mastersRt },
}
export function evalFn(fn, from = '1973-03') {
  const rows = run(m => EQ[fn(m)], { from })
  return { tr: perf(rows.filter(x => x.d < '2000-01')), te: perf(rows.filter(x => x.d >= '2000-01')), fu: perf(rows) }
}
export const fmt = p => p ? `${(p.cagr * 100).toFixed(2)}% / ${(p.maxDd * 100).toFixed(1)}% / ${p.sharpe.toFixed(3)} 仓位 ${p.avgEq.toFixed(2)} 换档 ${p.sw.toFixed(1)}` : 'n/a'
// 信号月 i 之后 12 个月（从 i+2 起）的标普累计回报
export function fwd12(i) { let w = 1; for (let k = 2; k < 14; k++) { const r = M[i + k]?.ret?.spx; if (r == null) return null; w *= 1 + r } return w - 1 }
export { signal }
