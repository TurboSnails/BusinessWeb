import { M, SCORE, DIM, scores, radarScore, tierOf, EQ, report, avg } from './lib.mjs'
const NINE = ['baaChange', 'erp', 'pe', 'equityShare', 'cashShare', 'finraDebtYoy', 'breadth', 'volume', 'epsYoy']
const TEN = [...NINE, 'cape']
console.log('== reproduce')
report('radar 9 (current tree)', m => EQ[tierOf(radarScore(m, NINE))])
report('radar 10 (with cape)', m => EQ[tierOf(radarScore(m, TEN))])
report('masters realtime', m => EQ[m.mastersRt])
report('masters revised', m => EQ[m.mastersRev])
report('trend', m => m.below == null ? null : m.below ? 0.5 : 1)
report('buyhold', () => 1); report('static70', () => 0.7)
console.log('== score distribution per indicator (share -1/0/+1), by era')
for (const id of TEN) {
  const line = [['73-89', '1973', '1990'], ['90-09', '1990', '2010'], ['10-26', '2010', '2027']].map(([n, a, b]) => {
    const s = M.filter(m => m.d >= a && m.d < b).map(m => scores(m, [id])[id]).filter(x => x != null)
    const sh = v => (s.filter(x => x === v).length / (s.length || 1) * 100).toFixed(0)
    return `${n}: n${s.length} -${sh(-1)}/0:${sh(0)}/+${sh(1)}`
  }).join('  ')
  console.log(id.padEnd(14), line)
}
console.log('== fwd 12m spx return by score (signal month i -> returns i+2..i+13), full 1973+')
const fwd = (i, n) => { let w = 1; for (let k = i + 2; k < i + 2 + n; k++) { if (!M[k]?.ret) return null; w *= 1 + M[k].ret.spx } return w - 1 }
for (const id of TEN) {
  const g = { '-1': [], 0: [], 1: [] }
  M.forEach((m, i) => { const s = scores(m, [id])[id]; const f = fwd(i, 12); if (s != null && f != null) g[s].push(f) })
  const g1 = { '-1': [], 0: [], 1: [] }
  M.forEach((m, i) => { const s = scores(m, [id])[id]; const f = fwd(i, 1); if (s != null && f != null) g1[s].push(f) })
  console.log(id.padEnd(14), [-1, 0, 1].map(k => `${k}: n${g[k].length} 12m ${g[k].length ? (avg(g[k]) * 100).toFixed(1) : '-'}% 1m ${g1[k].length ? (avg(g1[k]) * 100).toFixed(2) : '-'}%`).join(' | '))
}
console.log('== leave one out (from 9)')
for (const id of NINE) report('drop ' + id, m => EQ[tierOf(radarScore(m, NINE.filter(x => x !== id)))])
console.log('== single dimension only')
for (const dim of ['liquidity', 'valuation', 'crowding', 'trading', 'earnings']) report('only ' + dim, m => EQ[tierOf(radarScore(m, NINE.filter(x => DIM[x] === dim)))])
console.log('== drop dimension')
for (const dim of ['liquidity', 'valuation', 'crowding', 'trading', 'earnings']) report('drop ' + dim, m => EQ[tierOf(radarScore(m, NINE.filter(x => DIM[x] !== dim)))])
