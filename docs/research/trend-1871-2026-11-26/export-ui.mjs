#!/usr/bin/env node
// 从 results.json、g9.json 抽出「研究中」页签要展示的数字，写到 src/features/strategy-lab/data/trend.json。
// 用法：node docs/research/trend-1871-2026-11-26/export-ui.mjs（先跑 run.mjs、g9.mjs）
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const r = JSON.parse(readFileSync(here('./results.json'), 'utf8'))
const g9 = JSON.parse(readFileSync(here('./g9.json'), 'utf8'))
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]))

// 目标事件的高点月、谷底月取自预注册「目标事件」表（results.json 只存编号）
const prereg = readFileSync(here('./PREREG.md'), 'utf8')
const eventDates = Object.fromEntries(
  [...prereg.matchAll(/^\| (E\d) \| (\d{4}-\d{2}) \| (\d{4}-\d{2}) \| (前|后) \|$/gm)].map(m => [m[1], { peak: m[2], trough: m[3], sub: m[4] }]),
)

const MAIN_KEYS = ['wM', 'L', 'Lm29', 'wins', 'dE', 'posE', 'calmVsM', 'calmVsB0', 'dCER', 'switchesPerYear', 'turnoverPerYear', 'avgW']
const candidate = id => {
  const c = r.candidates[id]
  return {
    main: { ...pick(c.main, MAIN_KEYS), sub: c.main.sub, events: c.main.events.map(e => ({ ...e, ...eventDates[e.id] })) },
    cost30: pick(c.cost30, ['L', 'dE', 'posE']),
    Lstar: c.gates.Lstar,
    gates: c.gates,
    extra: c.extra,
    verdict: c.verdict,
    placebo: c.placebo,
    sharpeDiff: r.report[id].sharpeDiff,
  }
}
const STAT_KEYS = ['cagr', 'vol', 'sharpe', 'dailyMaxDd', 'turnoverPerYear', 'changedMonths']

const out = {
  generatedFrom: ['docs/research/trend-1871-2026-11-26/results.json', 'docs/research/trend-1871-2026-11-26/g9.json'],
  ledger: r.ledger,
  window: r.window,
  candidates: { C1: candidate('C1'), C2: candidate('C2') },
  twoMonthReversalShare: r.report.C1.twoMonthReversalShare,
  spells: r.report.C1.spells,
  explore: {
    X1four: pick(r.explore['X1 四票（1/3/6/12）'], ['L', 'wins', 'dE', 'switchesPerYear', 'wM']),
    X1three: pick(r.explore['X1 三票（去掉 1 个月）'], ['L', 'wins', 'dE', 'switchesPerYear', 'wM']),
    X2: {
      ...pick(r.explore['X2 流动性 + 破位'], ['L', 'dE', 'wins', 'vsC2']),
      Lshare: r.explore['X2 流动性 + 破位'].prediag.Lshare,
      designFailed: r.explore['X2 流动性 + 破位'].prediag.designFailed,
    },
  },
  g9: {
    base: pick(g9.base, STAT_KEYS),
    C2: pick(g9.C2, STAT_KEYS),
    events: g9.perEvent,
    sumBase: g9.sumBase,
    sumC2: g9.sumC2,
    triggered: g9.triggered,
  },
}
const target = here('../../../src/features/strategy-lab/data/trend.json')
writeFileSync(target, JSON.stringify(out, null, 2) + '\n')
console.log(`写入 ${target}`)
