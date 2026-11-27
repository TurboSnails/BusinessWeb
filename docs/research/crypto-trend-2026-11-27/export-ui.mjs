#!/usr/bin/env node
// Run after run.py to export the frozen historical study and pre-reveal status.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = path => fileURLToPath(new URL(path, import.meta.url))
const result = JSON.parse(readFileSync(here('./results.json'), 'utf8'))
const pick = (value, keys) => Object.fromEntries(keys.map(key => [key, value[key]]))
const stats = row => pick(row, ['sigma', 'mdd', 'cer', 'sharpe', 'cvar95', 'worst30', 'cagr', 'trades', 'turnover', 'exposure'])
const reference = row => ({ ...stats(row), ...pick(row, ['weight', 'matchError', 'mismatch']) })
const comparison = row => ({
  ...pick(row, ['coverage', 'deltas', 'gates', 'pass']),
  K1: stats(row.K1),
  B0: stats(row.B0),
  M: reference(row.M),
})
const leveragePaths = scenarios => Object.fromEntries(Object.entries(scenarios).map(([name, paths]) => [
  name,
  Object.fromEntries(Object.entries(paths).map(([ordering, path]) => [
    ordering,
    {
      mdd: path.mdd,
      touchesByLeg: Object.fromEntries(Object.entries(path.legs).map(([leg, value]) => [leg, value.touches])),
    },
  ])),
]))
const out = {
  generatedFrom: 'docs/research/crypto-trend-2026-11-27/results.json',
  ledger: result.study,
  title: result.title,
  units: 'decimal fractions',
  verdict: result.verdict,
  verdictRisk: pick(result.history.base.K1, ['sigma', 'mdd']),
  disclaimer: '即使通过，波动仍远高于美股；本研究不评估把 BTC 加入组合的影响，不构成配置或杠杆建议。',
  asOf: result.asOf,
  history: Object.fromEntries(Object.entries(result.history).map(([name, row]) => [name, comparison(row)])),
  historicalDisclosure: pick(result.bootstrap, ['historicalDisclosureOnly', 'cerDeltaLower95', 'resamples', 'blockDays']),
  dailyRebalanceDisclosure: reference(result.history.base.dailyReference),
  segments: Object.fromEntries(Object.entries(result.segments).map(([name, row]) => [name, comparison(row)])),
  sensitivities: {
    positiveVolume: Object.fromEntries(Object.entries(result.sensitivities.positiveVolume).map(([name, row]) => [name, comparison(row)])),
    cashRate: comparison(result.sensitivities.cashRate),
  },
  replay: {
    BTC: comparison(result.replay.BTC),
    ETH: {
      coverage: result.replay.ETH.coverage,
      K1: stats(result.replay.ETH.K1),
      B0: stats(result.replay.ETH.B0),
    },
    fiveCoinExactReplication: result.replay.fiveCoinExactReplication,
  },
  chainOverlay: Object.fromEntries(Object.entries(result.K2).map(([name, row]) => [
    name,
    { ...stats(row), ...pick(row, ['requiredMvrv', 'missingMvrv', 'incomplete']) },
  ])),
  leverageAppendix: {
    collapsedByDefault: true,
    ...pick(result.leverage, ['start', 'end', 'maintenanceMargin', 'fundingMarkSources', 'wholeAccountLiquidation']),
    ...Object.fromEntries(Object.entries(result.leverage.scenarios).map(([scenario, paths]) => [scenario, leveragePaths(paths)])),
  },
  forward: pick(result.forward, ['start', 'end', 'state', 'revealed']),
}

const output = '../../../src/features/strategy-lab/data/crypto-l039.json'
writeFileSync(here(output), JSON.stringify(out, null, 2) + '\n')
console.log('已写 src/features/strategy-lab/data/crypto-l039.json')
