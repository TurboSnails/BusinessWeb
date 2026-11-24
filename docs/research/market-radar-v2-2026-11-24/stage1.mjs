import { evalCfg, fmt } from './v2.mjs'
// TRAIN ONLY output for selection (stage 1)
const base0 = evalCfg({ d1: false }), base = evalCfg({})
console.log('v1 (no D1)   train', fmt(base0.tr))
console.log('D1 baseline  train', fmt(base.tr))
const cands = { 'F1 T1': { T: 'T1' }, 'F2 P1 30y': { P: 30 }, 'F2 P2 20y': { P: 20 }, 'F3 E1': { E: 1 }, 'F4 C1': { C: 1 }, 'F5 G1': { G: 1 } }
for (const [k, c] of Object.entries(cands)) { const r = evalCfg(c); console.log(k.padEnd(12), 'train', fmt(r.tr), '| dSharpe', (r.tr.sharpe - base.tr.sharpe).toFixed(3), 'dDD', ((r.tr.maxDd - base.tr.maxDd) * 100).toFixed(1), (r.tr.sharpe - base.tr.sharpe >= 0.01 && r.tr.maxDd - base.tr.maxDd >= -0.01) ? 'KEEP' : 'drop') }
