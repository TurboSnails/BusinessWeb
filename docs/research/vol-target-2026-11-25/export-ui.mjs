#!/usr/bin/env node
// 从 results.json 与 explore.json 抽出「研究中」页签的数字，写到 src/features/strategy-lab/data/vol-target.json。
// 用法：node docs/research/vol-target-2026-11-25/export-ui.mjs（先跑 run.mjs 与 explore.mjs）
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const r = JSON.parse(readFileSync(here('./results.json'), 'utf8'))
const x = JSON.parse(readFileSync(here('./explore.json'), 'utf8'))
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]))
const ids = ['base', 'VT1', 'VT2', 'VT3']
const STAT = ['cagr', 'sharpe', 'sharpeNet', 'dailyMaxDd', 'monthlyMaxDd', 'avgEquity', 'tradesPerYear', 'turnoverPerYear']
const out = {
  generatedFrom: 'docs/research/vol-target-2026-11-25/results.json',
  window: r.window,
  sigmaNow: r.sigmaNow,
  strategies: Object.fromEntries(ids.map(id => [id, { full: pick(r.full[id], STAT), train: pick(r.train[id], ['sharpeNet', 'dailyMaxDd']), valid: pick(r.valid[id], ['sharpeNet', 'dailyMaxDd']), without2020: r.without2020[id] }])),
  bootstrap: Object.fromEntries(['VT1', 'VT2', 'VT3'].map(id => [id, pick(r.bootstrap[id], ['point', 'low', 'high', 'p', 'holm'])])),
  verdict: r.verdict,
  standalone: Object.fromEntries(Object.entries(r.standalone).map(([k, v]) => [k, { static70: pick(v.static70, STAT), static70xK: pick(v.static70xK, STAT) }])),
  riskMatched: Object.fromEntries(Object.entries(x).map(([id, o]) => [id, { scale: o.scale, baseScaled: pick(o.baseScaled, STAT), candidate: pick(o.candidate, STAT) }])),
  events: r.events.map((e, i) => ({
    peak: e.peak, trough: e.trough, spxLoss: e.spxLoss,
    loss: { ...Object.fromEntries(ids.map(id => [id, e.byStrat[id].loss])), baseScaled: x.VT3.events[i].loss },
    gain: { ...Object.fromEntries(ids.map(id => [id, e.byStrat[id].gain])), baseScaled: x.VT3.events[i].gain },
  })),
}
const target = here('../../../src/features/strategy-lab/data/vol-target.json')
writeFileSync(target, JSON.stringify(out, null, 2) + '\n')
console.log(`写入 ${target}`)
