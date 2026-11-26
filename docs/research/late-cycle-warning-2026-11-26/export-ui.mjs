#!/usr/bin/env node
// 从 results.json 抽出「研究中」页签要展示的数字，写到 src/features/strategy-lab/data/late-warning.json。
// 用法：node docs/research/late-cycle-warning-2026-11-26/export-ui.mjs（先跑 run.mjs）
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const r = JSON.parse(readFileSync(here('./results.json'), 'utf8'))
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]))
const median = xs => {
  const s = xs.filter(x => x != null).sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// 预注册的 W1、W2，加上用户事后要求的 5 个变体（L-024：A、B；L-025：D、E、F）
const IDS = ['base', 'W1', 'W2', 'VA', 'VB', 'VD', 'VE', 'VF']
const strategies = Object.fromEntries(IDS.map(id => [id, {
  onMonths: r.full[id].onMonths,
  full: pick(r.full[id], ['cagr', 'sharpe', 'sharpeNet', 'dailyMaxDd']),
  train: pick(r.train[id], ['sharpe']),
  valid: pick(r.valid[id], ['sharpe']),
  ghDownMedian: r.eventMedians[id].ghDown,
  bootstrap: id === 'base' ? null : pick(r.bootstrap[id], ['point', 'low', 'high']),
  pass: id === 'base' ? null : r.gate[id].pass,
}]))

const prePost = r.explore.prePost
const out = {
  generatedFrom: 'docs/research/late-cycle-warning-2026-11-26/results.json',
  ledger: ['L-023', 'L-024', 'L-025'],
  window: pick(r.window, ['signals', 'navStart', 'navEnd']),
  strategies,
  passers: r.passers,
  explore: {
    events: prePost.length,
    preMedian: median(prePost.map(e => e.pre)),
    postMedian: median(prePost.map(e => e.post)),
    prePost,
    fairReference: r.explore.fairReference,
  },
  describe: r.describe.map(d => pick(d, ['label', 'months', 'fall10Share', 'fwd12Mean'])),
  current: r.current.map(c => pick(c, ['d', 'tier', 'heat', 'c', 'n'])),
}
const target = here('../../../src/features/strategy-lab/data/late-warning.json')
writeFileSync(target, JSON.stringify(out, null, 2) + '\n')
console.log(`写入 ${target}`)
