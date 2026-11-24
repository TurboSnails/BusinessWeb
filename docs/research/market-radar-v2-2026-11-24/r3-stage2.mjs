import { RULES, evalRule, fmt, heat } from './r3.mjs'
import { M, TIERS, avg } from './lib.mjs'
import { signal } from './r2.mjs'
for (const name of Object.keys(RULES)) { const r = evalRule(name); console.log(name.padEnd(16), '| 训练', fmt(r.tr), '| 验证', fmt(r.te), '| 全样本', fmt(r.fu)) }
// 宏观档位 × 雷达热度：之后 12 个月标普回报与期间最大回撤（信号月后隔一个月起算）
const fwd = (i, n) => { let w = 1; for (let k = i + 2; k < i + 2 + n; k++) { if (!M[k]?.ret) return null; w *= 1 + M[k].ret.spx } return w - 1 }
const dd = (i, n) => { let w = 1, pk = 1, worst = 0; for (let k = i + 2; k < i + 2 + n; k++) { if (!M[k]?.ret) return null; w *= 1 + M[k].ret.spx; pk = Math.max(pk, w); worst = Math.min(worst, w / pk - 1) } return worst }
const side = t => t === 'offense' || t === 'lean-offense' ? '进攻侧' : t === 'neutral' ? '中性' : '防守侧'
const H = { cold: '偏冷', mid: '居中', hot: '偏热' }
for (const [era, a, b] of [['全样本', '1973', '2027'], ['1973–1999', '1973', '2000'], ['2000–', '2000', '2027']]) {
  console.log('==', era, '（月数 / 之后12个月均值 / 为负比例 / 期间平均最大回撤）')
  for (const s of ['进攻侧', '中性', '防守侧']) {
    console.log(s.padEnd(4), ['cold', 'mid', 'hot'].map(h => {
      const f = [], d = []
      M.forEach((m, i) => { if (m.d < a || m.d >= b || side(m.mastersRt) !== s || heat(m) !== h) return; const x = fwd(i, 12); if (x != null) { f.push(x); d.push(dd(i, 12)) } })
      return `${H[h]} n${String(f.length).padStart(3)} ${f.length ? (avg(f) * 100).toFixed(1).padStart(5) + '% 负' + (f.filter(x => x < 0).length / f.length * 100).toFixed(0).padStart(2) + '% 回撤' + (avg(d) * 100).toFixed(1) : '      -'}`
    }).join('  |  '))
  }
}
// 一致 / 分歧
const side2 = t => TIERS.indexOf(t)
const groups = { '两者同档': [], '雷达更防守': [], '雷达更进攻': [] }
M.forEach((m, i) => { const r = signal(m, {}).tier; if (!r) return; const g = side2(r) === side2(m.mastersRt) ? '两者同档' : side2(r) > side2(m.mastersRt) ? '雷达更防守' : '雷达更进攻'; const x = fwd(i, 12); if (x != null) groups[g].push(x) })
for (const [k, f] of Object.entries(groups)) console.log(k, 'n' + f.length, (avg(f) * 100).toFixed(1) + '%', '为负', (f.filter(x => x < 0).length / f.length * 100).toFixed(0) + '%')
const last = M.at(-1); console.log('2026-10:', last.mastersRt, signal(last, {}).tier, heat(last), 'below', last.below, JSON.stringify(signal(last, {}).dim))
