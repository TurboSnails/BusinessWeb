#!/usr/bin/env node
// 从 L-041 的 results.json 抽出「研究中」要展示的数字，写到 src/features/strategy-lab/data/tier-switch.json。
// 用法：node docs/research/tier-switch-tilt-2026-11-28/export-ui.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const d = JSON.parse(readFileSync(here('./results.json'), 'utf8'))
const t = JSON.parse(readFileSync(here('./inputs/tiers.json'), 'utf8'))
const out = { generatedFrom: 'docs/research/tier-switch-tilt-2026-11-28/results.json', counts: t.counts }
for (const k of ['C1', 'C2']) {
  const o = d[k]; const s = o.main.stats
  out[k] = {
    verdict: o.verdict, gates: o.gates, pHolm: o.placebo.pHolm,
    main: { sharpe: { cand: s.switch.sharpe, B0: s.B0.sharpe, static: s.static.sharpe }, maxDd: { cand: s.switch.maxDd, B0: s.B0.maxDd, static: s.static.maxDd }, dS_B0: o.main.dS_B0, dS_static: o.main.dS_static },
    secondary: o.secondary.dS_B0, veto: o.veto.dS_B0, vetoSub: o.vetoSub,
    split: Object.fromEntries(['main', 'secondary', 'veto'].map(w => [w, { defOnly: o[w].dS_defOnly, offOnly: o[w].dS_offOnly }])),
    sideExcess: { main: o.sideExcess.main, veto: o.sideExcess.veto },
    lag2: o.lag2, cost3: o['cost0.003'],
  }
}
writeFileSync(here('../../../src/features/strategy-lab/data/tier-switch.json'), JSON.stringify(out, null, 2) + '\n')
console.log('已写 src/features/strategy-lab/data/tier-switch.json')
