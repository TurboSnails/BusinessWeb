import { EXECUTION_LAG } from '../macro-posture/backtest.mjs'
import { applyTactical, baseTier, BREAKERS, evaluate, PILLARS, TIERS } from '../macro-posture/model.mjs'
import { clean, monthEnd, panelAt, valueAt } from '../macro-posture/panel.mjs'
import { panelWithVintages } from '../macro-posture/vintages.mjs'
import { assertMonthlyCoverage, MACRO_START, measure, monthAfter, tierEquity } from './backtest.mjs'
import { month } from './data.mjs'

const WEIGHTS = [0.10, 0.15, 0.20, 0.25]
const BASELINE_LABEL = 'v2.2（实时数据口径）'
const tierIndex = id => TIERS.findIndex(t => t.id === id)

export function scaleWeights(pillars, market, w) {
  const known = PILLARS.filter(({ id }) => pillars[id] != null)
  const total = known.reduce((sum, p) => sum + p.weight, 0)
  const marketWeight = market == null ? 0 : w
  return {
    ...Object.fromEntries(known.map(({ id, weight }) => [id, weight / total * (1 - marketWeight)])),
    market: marketWeight,
  }
}

export function evaluateFifthPillar(frame, baseline, market, w) {
  if (baseline.regime.score == null || market == null || w === 0) return baseline.final.tier
  const pillars = { ...baseline.pillars, market }
  const weights = scaleWeights(baseline.pillars, market, w)
  const score = clean(Object.entries(weights).reduce((sum, [id, weight]) => sum + pillars[id] * weight, 0))
  // Reuse the breaker flags from the unchanged four pillars and apply the same caps.
  const capped = Math.max(tierIndex(baseTier(score)),
    ...BREAKERS.map(({ id, cap }) => baseline.breakers.find(b => b.id === id).active ? tierIndex(cap) : -1))
  const tactical = applyTactical(TIERS[capped].id, frame.tactical.below)
  const index = tierIndex(tactical)
  const baaChange = baseline.scores.baaChange
  const creditDelta = frame.components.nfciCredit?.delta
  const repaired = index >= 3 && frame.tactical.below === false
    && Number.isFinite(baaChange) && baaChange >= 0
    && Number.isFinite(creditDelta) && creditDelta <= 0
  return TIERS[index - Number(repaired)].id
}

const diff = (candidate, base, key) =>
  Number.isFinite(candidate[key]) && Number.isFinite(base[key]) ? clean(candidate[key] - base[key]) : null
const signed = (value, digits) => value == null ? '数据暂缺' : (value >= 0 ? '+' : '−') + Math.abs(value).toFixed(digits)
const points = value => value == null ? '数据暂缺' : signed(value * 100, 2) + ' 个百分点'
const countPair = (base, candidate) => base == null || candidate == null ? '数据暂缺' : `${base} → ${candidate}`

export function judgeWeights(baseline, candidate) {
  const trainSharpe = diff(candidate.train, baseline.train, 'sharpe')
  const testSharpe = diff(candidate.test, baseline.test, 'sharpe')
  const trainDrawdown = diff(candidate.train, baseline.train, 'maxDd')
  const testDrawdown = diff(candidate.test, baseline.test, 'maxDd')
  const cagr = diff(candidate.full, baseline.full, 'cagr')
  const caught = diff(candidate.full, baseline.full, 'recessionsCaught')
  const alarms = candidate.full.falseAlarmMonths
  const baseAlarms = baseline.full.falseAlarmMonths
  const checks = [
    { id: 'testSharpe', label: '验证期夏普至少提高 0.01', pass: testSharpe != null && testSharpe >= 0.01, detail: signed(testSharpe, 4) },
    { id: 'testDrawdown', label: '验证期最大回撤加深不超过 1 个百分点', pass: testDrawdown != null && testDrawdown >= -0.01, detail: '回撤幅度 ' + points(testDrawdown == null ? null : -testDrawdown) },
    { id: 'trainSharpe', label: '训练期夏普不降', pass: trainSharpe != null && trainSharpe >= 0, detail: signed(trainSharpe, 4) },
    { id: 'trainDrawdown', label: '训练期最大回撤加深不超过 1 个百分点', pass: trainDrawdown != null && trainDrawdown >= -0.01, detail: '回撤幅度 ' + points(trainDrawdown == null ? null : -trainDrawdown) },
    { id: 'fullCagr', label: '全样本年化收益下降不超过 0.3 个百分点', pass: cagr != null && cagr >= -0.003, detail: points(cagr) },
    { id: 'recessionsCaught', label: '提前捕捉到的衰退次数不减少', pass: caught != null && caught >= 0,
      detail: countPair(baseline.full.recessionsCaught, candidate.full.recessionsCaught) },
    { id: 'falseAlarmMonths', label: '误报月数增加不超过 20%', pass: Number.isFinite(alarms) && Number.isFinite(baseAlarms) && alarms * 5 <= baseAlarms * 6,
      detail: countPair(baseAlarms, alarms) },
  ]
  const failed = checks.filter(check => !check.pass)
  const verdict = failed.length ? 'reference' : 'adopt'
  const reason = `与原模型相比，验证期夏普从 ${baseline.test.sharpe.toFixed(4)} 变为 ${candidate.test.sharpe.toFixed(4)}（${signed(testSharpe, 4)}），最大回撤从 ${(-baseline.test.maxDd * 100).toFixed(2)}% 变为 ${(-candidate.test.maxDd * 100).toFixed(2)}%（回撤幅度 ${points(-testDrawdown)}）。`
    + (failed.length ? `未达到“${failed.map(check => check.label).join('”“')}”的要求，市场综合作为独立参考。` : '所有采用条件均通过，市场综合可作为第五支柱。')
  return { checks, verdict, reason }
}

export function runStage2(panel, vintages, marketByMonth, returns, through) {
  const signals = []
  for (let d = monthAfter(MACRO_START, -EXECUTION_LAG); d <= through; d = monthAfter(d, 1)) {
    const date = monthEnd(d)
    const frame = panelAt(panelWithVintages(panel, vintages, date), date, null)
    const baseline = evaluate(frame)
    const recession = valueAt(panel.USREC, date)
    signals.push({
      d, frame, baseline, market: marketByMonth.get(d),
      rec: Number(recession && month(recession.observedOn) === d && recession.value === 1),
    })
  }
  function rate(selectTier, label) {
    const rows = signals.map(row => ({ d: row.d, rec: row.rec, final: selectTier(row) }))
    const equity = row => tierEquity(row.final)
    assertMonthlyCoverage(rows, returns, equity, MACRO_START, through, label)
    return measure(rows, returns, equity, MACRO_START, true)
  }
  const baseline = rate(row => row.baseline.final.tier, BASELINE_LABEL)
  const weights = WEIGHTS.map(w => ({
    w, ...rate(row => evaluateFifthPillar(row.frame, row.baseline, row.market, w), `第五支柱 ${w * 100}%`),
  }))
  const chosen = weights.reduce((best, candidate) => candidate.train.sharpe > best.train.sharpe ? candidate : best)
  return { baselineLabel: BASELINE_LABEL, weights, baseline, chosenW: chosen.w, ...judgeWeights(baseline, chosen) }
}
