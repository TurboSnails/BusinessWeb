import {
  CAGR_TOLERANCE, DRAWDOWN_TOLERANCE, FALSE_ALARM_TOLERANCE, HISTORY_YEARS_MIN,
  MIN_DD_IMPROVEMENT, MIN_SHARPE_IMPROVEMENT, SPLIT_EARLY_END, SPLIT_LATE_START,
} from './defs.mjs'

/** 子样本切分：候选起点晚于 1973 时按其可用区间对半；否则 1973–1999 / 2000–最新 */
export function splitRanges(historyStart, sampleStart, sampleEnd) {
  const availableStart = [historyStart, sampleStart].sort().at(-1)
  if (historyStart > '1973-01') {
    const a = monthIndex(availableStart)
    const b = monthIndex(sampleEnd)
    const mid = a + Math.floor((b - a + 1) / 2) - 1
    const midMonth = indexToMonth(mid)
    const lateStart = indexToMonth(mid + 1)
    return {
      early: { start: availableStart, end: midMonth },
      late: { start: lateStart, end: sampleEnd },
      label: `${availableStart}–${midMonth} / ${lateStart}–${sampleEnd}`,
    }
  }
  return {
    early: { start: availableStart, end: SPLIT_EARLY_END },
    late: { start: SPLIT_LATE_START, end: sampleEnd },
    label: `${availableStart}–${SPLIT_EARLY_END} / ${SPLIT_LATE_START}–${sampleEnd}`,
  }
}

function monthIndex(ym) {
  return Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7))
}
function indexToMonth(n) {
  const year = Math.floor((n - 1) / 12)
  const month = ((n - 1) % 12) + 1
  return `${year}-${String(month).padStart(2, '0')}`
}

export function historyYears(start, end) {
  return (monthIndex(end) - monthIndex(start) + 1) / 12
}

export function emptyMetrics() {
  return { cagr: 0, vol: 0, maxDd: 0, sharpe: 0, avgEquity: 0, recessionsCaught: 0, falseAlarmMonths: 0 }
}

/** 采用判定（预注册标准；观察读法：只在一段夏普改善且未违反回撤/年化 → 观察）
 * requireMinImprovement：第二轮启用 11.3.1 门槛
 */
export function judge(baseline, withCandidate, historyYrs, {
  earlySharpeUp, lateSharpeUp, requireMinImprovement = false,
} = {}) {
  const checks = []

  const sharpeBoth = baseline.early.sharpe < withCandidate.early.sharpe
    && baseline.late.sharpe < withCandidate.late.sharpe
  checks.push({
    id: 'sharpeBoth',
    label: '两段子样本夏普都提高',
    pass: sharpeBoth,
    detail: `前段 ${fmt(baseline.early.sharpe)} → ${fmt(withCandidate.early.sharpe)}；后段 ${fmt(baseline.late.sharpe)} → ${fmt(withCandidate.late.sharpe)}`,
  })

  const ddEarlyOk = withCandidate.early.maxDd >= baseline.early.maxDd - DRAWDOWN_TOLERANCE
  const ddLateOk = withCandidate.late.maxDd >= baseline.late.maxDd - DRAWDOWN_TOLERANCE
  checks.push({
    id: 'drawdown',
    label: '两段最大回撤都不恶化超过 1 个百分点',
    pass: ddEarlyOk && ddLateOk,
    detail: `前段 ${pct(baseline.early.maxDd)} → ${pct(withCandidate.early.maxDd)}；后段 ${pct(baseline.late.maxDd)} → ${pct(withCandidate.late.maxDd)}`,
  })

  const cagrOk = baseline.full.cagr - withCandidate.full.cagr <= CAGR_TOLERANCE
  checks.push({
    id: 'cagr',
    label: '全样本年化收益下降不超过 0.3 个百分点',
    pass: cagrOk,
    detail: `${pct(baseline.full.cagr)} → ${pct(withCandidate.full.cagr)}（降幅 ${((baseline.full.cagr - withCandidate.full.cagr) * 100).toFixed(3)} 个百分点）`,
  })

  const recOk = withCandidate.full.recessionsCaught >= baseline.full.recessionsCaught
    && withCandidate.full.falseAlarmMonths <= baseline.full.falseAlarmMonths * FALSE_ALARM_TOLERANCE
  checks.push({
    id: 'recessions',
    label: '衰退捕捉不减少且误报月数增加不超过 20%',
    pass: recOk,
    detail: `捕捉 ${baseline.full.recessionsCaught} → ${withCandidate.full.recessionsCaught}；误报月 ${baseline.full.falseAlarmMonths} → ${withCandidate.full.falseAlarmMonths}`,
  })

  const histOk = historyYrs >= HISTORY_YEARS_MIN
  checks.push({
    id: 'history',
    label: `同口径历史至少 ${HISTORY_YEARS_MIN} 年`,
    pass: histOk,
    detail: `约 ${historyYrs.toFixed(1)} 年`,
  })

  const earlyDelta = withCandidate.early.sharpe - baseline.early.sharpe
  const lateDelta = withCandidate.late.sharpe - baseline.late.sharpe
  const earlyDdImprove = withCandidate.early.maxDd - baseline.early.maxDd
  const lateDdImprove = withCandidate.late.maxDd - baseline.late.maxDd
  const sharpeMinOk = earlyDelta >= MIN_SHARPE_IMPROVEMENT && lateDelta >= MIN_SHARPE_IMPROVEMENT
  const ddMinOk = (earlyDdImprove >= MIN_DD_IMPROVEMENT && lateDdImprove >= 0)
    || (lateDdImprove >= MIN_DD_IMPROVEMENT && earlyDdImprove >= 0)
  const minImprovementOk = sharpeMinOk || ddMinOk

  if (requireMinImprovement) {
    checks.push({
      id: 'minImprovement',
      label: '最小改善门槛',
      pass: minImprovementOk,
      detail: `前段夏普变化 ${signed(earlyDelta)}、后段夏普变化 ${signed(lateDelta)}；前段回撤改善 ${pp(earlyDdImprove)}、后段回撤改善 ${pp(lateDdImprove)}`,
    })
  }

  const earlyUp = earlySharpeUp ?? baseline.early.sharpe < withCandidate.early.sharpe
  const lateUp = lateSharpeUp ?? baseline.late.sharpe < withCandidate.late.sharpe
  const onlyOneSide = earlyUp !== lateUp && (earlyUp || lateUp)
  const rules23Ok = ddEarlyOk && ddLateOk && cagrOk

  const sharpeChange = `前段夏普变化 ${signed(earlyDelta)}、后段夏普变化 ${signed(lateDelta)}。`
  const belowNextRound = !requireMinImprovement
    && ((earlyDelta > 0 && earlyDelta < MIN_SHARPE_IMPROVEMENT)
      || (lateDelta > 0 && lateDelta < MIN_SHARPE_IMPROVEMENT))
  const noiseNote = belowNextRound
    ? '改善幅度很小，低于下一轮 0.01 的最小改善门槛。'
    : ''

  const pass13 = sharpeBoth && rules23Ok
  const passAdoptCore = pass13 && recOk && histOk
  let verdict
  let reason
  if (passAdoptCore && (!requireMinImprovement || minImprovementOk)) {
    verdict = 'adopt'
    reason = requireMinImprovement
      ? `${sharpeChange}两段夏普、回撤、年化、衰退捕捉、历史长度与最小改善门槛均满足预注册采用标准。`
      : `${sharpeChange}${noiseNote}两段夏普、回撤、年化、衰退捕捉与历史长度均满足预注册采用标准，已并入核心规则 v2.2。`
  } else if (passAdoptCore && requireMinImprovement && !minImprovementOk) {
    verdict = 'reject'
    reason = `${sharpeChange}其余条款达标，但未过最小改善门槛（两段夏普各 ≥ +0.01，或任一段回撤改善 ≥ 2 个百分点且另一段不恶化），不采用。`
  } else if ((pass13 && !recOk) || (pass13 && recOk && !histOk) || (onlyOneSide && !sharpeBoth && rules23Ok)) {
    verdict = 'watch'
    if (!histOk && pass13 && recOk) {
      reason = `${sharpeChange}${noiseNote}指标表现达标，但同口径历史不足 ${HISTORY_YEARS_MIN} 年，最多作为观察项。观察不代表有效，只表示没被否决。`
    } else if (onlyOneSide && !sharpeBoth) {
      reason = `${sharpeChange}${noiseNote}只有一段子样本夏普改善，且未违反回撤与年化条款，按预注册标准列为观察。观察不代表有效，只表示没被否决。`
    } else if (pass13 && !recOk) {
      reason = `${sharpeChange}${noiseNote}收益与回撤达标，但衰退捕捉或误报未过线，列为观察。观察不代表有效，只表示没被否决。`
    } else {
      reason = `${sharpeChange}${noiseNote}部分改善，按预注册标准列为观察。观察不代表有效，只表示没被否决。`
    }
  } else {
    verdict = 'reject'
    const failed = checks.filter(c => !c.pass).map(c => c.label).join('；')
    const oneSideButViolated = onlyOneSide && !rules23Ok
      ? '只在一段夏普改善，但违反回撤或年化条款，因此不采用。'
      : ''
    reason = `${sharpeChange}${noiseNote}${oneSideButViolated || `未满足采用标准（${failed}），不采用。`}`
  }

  return { checks, verdict, reason }
}

const signed = n => {
  const text = Math.abs(Number(n)).toFixed(3)
  return Number(text) === 0 ? text : `${n > 0 ? '+' : '−'}${text}`
}

/** 组合结果只需满足 1–4 */
export function judgeCombined(baseline, withCandidate) {
  const earlySharpe = baseline.early.sharpe < withCandidate.early.sharpe
  const lateSharpe = baseline.late.sharpe < withCandidate.late.sharpe
  const ddOk = withCandidate.early.maxDd >= baseline.early.maxDd - DRAWDOWN_TOLERANCE
    && withCandidate.late.maxDd >= baseline.late.maxDd - DRAWDOWN_TOLERANCE
  const cagrOk = baseline.full.cagr - withCandidate.full.cagr <= CAGR_TOLERANCE
  const recOk = withCandidate.full.recessionsCaught >= baseline.full.recessionsCaught
    && withCandidate.full.falseAlarmMonths <= baseline.full.falseAlarmMonths * FALSE_ALARM_TOLERANCE
  const pass = earlySharpe && lateSharpe && ddOk && cagrOk && recOk
  return {
    pass,
    detail: pass
      ? '全部采用项合测满足 1–4。'
      : `合测未过线：夏普前/后 ${earlySharpe}/${lateSharpe}，回撤 ${ddOk}，年化 ${cagrOk}，衰退 ${recOk}。`,
  }
}

const fmt = n => Number(n).toFixed(3)
const pct = n => `${n < 0 ? '−' : ''}${Math.abs(n * 100).toFixed(2)}%`
const pp = n => `${n < 0 ? '−' : '+'}${Math.abs(n * 100).toFixed(2)} 个百分点`
