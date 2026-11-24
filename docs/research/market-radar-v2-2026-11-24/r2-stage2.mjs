// 验证期与全样本；候选 = 训练期过线者中夏普最高的一个
import { evalCfg, fmt, CANDS, signal, newScores, NEW_DIM } from './r2.mjs'
import { M, EQ, TIERS, run, perf, avg } from './lib.mjs'
const show = (k, r) => console.log(k.padEnd(14), '| train', fmt(r.tr), '| test', fmt(r.te), '| full', fmt(r.fu))
const base = evalCfg({}); show('基线 radar-v1', base)
for (const [k, c] of Object.entries(CANDS)) show(k, evalCfg(c))
const c = evalCfg(CANDS['C 分层+扩充'])
console.log('采用检验 C: 验证期 dSharpe', (c.te.sharpe - base.te.sharpe).toFixed(3), '验证期 dDD', ((c.te.maxDd - base.te.maxDd) * 100).toFixed(2), '训练期 dSharpe', (c.tr.sharpe - base.tr.sharpe).toFixed(3), '全样本 d年化', ((c.fu.cagr - base.fu.cagr) * 100).toFixed(2))
const pr = fn => { const rows = run(fn); return { tr: perf(rows.filter(x => x.d < '2000-01')), te: perf(rows.filter(x => x.d >= '2000-01')), fu: perf(rows) } }
show('大师(同口径)', pr(m => EQ[m.mastersRev])); show('十个月均线', pr(m => m.below == null ? null : m.below ? 0.5 : 1)); show('恒定七成', pr(() => 0.7))
show('C 与大师平均', pr(m => (EQ[signal(m, CANDS['C 分层+扩充']).tier] + EQ[m.mastersRev]) / 2))
// 新指标单项：打分分布与之后 12 个月回报
const fwd = (i, n) => { let w = 1; for (let k = i + 2; k < i + 2 + n; k++) { if (!M[k]?.ret) return null; w *= 1 + M[k].ret.spx } return w - 1 }
console.log('== 新指标单项（1973 起）：扣分/0/加分 月数与之后 12 个月标普回报')
for (const id of Object.keys(NEW_DIM)) {
  const g = { '-1': [], 0: [], 1: [] }
  M.forEach((m, i) => { const s = newScores(m.d)[id]; const f = fwd(i, 12); if (s != null && f != null) g[s].push(f) })
  console.log(id.padEnd(18), [-1, 0, 1].map(k => `${k}: n${g[k].length} ${g[k].length ? (avg(g[k]) * 100).toFixed(1) + '%' : '-'}`).join(' | '))
}
// 档位分布与大跌期间仓位
for (const [k, cfg] of [['基线', {}], ['C', CANDS['C 分层+扩充']]]) {
  const cnt = {}; let sw = 0; M.forEach((m, i) => { const t = signal(m, cfg).tier; cnt[t] = (cnt[t] || 0) + 1; if (i && t !== signal(M[i - 1], cfg).tier) sw++ })
  console.log(k, '档位月数', TIERS.map(t => `${t}:${cnt[t] || 0}`).join(' '), '换档', sw)
}
for (const [a, b] of [['1973-01', '1974-12'], ['1980-11', '1982-08'], ['1987-08', '1987-12'], ['2000-08', '2002-10'], ['2007-10', '2009-03'], ['2020-01', '2020-04'], ['2022-01', '2022-10']]) {
  const idx = M.map((m, i) => i).filter(i => M[i].d >= a && M[i].d <= b && i >= 2)
  const w = cfg => avg(idx.map(i => EQ[signal(M[i - 2], cfg).tier]))
  console.log(a, b, '标普', ((idx.reduce((x, i) => x * (1 + (M[i].ret?.spx ?? 0)), 1) - 1) * 100).toFixed(1) + '%', '基线仓位', w({}).toFixed(2), 'C 仓位', w(CANDS['C 分层+扩充']).toFixed(2), '大师', avg(idx.map(i => EQ[M[i - 2].mastersRev])).toFixed(2))
}
// 按十年的夏普
for (const [a, b] of [['1973', '1980'], ['1980', '1990'], ['1990', '2000'], ['2000', '2010'], ['2010', '2020'], ['2020', '2027']]) {
  const f = cfg => { const p = perf(run(m => EQ[signal(m, cfg).tier]).filter(x => x.d >= a && x.d < b)); return `${(p.cagr * 100).toFixed(1)}%/${(p.maxDd * 100).toFixed(0)}/${p.sharpe.toFixed(2)}` }
  const g = fn => { const p = perf(run(fn).filter(x => x.d >= a && x.d < b)); return `${(p.cagr * 100).toFixed(1)}%/${(p.maxDd * 100).toFixed(0)}/${p.sharpe.toFixed(2)}` }
  console.log(a + 's', '基线', f({}), '| C', f(CANDS['C 分层+扩充']), '| 大师', g(m => EQ[m.mastersRev]), '| 均线', g(m => m.below ? 0.5 : 1))
}
const last = M.at(-1); console.log('2026-10 C:', JSON.stringify(signal(last, CANDS['C 分层+扩充'])))
