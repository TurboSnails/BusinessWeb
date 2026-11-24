import { M, SCORE, DIM, scores, radarScore, tierOf, EQ, avg } from './lib.mjs'
const NINE = ['baaChange', 'erp', 'pe', 'equityShare', 'cashShare', 'finraDebtYoy', 'breadth', 'volume', 'epsYoy']
const show = d => { const m = M.find(x => x.d === d); const s = scores(m, NINE)
  console.log(d, 'radar', (radarScore(m, NINE) ?? NaN).toFixed(2), tierOf(radarScore(m, NINE)).padEnd(12), 'masters', m.mastersRt.padEnd(12), 'below', m.below ? 'Y' : 'n',
    NINE.map(id => `${id.slice(0, 5)}:${s[id] ?? '·'}`).join(' '), `| pe ${m.ind.pe?.v} p${m.ind.pe?.p?.toFixed(0)} erp ${m.ind.erp?.v?.toFixed(2)} p${m.ind.erp?.p?.toFixed(0)} eqSh p${m.ind.equityShare?.p?.toFixed(0)} cash p${m.ind.cashShare?.p?.toFixed(0)} eps ${m.ind.epsYoy?.v?.toFixed(0)}`) }
for (const d of ['1973-01','1974-09','1980-03','1982-07','1987-08','1987-11','1990-10','1999-12','2000-03','2000-08','2001-09','2002-09','2003-03','2007-06','2007-10','2008-06','2008-10','2009-03','2009-06','2009-12','2011-09','2015-08','2018-12','2020-02','2020-03','2020-06','2021-12','2022-06','2022-10','2023-06','2024-12','2025-04','2026-10']) show(d)
// drawdown episodes: equity weight during big spx drawdowns
console.log('== avg equity weight (applied) during worst buy&hold drawdown windows')
const wins = [['1973-01','1974-12'],['1980-11','1982-08'],['1987-08','1987-12'],['2000-08','2002-10'],['2007-10','2009-03'],['2020-01','2020-04'],['2022-01','2022-10']]
for (const [a, b] of wins) {
  const idx = M.map((m, i) => i).filter(i => M[i].d >= a && M[i].d <= b && i >= 2)
  const wr = avg(idx.map(i => EQ[tierOf(radarScore(M[i - 2], NINE))])), wm = avg(idx.map(i => EQ[M[i - 2].mastersRt]))
  const spx = idx.reduce((w, i) => w * (1 + (M[i].ret?.spx ?? 0)), 1) - 1
  console.log(a, b, 'spx', (spx * 100).toFixed(1) + '%', 'radar eq', wr.toFixed(2), 'masters eq', wm.toFixed(2))
}
// data sanity: jumps & gaps in dump (monthly values per indicator)
console.log('== sanity: per indicator min/max, largest m/m jump, stale run')
for (const id of [...NINE, 'cape']) {
  const xs = M.map(m => m.ind[id]).filter(Boolean)
  const v = xs.map(x => x.v); let jump = 0, jd = ''
  M.forEach((m, i) => { if (i && m.ind[id] && M[i - 1].ind[id]) { const j = Math.abs(m.ind[id].v - M[i - 1].ind[id].v); if (j > jump) { jump = j; jd = m.d } } })
  // observation lag in months at signal date
  const lags = M.filter(m => m.ind[id]).map(m => (Number(m.d.slice(0, 4)) * 12 + Number(m.d.slice(5, 7))) - (Number(m.ind[id].o.slice(0, 4)) * 12 + Number(m.ind[id].o.slice(5, 7))))
  console.log(id.padEnd(13), 'n', xs.length, 'min', Math.min(...v).toFixed(2), 'max', Math.max(...v).toFixed(2), 'maxJump', jump.toFixed(2), '@', jd, 'obsLag(min/max/mode)', Math.min(...lags), Math.max(...lags))
}
