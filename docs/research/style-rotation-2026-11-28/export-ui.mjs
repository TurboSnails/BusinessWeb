#!/usr/bin/env node
// L-042 → 页面数据 src/features/strategy-lab/data/style-rotation.json（只取页面要显示的数字）。
// 用法：node docs/research/style-rotation-2026-11-28/export-ui.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const res = JSON.parse(readFileSync(here('./results.json'), 'utf8'))
const post = JSON.parse(readFileSync(here('./posthoc.json'), 'utf8'))
const r = (x, d = 4) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d)
const W = ['dxus', 'em', 'us']
const out = { windows: res.windows, candidates: {}, markets: {}, posthoc: {}, report: {} }
for (const k of ['R1', 'R2']) {
  const c = res.candidates[k]
  out.candidates[k] = { verdict: c.verdict, p: r(c.p), pHolm: r(c.pHolm), gates: c.gates, sub: Object.fromEntries(Object.entries(res.markets.dxus[k].sub).map(([a, b]) => [a, r(b)])), share: Object.fromEntries(Object.entries(res.markets.dxus[k].share).map(([a, b]) => [a, r(b, 3)])) }
}
for (const w of W) {
  const m = res.markets[w]
  out.markets[w] = { months: m.months, MKT: { sharpe: r(m.MKT.sharpe), maxDd: r(m.MKT.maxDd), cagr: r(m.MKT.cagr) } }
  for (const k of ['B0', 'R1', 'R2']) out.markets[w][k] = { sharpe: r(m[k].sharpe), maxDd: r(m[k].maxDd), cagr: r(m[k].cagr), turnover: r(m[k].turnover, 2), ...(m[k].dS != null ? { dS: r(m[k].dS) } : {}) }
  out.posthoc[w] = Object.fromEntries(['static', 'B0', 'R1', 'R2'].map(k => [k, { sharpe: r(post[w][k].sharpe), maxDd: r(post[w][k].maxDd), cagr: r(post[w][k].cagr), turnover: r(post[w][k].turnover, 2) }]))
}
out.posthoc.sub = Object.fromEntries(Object.entries(post.dxus.sub).map(([s, v]) => [s, Object.fromEntries(Object.entries(v).map(([k, x]) => [k, r(x)]))]))
for (const key of ['cost0.3', 'L1', 'L6']) out.report[key] = Object.fromEntries(W.map(w => [w, { R1: r(res.report[key][w].R1), R2: r(res.report[key][w].R2) }]))
for (const key of ['top2', 'top4']) out.report[key] = Object.fromEntries(W.map(w => [w, r(res.report[key][w])]))
out.report.ls = Object.fromEntries(Object.entries(res.report.ls_tsmom).map(([g, v]) => [g, { tsm: r(v.sharpe_tsm), ew: r(v.sharpe_ew), dS: r(v.dS) }]))
writeFileSync(here('../../../src/features/strategy-lab/data/style-rotation.json'), `${JSON.stringify(out, null, 2)}\n`)
console.log('ok')
