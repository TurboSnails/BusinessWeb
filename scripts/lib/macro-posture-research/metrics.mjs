import { TIERS } from '../macro-posture/model.mjs'
import {
  START, EXECUTION_LAG, falseAlarms, monthlyReturns, performance,
  recessionCapture, recessionRuns,
} from '../macro-posture/backtest.mjs'
import { monthEnd, panelAt, valueAt } from '../macro-posture/panel.mjs'
import { panelWithVintages } from '../macro-posture/vintages.mjs'
import { evaluateWithCandidates } from './evaluate.mjs'
import { readCandidates } from './series.mjs'
import { emptyMetrics, historyYears, splitRanges } from './verdict.mjs'

const month = date => date.slice(0, 7)
const keyAfter = (date, offset) => month(monthEnd(date, offset))
const equity = tier => TIERS.find(t => t.id === tier)?.equityShare ?? null
const portfolioReturn = ({ spx, cash }, weight) => spx * weight + cash * (1 - weight)
/**
 * 在完整面板上跑一条时间线；activeIds 为空 = baseline v2.1
 * extras = candidate series map
 * vintages 非空时：打分用 panelWithVintages（实时口径）；样本起点仍按修订值面板判定
 * （与引擎 buildVintageBacktest 一致——PCEPILFE/IC4WSA 早期 vintage 可为 null）
 */
export function buildTimeline(panel, extras, asOf, activeIds = [], vintages = null) {
  const lastComplete = monthEnd(asOf, -1)
  const rows = []
  for (let d = START; monthEnd(d) <= lastComplete; d = keyAfter(d, 1)) {
    const date = monthEnd(d)
    const gateFrame = panelAt(panel, date, null)
    if (!rows.length) {
      const gateReadings = readCandidates(extras, date, panel.FEDFUNDS)
      const gate = evaluateWithCandidates(gateFrame, gateReadings, activeIds)
      if (Object.values(gate.pillars).some(score => score == null)) continue
    }
    if (gateFrame.tactical.price == null || month(valueAt(panel.price, date)?.observedOn ?? '') !== d) {
      if (rows.length) throw new Error(`标普月均价历史缺少 ${d}`)
      continue
    }
    const monthPanel = vintages ? panelWithVintages(panel, vintages, date) : panel
    const frame = panelAt(monthPanel, date, null)
    const readings = readCandidates(extras, date, panel.FEDFUNDS)
    const result = evaluateWithCandidates(frame, readings, activeIds)
    const rec = valueAt(panel.USREC, date)
    rows.push({
      d,
      regime: result.regime.tier,
      final: result.final.tier,
      spx: frame.tactical.price,
      rec: panel.USREC?.length ? Number(month(rec?.observedOn ?? '') === d && rec.value === 1) : 0,
      below: frame.tactical.below,
    })
  }
  return rows
}

function metricsFromRows(rows, returns, range) {
  const sliced = range
    ? rows.filter(row => row.d >= range.start && row.d <= range.end)
    : rows
  if (!sliced.length) return emptyMetrics()

  const signals = sliced.map(row => ({ d: row.d, final: row.final, below: row.below, regime: row.regime }))
  // alignVariants 期望 weights 选择器；这里直接用 final 档位
  const aligned = signals.flatMap(signal => {
    const d = keyAfter(signal.d, EXECUTION_LAG)
    const row = returns.get(d)
    const weight = equity(signal.final)
    if (row?.cash == null || weight == null) return []
    return [{ d, ...row, equity: weight, portfolio: portfolioReturn(row, weight) }]
  })
  if (!aligned.length) return emptyMetrics()

  const perf = performance(aligned)
  const timeline = sliced.map(({ d, final, rec }) => ({ d, final, rec }))
  const runs = recessionRuns(timeline)
  const captured = recessionCapture(timeline, runs)
  const recessionsCaught = captured.filter(r => r.leadMonths != null && r.leadMonths >= 1).length
  const alarms = falseAlarms(timeline, runs, returns)
  const falseAlarmMonths = alarms.reduce((sum, a) => sum + a.months, 0)

  return {
    cagr: perf.cagr,
    vol: perf.vol,
    maxDd: perf.maxDd,
    sharpe: perf.sharpe,
    avgEquity: perf.avgEquity,
    recessionsCaught,
    falseAlarmMonths,
  }
}

/**
 * 计算 baseline / withCandidate 的 full/early/late 指标。
 * compareStart：候选可用起点（用于子样本切分与 historyYears）
 * vintages：传入则按实时口径构造每月面板
 */
export function measureCandidate(panel, extras, asOf, candidate, activeIds, vintages = null) {
  const lastComplete = monthEnd(asOf, -1)
  const sampleEnd = month(lastComplete)
  const returns = monthlyReturns(panel, lastComplete)

  const baselineRows = buildTimeline(panel, extras, asOf, [], vintages)
  const withRows = buildTimeline(panel, extras, asOf, activeIds, vintages)

  const sampleStart = baselineRows[0]?.d ?? START
  const splits = splitRanges(candidate.historyStart, sampleStart, sampleEnd)
  // 起点之前的月份不计入该候选的子样本比较：用候选可用起点裁剪
  const compareStart = [candidate.historyStart, sampleStart].sort().at(-1)
  const baseScoped = baselineRows.filter(r => r.d >= compareStart)
  const withScoped = withRows.filter(r => r.d >= compareStart)

  const pack = rows => ({
    full: metricsFromRows(rows, returns),
    early: metricsFromRows(rows, returns, splits.early),
    late: metricsFromRows(rows, returns, splits.late),
  })

  return {
    splits,
    historyYears: historyYears(compareStart, sampleEnd),
    baseline: pack(baseScoped),
    withCandidate: pack(withScoped),
    sampleStart: compareStart,
    sampleEnd,
  }
}

export function measureCombined(panel, extras, asOf, adoptIds, historyStart, vintages = null) {
  const lastComplete = monthEnd(asOf, -1)
  const sampleEnd = month(lastComplete)
  const returns = monthlyReturns(panel, lastComplete)
  const baselineRows = buildTimeline(panel, extras, asOf, [], vintages)
  const withRows = buildTimeline(panel, extras, asOf, adoptIds, vintages)
  const sampleStart = baselineRows[0]?.d ?? START
  const compareStart = [historyStart, sampleStart].sort().at(-1)
  const splits = splitRanges(historyStart, sampleStart, sampleEnd)
  const baseScoped = baselineRows.filter(r => r.d >= compareStart)
  const withScoped = withRows.filter(r => r.d >= compareStart)
  const pack = rows => ({
    full: metricsFromRows(rows, returns),
    early: metricsFromRows(rows, returns, splits.early),
    late: metricsFromRows(rows, returns, splits.late),
  })
  return { splits, baseline: pack(baseScoped), withCandidate: pack(withScoped) }
}
