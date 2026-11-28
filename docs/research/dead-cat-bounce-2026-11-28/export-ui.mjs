#!/usr/bin/env node
// L-051 → src/features/strategy-lab/data/dead-cat-bounce.json（只导出页面展示用的汇总数字）
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const res = JSON.parse(readFileSync(here('./results.json'), 'utf8'))
const h3 = JSON.parse(readFileSync(here('./counts_h3.json'), 'utf8'))
const r = (x, d = 4) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d)

const row = (x, n) => ({
  events: n,
  mean: r(x.inference.mean_x60), t: r(x.inference.nw_t, 2),
  s1: x.S1.pass, s2: x.S2.pass, s3: x.S3.pass, s5: x.S5.pass,
  volRatio: r(x.S3.detail.vol_ratio, 3), avoidNet: r(x.S5.detail.avoid_net_mean),
  grade: x.grade,
})
const layer = key => {
  const L = res.layers[key]
  return {
    from: L.meta.date_start.slice(0, 4), to: key === 'validate' ? '2023-10' : L.meta.date_end.slice(0, 4),
    C1: row(L.C1, L.meta.n_events_C1),
    C2lo: row(L.C2.bound_lo, L.meta.n_events_C2_lo),
    C2hi: row(L.C2.bound_hi, L.meta.n_events_C2_hi),
    C2grade: L.C2.grade,
  }
}
const v = res.layers.validate.C1
const out = {
  verdict: { C1: res.verdict.C1, C2: res.verdict.C2 },
  headline: {
    volFull: r(res.headline.pool_vol_full), volAvoid: r(res.headline.pool_vol_avoid),
    mddFull: r(res.headline.pool_mdd_full), mddAvoid: r(res.headline.pool_mdd_avoid),
    sharpeFull: r(v.S3.detail.sharpe_full, 3), sharpeAvoid: r(v.S3.detail.sharpe_avoid, 3),
    eventMean: r(v.inference.event_mean_excess),
  },
  layers: { explore: layer('explore'), validate: layer('validate') },
  costMean: r(v.S5.detail.cost_mean),
  trials: res.trials.n_recorded,
  h3: { stages: h3.main.stages, byYear: h3.main.lps_by_year },
}
writeFileSync(here('../../../src/features/strategy-lab/data/dead-cat-bounce.json'), `${JSON.stringify(out, null, 2)}\n`)
console.log('ok')
