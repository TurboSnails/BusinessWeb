// 雷达各档位之后的标普回报（线上 radar-v1 规则），以及只看估值+拥挤度的「热度」分组
import { M, TIERS, avg } from './lib.mjs'
import { signal } from './r2.mjs'
const fwd = (i, n) => { let w = 1; for (let k = i + 2; k < i + 2 + n; k++) { if (!M[k]?.ret) return null; w *= 1 + M[k].ret.spx } return w - 1 }
const dd = (i, n) => { let w = 1, pk = 1, worst = 0; for (let k = i + 2; k < i + 2 + n; k++) { if (!M[k]?.ret) return null; w *= 1 + M[k].ret.spx; pk = Math.max(pk, w); worst = Math.min(worst, w / pk - 1) } return worst }
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
const table = (label, key, groups) => {
  console.log('==', label)
  for (const g of groups) for (const [era, a, b] of [['全样本', '1973', '2027'], ['1973–1999', '1973', '2000'], ['2000–', '2000', '2027']]) {
    const f = [], d = []
    M.forEach((m, i) => { if (m.d < a || m.d >= b || key(m) !== g) return; const x = fwd(i, 12), y = dd(i, 12); if (x != null) { f.push(x); d.push(y) } })
    if (f.length) console.log(String(g).padEnd(13), era.padEnd(10), `n${String(f.length).padStart(3)}  12个月均值 ${(avg(f) * 100).toFixed(1)}%  中位 ${(med(f) * 100).toFixed(1)}%  为负 ${(f.filter(x => x < 0).length / f.length * 100).toFixed(0)}%  期间平均最大回撤 ${(avg(d) * 100).toFixed(1)}%`)
  }
}
table('雷达档位', m => signal(m, {}).tier, TIERS)
const heat = m => { const d = signal(m, {}).dim; const s = avg([d.valuation, d.crowding].filter(x => x != null)); return s == null ? null : s <= -0.5 ? '偏热' : s >= 0.5 ? '偏冷' : '居中' }
table('热度（估值+拥挤度）', heat, ['偏冷', '居中', '偏热'])
