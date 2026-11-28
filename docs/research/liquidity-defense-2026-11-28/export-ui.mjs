#!/usr/bin/env node
// L-047 → src/features/strategy-lab/data/liquidity-defense.json
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const res = JSON.parse(readFileSync(here('./results.json'), 'utf8'))
const r = (x, d = 4) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d)
const out = { candidates: {}, report: {} }
for (const [k, v] of Object.entries(res.candidates)) {
  out.candidates[k] = {
    verdict: v.verdict, gates: v.gates, sharpe: r(v.sharpe), sharpeB0: r(v.sharpe_B0), sharpeBc: r(v.sharpe_Bc), dS: r(v.dS),
    maxdd: r(v.maxdd), maxddB0: r(v.maxdd_B0), maxddBc: r(v.maxdd_Bc), avgExposure: r(v.avg_exposure, 3), L: r(v.L_vs_Bc, 3),
    halves: v.halves_dS.map(x => r(x)), p: r(v.p, 3), pHolm: r(v.pHolm, 3), triggerDays: v.trigger_days, daysReduced: v.days_reduced,
    episodes: v.episodes.map((e, i) => ({ from: e[0], to: e[1], cand: r(v.ep_loss_cand[i], 3), bc: r(v.ep_loss_Bc[i], 3) })),
  }
}
for (const [k, v] of Object.entries(res.report)) {
  out.report[k] = { firstTriggers: v.first_triggers, forward: Object.fromEntries(Object.entries(v.forward).map(([h, x]) => [h, { mean: r(x.mean), neg: r(x.neg_share, 3) }])), cost03: r(v['cost0.3_dS']), hold10: r(v.hold10_dS), hold40: r(v.hold40_dS) }
}
writeFileSync(here('../../../src/features/strategy-lab/data/liquidity-defense.json'), `${JSON.stringify(out, null, 2)}\n`)
console.log('ok')
