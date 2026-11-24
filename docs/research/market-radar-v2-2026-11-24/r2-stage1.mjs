// 只输出训练期，用于筛选
import { evalCfg, fmt, CANDS } from './r2.mjs'
const base = evalCfg({})
console.log('基线 radar-v1 '.padEnd(14), 'train', fmt(base.tr))
for (const [k, c] of Object.entries(CANDS)) {
  const r = evalCfg(c), ds = r.tr.sharpe - base.tr.sharpe, dd = (r.tr.maxDd - base.tr.maxDd) * 100
  console.log(k.padEnd(14), 'train', fmt(r.tr), '| dSharpe', ds.toFixed(3), 'dDD', dd.toFixed(1), ds >= 0.01 && dd >= -1 ? '过线' : '不过线')
}
