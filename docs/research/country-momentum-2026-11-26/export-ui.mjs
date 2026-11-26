#!/usr/bin/env node
// 从 L-034 与 L-035 的 results.json 抽出「研究中」页签要展示的数字，写到 src/features/strategy-lab/data/rotation-heat.json。
// 用法：node docs/research/country-momentum-2026-11-26/export-ui.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const cm = JSON.parse(readFileSync(here('./results.json'), 'utf8'))
const hm = JSON.parse(readFileSync(here('../heat-more-2026-11-26/results.json'), 'utf8'))
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]))
const S = ['sharpe', 'cagr', 'vol', 'maxDd', 'turnoverPerYear']
const period = p => ({ cand: pick(p.cand, S), bench: pick(p.bench, S), dS: p.dS, dCagr: p.dCagr })
const out = {
  generatedFrom: ['docs/research/country-momentum-2026-11-26/results.json', 'docs/research/heat-more-2026-11-26/results.json'],
  momentum: Object.fromEntries(['C1', 'C2'].map(k => {
    const m = cm.main[k]
    return [k, {
      full: period(m.full), half1: period(m.half1), half2: period(m.half2), post2014: period(m.post2014),
      pUpper: m.placebo.pUpper, pHolm: m.placebo.pHolm, gates: m.gates, verdict: m.verdict,
    }]
  })),
  usOnly: pick(cm.report.vsUS.C1.full.bench, S),
  vsUS: Object.fromEntries(Object.entries(cm.report.vsUS).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([p, x]) => [p, x.dS]))])),
  explore: {
    devx: { dS: cm.report.C1devx.full.dS, dSpost: cm.report.C1devx.post2014.dS, vsUS: cm.report.C1devx.vsUS.dS, usShare: cm.report.C1devx.usShare },
    absolute: { dS: cm.report.C1absolute.full.dS, dSpost: cm.report.C1absolute.post2014.dS, cashMonths: cm.report.C1absolute.cashMonths },
    lookback6: { C1: cm.report.lookback6.C1.dS, C2: cm.report.lookback6.C2.dS },
    cost0: { C1: cm.report['cost0.0'].C1.dS, C2: cm.report['cost0.0'].C2.dS },
  },
  heat: Object.fromEntries(Object.entries(hm.main).map(([k, v]) => [k, {
    ...pick(v, ['n', 'from', 'to', 'beta', 'pLower', 'pHolm', 'dR', 'dD', 'verdict']),
    current: hm.report.current[k],
  }])),
  p49: pick(hm.P49, ['from', 'to', 'months', 'betaBar', 'pLower', 'nNeg', 'industries', 'crash30', 'verdict']),
}
writeFileSync(here('../../../src/features/strategy-lab/data/rotation-heat.json'), JSON.stringify(out, null, 2) + '\n')
console.log('已写 src/features/strategy-lab/data/rotation-heat.json')
