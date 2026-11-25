#!/usr/bin/env node
// 从 results.json 抽出「研究中」页签的数字，写到 src/features/strategy-lab/data/multi-asset.json。
// 用法：node docs/research/multi-asset-2026-11-25/export-ui.mjs（先跑 research-py 的 engines.multi_asset）
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const r = JSON.parse(readFileSync(here('./results.json'), 'utf8'))
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]))
const M = ['vol', 'sharpe', 'cvar5', 'deepest3', 'dailyMaxDd', 'cagr', 'avgWeights']
const out = {
  generatedFrom: 'docs/research/multi-asset-2026-11-25/results.json',
  thresholds: r.thresholds,
  verdict: r.verdict,
  candidates: Object.fromEntries(Object.entries(r.candidates).map(([k, o]) => [k, {
    segments: Object.fromEntries(Object.entries(o.segments).map(([s, g]) => [s, { candidate: pick(g.candidate, M), b0: pick(g.b0, M), c: g.c, needsLeverage: g.needsLeverage, cmp: g.cmp, noninferior: g.noninferior, tailImproved: g.tailImproved }])),
    stress: o.stress, dedrift: o.dedrift, lockbox: { cmp: o.lockbox.cmp, noninferior: o.lockbox.noninferior },
    bootstrap: o.bootstrap, checks: o.checks, pass: o.pass,
  }])),
}
writeFileSync(here('../../../src/features/strategy-lab/data/multi-asset.json'), JSON.stringify(out, null, 1) + '\n')
console.log('写入 src/features/strategy-lab/data/multi-asset.json')
