import { formatDate } from '../macro-posture/format.mjs'
import { TIERS } from '../macro-posture/model.mjs'
import { monthEnd, addDays } from '../macro-posture/panel.mjs'
import { isTradingDay } from '../trading-calendar.mjs'
import { classifyHeat, HEAT_LABEL, heatScoreFromScores } from './heat.mjs'
import { findMatrixCell, macroSide } from './matrix.mjs'

const fullDate = d => `${d.slice(0, 4)} 年 ${formatDate(d)}`
const tierOf = id => TIERS.find(row => row.id === id) ?? null
const tierName = id => tierOf(id)?.label ?? null
const sharePct = id => {
  const share = tierOf(id)?.equityShare
  return share == null ? null : Math.round(share * 100)
}
const monthNum = ym => Number(String(ym).slice(5, 7))

export function heatFromRadarCurrent(radarCurrent) {
  const byId = Object.fromEntries((radarCurrent?.dimensions ?? []).map(row => [row.id, row.score]))
  const heatScore = heatScoreFromScores(byId.valuation, byId.crowding)
  return { heatScore, heat: classifyHeat(heatScore) }
}

export function buildHeadline({ macroTier, equityShare, heat, cell }) {
  if (macroTier == null || heat == null || equityShare == null) {
    return '宏观攻守或雷达读数暂缺，暂不给出综合结论。'
  }
  const tierLabel = TIERS.find(row => row.id === macroTier)?.label ?? macroTier
  const n = Math.round(equityShare * 100)
  const action = cell?.action ?? ''
  return `宏观${tierLabel}、市场${HEAT_LABEL[heat]}：股票仓位按自设上限的 ${n}%。${action}`
}

/** 本月（或指定月）最后一个美股交易日；算不出返回 null。 */
export function lastUsTradingDayOfMonth(ymOrDate) {
  const end = monthEnd(ymOrDate)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return null
  let d = end
  // 最多往回走 15 天，避开月末连休
  for (let i = 0; i < 15; i += 1) {
    if (isTradingDay('us', d)) return d
    d = addDays(d, -1)
  }
  return null
}

/**
 * 下次正式定档日：今天所在月最后一个交易日；今天已过该日则取下个月最后一个交易日。
 * 月末当天仍算本月（未「已过」）。
 */
export function nextReviewDate(today) {
  if (!today || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null
  const thisMonthLast = lastUsTradingDayOfMonth(today)
  if (!thisMonthLast) return null
  if (today <= thisMonthLast) return thisMonthLast
  const nextMonthAnchor = monthEnd(today, 1)
  return lastUsTradingDayOfMonth(nextMonthAnchor)
}

/** 月度时间线最后一个月 = 最近一次月末正式定档。 */
export function buildOfficial(timeline) {
  const rows = Array.isArray(timeline) ? timeline : []
  if (!rows.length) return null
  const last = rows[rows.length - 1]
  const prev = rows.length >= 2 ? rows[rows.length - 2] : null
  const month = last?.d ?? null
  if (!month) return null
  return {
    month,
    tier: last.final ?? last.macro ?? null,
    previousTier: prev ? (prev.final ?? prev.macro ?? null) : null,
  }
}

export function buildInstruction({ macroTier, official }) {
  const cur = macroTier ?? null
  const off = official?.tier ?? null
  const prev = official?.previousTier ?? null
  if (cur == null) return '宏观攻守读数暂缺，暂不给出仓位。'
  const n = sharePct(cur)
  if (cur === off && off === prev) {
    return `股票仓位保持在你上限的 ${n}%，本月不用调。`
  }
  if (cur === off && off !== prev && prev != null) {
    const m = sharePct(prev)
    return `股票仓位调到你上限的 ${n}%（上月是 ${m}%），本月内完成。`
  }
  if (cur !== off) {
    const k = sharePct(off)
    return `股票仓位先保持在你上限的 ${k}%；按目前数据，月底可能变为 ${n}%，等月底定档再调。`
  }
  // cur === off 且 prev 为空：按「与上月相同」处理
  return `股票仓位保持在你上限的 ${n}%，本月不用调。`
}

function positionStep({ official, macroTier: cur }) {
  const off = official?.tier ?? null
  const prev = official?.previousTier ?? null
  const x = official?.month ? monthNum(official.month) : null
  const offName = tierName(off)
  const prevName = tierName(prev)
  const curName = tierName(cur)
  const n = sharePct(off)
  const m = sharePct(prev)
  const k = sharePct(off)

  if (x == null || off == null) {
    return '月末正式定档暂缺，先按当前读数执行。'
  }
  if (cur === off && off === prev) {
    return `${x} 月底定档为${offName}，对应上限的 ${n}%，和上月相同，不用调仓。`
  }
  if (cur === off && off !== prev && prev != null) {
    return `${x} 月底档位由${prevName}变为${offName}，本月内把股票仓位从上限的 ${m}% 调到 ${n}%。`
  }
  if (cur !== off) {
    return `${x} 月底定档为${offName}（上限的 ${k}%）。按目前数据月底可能变为${curName}，先不动。`
  }
  return `${x} 月底定档为${offName}，对应上限的 ${n}%，和上月相同，不用调仓。`
}

function nextStep(nextReview) {
  const tail = '档位如有变化，在下个月内调整到位；没变就不用动。'
  if (!nextReview) {
    return `每月最后一个交易日收盘后。${tail}`
  }
  return `${formatDate(nextReview)}收盘后（本月最后一个交易日）。${tail}`
}

export function buildSteps({ macroTier, official, cell, nextReview }) {
  return [
    { title: '仓位', text: positionStep({ official, macroTier }) },
    { title: '做法', text: cell?.action ?? '雷达读数暂缺，先只按仓位执行。' },
    { title: '下次定档', text: nextStep(nextReview) },
  ]
}

export function buildCurrent({ posture, radar, matrix, today }) {
  const final = posture?.current?.final ?? null
  const macroTier = final?.tier ?? null
  const equityShare = final?.equityShare ?? null
  const side = macroSide(macroTier)
  const radarTier = radar?.tier ?? null
  const { heatScore, heat } = heatFromRadarCurrent(radar)
  const cell = findMatrixCell(matrix, side, heat)
  const timeline = posture?.backtest?.timeline ?? []
  const official = buildOfficial(timeline)
  const nextReview = nextReviewDate(today)
  return {
    macroTier,
    equityShare,
    macroSide: side,
    radarTier,
    heatScore,
    heat,
    headline: buildHeadline({ macroTier, equityShare, heat, cell }),
    cell,
    dates: [
      { label: '宏观攻守', date: fullDate(posture.current.asOf) },
      { label: '市场雷达', date: fullDate(today) },
    ],
    instruction: buildInstruction({ macroTier, official }),
    steps: buildSteps({ macroTier, official, cell, nextReview }),
    official,
    nextReview,
  }
}
