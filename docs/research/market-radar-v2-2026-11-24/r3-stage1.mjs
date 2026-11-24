import { RULES, evalRule, fmt } from './r3.mjs'
const base = evalRule('基线 宏观攻守')
for (const name of Object.keys(RULES)) { const r = evalRule(name), ds = r.tr.sharpe - base.tr.sharpe, dd = (r.tr.maxDd - base.tr.maxDd) * 100
  console.log(name.padEnd(16), '训练期', fmt(r.tr), name.startsWith('基线') ? '' : `| dSharpe ${ds.toFixed(3)} dDD ${dd.toFixed(1)} ${ds >= 0.01 && dd >= -1 ? '过线' : '不过线'}`) }
