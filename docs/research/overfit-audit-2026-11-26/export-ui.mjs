#!/usr/bin/env node
// 从 results.json 抽出「研究中」页签要展示的数字，写到 src/features/strategy-lab/data/overfit-audit.json。
// 用法：node docs/research/overfit-audit-2026-11-26/export-ui.mjs（先跑 run.py）
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const r = JSON.parse(readFileSync(here('./results.json'), 'utf8'))
const { T1, T2, T3, T4 } = r
const out = {
  generatedFrom: 'docs/research/overfit-audit-2026-11-26/results.json',
  ledger: r.study,
  periods: r.periods,
  members: r.members,
  block: r.block,
  T1: {
    ir: T1.ir, irAnnual: T1.irAnnual, skew: T1.skew, kurtosis: T1.kurtosis, sharpe: T1.sharpe,
    byN: T1.byN.map(x => ({ N: x.N, irStar: x.irStar, dsr: x.dsr, minTRLYears: x.minTRLYears })),
    crossSectional: { dsr: T1.crossSectional.dsr, minTRLYears: T1.crossSectional.minTRLYears },
    forward: T1.forward,
    verdict: T1.verdict,
  },
  T2: {
    spa: T2.spa.consistent, spa24: T2.sensitivity.spa.consistent,
    stepmBetter: T2.stepmBetter, s0InStepm: T2.s0InStepm, stepmBetterSFamily: T2.stepmBetterSFamily,
    verdict: T2.verdict,
  },
  T3: { included: T3.included, pvalues: T3.pvalues, sharpe: T3.sharpe, included24: T3.sensitivity.included, verdict: T3.verdict },
  T4: {
    P: { pbo: T4.P.pbo, columns: T4.P.columns, gap: T4.P.oosSharpeGapMedian, rank: T4.P.trackHalfRankMedian, verdict: T4.P.verdict },
    S: { pbo: T4.S.pbo, columns: T4.S.columns },
  },
}
writeFileSync(here('../../../src/features/strategy-lab/data/overfit-audit.json'), JSON.stringify(out, null, 2) + '\n')
console.log('已写 src/features/strategy-lab/data/overfit-audit.json')
