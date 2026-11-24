#!/usr/bin/env node
// 探索性诊断（看过 run.mjs 结果后加的，不改变预注册结论）：
// 1) 卫星超额收益分段、分年代的 HAC 检验；2) 0.30% 成本下的组合；3) 超额收益的最大回撤（动量崩溃）。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const here = p => fileURLToPath(new URL(p, import.meta.url))
const ind = JSON.parse(readFileSync(here('./inputs-industry.json'), 'utf8'))
const us = JSON.parse(readFileSync(here('../macro-significance-2026-11-25/inputs.json'), 'utf8'))
const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length
const monthAfter = (d, k) => { const [y, m] = d.split('-').map(Number); const t = y * 12 + (m - 1) + k; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}` }
function normCdf(z) { const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2); return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y) }
function hac(x, lag = 12) { const T = x.length; const m = mean(x); const u = x.map(v => v - m); let s = u.reduce((a, v) => a + v * v, 0) / T; for (let l = 1; l <= lag; l += 1) { let c = 0; for (let t = l; t < T; t += 1) c += u[t] * u[t - l]; s += 2 * (1 - l / (lag + 1)) * c / T } const se = Math.sqrt(s / T); return { ann: m * 12, t: m / se, p: 2 * (1 - normCdf(Math.abs(m / se))) } }
const indRet = new Map(ind.returns.map(([d, c]) => [d, c.map(v => (v == null ? null : v / 100))]))
const firms = new Map(ind.firms); const size = new Map(ind.size)
const months = ind.returns.map(([d]) => d)
const N = ind.industries.length
function sat(look, top) {
  const out = new Map(); let prev = null
  for (const t of months) {
    const next = monthAfter(t, 1); const nr = indRet.get(next); if (!nr) continue
    const mom = Array.from({ length: N }, (_, i) => { let g = 1; for (let k = look - 1; k >= 1; k -= 1) { const r = indRet.get(monthAfter(t, -k))?.[i]; if (r == null) return null; g *= 1 + r } return g - 1 })
    const ranked = mom.map((v, i) => [v, i]).filter(([v, i]) => v != null && indRet.get(t)?.[i] != null).sort((a, b) => b[0] - a[0])
    if (ranked.length < top + 5) continue
    const w = new Array(N).fill(0); ranked.slice(0, top).forEach(([, i]) => { w[i] = 1 / top })
    const turnover = prev ? w.reduce((s, x, i) => s + Math.abs(x - prev[i]), 0) : 1
    out.set(next, { gross: w.reduce((s, x, i) => s + x * (nr[i] ?? 0), 0), turnover, names: ranked.slice(0, top).map(([, i]) => ind.industries[i]) })
    const g = w.map((x, i) => x * (1 + (nr[i] ?? 0))); const tot = g.reduce((s, x) => s + x, 0); prev = g.map(x => x / tot)
  }
  return out
}
const vw = new Map()
for (const t of months) { const r = indRet.get(t); const f = firms.get(t); const s = size.get(t); if (!r || !f || !s) continue; let n = 0; let d = 0; r.forEach((v, i) => { const c = (f[i] ?? 0) * (s[i] ?? 0); if (v != null && c > 0) { n += c * v; d += c } }); if (d > 0) vw.set(t, n / d) }
for (const [id, look, top] of [['S1', 12, 5], ['S3', 12, 10]]) {
  const s = sat(look, top)
  const ms = [...s.keys()].filter(d => vw.has(d)).sort()
  for (const cost of [0.001, 0.003]) {
    const act = ms.map(d => s.get(d).gross - cost * s.get(d).turnover - vw.get(d))
    const seg = (a, b) => { const idx = ms.map((d, i) => (d >= a && d < b ? i : -1)).filter(i => i >= 0); return hac(idx.map(i => act[i])) }
    const f = x => `${(x.ann * 100).toFixed(2)}%（t ${x.t.toFixed(2)}）`
    console.log(`${id} 成本 ${cost * 100}%：1927–1999 ${f(seg('1900', '2000'))} | 2000–2026 ${f(seg('2000', '2027'))} | 2000–2012 ${f(seg('2000', '2013'))} | 2013–2026 ${f(seg('2013', '2027'))}`)
    let w = 1; let peak = 1; let dd = 0; let at = ''
    ms.forEach((d, i) => { w *= 1 + act[i]; if (w > peak) peak = w; if (w / peak - 1 < dd) { dd = w / peak - 1; at = d } })
    console.log(`   超额收益最大回撤 ${(dd * 100).toFixed(1)}%（谷底 ${at}）`)
  }
  const last = s.get([...s.keys()].sort().at(-1))
  console.log(`   最近持有：${last.names.join('、')}`)
}
