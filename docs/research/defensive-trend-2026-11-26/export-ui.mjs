#!/usr/bin/env node
// 从 results.json 抽出「研究中」页签要展示的数字，写到 src/features/strategy-lab/data/defensive-trend.json。
// 用法：node docs/research/defensive-trend-2026-11-26/export-ui.mjs（先跑 run.py）
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const r = JSON.parse(readFileSync(here('./results.json'), 'utf8'))
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]))
const KEYS = ['dS', 'dSUnits', 'positiveShare', 'positiveUnits', 'units', 'rising', 'first', 'second', 'bearL', 'gates', 'verdict']
const out = {
  generatedFrom: 'docs/research/defensive-trend-2026-11-26/results.json',
  ledger: r.study,
  countries: r.countries.length,
  C1: { ...pick(r.summary.C1, [...KEYS, 'dedrift', 'placeboP', 'inBond', 'switchesPerYear']) },
  C2: pick(r.summary.C2, KEYS),
  perCountry: r.countries.map(c => {
    const p = r.perCountry[c]
    return { id: c, from: p.from, to: p.to, C1: pick(p.C1, ['dS', 'rising']), C2: pick(p.C2, ['dS', 'rising']) }
  }),
}
writeFileSync(here('../../../src/features/strategy-lab/data/defensive-trend.json'), JSON.stringify(out, null, 2) + '\n')
console.log('已写 src/features/strategy-lab/data/defensive-trend.json')
