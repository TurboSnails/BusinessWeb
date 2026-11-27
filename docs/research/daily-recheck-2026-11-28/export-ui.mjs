#!/usr/bin/env node
// 从 L-040 的 results.json（和原研究的 results.json）抽出「通过检验」页要展示的数字，
// 写到 src/features/strategy-lab/data/daily-recheck.json。
// 用法：node docs/research/daily-recheck-2026-11-28/export-ui.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const read = p => JSON.parse(readFileSync(here(p), 'utf8'))
const d = read('./results.json')
const o1 = read('../sector-rotation-2026-11-26/results.json').main
const o2 = read('../defensive-tilt-2026-11-26/results.json').results
const cmp = d.report.dailyVsMonthEnd
const wk1 = d.report.weekly['R1_cost0.001']
const wk3 = d.report.weekly['R1_cost0.003']

const sector = Object.fromEntries(['S1', 'S2'].map(k => {
  const r = d.R1[k]; const p = r.periods; const o = o1[k]
  return [k, {
    verdict: r.verdict,
    gates: r.gates,
    daily: { full: p.full.dS_ew, half1: p.half1.dS_ew, half2: p.half2.dS_ew, post2000: p.post2000.dS_ew, mktFull: p.full.dS_mkt, mktPost2000: p.post2000.dS_mkt, delay: r.delay.dS_ew },
    monthly: { full: o.vsEW.full.dS, half1: o.vsEW.half1.dS, half2: o.vsEW.half2.dS, post2000: o.vsEW.post2000.dS, mktFull: o.vsMKT.full.dS, mktPost2000: o.vsMKT.post2000.dS, delay: o.delay.dS },
    maxDd: { daily: cmp.R1[k].maxDdDaily, monthEnd: cmp.R1[k].maxDdMonthEnd },
    weekly: {
      full: wk1[k].periods.full.dS_weekly_vs_monthly, half1: wk1[k].periods.half1.dS_weekly_vs_monthly,
      half2: wk1[k].periods.half2.dS_weekly_vs_monthly, post2000: wk1[k].periods.post2000.dS_weekly_vs_monthly,
      fullCost03: wk3[k].periods.full.dS_weekly_vs_monthly, turnover: wk1[k].turnoverPerYear, turnoverMonthly: r.turnoverPerYear,
    },
  }]
}))
sector.EW = { maxDd: { daily: cmp.R1.EW.maxDdDaily, monthEnd: cmp.R1.EW.maxDdMonthEnd } }
sector.MKT = { maxDd: { daily: cmp.R1.MKT.maxDdDaily, monthEnd: cmp.R1.MKT.maxDdMonthEnd } }

const tilt = Object.fromEntries(['P1', 'P2'].map(k => {
  const r = d.R2[k]; const m = r.main; const o = o2[k].main
  return [k, {
    verdict: r.verdict,
    gates: r.gates,
    daily: { sharpeS: m.S.sharpe, sharpeM: m.M.sharpe, maxDdS: m.S.maxDd, maxDdMstar: m.Mstar.maxDd, L: m.L, k: m.k },
    monthly: { sharpeS: o.S.sharpe, sharpeM: o.M.sharpe, maxDdS: o.S.maxDd, maxDdMstar: o.Mstar.maxDd, L: o.L, k: o.k },
    weekly: { dS: d.report.weekly.R2[k].dS, turnover: d.report.weekly.R2[k].weekly.turnoverPerYear, turnoverMonthly: d.report.weekly.R2[k].monthly.turnoverPerYear },
  }]
}))

const crashes = Object.fromEntries(Object.entries(d.report.crashes).map(([label, v]) => [label, { daily: { S1: v.S1, S2: v.S2, EW: v.EW, MKT: v.MKT }, monthEnd: v.monthEnd }]))

const out = { generatedFrom: 'docs/research/daily-recheck-2026-11-28/results.json', sector, tilt, crashes }
writeFileSync(here('../../../src/features/strategy-lab/data/daily-recheck.json'), JSON.stringify(out, null, 2) + '\n')
console.log('已写 src/features/strategy-lab/data/daily-recheck.json')
