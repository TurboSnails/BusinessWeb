#!/usr/bin/env node
// 从 results.json 抽出「研究中」页签要展示的数字，写到 src/features/strategy-lab/data/daily-execution.json。
// 用法：node docs/research/daily-execution-2026-11-25/export-ui.mjs（先跑 run.mjs）
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const r = JSON.parse(readFileSync(here('./results.json'), 'utf8'))
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]))
const ids = ['M', 'D1', 'D2', 'D3']
const out = {
  generatedFrom: 'docs/research/daily-execution-2026-11-25/results.json',
  window: r.window,
  answer: r.answer,
  strategies: Object.fromEntries(ids.map(id => [id, {
    full: pick(r.full[id], ['cagr', 'sharpe', 'sharpeNet', 'dailyMaxDd', 'monthlyMaxDd', 'avgEquity', 'tradesPerYear', 'turnoverPerYear']),
    train: pick(r.train[id], ['sharpeNet', 'dailyMaxDd']),
    valid: pick(r.valid[id], ['sharpeNet', 'dailyMaxDd']),
  }])),
  bootstrap: Object.fromEntries(['D1', 'D2', 'D3'].map(id => [id, pick(r.bootstrap[id], ['point', 'low', 'high', 'p', 'holm'])])),
  verdict: r.verdict,
  events: r.events.map(e => ({
    peak: e.peak, trough: e.trough, spxLoss: e.spxLoss,
    loss: Object.fromEntries(ids.map(id => [id, e.byStrat[id].loss])),
    gain: Object.fromEntries(ids.map(id => [id, e.byStrat[id].gain])),
  })),
}
const target = here('../../../src/features/strategy-lab/data/daily-execution.json')
writeFileSync(target, JSON.stringify(out, null, 2) + '\n')
console.log(`写入 ${target}`)
