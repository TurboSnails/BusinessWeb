// 融合规则检验。先读 PREREG-round3-fusion.md。
import { M, EQ, TIERS, run, perf, avg } from './lib.mjs'
import { signal } from './r2.mjs'
export const heat = m => { const d = signal(m, {}).dim; const s = avg([d.valuation, d.crowding].filter(x => x != null)); return s == null ? null : s <= -0.5 ? 'hot' : s >= 0.5 ? 'cold' : 'mid' }
const idx = t => TIERS.indexOf(t)
const shift = (i, k) => Math.max(0, Math.min(4, i + k))
export const RULES = {
  '基线 宏观攻守': m => m.mastersRt,
  'M1 平均仓位': null,
  'M2 热度上限': m => heat(m) === 'hot' ? TIERS[Math.max(idx(m.mastersRt), 1)] : m.mastersRt,
  'M3 偏热且破位再降一档': m => heat(m) === 'hot' && m.below ? TIERS[shift(idx(m.mastersRt), 1)] : m.mastersRt,
  'M4 偏冷加码': m => heat(m) === 'cold' && !m.below ? TIERS[shift(idx(m.mastersRt), -1)] : m.mastersRt,
  'M5 全套热度修正': m => { let i = idx(m.mastersRt); const h = heat(m); if (h === 'hot') { i = Math.max(i, 1); if (m.below) i = shift(i, 1) } else if (h === 'cold' && !m.below) i = shift(i, -1); return TIERS[i] },
  'M6 雷达否决': m => ['lean-defense', 'defense'].includes(signal(m, {}).tier) ? TIERS[shift(idx(m.mastersRt), 1)] : m.mastersRt,
}
export const equity = (name, m) => name === 'M1 平均仓位' ? (EQ[signal(m, {}).tier] + EQ[m.mastersRt]) / 2 : EQ[RULES[name](m)]
export function evalRule(name) { const rows = run(m => equity(name, m)); return { tr: perf(rows.filter(x => x.d < '2000-01')), te: perf(rows.filter(x => x.d >= '2000-01')), fu: perf(rows) } }
export const fmt = p => `${(p.cagr * 100).toFixed(2)}% / ${(p.maxDd * 100).toFixed(1)}% / ${p.sharpe.toFixed(3)} 仓位 ${p.avgEq.toFixed(2)} 换档 ${p.sw.toFixed(1)}`
