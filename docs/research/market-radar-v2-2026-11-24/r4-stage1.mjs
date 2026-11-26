// 第四轮训练期筛选（只看 1973–1999）。
import { RULES, evalFn, fmt } from './r4.mjs'
const base = evalFn(RULES['基线 radar-v1'])
for (const [name, fn] of Object.entries(RULES)) { const r = evalFn(fn), ds = r.tr.sharpe - base.tr.sharpe, dd = (r.tr.maxDd - base.tr.maxDd) * 100
  console.log(name.padEnd(20), '训练期', fmt(r.tr), name.startsWith('基线') ? '' : `| dSharpe ${ds.toFixed(3)} dDD ${dd.toFixed(1)} ${ds >= 0.01 && dd >= -1 ? '过线' : '不过线'}`) }
