#!/usr/bin/env node
// 从 L-032 与 L-033 的 results.json 抽出「研究中」页签要展示的数字，写到 src/features/strategy-lab/data/heat-liquidity.json。
// 用法：node docs/research/nasdaq-semis-heat-2026-11-26/export-ui.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const heat = JSON.parse(readFileSync(here('./results.json'), 'utf8'))
const liq = JSON.parse(readFileSync(here('../liquidity-2026-11-26/results.json'), 'utf8'))
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]))
const out = {
  generatedFrom: ['docs/research/nasdaq-semis-heat-2026-11-26/results.json', 'docs/research/liquidity-2026-11-26/results.json'],
  heat: Object.fromEntries(Object.entries(heat.main).map(([k, v]) => [k, {
    ...pick(v, ['n', 'from', 'to', 'beta', 'pLower', 'pUpper', 'pHolm', 'dR', 'dD', 'verdict']),
    current: heat.report.current[k],
  }])),
  liquidity: Object.fromEntries(['Q1', 'Q2'].map(k => [k, {
    ...pick(liq[k], ['start', 'halves', 'dSharpe', 'dMaxDd', 'changedMonths', 'verdict']),
    base: liq[k].base.map(b => pick(b, ['sharpe', 'maxDd'])),
    cand: liq[k].cand.map(b => pick(b, ['sharpe', 'maxDd'])),
    cagr: [liq[k].full.base.cagr, liq[k].full.cand.cagr],
    current: liq.report.current[k],
  }])),
}
writeFileSync(here('../../../src/features/strategy-lab/data/heat-liquidity.json'), JSON.stringify(out, null, 2) + '\n')
console.log('已写 src/features/strategy-lab/data/heat-liquidity.json')
