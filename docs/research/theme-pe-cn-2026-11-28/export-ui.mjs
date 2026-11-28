#!/usr/bin/env node
// L-052 → src/features/strategy-lab/data/theme-pe-cn.json（只导出页面展示用的汇总数字）
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const res = JSON.parse(readFileSync(here('./results.json'), 'utf8'))
const r = (x, d = 4) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d)

const mv = res.metrics.validate
const net = k => ({ cagr: r(mv[k].net.cagr), vol: r(mv[k].net.vol), sharpe: r(mv[k].net.sharpe, 3), maxdd: r(mv[k].net.maxdd), costAnn: mv[k].costAnn == null ? null : r(mv[k].costAnn) })
const cand = k => {
  const h = res.headline[k]
  const j = res.judgments[k].net
  return {
    grade: h.grade, L: r(h.L, 3), sharpeB1star: r(h.sharpeB1star, 3),
    pass: { c1: j.c1.pass, c2: j.c2.pass, c3: j.c3.pass, c4: j.c4.pass },
    vs4: j.c4.detail.vs,
    placeboP: r(res.placebo.randomIndustry[k].p.L, 3), holm: r(res.placebo.holm[k], 3),
  }
}
const dec = res.decomposition.C1a_vs_B1.validate
const out = {
  verdict: { C1a: res.verdict.C1a, C1b: res.verdict.C1b },
  window: res.params.windows.validate,
  rows: { C1a: net('C1a'), C1b: net('C1b'), B0: net('B0'), B1: net('B1'), B2p: net('B2p'), B2b: net('B2b'), B4: net('B4') },
  C1a: cand('C1a'),
  C1b: cand('C1b'),
  decomposition: {
    totalAnn: r(dec.totalDiffAnn), emptyMonths: dec.emptyMonths.n, emptyAnn: r(dec.emptyMonths.contribAnn),
    heldMonths: dec.heldMonths.n, heldAnn: r(dec.heldMonths.contribAnn),
  },
  power: { C1a: res.power.C1a['power_alpha_0.10'], C1b: res.power.C1b['power_alpha_0.10'] },
  trials: res.trials.nRecorded,
}
writeFileSync(here('../../../src/features/strategy-lab/data/theme-pe-cn.json'), `${JSON.stringify(out, null, 2)}\n`)
console.log('ok')
