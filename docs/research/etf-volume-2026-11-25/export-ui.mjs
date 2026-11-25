#!/usr/bin/env node
// 从 results.json 抽出「研究中」页签的数字，写到 src/features/strategy-lab/data/etf-volume.json。
// 用法：node docs/research/etf-volume-2026-11-25/export-ui.mjs（先跑 run.mjs）
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const r = JSON.parse(readFileSync(here('./results.json'), 'utf8'))
const FULL = r.windows[0][0]
const avg = (k, f) => r.results.reduce((s, x) => s + f(x, k), 0) / r.results.length
const out = {
  generatedFrom: 'docs/research/etf-volume-2026-11-25/results.json',
  dataMismatch: r.reproduction.detail.filter(d => !d.ok).map(d => d.code),
  summary: r.summary,
  decision: r.decision,
  exposure: Object.fromEntries(['base', 'V1', 'V2', 'V3'].map(k => [k, avg(k, (x, key) => x.exposure[key])])),
  rows: r.results.map(x => ({
    code: x.code, name: x.name,
    hold: x.windows[FULL].hold, base: x.windows[FULL].base, V1: x.windows[FULL].V1, V2: x.windows[FULL].V2, V3: x.windows[FULL].V3,
    both: Object.fromEntries(Object.entries(x.verdict).map(([k, v]) => [k, v.both])),
  })),
}
writeFileSync(here('../../../src/features/strategy-lab/data/etf-volume.json'), JSON.stringify(out, null, 1) + '\n')
console.log('写入 src/features/strategy-lab/data/etf-volume.json')
