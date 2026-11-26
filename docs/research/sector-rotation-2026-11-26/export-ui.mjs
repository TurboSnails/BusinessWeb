#!/usr/bin/env node
// 从 L-037 的 results.json 抽出「板块轮动」页签要展示的数字，写到 src/features/strategy-lab/data/sector-rotation.json。
// 用法：node docs/research/sector-rotation-2026-11-26/export-ui.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const d = JSON.parse(readFileSync(here('./results.json'), 'utf8'))
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]))
const S = ['sharpe', 'cagr', 'vol', 'maxDd']
const out = {
  generatedFrom: 'docs/research/sector-rotation-2026-11-26/results.json',
  main: Object.fromEntries(['S1', 'S2'].map(k => {
    const m = d.main[k]
    return [k, {
      cand: pick(m.vsEW.full.cand, S), ew: pick(m.vsEW.full.bench, S), mkt: pick(m.vsMKT.full.bench, S),
      dS: {
        full: m.vsEW.full.dS, half1: m.vsEW.half1.dS, half2: m.vsEW.half2.dS, post2000: m.vsEW.post2000.dS,
        mktFull: m.vsMKT.full.dS, mktPost2000: m.vsMKT.post2000.dS, mktPost2011: m.vsMKT.post2011.dS, delay: m.delay.dS,
        etfEw: m.etf.vsEW9.full.dS, etfSpy: m.etf.vsSPY.full.dS, etfSpyPost2011: m.etf.vsSPY.post2011.dS,
      },
      post2011: { cagr: m.vsMKT.post2011.cand.cagr, mktCagr: m.vsMKT.post2011.bench.cagr },
      turnover: m.turnoverPerYear, pHolm: m.placebo.pHolm, gates: m.gates, verdict: m.verdict,
      current: m.current, currentEtf: m.etf.current,
    }]
  })),
  ewVsMktPost2011: d.report.ewVsMkt.post2011.dS,
  cost03Post2000: { S1: d.report['cost0.003'].S1.post2000.dS, S2: d.report['cost0.003'].S2.post2000.dS },
}
writeFileSync(here('../../../src/features/strategy-lab/data/sector-rotation.json'), JSON.stringify(out, null, 2) + '\n')
console.log('已写 src/features/strategy-lab/data/sector-rotation.json')
