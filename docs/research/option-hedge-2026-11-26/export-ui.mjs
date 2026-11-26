#!/usr/bin/env node
// 从 results.json 抽出「研究中」页签要展示的数字，写到 src/features/strategy-lab/data/option-hedge.json。
// 用法：node docs/research/option-hedge-2026-11-26/export-ui.mjs（先跑 run.py）
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const r = JSON.parse(readFileSync(here('./results.json'), 'utf8'))
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]))
const STATS = ['cagr', 'vol', 'maxDd', 'sharpe']
const cand = c => ({
  ...pick(c, ['from', 'to', 'w', 'L', 'wins', 'n', 'deltaA', 'deltaSharpe', 'Lfirst', 'Lsecond', 'verdict', 'gates']),
  cand: pick(c.cand, STATS), M: pick(c.M, STATS), B80: pick(c.B80, STATS),
  costly: pick(c.costly, ['L', 'deltaA']),
  from1990: pick(c.from1990, ['L', 'wins', 'n', 'deltaA']),
  drop1987: pick(c.drop1987, ['L', 'wins', 'n']),
  sameLoss: pick(c.report.sameLoss, ['w', 'deltaA']),
  Mmon: pick(c.report.Mmon, ['w', 'L', 'wins', 'deltaA']),
  Mex: pick(c.report.Mex, ['w', 'L', 'wins', 'deltaA']),
  looRange: c.report.looRange,
  events: c.events.map(e => pick(e, ['peak', 'trough', 'depth', 'cand', 'm', 'b80', 'after60'])),
})
const explore = Object.fromEntries(Object.entries(r.explore).map(([k, v]) => [k, {
  ...pick(v, ['from', 'to', 'w', 'L', 'wins', 'n', 'deltaA']), sameLossDeltaA: v.report.sameLoss?.deltaA ?? null,
}]))
const out = {
  generatedFrom: 'docs/research/option-hedge-2026-11-26/results.json',
  ledger: r.study,
  events: r.events.map(e => pick(e, ['peak', 'trough', 'depth'])),
  confirm: { PPUT: cand(r.confirm.PPUT), CLLZ: cand(r.confirm.CLLZ) },
  explore,
}
writeFileSync(here('../../../src/features/strategy-lab/data/option-hedge.json'), JSON.stringify(out, null, 2) + '\n')
console.log('已写 src/features/strategy-lab/data/option-hedge.json')
