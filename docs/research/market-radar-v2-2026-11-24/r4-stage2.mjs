// 第四轮全部结果：验证期、全样本、VIX-only 子样本、描述统计。
import { M, avg } from './lib.mjs'
import { RULES, MACRO, evalFn, fmt, fwd12, volTrend, VIX, RV, VIX_FROM } from './r4.mjs'
const show = (set, from) => { for (const [name, fn] of Object.entries(set)) { const r = evalFn(fn, from); console.log(name.padEnd(22), '| 训练', fmt(r.tr), '| 验证', fmt(r.te), '| 全样本', fmt(r.fu)) } }
console.log('== 雷达候选 =='); show(RULES)
console.log('== 宏观叠加（探索）=='); show(MACRO)
console.log('== 稳健性：只用 VIX（收益月 1990-09 起；训练段=1990-09..1999-12）=='); show(RULES, '1990-09')
// 数据核对：重叠期 VIX 趋势与已实现波动趋势的相关
const ov = M.map(m => m.d).filter(d => d >= VIX_FROM)
const addM = (m, k) => { const y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1 + k; return `${y + Math.floor(mo / 12)}-${String(((mo % 12) + 12) % 12 + 1).padStart(2, '0')}` }
const tr = (S, t) => { const p = [1,2,3,4,5,6].map(k => S.get(addM(t, -k))); return S.has(t) && p.every(x => x != null) ? S.get(t) / avg(p) - 1 : null }
const pairs = ov.map(d => [tr(VIX, d), tr(RV, d)]).filter(([a, b]) => a != null && b != null)
const corr = (P) => { const ma = avg(P.map(p => p[0])), mb = avg(P.map(p => p[1])); let c = 0, a = 0, b = 0; for (const [x, y] of P) { c += (x - ma) * (y - mb); a += (x - ma) ** 2; b += (y - mb) ** 2 } return c / Math.sqrt(a * b) }
console.log('重叠期 VIX 趋势 vs 已实现波动趋势 相关', corr(pairs).toFixed(3), 'n', pairs.length)
// 描述统计
const cell = rows => { const f = rows.filter(x => x != null); return f.length ? `${f.length} / ${(avg(f) * 100).toFixed(1)}% / 负 ${(f.filter(x => x < 0).length / f.length * 100).toFixed(0)}%` : '—' }
const vb = v => v == null ? null : v >= 0.20 ? '波动上升≥20%' : v <= -0.15 ? '波动回落≤−15%' : '居中'
const bb = b => b == null ? null : b >= 0.20 ? '利差扩大' : b <= -0.15 ? '利差收窄' : '利差平稳'
for (const [label, lo, hi] of [['1973 起', '1973-01', '9999'], ['1973–1999', '1973-01', '1999-12'], ['2000 起', '2000-01', '9999'], ['只用 VIX 1990-07 起', VIX_FROM, '9999']]) {
  const idxs = M.map((m, i) => i).filter(i => M[i].d >= lo && M[i].d <= hi)
  console.log(`\n== ${label}：volTrend 三档之后 12 个月（月数 / 均值 / 为负比例）==`)
  for (const b of ['波动上升≥20%', '居中', '波动回落≤−15%']) console.log(b.padEnd(14), cell(idxs.filter(i => vb(volTrend(M[i].d)) === b).map(fwd12)))
  console.log(`-- 九格（行：利差，列：波动上升 / 居中 / 回落）--`)
  for (const r of ['利差扩大', '利差平稳', '利差收窄']) console.log(r.padEnd(6), ['波动上升≥20%', '居中', '波动回落≤−15%'].map(c => cell(idxs.filter(i => bb(M[i].ind.baaChange?.v) === r && vb(volTrend(M[i].d)) === c).map(fwd12)).padEnd(26)).join(' | '))
  console.log('利差扩大 × volTrend>0 / ≤0：', cell(idxs.filter(i => M[i].ind.baaChange?.v >= 0.2 && volTrend(M[i].d) > 0).map(fwd12)), '|', cell(idxs.filter(i => M[i].ind.baaChange?.v >= 0.2 && volTrend(M[i].d) != null && volTrend(M[i].d) <= 0).map(fwd12)))
}
