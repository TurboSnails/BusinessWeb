// 探索性诊断（不作采用依据）：如果行业宽度没有两个月的发布滞后，结果会怎样；以及只用单一新指标的情况。
import { D, M, DIM, avg, EQ, TIERS, run, perf } from './lib.mjs'
import { baseScores, fmt } from './r2.mjs'
const ym = d => d.slice(0, 7)
const addM = (m, k) => { const y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1 + k; return `${y + Math.floor(mo / 12)}-${String(((mo % 12) + 12) % 12 + 1).padStart(2, '0')}` }
const band = (v, lo, hi, loScore = -1) => v <= lo ? loScore : v >= hi ? -loScore : 0
const lastByMonth = rows => { const m = new Map(); for (const [d, v] of rows) if (v != null) m.set(ym(d), v); return m }
const i200 = lastByMonth(D.extra.industry200), iMom = lastByMonth(D.extra.industryMomentum)
const fwd = (i, n) => { let w = 1; for (let k = i + 2; k < i + 2 + n; k++) { if (!M[k]?.ret) return null; w *= 1 + M[k].ret.spx } return w - 1 }
for (const lag of [2, 1, 0]) {
  const g = { '-1': [], 0: [], 1: [] }, g1 = { '-1': [], 0: [], 1: [] }
  M.forEach((m, i) => { const v = i200.get(addM(m.d, -lag)); if (v == null) return; const s = band(v, 40, 60); const f = fwd(i, 12), f1 = fwd(i, 1); if (f != null) g[s].push(f); if (f1 != null) g1[s].push(f1) })
  console.log('industry200 滞后', lag, '月:', [-1, 0, 1].map(k => `${k}: n${g[k].length} 12m ${(avg(g[k]) * 100).toFixed(1)}% 1m ${(avg(g1[k]) * 100).toFixed(2)}%`).join(' | '))
  const T = s => s >= 0.5 ? 1 : s <= -0.5 ? 0.5 : 0.7
  const rows = run(m => { const v = i200.get(addM(m.d, -lag)); return v == null ? null : v >= 60 ? 1 : v <= 40 ? 0.5 : 0.75 })
  const p = x => fmt(perf(x))
  console.log('   仅按 industry200 定仓（≥60 满仓 / ≤40 五成 / 其余 75%）: train', p(rows.filter(x => x.d < '2000-01')), '| test', p(rows.filter(x => x.d >= '2000-01')))
}
