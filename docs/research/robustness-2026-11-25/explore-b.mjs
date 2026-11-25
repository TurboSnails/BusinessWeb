#!/usr/bin/env node
// 事后探索（不在预注册内，不改变 B 项结论）：1959–1972 留出期本策略为什么输给恒定七成。
// 用法：node docs/research/robustness-2026-11-25/explore-b.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { BREAKERS, COMPONENTS, PILLARS, TIERS, applyTactical, pillarScore, scoreComponent, evaluate } from '../../../scripts/lib/macro-posture/model.mjs'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const input = JSON.parse(readFileSync(here('./inputs.json'), 'utf8'))
const EQ = Object.fromEntries(TIERS.map(t => [t.id, t.equityShare]))
const idx = id => TIERS.findIndex(t => t.id === id)
const monthAfter = (d, k) => { const [y, m] = d.split('-').map(Number); const t = y * 12 + m - 1 + k; return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, '0')}` }
const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length
const sv = xs => { const m = mean(xs); return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1) }
const returns = new Map(input.returns.map(([d, s, c]) => [d, { spx: s, cash: c }]))
function perf(port, cash) {
  let w = 1, pk = 1, dd = 0
  for (const r of port) { w *= 1 + r; pk = Math.max(pk, w); dd = Math.min(dd, w / pk - 1) }
  const ex = port.map((r, i) => r - cash[i])
  return { cagr: w ** (12 / port.length) - 1, maxDd: dd, sharpe: Math.sqrt(12) * mean(ex) / Math.sqrt(sv(ex)) }
}
const frames = input.holdout.filter(f => f.d >= '1959-09' && f.d <= '1972-12')
const variants = {
  production: f => evaluate({ components: f.components, tactical: { below: f.below } }).final.tier,
  macroOnly: f => evaluate({ components: f.components, tactical: { below: f.below } }).regime.tier,
  repairWithoutCreditConditions: f => {
    const res = evaluate({ components: f.components, tactical: { below: f.below } })
    const tactical = applyTactical(res.regime.tier, f.below)
    const baa = scoreComponent(COMPONENTS.find(c => c.id === 'baaChange'), f.components.baaChange)
    const ok = idx(tactical) >= 3 && f.below === false && Number.isFinite(baa) && baa >= 0
    return ok ? TIERS[idx(tactical) - 1].id : tactical
  },
}
const out = {}
for (const [id, tierOf] of Object.entries(variants)) {
  const rows = frames.map(f => ({ d: f.d, tier: tierOf(f), r: returns.get(monthAfter(f.d, 2)) })).filter(x => x.tier && x.r)
  const cash = rows.map(x => x.r.cash)
  out[id] = perf(rows.map(x => EQ[x.tier] * x.r.spx + (1 - EQ[x.tier]) * x.r.cash), cash)
}
// 逐年：本策略相对恒定七成的超额（百分点）
const rows = frames.map(f => ({ d: f.d, tier: variants.production(f), r: returns.get(monthAfter(f.d, 2)) }))
const byYear = {}
for (const x of rows) {
  const y = monthAfter(x.d, 2).slice(0, 4)
  byYear[y] ??= { s: 1, c: 1, eq: [] }
  byYear[y].s *= 1 + EQ[x.tier] * x.r.spx + (1 - EQ[x.tier]) * x.r.cash
  byYear[y].c *= 1 + 0.7 * x.r.spx + 0.3 * x.r.cash
  byYear[y].eq.push(EQ[x.tier])
}
out.byYear = Object.fromEntries(Object.entries(byYear).map(([y, v]) => [y, { excess: v.s - v.c, avgEquity: mean(v.eq) }]))
writeFileSync(here('./explore-b.json'), JSON.stringify(out, null, 2) + '\n')
const pct = x => `${(x * 100).toFixed(2)}%`
for (const id of Object.keys(variants)) console.log(id, pct(out[id].cagr), pct(out[id].maxDd), out[id].sharpe.toFixed(3))
console.log(Object.entries(out.byYear).map(([y, v]) => `${y} ${(v.excess * 100).toFixed(1)} (${Math.round(v.avgEquity * 100)}%)`).join(' | '))
