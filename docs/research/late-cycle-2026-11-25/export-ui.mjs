#!/usr/bin/env node
// 从 results.json 抽出「研究中」页签要展示的数字，写到 src/features/strategy-lab/data/late-cycle.json。
// 用法：node docs/research/late-cycle-2026-11-25/export-ui.mjs（先跑 run.mjs）
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const r = JSON.parse(readFileSync(here('./results.json'), 'utf8'))
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]))
const STAT_KEYS = ['cagr', 'sharpe', 'sharpeNet', 'dailyMaxDd', 'avgEquity', 'triggerDaysPerYear', 'turnoverPerYear']
const SPLIT_KEYS = ['sharpe', 'dailyMaxDd']

const out = {
  generatedFrom: 'docs/research/late-cycle-2026-11-25/results.json',
  window: r.window,
  verdictA: r.A.verdict,
  groups: r.A.groups.map(g => pick(g, ['label', 'n', 'downMedian', 'upMedian', 'cutBeforeTrough'])),
  events: r.A.events.map(e => ({
    ...pick(e, ['peak', 'trough', 'recover', 'depth', 'bear', 'measuredFrom', 'recession', 'tierAtPeak', 'heatAtPeak',
      'weightAtPeak', 'weightAtTrough', 'firstCutDays', 'peakToTroughDays', 'spxLoss', 'spxGain', 'recoveredInWindow']),
    loss: Object.fromEntries(Object.entries(e.byStrat).map(([id, v]) => [id, v.loss])),
    gain: Object.fromEntries(Object.entries(e.byStrat).map(([id, v]) => [id, v.gain])),
  })),
  strategies: Object.fromEntries(Object.keys(r.B.full).map(id => [id, {
    full: pick(r.B.full[id], STAT_KEYS),
    train: pick(r.B.train[id], SPLIT_KEYS),
    valid: pick(r.B.valid[id], SPLIT_KEYS),
  }])),
  bootstrap: Object.fromEntries(['K1', 'K2', 'K3', 'K4'].map(id => [id, pick(r.B.bootstrap[id], ['point', 'low', 'high', 'p', 'holm'])])),
  verdictB: r.B.verdict,
}
const target = here('../../../src/features/strategy-lab/data/late-cycle.json')
writeFileSync(target, JSON.stringify(out, null, 2) + '\n')
console.log(`写入 ${target}`)
