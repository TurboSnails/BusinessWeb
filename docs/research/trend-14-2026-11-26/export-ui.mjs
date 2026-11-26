#!/usr/bin/env node
// 从 results.json 抽出「研究中」页签要展示的数字，写到 src/features/strategy-lab/data/trend-14.json。
// 用法：node docs/research/trend-14-2026-11-26/export-ui.mjs（先跑 run.py）
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const r = JSON.parse(readFileSync(here('./results.json'), 'utf8'))
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]))
const cand = k => ({
  ...pick(r[k], ['n', 'L', 'Lstar', 'wins', 'dE', 'posE', 'calm', 'dCER', 'switchesPerYear', 'pHolm', 'gates', 'verdict', 'halves']),
  lag2: pick(r[k].lag2, ['L', 'dE']),
})
const out = {
  generatedFrom: 'docs/research/trend-14-2026-11-26/results.json',
  ledger: r.study,
  countries: r.countries.length,
  shifts: r.placebo.shifts,
  C1: cand('C1'),
  C2: cand('C2'),
  fresh: { C1: pick(r.report.freshSample.C1, ['n', 'L', 'dE']), C2: pick(r.report.freshSample.C2, ['n', 'L', 'dE']) },
  perCountry: r.countries.map(c => ({ id: c, ...pick(r.report.perCountry[c].C1, ['n', 'L', 'wins', 'dE']), L2: r.report.perCountry[c].C2.L })),
}
writeFileSync(here('../../../src/features/strategy-lab/data/trend-14.json'), JSON.stringify(out, null, 2) + '\n')
console.log('已写 src/features/strategy-lab/data/trend-14.json')
