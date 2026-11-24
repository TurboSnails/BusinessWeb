import { evalCfg, fmt, signal } from './v2.mjs'
import { M, EQ, run, perf } from './lib.mjs'
const show = (k, r) => console.log(k.padEnd(16), '| train', fmt(r.tr), '| test', fmt(r.te), '| full', fmt(r.fu))
const all = { 'v1 (no D1)': { d1: false }, 'D1 baseline': {}, 'F1 T1': { T: 'T1' }, 'F2 P1 30y': { P: 30 }, 'F2 P2 20y': { P: 20 }, 'F3 E1': { E: 1 }, 'F4 C1': { C: 1 }, 'F5 G1': { G: 1 }, 'v2cand D1+E1': { E: 1 } }
for (const [k, c] of Object.entries(all)) show(k, evalCfg(c))
const b = evalCfg({}), c = evalCfg({ E: 1 })
console.log('adopt test: dSharpe(test)', (c.te.sharpe - b.te.sharpe).toFixed(3), 'dDD(test)', ((c.te.maxDd - b.te.maxDd) * 100).toFixed(2), 'dSharpe(train)', (c.tr.sharpe - b.tr.sharpe).toFixed(3), 'dCAGR(full)', ((c.fu.cagr - b.fu.cagr) * 100).toFixed(2))
// D1 effect on tiers
let diff = 0; const ex = []
for (const m of M) { const a = signal(m, { d1: false }).tier, d = signal(m, {}).tier; if (a !== d) { diff++; if (ex.length < 400) ex.push(m.d + ':' + a + '>' + d) } }
console.log('D1 changes radar tier in', diff, 'of', M.length, 'months;', 'by decade', JSON.stringify(ex.reduce((o, x) => { const k = x.slice(0, 3) + '0s'; o[k] = (o[k] || 0) + 1; return o }, {})))
console.log(ex.filter(x => /^(2002|2003|2008|2009|2020|2022|2025|2026)/.test(x)).join(' '))
// masters revised vs realtime, same harness
const pr = k => { const rows = run(m => EQ[m[k]]); return { tr: perf(rows.filter(x => x.d < '2000-01')), te: perf(rows.filter(x => x.d >= '2000-01')), fu: perf(rows) } }
show('masters revised', pr('mastersRev')); show('masters realtime', pr('mastersRt'))
const blend = k => { const rows = run(m => (EQ[signal(m, {}).tier] + EQ[m[k]]) / 2); return { tr: perf(rows.filter(x => x.d < '2000-01')), te: perf(rows.filter(x => x.d >= '2000-01')), fu: perf(rows) } }
show('blend D1+rev', blend('mastersRev'))
const last = M.at(-1); console.log('current(2026-10) v1', JSON.stringify(signal(last, { d1: false })), '\nD1', JSON.stringify(signal(last, {})))
