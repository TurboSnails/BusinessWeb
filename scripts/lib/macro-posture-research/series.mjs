import { formatDate, formatReading } from '../macro-posture/format.mjs'
import { clean, monthEnd, percentile, valueAt } from '../macro-posture/panel.mjs'

const month = date => date.slice(0, 7)

/** 观测日所属季度的下一个季度第一个月末（DRTSCILM 发布滞后） */
export function nextQuarterFirstMonthEnd(observedOn) {
  const [year, mon] = observedOn.split('-').map(Number)
  const quarterStartMonth = Math.floor((mon - 1) / 3) * 3 + 1
  const nextQuarterMonth = quarterStartMonth + 3
  const y = nextQuarterMonth > 12 ? year + 1 : year
  const m = nextQuarterMonth > 12 ? nextQuarterMonth - 12 : nextQuarterMonth
  return monthEnd(`${y}-${String(m).padStart(2, '0')}`)
}

/** 按序列类型给可用日：DGS2/T10YIE 当日；FEDFUNDS/GS10 当月末；PERMIT/AWHMAN m+1；PCEPILFE m+2；EPS m+3；DRTSCILM 次季首月末 */
export function availableOnFor(id, observedOn) {
  if (id === 'DGS2' || id === 'T10YIE') return observedOn
  if (id === 'FEDFUNDS' || id === 'GS10' || id === 'CAPE') return monthEnd(observedOn)
  if (id === 'PERMIT' || id === 'AWHMAN') return monthEnd(observedOn, 1)
  if (id === 'PCEPILFE') return monthEnd(observedOn, 2)
  if (id === 'EPS') return monthEnd(observedOn, 3)
  if (id === 'DRTSCILM') return nextQuarterFirstMonthEnd(observedOn)
  return observedOn
}

export function makeCandidateSeries(id, rows) {
  return [...new Map(rows.filter(([, value]) => Number.isFinite(value))
    .map(([day, value]) => [day, {
      observedOn: day,
      availableOn: availableOnFor(id, day),
      value,
    }])).values()].sort((a, b) => a.observedOn.localeCompare(b.observedOn))
}

function upperBound(series, date, key) {
  let lo = 0
  let hi = series.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (series[mid][key] <= date) lo = mid + 1
    else hi = mid
  }
  return lo
}

export function pointAt(series = [], date) {
  return series[upperBound(series, date, 'availableOn') - 1] ?? null
}

/** 同月观测（按 observedOn 月对齐），且 availableOn ≤ asOf */
function monthPoint(series, ym, asOf) {
  const end = monthEnd(ym)
  const point = series[upperBound(series, end, 'observedOn') - 1]
  return point?.availableOn <= asOf && month(point.observedOn) === ym ? point : null
}

function mean(values) {
  return values.reduce((sum, n) => sum + n, 0) / values.length
}

/** 取 asOf 时已可得、观测月为 ym 及其前 n-1 个月的点；任一缺失返回 null */
function monthlyWindow(series, ym, count, asOf) {
  const points = []
  for (let i = 0; i < count; i += 1) {
    const target = month(monthEnd(ym, -i))
    const point = monthPoint(series, target, asOf)
    if (!point) return null
    points.push(point)
  }
  return points
}

export function scoreRateExp(spread, dgs2Change6) {
  if (!Number.isFinite(spread) || !Number.isFinite(dgs2Change6)) return null
  if (spread >= 0.75 && dgs2Change6 >= 0.50) return -1
  return 0
}

export function scorePermits(yoy) {
  if (!Number.isFinite(yoy)) return null
  if (yoy <= -30) return -2
  if (yoy <= -20) return -1
  if (yoy >= 10) return 1
  return 0
}

export function scoreHours(change6) {
  if (!Number.isFinite(change6)) return null
  if (change6 <= -0.5) return -1
  if (change6 >= 0.3) return 1
  return 0
}

export function scoreEps(yoy) {
  if (!Number.isFinite(yoy)) return null
  if (yoy <= -20) return -2
  if (yoy <= -10) return -1
  if (yoy >= 10) return 1
  return 0
}

export function scoreSloos(level) {
  if (!Number.isFinite(level)) return null
  if (level >= 40) return -2
  if (level >= 20) return -1
  if (level <= -5) return 1
  return 0
}

export function valuationCapActive(capePct, dgs2Change6) {
  if (!Number.isFinite(capePct) || !Number.isFinite(dgs2Change6)) return false
  return capePct >= 90 && dgs2Change6 >= 0.50
}

/** 第二轮：FEDFUNDS 半年变化 ≥ +0.25 → −1 */
export function scoreHikeStart(change6) {
  if (!Number.isFinite(change6)) return null
  return change6 >= 0.25 ? -1 : 0
}

/** 第二轮：GS10 一年变化 ≥ +1.50 → −2；≥ +1.00 → −1 */
export function scoreLongRateShock(change12) {
  if (!Number.isFinite(change12)) return null
  if (change12 >= 1.50) return -2
  if (change12 >= 1.00) return -1
  return 0
}

/**
 * 第二轮：核心 PCE 3 个月年化 a3 与同比 y
 * a3 ≥ 3.0 且 a3 ≥ y + 0.5 → −1；a3 ≤ 2.0 → +1
 */
export function scorePceMomentum(a3, yoy) {
  if (!Number.isFinite(a3)) return null
  if (a3 >= 3.0 && Number.isFinite(yoy) && a3 >= yoy + 0.5) return -1
  if (a3 <= 2.0) return 1
  return 0
}

/** 第二轮：T10YIE 半年变化 ≥ +0.50 → −1 */
export function scoreBreakevenShock(change6) {
  if (!Number.isFinite(change6)) return null
  return change6 >= 0.50 ? -1 : 0
}

/** 指数水平的百分比变化：(now/prior)^power − 1，×100 */
export function percentChange(now, prior, power = 1) {
  if (!(prior > 0) || !Number.isFinite(now)) return null
  return clean(((now / prior) ** power - 1) * 100)
}

/** 序列按 observedOn 的最新点（不看 availableOn；用于当前读数） */
export function latestObserved(series = []) {
  return series.length ? series[series.length - 1] : null
}

/** 同月观测（只按 observedOn，不看 availableOn） */
function monthPointRaw(series, ym) {
  const end = monthEnd(ym)
  const point = series[upperBound(series, end, 'observedOn') - 1]
  return point && month(point.observedOn) === ym ? point : null
}

/** 水平序列在 asOf 的 n 个月变化（回测：尊重 availableOn） */
function levelChange(series, asOf, months) {
  const point = pointAt(series, asOf)
  if (!point) return { value: null, observedOn: null }
  const prior = monthPoint(series, month(monthEnd(point.observedOn, -months)), asOf)
  return {
    value: prior ? clean(point.value - prior.value) : null,
    observedOn: point.observedOn,
  }
}

/** 当前读数：最新观测的 n 个月变化（不套发布滞后） */
function levelChangeCurrent(series, months) {
  const point = latestObserved(series)
  if (!point) return { value: null, observedOn: null }
  const prior = monthPointRaw(series, month(monthEnd(point.observedOn, -months)))
  return {
    value: prior ? clean(point.value - prior.value) : null,
    observedOn: point.observedOn,
  }
}

/** PCE a3（3 个月年化，power=4）与同比；回测尊重 availableOn */
function pceMomentumAt(series, asOf) {
  const point = pointAt(series, asOf)
  if (!point) return { a3: null, yoy: null, observedOn: null }
  const prior3 = monthPoint(series, month(monthEnd(point.observedOn, -3)), asOf)
  const prior12 = monthPoint(series, month(monthEnd(point.observedOn, -12)), asOf)
  return {
    a3: prior3 ? percentChange(point.value, prior3.value, 4) : null,
    yoy: prior12 ? percentChange(point.value, prior12.value, 1) : null,
    observedOn: point.observedOn,
  }
}

function pceMomentumCurrent(series) {
  const point = latestObserved(series)
  if (!point) return { a3: null, yoy: null, observedOn: null }
  const prior3 = monthPointRaw(series, month(monthEnd(point.observedOn, -3)))
  const prior12 = monthPointRaw(series, month(monthEnd(point.observedOn, -12)))
  return {
    a3: prior3 ? percentChange(point.value, prior3.value, 4) : null,
    yoy: prior12 ? percentChange(point.value, prior12.value, 1) : null,
    observedOn: point.observedOn,
  }
}

/**
 * 在 asOf 日读取各候选派生值与打分（回测路径，尊重发布滞后）。
 * extras: { DGS2, PERMIT, AWHMAN, DRTSCILM, EPS, CAPE, T10YIE? }
 * panel：可选；第二轮 hikeStart/longRateShock/pceMomentum 从面板序列读（PCE 可带当时版本）
 * fedfundsSeries：rateExp 用（当日可得）
 */
export function readCandidates(extras, asOf, fedfundsSeries, panel = null) {
  const dgs2 = pointAt(extras.DGS2, asOf)
  const dgs2Prior = dgs2 && pointAt(extras.DGS2, monthEnd(dgs2.observedOn, -6))
  const dgs2Change6 = dgs2 && dgs2Prior && month(dgs2Prior.observedOn) === month(monthEnd(dgs2.observedOn, -6))
    ? clean(dgs2.value - dgs2Prior.value) : null
  const funds = valueAt(fedfundsSeries, asOf)
  // rateExp：DGS2 与 FEDFUNDS 都已可得时用各自最新值之差
  const rateSpread = dgs2 && funds ? clean(dgs2.value - funds.value) : null

  const permitPoint = pointAt(extras.PERMIT, asOf)
  let permitsYoy = null
  if (permitPoint) {
    const ym = month(permitPoint.observedOn)
    const recent = monthlyWindow(extras.PERMIT, ym, 6, asOf)
    const priorYm = month(monthEnd(ym, -12))
    const prior = monthlyWindow(extras.PERMIT, priorYm, 6, asOf)
    if (recent && prior) {
      const a = mean(recent.map(p => p.value))
      const b = mean(prior.map(p => p.value))
      permitsYoy = b > 0 ? clean((a / b - 1) * 100) : null
    }
  }

  const hoursPoint = pointAt(extras.AWHMAN, asOf)
  let hoursChange6 = null
  if (hoursPoint) {
    const prior = monthPoint(extras.AWHMAN, month(monthEnd(hoursPoint.observedOn, -6)), asOf)
    if (prior) hoursChange6 = clean(hoursPoint.value - prior.value)
  }

  const epsPoint = pointAt(extras.EPS, asOf)
  let epsYoy = null
  if (epsPoint) {
    const prior = monthPoint(extras.EPS, month(monthEnd(epsPoint.observedOn, -12)), asOf)
    if (prior && prior.value > 0) epsYoy = clean((epsPoint.value / prior.value - 1) * 100)
  }

  const sloosPoint = pointAt(extras.DRTSCILM, asOf)

  const capePoint = pointAt(extras.CAPE, asOf)
  let capePct = null
  if (capePoint && extras.CAPE?.length) {
    // 扩张窗口：1900 起至该观测（只用 asOf 时已可得的点）
    const window = extras.CAPE.filter(p => p.availableOn <= asOf && p.observedOn <= capePoint.observedOn)
    if (window.length >= 2) capePct = clean(percentile(capePoint.value, window.map(p => p.value)))
  }

  const capActive = valuationCapActive(capePct, dgs2Change6)
  const capScore = Number.isFinite(capePct) && Number.isFinite(dgs2Change6) ? (capActive ? -1 : 0) : null

  const fedSeries = panel?.FEDFUNDS ?? fedfundsSeries
  const hike = levelChange(fedSeries, asOf, 6)
  const longRate = levelChange(panel?.GS10 ?? [], asOf, 12)
  const pce = pceMomentumAt(panel?.PCEPILFE ?? [], asOf)
  const breakeven = levelChange(extras.T10YIE ?? [], asOf, 6)

  return {
    rateExp: {
      value: rateSpread,
      dgs2Change6,
      score: scoreRateExp(rateSpread, dgs2Change6),
      observedOn: dgs2?.observedOn ?? null,
    },
    permits: {
      value: permitsYoy,
      score: scorePermits(permitsYoy),
      observedOn: permitPoint?.observedOn ?? null,
    },
    hours: {
      value: hoursChange6,
      score: scoreHours(hoursChange6),
      observedOn: hoursPoint?.observedOn ?? null,
    },
    eps: {
      value: epsYoy,
      score: scoreEps(epsYoy),
      observedOn: epsPoint?.observedOn ?? null,
    },
    sloos: {
      value: sloosPoint?.value ?? null,
      score: scoreSloos(sloosPoint?.value),
      observedOn: sloosPoint?.observedOn ?? null,
    },
    valuationCap: {
      value: capePct,
      dgs2Change6,
      active: capActive,
      score: capScore,
      observedOn: capePoint?.observedOn ?? null,
    },
    hikeStart: {
      value: hike.value,
      score: scoreHikeStart(hike.value),
      observedOn: hike.observedOn,
    },
    longRateShock: {
      value: longRate.value,
      score: scoreLongRateShock(longRate.value),
      observedOn: longRate.observedOn,
    },
    pceMomentum: {
      value: pce.a3,
      yoy: pce.yoy,
      score: scorePceMomentum(pce.a3, pce.yoy),
      observedOn: pce.observedOn,
    },
    breakevenShock: {
      value: breakeven.value,
      score: scoreBreakevenShock(breakeven.value),
      observedOn: breakeven.observedOn,
    },
  }
}

/**
 * 当前读数：用 FRED 已发布的最新观测，不套回测滞后。
 * PCE 用面板修订值（当前已发布）；T10YIE 用 extras。
 */
export function readCandidatesCurrent(extras, panel, fedfundsSeries) {
  const lagged = readCandidates(extras, '9999-12-31', fedfundsSeries, panel)
  // rateExp / round1 等：pointAt 对远未来日期已取最新可得；第二轮改用不套滞后的变化
  const hike = levelChangeCurrent(panel?.FEDFUNDS ?? fedfundsSeries ?? [], 6)
  const longRate = levelChangeCurrent(panel?.GS10 ?? [], 12)
  const pce = pceMomentumCurrent(panel?.PCEPILFE ?? [])
  const breakeven = levelChangeCurrent(extras.T10YIE ?? [], 6)
  return {
    ...lagged,
    hikeStart: {
      value: hike.value,
      score: scoreHikeStart(hike.value),
      observedOn: hike.observedOn,
    },
    longRateShock: {
      value: longRate.value,
      score: scoreLongRateShock(longRate.value),
      observedOn: longRate.observedOn,
    },
    pceMomentum: {
      value: pce.a3,
      yoy: pce.yoy,
      score: scorePceMomentum(pce.a3, pce.yoy),
      observedOn: pce.observedOn,
    },
    breakevenShock: {
      value: breakeven.value,
      score: scoreBreakevenShock(breakeven.value),
      observedOn: breakeven.observedOn,
    },
  }
}

const MISSING = '暂无足够读数'

/** 把 readCandidates 一条结果格式成契约 current：{ display, score, observedOn } */
export function formatCandidateCurrent(id, reading) {
  if (!reading) return { display: MISSING, score: null, observedOn: null }
  const observedOn = reading.observedOn ?? null
  const score = reading.score ?? null

  if (id === 'valuationCap') {
    if (!Number.isFinite(reading.value) || !Number.isFinite(reading.dgs2Change6)) {
      return { display: MISSING, score: null, observedOn }
    }
    return {
      display: `CAPE ${formatReading(reading.value, '百分位')}，2 年期美债半年变化 ${formatReading(reading.dgs2Change6, '百分点')}`,
      score,
      observedOn,
    }
  }

  if (id === 'rateExp') {
    if (!Number.isFinite(reading.value) || !Number.isFinite(reading.dgs2Change6) || !observedOn) {
      return { display: MISSING, score: null, observedOn }
    }
    return {
      display: `差值 ${formatReading(reading.value, '百分点')}，两年期半年变化 ${formatReading(reading.dgs2Change6, '百分点')}（${formatDate(observedOn)}）`,
      score,
      observedOn,
    }
  }

  if (id === 'breakevenShock') {
    if (!Number.isFinite(reading.value) || !observedOn) {
      return { display: MISSING, score: null, observedOn }
    }
    return {
      display: `10 年盈亏平衡通胀半年变化 ${formatReading(reading.value, '百分点')}（${formatDate(observedOn)}）`,
      score,
      observedOn,
    }
  }

  if (!Number.isFinite(reading.value) || !observedOn) {
    return { display: MISSING, score: null, observedOn }
  }

  const date = formatDate(observedOn, 'monthly')
  if (id === 'permits') {
    return { display: `六月均同比 ${formatReading(reading.value, '%')}（${date}）`, score, observedOn }
  }
  if (id === 'hours') {
    return {
      display: `半年变化 ${formatReading(reading.value, '', 1)} 小时（${date}）`,
      score,
      observedOn,
    }
  }
  if (id === 'eps') {
    return { display: `同比 ${formatReading(reading.value, '%')}（${date}）`, score, observedOn }
  }
  if (id === 'sloos') {
    return { display: `净收紧比例 ${formatReading(reading.value, '%')}（${date}）`, score, observedOn }
  }
  if (id === 'hikeStart') {
    return {
      display: `联邦基金利率半年变化 ${formatReading(reading.value, '百分点')}（${date}）`,
      score,
      observedOn,
    }
  }
  if (id === 'longRateShock') {
    return {
      display: `10 年期美债一年变化 ${formatReading(reading.value, '百分点')}（${date}）`,
      score,
      observedOn,
    }
  }
  if (id === 'pceMomentum') {
    const yoyText = Number.isFinite(reading.yoy) ? `，同比 ${formatReading(reading.yoy, '%')}` : ''
    return {
      display: `3 个月年化 ${formatReading(reading.value, '%')}${yoyText}（${date}）`,
      score,
      observedOn,
    }
  }
  return { display: MISSING, score: null, observedOn }
}
