#!/usr/bin/env node
// 从 results.json 与 cap-table.json 抽出「研究中」页签的数字，写到 src/features/strategy-lab/data/vol-confirm.json。
// 用法：node docs/research/vol-target-confirm-2026-11-25/export-ui.mjs（先跑 run.mjs、cap-table.mjs、cap-intervals.mjs）
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const r = JSON.parse(readFileSync(here('./results.json'), 'utf8'))
const cap = JSON.parse(readFileSync(here('./cap-table.json'), 'utf8'))
const intervals = JSON.parse(readFileSync(here('./cap-intervals.json'), 'utf8'))
const KEYS = ['vol', 'dailyMaxDd', 'sharpeNet', 'cagr', 'avgEquity', 'turnoverPerYear']
const pick = o => Object.fromEntries(KEYS.map(k => [k, o[k]]))
const unit = u => ({ first: u.first, last: u.last, scale: u.scale, matched: pick(u.matched), vt3: pick(u.vt3), pass: u.pass, holds: u.holds })
const out = {
  generatedFrom: 'docs/research/vol-target-confirm-2026-11-25/results.json',
  verdict: r.verdict, intlHolds: r.intlHolds,
  U1: unit(r.U1),
  overseas: Object.entries(r.overseas).map(([key, u]) => ({ key, name: u.name, ...unit(u) })),
  us1973: unit(r.reportUs1973),
  capIntervals: Object.fromEntries(Object.entries(intervals.caps).map(([k, v]) => [k, { vol: v.vol, dailyMaxDd: v.dailyMaxDd }])),
  capIntervalMethod: intervals.method,
  capTable: Object.fromEntries(Object.entries(cap).map(([label, rows]) => [label, Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, pick(v)]))])),
}
writeFileSync(here('../../../src/features/strategy-lab/data/vol-confirm.json'), JSON.stringify(out, null, 2) + '\n')
console.log('写入 src/features/strategy-lab/data/vol-confirm.json')
