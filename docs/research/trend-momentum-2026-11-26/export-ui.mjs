#!/usr/bin/env node
// 从 L-036 的 results.json 抽出「研究中」页签要展示的数字，写到 src/features/strategy-lab/data/trend-momentum.json。
// 用法：node docs/research/trend-momentum-2026-11-26/export-ui.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const d = JSON.parse(readFileSync(here('./results.json'), 'utf8'))
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]))
const S = ['sharpe', 'cagr', 'vol', 'maxDd', 'turnoverPerYear']
const out = {
  generatedFrom: 'docs/research/trend-momentum-2026-11-26/results.json',
  main: Object.fromEntries(['T1', 'T2'].map(k => {
    const m = d.main[k]
    return [k, {
      cand: pick(m.full.cand, S), bench: pick(m.full.bench, S),
      dS: { full: m.full.dS, half1: m.half1.dS, half2: m.half2.dS, post2010: m.post2010.dS, delay: m.delay.dS },
      pHolm: m.placebo.pHolm, gates: m.gates, verdict: m.verdict,
    }]
  })),
  bears: d.report.usBears,
  refs: Object.fromEntries(Object.entries(d.report.refs).map(([k, v]) => [k, { full: pick(v.full, ['sharpe', 'cagr', 'maxDd']), post2010: pick(v.post2010, ['sharpe', 'cagr', 'maxDd']) }])),
  explore: { fixedAvg: { T1: d.report.fixedAvg.T1.dS, T2: d.report.fixedAvg.T2.dS }, t2prime: { full: d.report.T2prime.full.dS, half2: d.report.T2prime.half2.dS } },
}
writeFileSync(here('../../../src/features/strategy-lab/data/trend-momentum.json'), JSON.stringify(out, null, 2) + '\n')
console.log('已写 src/features/strategy-lab/data/trend-momentum.json')
