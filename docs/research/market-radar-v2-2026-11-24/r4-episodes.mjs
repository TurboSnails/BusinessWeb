// 事后探索：利差扩大 ≥0.20 且 VIX 趋势 ≥+20% 的月份落在哪几段行情（不作采用依据）。
import { M } from './lib.mjs'
import { volTrend, fwd12 } from './r4.mjs'
const hits = M.map((m, i) => ({ d: m.d, i, b: m.ind.baaChange?.v, v: volTrend(m.d), tier: m.mastersRt })).filter(x => x.b >= 0.2 && x.v >= 0.2)
let ep = []; for (const h of hits) { const last = ep.at(-1); if (last && h.i - last.at(-1).i <= 3) last.push(h); else ep.push([h]) }
for (const e of ep) console.log(e[0].d, '→', e.at(-1).d, `${e.length} 个月`, '之后12月:', e.map(h => { const f = fwd12(h.i); return f == null ? '—' : (f * 100).toFixed(0) + '%' }).join(' '), '| 宏观档位:', [...new Set(e.map(h => h.tier))].join('/'))
console.log('段数', ep.length)
// 每段第一个信号月之后 12 个月内的最大回撤（月度）
for (const e of ep) { const i = e[0].i; let w = 1, pk = 1, dd = 0; for (let k = 2; k < 14; k++) { const r = M[i + k]?.ret?.spx; if (r == null) break; w *= 1 + r; pk = Math.max(pk, w); dd = Math.min(dd, w / pk - 1) } console.log(e[0].d, '期间最大回撤', (dd * 100).toFixed(1) + '%') }
