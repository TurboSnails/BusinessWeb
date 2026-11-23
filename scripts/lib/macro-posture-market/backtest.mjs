import { EXECUTION_LAG, performance, recessionCapture, recessionRuns, falseAlarms } from '../macro-posture/backtest.mjs'
import { baseTier, TIERS } from '../macro-posture/model.mjs'
import { monthEnd } from '../macro-posture/panel.mjs'
import { configurations, marketScore } from './components.mjs'
import { month } from './data.mjs'

export const MARKET_START = '1955-01'
export const MACRO_START = '1973-01'
export const TEST_START = '2000-01'
export const TRAIN_END = '1999-12'
export const monthAfter = (d, offset) => month(monthEnd(d, offset))
export const tierEquity = tier => TIERS.find(t => t.id === tier)?.equityShare ?? null

export function alignMarket(signals, returns, equity, start) {
  return signals.flatMap(signal => {
    const d = monthAfter(signal.d, EXECUTION_LAG)
    const row = returns.get(d)
    const weight = equity(signal)
    if (d < start || row?.cash == null || weight == null) return []
    return [{ d, cash: row.cash, equity: weight, portfolio: weight * row.spx + (1 - weight) * row.cash }]
  })
}

function financialMetrics(rows) {
  const { cagr, vol, maxDd, sharpe, avgEquity, switchesPerYear } = performance(rows)
  return { cagr, vol, maxDd, sharpe, avgEquity, switchesPerYear }
}

function recessionMetrics(signals, returns, start, end) {
  if (!signals.some(row => row.rec === 1)) return {}
  const scoped = signals.filter(r => r.d >= start && r.d <= end)
  const runs = recessionRuns(scoped)
  return {
    recessionsCaught: recessionCapture(scoped, runs).filter(r => r.leadMonths >= 1).length,
    falseAlarmMonths: falseAlarms(scoped, runs, returns).reduce((sum, alarm) => sum + alarm.months, 0),
  }
}

export function measure(signals, returns, equity, start, includeRecessions = false) {
  const rows = alignMarket(signals, returns, equity, start)
  const train = rows.filter(r => r.d < TEST_START)
  const test = rows.filter(r => r.d >= TEST_START)
  const pack = (slice, from, through) => ({
    ...financialMetrics(slice),
    ...(includeRecessions ? recessionMetrics(signals, returns, from, through) : {}),
  })
  return {
    train: pack(train, start, TRAIN_END),
    test: pack(test, TEST_START, signals.at(-1).d),
    full: pack(rows, start, signals.at(-1).d),
  }
}

export function assertMonthlyCoverage(signals, returns, equity, start, through, label) {
  const seen = new Set(alignMarket(signals, returns, equity, start).map(r => r.d))
  for (let d = start; d <= through; d = monthAfter(d, 1)) {
    if (!seen.has(d)) throw new Error(`${label}缺少 ${d} 的对齐收益或信号`)
  }
}

const BENCHMARKS = [
  ['buyhold', '全程持有标普', () => 1],
  ['trend', '10 个月均线', row => row.below == null ? null : row.below ? 0.5 : 1],
  ['static70', '恒定七成股票', () => 0.7],
]

export function runStage1(signals, returns, through) {
  function rate(equity, label) {
    if (through) assertMonthlyCoverage(signals, returns, equity, MARKET_START, through, label)
    return measure(signals, returns, equity, MARKET_START)
  }
  const configs = configurations().map(config => {
    const { id, label, construction } = config
    const equity = row => tierEquity(baseTier(marketScore(config, row.readings)))
    return { id, label, construction, ...rate(equity, label) }
  }).sort((a, b) => b.train.sharpe - a.train.sharpe || a.id.localeCompare(b.id))
  const benchmarks = BENCHMARKS.map(([id, label, equity]) => ({ id, label, ...rate(equity, label) }))
  return { configs, chosenId: configs[0].id, benchmarks }
}
