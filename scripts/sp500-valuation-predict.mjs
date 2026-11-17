// 标普 500 估值预测力与仓位规则回测 v2（预注册 sp500-valuation-predict-prereg-v2-2026-11-15）。
// Node ESM、无 npm 依赖；复用 v1 backtest 导出函数。
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  BOOT_B,
  BLOCK_MEAN,
  COST_HIGH,
  COST_MAIN,
  SEED,
  alignWeights,
  bootstrapDeltaCer,
  buildSeries,
  cer,
  constantMixTarget,
  deltaCerAfterDropBest24,
  holmCorrect,
  metrics,
  parseCsv,
  popStd,
  simulatePortfolio,
  subperiodDeltaCer,
} from './sp500-allocation-backtest.mjs'

export const PREREG_V2 = 'sp500-valuation-predict-prereg-v2-2026-11-15'
export const HORIZONS = [12, 36, 60, 120]
export const MIN_TRAIN = 240
export const OOS_COMMON_START = '1985-01'
export const TRADE_EVAL_START = '1960-01'
export const SHIFT_MARGIN = 120

const round = (v, d = 6) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(d)))
const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length

export function addMonths(ym, delta) {
  const [y0, m0] = ym.split('-').map(Number)
  const t = y0 * 12 + (m0 - 1) + delta
  const y = Math.floor(t / 12)
  const m = (t % 12) + 1
  return `${y}-${String(m).padStart(2, '0')}`
}

/** π̄_t：截至 t−1 的过去 120 个月 CPI 年化通胀。 */
export function trailingInflation(cpi, t) {
  const end = t - 1
  const start = end - 120
  if (start < 0) return null
  const a = cpi[start], b = cpi[end]
  if (!(a > 0) || !(b > 0)) return null
  return (b / a) ** (12 / 120) - 1
}

/** 单位换算：FRED raw → 百万美元；非 Millions/Billions 抛错。 */
export function multiplierToMillions(units) {
  const u = String(units).trim().toLowerCase()
  if (u.startsWith('millions')) return 1
  if (u.startsWith('billions')) return 1000
  throw new Error(`unsupported FRED units for millions conversion: ${units}`)
}

/**
 * Z.1 季频：FRED 用季初月（1/4/7/10）。季末后第 3 个月起可用 → 相对季初 +5 月。
 * 例：Q1(…-01) → 可用 …-06。
 */
export function z1AvailableMonth(quarterStartYm) {
  return addMonths(quarterStartYm, 5)
}

/** 任一分项缺失 → 该季整体缺失；可用月起前向填到月度（最近完整可得季）。 */
export function quarterlyToMonthly(dates, quarterMap) {
  const out = new Array(dates.length).fill(null)
  const qDates = [...quarterMap.keys()].sort()
  let qi = 0
  let best = null
  for (let i = 0; i < dates.length; i++) {
    const d = dates[i]
    while (qi < qDates.length && z1AvailableMonth(qDates[qi]) <= d) {
      const v = quarterMap.get(qDates[qi])
      if (v != null && Number.isFinite(v)) best = v
      // 缺失季：不更新 best（不插值）
      qi++
    }
    out[i] = best
  }
  return out
}

export function buildQuarterMap(rows, id, mult) {
  const m = new Map()
  for (const r of rows) {
    const raw = r[id]
    if (raw == null || !Number.isFinite(raw)) {
      m.set(r.date, null) // 显式缺失季
      continue
    }
    m.set(r.date, raw * mult)
  }
  return m
}

export function computeAiaeQuarter(maps, qDate) {
  const ids = [
    'NCBEILQ027S', 'FBCELLQ027S', 'FGSDODNS', 'CMDEBT',
    'BCNSDODNS', 'DODFFSWCMI', 'SLGSDODNS',
  ]
  const vals = ids.map(id => maps[id].get(qDate))
  if (vals.some(v => v == null || !Number.isFinite(v))) return null
  const eq = vals[0] + vals[1]
  const den = vals.reduce((s, x) => s + x, 0)
  if (!(den > 0)) return null
  return eq / den
}

/** Y_t(h) = Σ_{k=2..h+1} [ln(1+r_{t+k})−ln(1+rf_{t+k})]。 */
export function buildExcessLabels(rStock, rCash, h) {
  const n = rStock.length
  const y = new Array(n).fill(null)
  for (let t = 0; t < n; t++) {
    let s = 0
    let ok = true
    for (let k = 2; k <= h + 1; k++) {
      const j = t + k
      if (j >= n || rStock[j] == null || rCash[j] == null) { ok = false; break }
      if (!(1 + rStock[j] > 0) || !(1 + rCash[j] > 0)) { ok = false; break }
      s += Math.log(1 + rStock[j]) - Math.log(1 + rCash[j])
    }
    if (ok) y[t] = s
  }
  return y
}

/** 标签在信号月 t 已实现 iff s ≤ t − h − 1。 */
export function isLabelRealized(s, t, h) {
  return s <= t - h - 1
}

export function computeCapeYield(cape) {
  return cape.map(v => (v != null && v > 0 ? 1 / v : null))
}

export function computeEcy(cape, gs10, cpi) {
  const n = cape.length
  const out = new Array(n).fill(null)
  for (let t = 0; t < n; t++) {
    if (cape[t] == null || !(cape[t] > 0) || gs10[t] == null) continue
    const pi = trailingInflation(cpi, t)
    if (pi == null) continue
    const real10 = gs10[t] / 100 - pi
    out[t] = 1 / cape[t] - real10
  }
  return out
}

export function computeSop(P, D, E, tb3msAnnualPct) {
  const n = P.length
  const out = new Array(n).fill(null)
  for (let t = 0; t < n; t++) {
    const d = t >= 3 ? D[t - 3] : null
    const eNow = t >= 3 ? E[t - 3] : null
    const eOld = t >= 243 ? E[t - 243] : null
    const rf = tb3msAnnualPct[t]
    if (P[t] == null || !(P[t] > 0) || d == null || !(d >= 0)) continue
    if (eNow == null || !(eNow > 0) || eOld == null || !(eOld > 0)) continue
    if (rf == null) continue
    const g = (Math.log(eNow) - Math.log(eOld)) / 20
    out[t] = Math.log(1 + d / P[t]) + g - Math.log(1 + rf / 100)
  }
  return out
}

/** 算术口径 SOP（稳健性）。 */
export function computeSopArith(P, D, E, tb3msAnnualPct) {
  const n = P.length
  const out = new Array(n).fill(null)
  for (let t = 0; t < n; t++) {
    const d = t >= 3 ? D[t - 3] : null
    const eNow = t >= 3 ? E[t - 3] : null
    const eOld = t >= 243 ? E[t - 243] : null
    const rf = tb3msAnnualPct[t]
    if (P[t] == null || !(P[t] > 0) || d == null || !(d >= 0)) continue
    if (eNow == null || !(eNow > 0) || eOld == null || !(eOld > 0)) continue
    if (rf == null) continue
    const g = (eNow / eOld) ** (1 / 20) - 1
    out[t] = d / P[t] + g - rf / 100
  }
  return out
}

export function expandingZScore(x, t, minN = MIN_TRAIN) {
  const hist = []
  for (let i = 0; i <= t; i++) if (x[i] != null && Number.isFinite(x[i])) hist.push(x[i])
  if (hist.length < minN) return null
  const m = mean(hist)
  const sd = popStd(hist)
  if (sd == null || !(sd > 0)) return null
  return (x[t] - m) / sd
}

export function momentumLogExcess(rStock, rCash, t) {
  if (t < 11) return null
  let s = 0
  for (let k = t - 11; k <= t; k++) {
    if (rStock[k] == null || rCash[k] == null) return null
    if (!(1 + rStock[k] > 0) || !(1 + rCash[k] > 0)) return null
    s += Math.log(1 + rStock[k]) - Math.log(1 + rCash[k])
  }
  return s
}

/** 扩张 OLS 累加器：O(1) 增量。 */
export function createOlsAcc() {
  return { n: 0, sumX: 0, sumY: 0, sumXX: 0, sumXY: 0 }
}

export function olsAdd(acc, x, y) {
  acc.n++
  acc.sumX += x
  acc.sumY += y
  acc.sumXX += x * x
  acc.sumXY += x * y
}

export function olsFit(acc) {
  if (acc.n < 2) return null
  const sxx = acc.sumXX - (acc.sumX * acc.sumX) / acc.n
  if (!(Math.abs(sxx) > 1e-18)) return null
  const sxy = acc.sumXY - (acc.sumX * acc.sumY) / acc.n
  const beta = sxy / sxx
  const alpha = acc.sumY / acc.n - beta * (acc.sumX / acc.n)
  return { alpha, beta, n: acc.n }
}

/**
 * 对单个预测变量跑扩张窗口 OOS（含 CT 约束）。
 * mode: 'ols' | 'sop'
 * expectedSign: +1 / -1 / null（SOP）
 */
export function runOosForecast({
  x, y, h, dates,
  oosStart, oosEnd = null,
  mode = 'ols',
  expectedSign = 1,
  applyCt = true,
  minTrain = MIN_TRAIN,
}) {
  const n = dates.length
  const yhat = new Array(n).fill(null)
  const yhist = new Array(n).fill(null)
  const resid = new Array(n).fill(null)
  const betaPath = new Array(n).fill(null)

  // 预计算：每个 t 时「新实现」的标签索引 = t - h - 1（若有效）
  // 扩张：按 t 递增，把刚实现的 (x_s,y_s) 加入 OLS / 历史均值
  const ols = createOlsAcc()
  const histYs = []
  let nextRealize = 0 // 下一个待加入的 s（s 满足 s <= t-h-1）

  const preds = []
  const expandPreds = []
  for (let t = 0; t < n; t++) {
    // 加入新实现标签
    const maxS = t - h - 1
    while (nextRealize <= maxS && nextRealize < n) {
      const s = nextRealize
      if (y[s] != null && Number.isFinite(y[s])) {
        histYs.push(y[s])
        if (mode === 'ols' && x[s] != null && Number.isFinite(x[s])) {
          olsAdd(ols, x[s], y[s])
        }
      }
      nextRealize++
    }

    // M1：OLS 用实际进入回归的样本数；SOP 用已实现标签数
    const trainN = mode === 'ols' ? ols.n : histYs.length
    if (trainN < minTrain) continue
    const histMean = mean(histYs)
    yhist[t] = histMean

    let pred = null
    if (mode === 'sop') {
      if (x[t] == null || !Number.isFinite(x[t])) continue
      pred = (h / 12) * x[t]
    } else {
      if (x[t] == null || !Number.isFinite(x[t])) continue
      const fit = olsFit(ols)
      if (!fit) continue
      betaPath[t] = fit.beta
      pred = fit.alpha + fit.beta * x[t]
      if (applyCt) {
        const signOk = expectedSign == null
          ? true
          : expectedSign > 0 ? fit.beta > 0 : fit.beta < 0
        if (!signOk) pred = histMean
        if (pred < 0) pred = 0
      }
    }
    yhat[t] = pred

    // expandPreds：自首个可预测月起凡有标签的预测（供区间残差池；不限 OOS 窗）
    if (y[t] != null && Number.isFinite(y[t])) {
      expandPreds.push({ t, y: y[t], yhat: pred, yhist: histMean })
      resid[t] = y[t] - pred
    }

    const d = dates[t]
    if (d < oosStart) continue
    if (oosEnd && d > oosEnd) continue
    if (y[t] == null || !Number.isFinite(y[t])) continue
    preds.push({ t, y: y[t], yhat: pred, yhist: histMean })
  }

  return { yhat, yhist, resid, betaPath, preds, expandPreds }
}

export function oosR2(preds) {
  if (!preds.length) return null
  let num = 0, den = 0
  for (const p of preds) {
    num += (p.y - p.yhat) ** 2
    den += (p.y - p.yhist) ** 2
  }
  if (!(den > 0)) return null
  return 1 - num / den
}

export function countNonOverlap(preds, h) {
  if (!preds.length) return 0
  let c = 0
  let lastT = -Infinity
  for (const p of preds) {
    if (p.t >= lastT + h) {
      c++
      lastT = p.t
    }
  }
  return c
}

/**
 * 循环平移零分布 p 值。
 * offsets ∈ [margin, N-margin]；单侧 p = (#{R²_shift ≥ R²_obs}+1)/(K+1)
 */
export function circularShiftPValue({
  x, y, h, dates, oosStart, oosEnd,
  mode, expectedSign, applyCt,
  observedR2, margin = SHIFT_MARGIN,
}) {
  // N = 变量有效长度：两端都有限的最长跨度
  let lo = 0, hi = x.length - 1
  while (lo < x.length && (x[lo] == null || !Number.isFinite(x[lo]))) lo++
  while (hi >= 0 && (x[hi] == null || !Number.isFinite(x[hi]))) hi--
  const N = hi - lo + 1
  if (N < 2 * margin + 1) {
    return { p: 1, nOffsets: 0, nGe: 0, N }
  }
  let nGe = 0
  let nOff = 0
  for (let off = margin; off <= N - margin; off++) {
    // 只在 [lo,hi] 环上平移，再映回全长数组
    const xShift = x.slice()
    for (let i = lo; i <= hi; i++) {
      const j = lo + ((i - lo + off) % N)
      xShift[i] = x[j]
    }
    const { preds } = runOosForecast({
      x: xShift, y, h, dates, oosStart, oosEnd, mode, expectedSign, applyCt,
    })
    const r2 = oosR2(preds)
    nOff++
    if (r2 != null && observedR2 != null && r2 >= observedR2) nGe++
  }
  const p = (nGe + 1) / (nOff + 1)
  return { p, nOffsets: nOff, nGe, N }
}

/** 标准正态 CDF（Abramowitz–Stegun 近似）。 */
export function normCdf(z) {
  if (!Number.isFinite(z)) return null
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989422804014327 * Math.exp(-0.5 * z * z)
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  return z >= 0 ? 1 - p : p
}

/** 单侧 p = 1 − Φ(stat)（备择：统计量 > 0）。 */
export function oneSidedNormalP(stat) {
  if (stat == null || !Number.isFinite(stat)) return null
  const c = normCdf(stat)
  return c == null ? null : 1 - c
}

/** Newey–West HAC 方差（滞后 L）。 */
export function neweyWestSe(series, L) {
  const n = series.length
  if (n < 2) return null
  const m = mean(series)
  const e = series.map(v => v - m)
  const gamma0 = e.reduce((s, v) => s + v * v, 0) / n
  let varHat = gamma0
  for (let j = 1; j <= L; j++) {
    let g = 0
    for (let t = j; t < n; t++) g += e[t] * e[t - j]
    g /= n
    const w = 1 - j / (L + 1)
    varHat += 2 * w * g
  }
  if (!(varHat > 0)) return null
  return Math.sqrt(varHat / n)
}

/** Clark–West (2007) 嵌套模型统计量 + 正态单侧 p。 */
export function clarkWestStat(preds, lag) {
  if (preds.length < 10) return null
  const f = preds.map(p => {
    const e1 = p.y - p.yhist
    const e2 = p.y - p.yhat
    return e1 * e1 - e2 * e2 + (p.yhat - p.yhist) ** 2
  })
  const m = mean(f)
  const se = neweyWestSe(f, lag)
  if (se == null || !(se > 0)) return null
  const stat = m / se
  return { stat, mean: m, n: f.length, p: oneSidedNormalP(stat) }
}

/** Diebold–Mariano 型：平方损失差 + 正态单侧 p。 */
export function dieboldMarianoStat(preds, lag) {
  if (preds.length < 10) return null
  const d = preds.map(p => (p.y - p.yhist) ** 2 - (p.y - p.yhat) ** 2)
  const m = mean(d)
  const se = neweyWestSe(d, lag)
  if (se == null || !(se > 0)) return null
  const stat = m / se
  return { stat, mean: m, n: d.length, p: oneSidedNormalP(stat) }
}

/**
 * 第 t 月预测区间：残差池仅含已实现标签 preds[i].t ≤ t−h−1。
 * poolStartDate：若给，只收 dates[t']≥poolStartDate 的残差（「仅 1985 起」对照）。
 * 池 < minPool 时返回 null。
 */
export function predictionIntervalAt({
  expandPreds, dates, t, h, yhat, poolStartDate = null, minPool = 60, level = 0.8,
}) {
  if (yhat[t] == null) return null
  const histResid = []
  for (const p of expandPreds) {
    if (p.t > t - h - 1) break
    if (poolStartDate && dates[p.t] < poolStartDate) continue
    histResid.push(p.y - p.yhat)
  }
  if (histResid.length < minPool) return null
  const alpha = (1 - level) / 2
  const sorted = [...histResid].sort((a, b) => a - b)
  const loQ = sorted[Math.floor(alpha * (sorted.length - 1))]
  const hiQ = sorted[Math.ceil((1 - alpha) * (sorted.length - 1))]
  return {
    lo: yhat[t] + loQ,
    hi: yhat[t] + hiQ,
    nPool: histResid.length,
  }
}

/** 覆盖率：主池=自首个可预测月起全部扩张已实现残差；对照可设 poolStartDate。 */
export function predictionIntervalCoverage({
  expandPreds, dates, yhat, y, h,
  evalStart = OOS_COMMON_START,
  poolStartDate = null,
  minPool = 60,
  level = 0.8,
}) {
  let covered = 0, total = 0
  for (let t = 0; t < dates.length; t++) {
    if (yhat[t] == null || y[t] == null) continue
    if (dates[t] < evalStart) continue
    const iv = predictionIntervalAt({
      expandPreds, dates, t, h, yhat, poolStartDate, minPool, level,
    })
    if (!iv) continue
    total++
    if (y[t] >= iv.lo && y[t] <= iv.hi) covered++
  }
  return {
    coverage: total ? covered / total : null,
    n: total,
    level,
    minPool,
    poolStartDate,
  }
}

export function splitOosR2(preds, dates, midEnd = '2004-12') {
  const a = [], b = []
  for (const p of preds) {
    if (dates[p.t] <= midEnd) a.push(p)
    else b.push(p)
  }
  return { r2a: oosR2(a), r2b: oosR2(b), na: a.length, nb: b.length }
}

export function judgePredict(r2, pHolm, r2a, r2b) {
  if (r2 == null || r2 <= 0) return '无'
  const a = pHolm < 0.05
  const b = r2 > 0
  const c = r2a != null && r2a > 0 && r2b != null && r2b > 0
  if (a && b && c) return '有预测力'
  return '未证实'
}

export function clip(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x))
}

export async function loadPredictData(dataDir) {
  const shiller = parseCsv(await readFile(join(dataDir, 'shiller.csv'), 'utf8'))
  const fred = parseCsv(await readFile(join(dataDir, 'fred-tb3ms.csv'), 'utf8'))
  const units = JSON.parse(await readFile(join(dataDir, 'fred-units.json'), 'utf8'))
  const unitMap = Object.fromEntries(units.map(u => [u.id, u]))
  const loadQ = async id => parseCsv(await readFile(join(dataDir, `fred-${id.toLowerCase()}.csv`), 'utf8'))
  const seriesIds = [
    'NCBEILQ027S', 'FBCELLQ027S', 'FGSDODNS', 'CMDEBT',
    'BCNSDODNS', 'DODFFSWCMI', 'SLGSDODNS',
    'NCBCEL', 'GDP', 'BOGZ1FL105015005Q', 'A455RC1Q027SBEA',
  ]
  const raw = {}
  for (const id of seriesIds) raw[id] = await loadQ(id)
  return { shiller, fred, unitMap, raw }
}

export function buildPredictors(series, gs10, raw, unitMap) {
  const { dates, P, D, E, CPI, cape, rCash } = series
  // rCash = TB3MS/1200 → annual pct = rCash*1200
  const tb3msPct = rCash.map(v => (v == null ? null : v * 1200))

  const p1 = computeCapeYield(cape)
  const p2 = computeEcy(cape, gs10, CPI)
  const p4 = computeSop(P, D, E, tb3msPct)
  const p4arith = computeSopArith(P, D, E, tb3msPct)

  // AIAE
  const maps = {}
  for (const id of [
    'NCBEILQ027S', 'FBCELLQ027S', 'FGSDODNS', 'CMDEBT',
    'BCNSDODNS', 'DODFFSWCMI', 'SLGSDODNS',
  ]) {
    const u = unitMap[id]
    if (!u) throw new Error(`missing units for ${id}`)
    const mult = multiplierToMillions(u.units)
    if (mult !== u.multiplier_to_millions) {
      throw new Error(`units multiplier mismatch for ${id}`)
    }
    maps[id] = buildQuarterMap(raw[id], id, mult)
  }
  const aiaeQ = new Map()
  const qDates = new Set()
  for (const id of Object.keys(maps)) for (const d of maps[id].keys()) qDates.add(d)
  for (const qd of [...qDates].sort()) {
    aiaeQ.set(qd, computeAiaeQuarter(maps, qd))
  }
  const p3 = quarterlyToMonthly(dates, aiaeQ)

  // secondary
  const dp = dates.map((_, t) => {
    const d = t >= 3 ? D[t - 3] : null
    if (P[t] == null || !(P[t] > 0) || d == null) return null
    return d / P[t]
  })

  const ncbcelU = unitMap.NCBCEL
  const gdpU = unitMap.GDP
  const bogU = unitMap.BOGZ1FL105015005Q
  const gvaU = unitMap.A455RC1Q027SBEA
  const ncbcelM = buildQuarterMap(raw.NCBCEL, 'NCBCEL', multiplierToMillions(ncbcelU.units))
  const gdpM = buildQuarterMap(raw.GDP, 'GDP', multiplierToMillions(gdpU.units))
  const bogM = buildQuarterMap(raw.BOGZ1FL105015005Q, 'BOGZ1FL105015005Q', multiplierToMillions(bogU.units))
  const gvaM = buildQuarterMap(raw.A455RC1Q027SBEA, 'A455RC1Q027SBEA', multiplierToMillions(gvaU.units))

  const mktGdpQ = new Map()
  const tobQ = new Map()
  const mktGvaQ = new Map()
  for (const qd of [...new Set([...ncbcelM.keys(), ...gdpM.keys(), ...bogM.keys(), ...gvaM.keys()])].sort()) {
    const m = ncbcelM.get(qd), g = gdpM.get(qd), b = bogM.get(qd), gv = gvaM.get(qd)
    // GDP/GVA already in millions after multiplier; prereg: NCBCEL/(GDP×1000) where GDP 十亿
    // Our mult already converted GDP billions→millions, so ratio = m / g (both millions).
    // BUT prereg formula writes NCBCEL/(GDP×1000) with raw FRED units. Equivalent:
    // raw_ncbcel / (raw_gdp * 1000) = (ncbcel_millions) / (gdp_billions * 1000) = m / g_millions.
    mktGdpQ.set(qd, m != null && g != null && g > 0 ? m / g : null)
    tobQ.set(qd, m != null && b != null && b > 0 ? m / b : null)
    mktGvaQ.set(qd, m != null && gv != null && gv > 0 ? m / gv : null)
  }
  const mktGdp = quarterlyToMonthly(dates, mktGdpQ)
  const tobinQ = quarterlyToMonthly(dates, tobQ)
  const mktGva = quarterlyToMonthly(dates, mktGvaQ)

  return {
    p1, p2, p3, p4, p4arith, dp, mktGdp, tobinQ, mktGva, tb3msPct, aiaeQ,
  }
}

/** 长窗口起点：已实现标签 ≥240 且标签所需 TB3MS 全部可得（不早于 1934-01）。 */
export function longWindowStart(dates, y, rCash, h) {
  for (let t = 0; t < dates.length; t++) {
    if (t + h + 1 >= dates.length) return null
    let nReal = 0
    for (let s = 0; s <= t - h - 1; s++) {
      if (y[s] == null) continue
      let ok = true
      for (let k = 2; k <= h + 1; k++) {
        const j = s + k
        if (rCash[j] == null || dates[j] < '1934-01') { ok = false; break }
      }
      if (ok) nReal++
    }
    if (nReal >= MIN_TRAIN) return dates[t]
  }
  return null
}

/** 单条交易规则：信号 → lag=2 → 相对同平均仓位 CM 的 ΔCER / 自助法。 */
export function evalOneTradeRule(series, signal, {
  name, cost = COST_MAIN, evalStart = TRADE_EVAL_START, B = BOOT_B, okIdx = null, lag = 2,
} = {}) {
  const { dates, rStock, rCash } = series
  const n = dates.length
  const aligned = alignWeights(signal, lag)
  let ok = okIdx
  if (!ok) {
    ok = []
    for (let i = 0; i < n; i++) {
      if (dates[i] < evalStart) continue
      if (aligned[i] == null || rStock[i] == null || rCash[i] == null) continue
      ok.push(i)
    }
  }
  const masked = aligned.slice()
  const set = new Set(ok)
  for (let i = 0; i < n; i++) if (!set.has(i)) masked[i] = null
  const sim = simulatePortfolio(rStock, rCash, masked, { cost })
  const met = metrics(sim.portR, rCash, sim.weightsUsed, sim.turnover, dates)
  if (!met) return null
  const cmt = constantMixTarget(met.avgWeight, n, ok)
  const simC = simulatePortfolio(rStock, rCash, cmt, { cost })
  const metC = metrics(simC.portR, rCash, simC.weightsUsed, simC.turnover, dates)
  const endMonth = met.end
  const ranges = {
    '1960-1984': ['1960-01', '1984-12'],
    '1985-2004': ['1985-01', '2004-12'],
    '2005-end': ['2005-01', endMonth],
  }
  const xs = met.excess, ys = metC.excess
  const boot = bootstrapDeltaCer(xs, ys, { B, seed: SEED, meanLen: BLOCK_MEAN })
  const subs = subperiodDeltaCer(xs, ys, dates, met.idx, ranges)
  const drop24 = deltaCerAfterDropBest24(xs, ys)
  const simH = simulatePortfolio(rStock, rCash, masked, { cost: COST_HIGH })
  const metH = metrics(simH.portR, rCash, simH.weightsUsed, simH.turnover, dates)
  const cmH = constantMixTarget(metH.avgWeight, n, ok)
  const simCH = simulatePortfolio(rStock, rCash, cmH, { cost: COST_HIGH })
  const metCH = metrics(simCH.portR, rCash, simCH.weightsUsed, simCH.turnover, dates)
  const highDelta = cer(metH.excess) - cer(metCH.excess)
  return {
    name,
    deltaCer: cer(xs) - cer(ys),
    p: boot.p,
    ci95: boot.ci95,
    subperiods: subs,
    drop24,
    highCostDeltaCer: highDelta,
    metrics: {
      cagr: met.cagr, vol: met.vol, sharpe: met.sharpe, maxDrawdown: met.maxDrawdown,
      cer: met.cer, avgWeight: met.avgWeight, turnoverAnn: met.turnoverAnn, n: met.n,
      start: met.start, end: met.end,
    },
    ok,
  }
}

export function summarizeTradeJudgment(T, holmRow) {
  const a = holmRow.pHolm < 0.05
  const b = Object.values(T.subperiods).every(v => v != null && v > 0)
  const c = T.drop24 != null && T.drop24 > 0
  const d = T.highCostDeltaCer != null && T.highCostDeltaCer > 0
  let verdict = '未证实'
  if (T.deltaCer <= 0) verdict = '无效'
  else if (a && b && c && d) verdict = '有效'
  return {
    name: T.name,
    verdict,
    deltaCer: round(T.deltaCer),
    p: round(T.p, 6),
    pHolm: round(holmRow.pHolm, 6),
    ci95: T.ci95.map(x => round(x)),
    subperiods: Object.fromEntries(Object.entries(T.subperiods).map(([k, v]) => [k, round(v)])),
    drop24: round(T.drop24),
    highCostDeltaCer: round(T.highCostDeltaCer),
    conditions: { a_holm: a, b_subperiods: b, c_drop24: c, d_cost30bps: d },
    metrics: T.metrics,
  }
}

export function runTradingRules(series, ecy, sop, { cost = COST_MAIN, evalStart = TRADE_EVAL_START, B = BOOT_B } = {}) {
  const { dates, rStock, rCash } = series
  const n = dates.length
  const t1 = new Array(n).fill(null)
  const t2 = new Array(n).fill(null)
  const onlyVal = new Array(n).fill(null)
  const onlyMom = new Array(n).fill(null)
  const mom = new Array(n).fill(null)

  for (let t = 0; t < n; t++) {
    mom[t] = momentumLogExcess(rStock, rCash, t)
    const zE = ecy[t] != null ? expandingZScore(ecy, t) : null
    const zM = mom[t] != null ? expandingZScore(mom, t) : null
    const zS = sop[t] != null ? expandingZScore(sop, t) : null
    if (zE != null && zM != null) {
      t1[t] = round(clip(0.6 + 0.1 * (0.5 * zE + 0.5 * zM), 0.4, 0.8), 6)
    }
    if (zS != null) t2[t] = round(clip(0.6 + 0.1 * zS, 0.4, 0.8), 6)
    if (zE != null) onlyVal[t] = round(clip(0.6 + 0.1 * zE, 0.4, 0.8), 6)
    if (zM != null) onlyMom[t] = round(clip(0.6 + 0.1 * zM, 0.4, 0.8), 6)
  }

  // 主判定窗：T1/T2 均可算的首月
  const lag = 2
  const a1 = alignWeights(t1, lag)
  const a2 = alignWeights(t2, lag)
  let start = evalStart
  for (let i = 0; i < n; i++) {
    if (dates[i] < evalStart) continue
    if (a1[i] != null && a2[i] != null && rStock[i] != null && rCash[i] != null) {
      start = dates[i]
      break
    }
  }
  const ok = []
  for (let i = 0; i < n; i++) {
    if (dates[i] < start) continue
    if (a1[i] == null || a2[i] == null || rStock[i] == null || rCash[i] == null) continue
    ok.push(i)
  }

  const T1 = evalOneTradeRule(series, t1, { name: 'T1', cost, evalStart: start, B, okIdx: ok })
  const T2 = evalOneTradeRule(series, t2, { name: 'T2', cost, evalStart: start, B, okIdx: ok })
  const withHolm = holmCorrect([{ id: 'T1', p: T1.p }, { id: 'T2', p: T2.p }])

  // 稳健性：同窗 0.30% 成本 ΔCER；T1 仅估值 / 仅动量（各自可交易窗）
  const t1Cost30 = evalOneTradeRule(series, t1, { name: 'T1_cost30', cost: COST_HIGH, evalStart: start, B, okIdx: ok })
  const t2Cost30 = evalOneTradeRule(series, t2, { name: 'T2_cost30', cost: COST_HIGH, evalStart: start, B, okIdx: ok })
  const t1Val = evalOneTradeRule(series, onlyVal, { name: 'T1_valOnly', cost, evalStart, B })
  const t1Mom = evalOneTradeRule(series, onlyMom, { name: 'T1_momOnly', cost, evalStart, B })

  const packVariant = (T) => T && ({
    name: T.name,
    deltaCer: round(T.deltaCer),
    p: round(T.p, 6),
    ci95: T.ci95.map(x => round(x)),
    highCostDeltaCer: round(T.highCostDeltaCer),
    metrics: T.metrics,
  })

  return {
    evalStart: start,
    evalEnd: T1.metrics.end,
    nMonths: ok.length,
    judgments: [summarizeTradeJudgment(T1, withHolm[0]), summarizeTradeJudgment(T2, withHolm[1])],
    t1Targets: t1,
    t2Targets: t2,
    variants: {
      T1_cost30: packVariant(t1Cost30),
      T2_cost30: packVariant(t2Cost30),
      T1_valOnly: packVariant(t1Val),
      T1_momOnly: packVariant(t1Mom),
    },
  }
}

export async function runAllPredict(dataDir, { skipShift = false, tradeB = BOOT_B } = {}) {
  const t0 = Date.now()
  const { shiller, fred, unitMap, raw } = await loadPredictData(dataDir)
  const series = buildSeries(shiller, fred)
  const gsMap = new Map(shiller.map(r => [r.date, r.GS10]))
  const gs10 = series.dates.map(d => gsMap.get(d) ?? null)

  const preds = buildPredictors(series, gs10, raw, unitMap)
  const labels = Object.fromEntries(HORIZONS.map(h => [h, buildExcessLabels(series.rStock, series.rCash, h)]))

  const mainSpecs = [
    { name: 'P1', x: preds.p1, mode: 'ols', expectedSign: 1, family: 'main' },
    { name: 'P2', x: preds.p2, mode: 'ols', expectedSign: 1, family: 'main' },
    { name: 'P3', x: preds.p3, mode: 'ols', expectedSign: -1, family: 'exploratory' },
    { name: 'P4', x: preds.p4, mode: 'sop', expectedSign: null, family: 'main' },
  ]

  const common = {}
  const longWin = {}
  const coverage = {}
  const refTests = {}

  for (const h of HORIZONS) {
    common[h] = {}
    longWin[h] = {}
    coverage[h] = {}
    refTests[h] = {}
    const y = labels[h]
    const lwStart = longWindowStart(series.dates, y, series.rCash, h)

    for (const spec of mainSpecs) {
      const run = runOosForecast({
        x: spec.x, y, h, dates: series.dates,
        oosStart: OOS_COMMON_START,
        mode: spec.mode, expectedSign: spec.expectedSign, applyCt: true,
      })
      let shift = { p: null, nOffsets: 0, nGe: 0, N: 0 }
      const r2 = oosR2(run.preds)
      if (!skipShift && spec.family === 'main') {
        shift = circularShiftPValue({
          x: spec.x, y, h, dates: series.dates,
          oosStart: OOS_COMMON_START, mode: spec.mode,
          expectedSign: spec.expectedSign, applyCt: true,
          observedR2: r2,
        })
      } else if (!skipShift && spec.family === 'exploratory') {
        // still compute for reporting but mark exploratory
        shift = circularShiftPValue({
          x: spec.x, y, h, dates: series.dates,
          oosStart: OOS_COMMON_START, mode: spec.mode,
          expectedSign: spec.expectedSign, applyCt: true,
          observedR2: r2,
        })
      }
      const splits = splitOosR2(run.preds, series.dates)
      common[h][spec.name] = {
        oosR2: round(r2),
        nOos: run.preds.length,
        nNonOverlap: countNonOverlap(run.preds, h),
        r2_1985_2004: round(splits.r2a),
        r2_2005_end: round(splits.r2b),
        shiftP: shift.p == null ? null : round(shift.p, 6),
        shiftN: shift.nOffsets,
        family: spec.family,
        oosStart: run.preds[0] ? series.dates[run.preds[0].t] : null,
        oosEnd: run.preds.length ? series.dates[run.preds.at(-1).t] : null,
      }
      // B1：主覆盖率用全扩张已实现残差；对照仅 1985 起残差池
      coverage[h][spec.name] = {
        expand: predictionIntervalCoverage({
          expandPreds: run.expandPreds, dates: series.dates,
          yhat: run.yhat, y, h, evalStart: OOS_COMMON_START, minPool: 60,
        }),
        oos1985: predictionIntervalCoverage({
          expandPreds: run.expandPreds, dates: series.dates,
          yhat: run.yhat, y, h, evalStart: OOS_COMMON_START,
          poolStartDate: OOS_COMMON_START, minPool: 60,
        }),
      }
      if (spec.name === 'P1' || spec.name === 'P2') {
        const cw = clarkWestStat(run.preds, h + 1)
        refTests[h][spec.name] = { clarkWest: cw && {
          stat: round(cw.stat, 6), p: round(cw.p, 6), n: cw.n,
        } }
      } else if (spec.name === 'P4') {
        const dm = dieboldMarianoStat(run.preds, h + 1)
        refTests[h][spec.name] = { dm: dm && {
          stat: round(dm.stat, 6), p: round(dm.p, 6), n: dm.n,
        } }
      }

      if (lwStart && (spec.name === 'P1' || spec.name === 'P2' || spec.name === 'P4')) {
        const runL = runOosForecast({
          x: spec.x, y, h, dates: series.dates,
          oosStart: lwStart, mode: spec.mode,
          expectedSign: spec.expectedSign, applyCt: true,
        })
        longWin[h][spec.name] = {
          start: lwStart,
          end: runL.preds.length ? series.dates[runL.preds.at(-1).t] : null,
          oosR2: round(oosR2(runL.preds)),
          nOos: runL.preds.length,
          nNonOverlap: countNonOverlap(runL.preds, h),
        }
      }
    }

    // PC = avg of P1,P2,P4 forecasts; PC3 includes P3
    const runs = {}
    for (const spec of mainSpecs) {
      runs[spec.name] = runOosForecast({
        x: spec.x, y, h, dates: series.dates,
        oosStart: OOS_COMMON_START, mode: spec.mode,
        expectedSign: spec.expectedSign, applyCt: true,
      })
    }
    const combine = (names) => {
      const byT = new Map()
      for (const nm of names) {
        for (const p of runs[nm].preds) {
          if (!byT.has(p.t)) byT.set(p.t, { t: p.t, y: p.y, yhists: [], yhats: [] })
          const o = byT.get(p.t)
          o.yhats.push(p.yhat)
          o.yhists.push(p.yhist)
        }
      }
      return [...byT.values()]
        .filter(o => o.yhats.length === names.length)
        .map(o => ({
          t: o.t,
          y: o.y,
          yhat: mean(o.yhats),
          yhist: mean(o.yhists),
        }))
    }
    const pcPreds = combine(['P1', 'P2', 'P4'])
    const pc3Preds = combine(['P1', 'P2', 'P3', 'P4'])
    common[h].PC = {
      oosR2: round(oosR2(pcPreds)),
      nOos: pcPreds.length,
      family: 'benchmark',
      note: '等权 P1/P2/P4',
    }
    common[h].PC3 = {
      oosR2: round(oosR2(pc3Preds)),
      nOos: pc3Preds.length,
      family: 'exploratory',
      note: '等权含 P3',
    }
  }

  // Holm on 12 main tests
  const mainTests = []
  for (const name of ['P1', 'P2', 'P4']) {
    for (const h of HORIZONS) {
      mainTests.push({
        id: `${name}_h${h}`,
        name,
        h,
        p: common[h][name].shiftP ?? 1,
        oosR2: common[h][name].oosR2,
        r2a: common[h][name].r2_1985_2004,
        r2b: common[h][name].r2_2005_end,
      })
    }
  }
  const holm = holmCorrect(mainTests.map(t => ({ id: t.id, p: t.p ?? 1 })))
  const judgmentsA = mainTests.map((t, i) => {
    const pHolm = holm[i].pHolm
    const verdict = judgePredict(t.oosR2, pHolm, t.r2a, t.r2b)
    const c = common[t.h][t.name]
    c.pHolm = round(pHolm, 6)
    c.verdict = verdict
    return {
      id: t.id, name: t.name, h: t.h,
      oosR2: t.oosR2, shiftP: t.p, pHolm: round(pHolm, 6),
      r2_1985_2004: t.r2a, r2_2005_end: t.r2b, verdict,
      nOos: c.nOos, nNonOverlap: c.nNonOverlap, oosStart: c.oosStart, oosEnd: c.oosEnd,
    }
  })

  // I2：CW 族 {P1,P2}×4、DM 族 {P4}×4 各 Holm
  const cwTests = []
  const dmTests = []
  for (const h of HORIZONS) {
    for (const name of ['P1', 'P2']) {
      const p = refTests[h][name]?.clarkWest?.p
      cwTests.push({ id: `CW_${name}_h${h}`, name, h, p: p ?? 1 })
    }
    const p4 = refTests[h].P4?.dm?.p
    dmTests.push({ id: `DM_P4_h${h}`, name: 'P4', h, p: p4 ?? 1 })
  }
  const cwHolm = holmCorrect(cwTests.map(t => ({ id: t.id, p: t.p })))
  const dmHolm = holmCorrect(dmTests.map(t => ({ id: t.id, p: t.p })))
  cwTests.forEach((t, i) => {
    if (refTests[t.h][t.name]?.clarkWest) {
      refTests[t.h][t.name].clarkWest.pHolm = round(cwHolm[i].pHolm, 6)
    }
  })
  dmTests.forEach((t, i) => {
    if (refTests[t.h].P4?.dm) {
      refTests[t.h].P4.dm.pHolm = round(dmHolm[i].pHolm, 6)
    }
  })
  const refHolm = {
    cw: cwTests.map((t, i) => ({
      id: t.id, name: t.name, h: t.h, p: round(t.p, 6), pHolm: round(cwHolm[i].pHolm, 6),
      shiftP: common[t.h][t.name].shiftP,
    })),
    dm: dmTests.map((t, i) => ({
      id: t.id, name: t.name, h: t.h, p: round(t.p, 6), pHolm: round(dmHolm[i].pHolm, 6),
      shiftP: common[t.h].P4.shiftP,
    })),
  }

  // secondary vars (report only)
  const secondary = {}
  const secSpecs = [
    { name: 'D12P', x: preds.dp, mode: 'ols', expectedSign: 1, z1: false },
    { name: 'MktGDP', x: preds.mktGdp, mode: 'ols', expectedSign: -1, z1: true },
    { name: 'TobinQ', x: preds.tobinQ, mode: 'ols', expectedSign: -1, z1: true },
    { name: 'MktGVA', x: preds.mktGva, mode: 'ols', expectedSign: -1, z1: true },
  ]
  for (const h of HORIZONS) {
    secondary[h] = {}
    for (const spec of secSpecs) {
      const run = runOosForecast({
        x: spec.x, y: labels[h], h, dates: series.dates,
        oosStart: OOS_COMMON_START, mode: spec.mode,
        expectedSign: spec.expectedSign, applyCt: true,
      })
      secondary[h][spec.name] = { oosR2: round(oosR2(run.preds)), nOos: run.preds.length }
    }
  }

  // I1：§8 稳健性全量（4 周期）
  const lag3 = (arr) => {
    const o = new Array(arr.length).fill(null)
    for (let i = 3; i < arr.length; i++) o[i] = arr[i - 3]
    return o
  }
  const robustness = { byHorizon: {}, trade: null }
  for (const h of HORIZONS) {
    const y = labels[h]
    const row = {}
    for (const spec of [
      { name: 'P1', x: preds.p1, mode: 'ols', expectedSign: 1 },
      { name: 'P2', x: preds.p2, mode: 'ols', expectedSign: 1 },
      { name: 'P3', x: preds.p3, mode: 'ols', expectedSign: -1 },
    ]) {
      const noCt = runOosForecast({
        x: spec.x, y, h, dates: series.dates, oosStart: OOS_COMMON_START,
        mode: spec.mode, expectedSign: spec.expectedSign, applyCt: false,
      })
      row[`${spec.name}_noCT`] = round(oosR2(noCt.preds))
    }
    for (const spec of [
      { name: 'P1', x: preds.p1, mode: 'ols', expectedSign: 1 },
      { name: 'P2', x: preds.p2, mode: 'ols', expectedSign: 1 },
      { name: 'P4', x: preds.p4, mode: 'sop', expectedSign: null },
    ]) {
      const r75 = runOosForecast({
        x: spec.x, y, h, dates: series.dates, oosStart: '1975-01',
        mode: spec.mode, expectedSign: spec.expectedSign, applyCt: true,
      })
      row[`${spec.name}_oos1975`] = round(oosR2(r75.preds))
    }
    const sopA = runOosForecast({
      x: preds.p4arith, y, h, dates: series.dates, oosStart: OOS_COMMON_START,
      mode: 'sop', expectedSign: null, applyCt: false,
    })
    row.P4_arith = round(oosR2(sopA.preds))
    const p3extra = runOosForecast({
      x: lag3(preds.p3), y, h, dates: series.dates, oosStart: OOS_COMMON_START,
      mode: 'ols', expectedSign: -1, applyCt: true,
    })
    row.P3_extraLag3m = round(oosR2(p3extra.preds))
    for (const spec of secSpecs.filter(s => s.z1)) {
      const r = runOosForecast({
        x: lag3(spec.x), y, h, dates: series.dates, oosStart: OOS_COMMON_START,
        mode: 'ols', expectedSign: spec.expectedSign, applyCt: true,
      })
      row[`${spec.name}_extraLag3m`] = round(oosR2(r.preds))
    }
    robustness.byHorizon[h] = row
  }

  const trade = runTradingRules(series, preds.p2, preds.p4, { B: tradeB })
  robustness.trade = trade.variants

  const elapsedMs = Date.now() - t0
  const choices = [
    'Z.1 FRED 季初月 +5 月作为「季末后第 3 个月」可用月（Q1=01→06）。',
    '缺失季不插值；月度前向填充最近一个完整可得季的 AIAE。',
    '市值/GDP、市值/GVA：先把 GDP/GVA 从十亿×1000 成百万，再与 NCBCEL（百万）相除。',
    '循环平移在变量有效区间 [lo,hi] 上取 N，偏移 [120,N−120]，每次完整重跑扩张 OLS+CT+OOS R²。',
    '扩张 OLS 用累加和 O(1) 更新；最小训练量按 OLS 实际样本数（SOP 按已实现标签数）；P4 为 h/12×SOP。',
    '预测区间：残差池=自首个可预测月起全部扩张预测的已实现残差（t′≤t−h−1）；池<60 该月不计入覆盖率；另报仅 1985 起残差池对照。',
    'B 部分评估起点取 T1/T2 均可算且 ≥1960-01 的首月。',
    'z 分数用总体标准差 /n，历史含当期，至少 240 个月。',
    '参考检验：CW/DM 用 NW HAC + 正态单侧 p；CW 族与 DM 族各自 Holm，与平移 p 并列，判定仍以平移为准。',
  ]

  return {
    prereg: PREREG_V2,
    elapsedMs,
    dataEnd: series.dates.at(-1),
    judgmentsA,
    common,
    longWin,
    coverage,
    refTests,
    refHolm,
    secondary,
    robustness,
    trade,
    choices,
    skipShift,
  }
}

export function formatPredictReport(res) {
  const lines = []
  const fmtCov = c => (c?.coverage == null ? null : round(c.coverage, 4))
  lines.push('# 标普 500 估值指标预测力与仓位规则 · 结果 v2（2026-11-15）')
  lines.push('')
  lines.push(`预注册：\`${res.prereg}\`。数据末月：${res.dataEnd}。耗时：${(res.elapsedMs / 1000).toFixed(1)}s。`)
  lines.push('')
  lines.push('## 判定表 A：预测力（主族 P1/P2/P4 × 4 周期）')
  lines.push('')
  lines.push('| 变量 | h | OOS R² | 平移 p | Holm p | R² 1985–2004 | R² 2005–末 | n | 不重叠 | 起 | 止 | 判定 |')
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|')
  for (const j of res.judgmentsA) {
    lines.push(`| ${j.name} | ${j.h} | ${j.oosR2} | ${j.shiftP} | ${j.pHolm} | ${j.r2_1985_2004} | ${j.r2_2005_end} | ${j.nOos} | ${j.nNonOverlap} | ${j.oosStart} | ${j.oosEnd} | ${j.verdict} |`)
  }
  lines.push('')
  lines.push('### P3 / PC（探索性 / 基准，不升格）')
  lines.push('')
  lines.push('| 变量 | h | OOS R² | n | 不重叠 | 起 | 止 | 备注 |')
  lines.push('|---|---:|---:|---:|---:|---|---|---|')
  for (const h of HORIZONS) {
    const p3 = res.common[h].P3
    const pc = res.common[h].PC
    const pc3 = res.common[h].PC3
    lines.push(`| P3 | ${h} | ${p3.oosR2} | ${p3.nOos} | ${p3.nNonOverlap ?? ''} | ${p3.oosStart ?? ''} | ${p3.oosEnd ?? ''} | 探索性；平移 p=${p3.shiftP} |`)
    lines.push(`| PC | ${h} | ${pc.oosR2} | ${pc.nOos} |  |  |  | 基准等权 P1/P2/P4 |`)
    lines.push(`| PC3 | ${h} | ${pc3.oosR2} | ${pc3.nOos} |  |  |  | 探索性含 P3 |`)
  }
  lines.push('')
  lines.push('## 判定表 B：可交易性（T1/T2）')
  lines.push('')
  lines.push(`评估窗：${res.trade.evalStart} → ${res.trade.evalEnd}（n=${res.trade.nMonths}）。`)
  lines.push('')
  lines.push('| 规则 | ΔCER | 95% CI | p | Holm p | 1960–84 | 1985–2004 | 2005–末 | drop24 | 成本0.30% ΔCER | 判定 |')
  lines.push('|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---|')
  for (const j of res.trade.judgments) {
    const ci = j.ci95 ? `[${j.ci95[0]}, ${j.ci95[1]}]` : ''
    const s = j.subperiods || {}
    lines.push(`| ${j.name} | ${j.deltaCer} | ${ci} | ${j.p} | ${j.pHolm} | ${s['1960-1984']} | ${s['1985-2004']} | ${s['2005-end']} | ${j.drop24} | ${j.highCostDeltaCer} | ${j.verdict} |`)
  }
  lines.push('')
  lines.push('## 预测区间覆盖率（名义 80%；残差仅已实现 t′≤t−h−1；池≥60）')
  lines.push('')
  lines.push('| 变量 | h | 全扩张残差池 | n | 仅1985起残差池 | n |')
  lines.push('|---|---:|---:|---:|---:|---:|')
  for (const h of HORIZONS) {
    for (const name of ['P1', 'P2', 'P4']) {
      const c = res.coverage[h][name]
      lines.push(`| ${name} | ${h} | ${fmtCov(c.expand)} | ${c.expand?.n ?? null} | ${fmtCov(c.oos1985)} | ${c.oos1985?.n ?? null} |`)
    }
  }
  lines.push('')
  lines.push('## 长窗口（P1/P2/P4）')
  lines.push('')
  lines.push('| 变量 | h | 起 | 止 | OOS R² | n | 不重叠 |')
  lines.push('|---|---:|---|---|---:|---:|---:|')
  for (const h of HORIZONS) {
    for (const name of ['P1', 'P2', 'P4']) {
      const L = res.longWin[h][name]
      if (!L) continue
      lines.push(`| ${name} | ${h} | ${L.start} | ${L.end} | ${L.oosR2} | ${L.nOos} | ${L.nNonOverlap} |`)
    }
  }
  lines.push('')
  lines.push('## 参考检验（不用于判定）：Clark–West / DM + NW，正态单侧 p 与 Holm')
  lines.push('')
  lines.push('| 族 | 变量 | h | 统计量 | 单侧 p | Holm p | 平移 p |')
  lines.push('|---|---|---:|---:|---:|---:|---:|')
  for (const t of res.refHolm?.cw || []) {
    const st = res.refTests[t.h][t.name].clarkWest
    lines.push(`| CW | ${t.name} | ${t.h} | ${st?.stat} | ${t.p} | ${t.pHolm} | ${t.shiftP} |`)
  }
  for (const t of res.refHolm?.dm || []) {
    const st = res.refTests[t.h].P4.dm
    lines.push(`| DM | ${t.name} | ${t.h} | ${st?.stat} | ${t.p} | ${t.pHolm} | ${t.shiftP} |`)
  }
  lines.push('')
  lines.push('## 次要变量（不进主族）')
  lines.push('')
  lines.push('| 变量 | h | OOS R² | n |')
  lines.push('|---|---:|---:|---:|')
  for (const h of HORIZONS) {
    for (const [name, v] of Object.entries(res.secondary[h])) {
      lines.push(`| ${name} | ${h} | ${v.oosR2} | ${v.nOos} |`)
    }
  }
  lines.push('')
  lines.push('## 稳健性（完整）')
  lines.push('')
  lines.push('### 预测变体 OOS R²')
  lines.push('')
  const robKeys = new Set()
  for (const h of HORIZONS) Object.keys(res.robustness.byHorizon[h] || {}).forEach(k => robKeys.add(k))
  const keys = [...robKeys]
  lines.push(`| h | ${keys.join(' | ')} |`)
  lines.push(`|---:|${keys.map(() => '---:').join('|')}|`)
  for (const h of HORIZONS) {
    const row = res.robustness.byHorizon[h] || {}
    lines.push(`| ${h} | ${keys.map(k => row[k] ?? '').join(' | ')} |`)
  }
  lines.push('')
  lines.push('### 交易变体（T1/T2 成本 0.30%；T1 仅估值 / 仅动量）')
  lines.push('')
  lines.push('| 变体 | ΔCER | p | 95% CI |')
  lines.push('|---|---:|---:|---|')
  for (const [k, v] of Object.entries(res.robustness.trade || {})) {
    if (!v) continue
    const ci = v.ci95 ? `[${v.ci95[0]}, ${v.ci95[1]}]` : ''
    lines.push(`| ${k} | ${v.deltaCer} | ${v.p} | ${ci} |`)
  }
  lines.push('')
  lines.push('## 局限')
  lines.push('')
  lines.push('- Z.1/GDP 用当前修订版而非 vintage；AIAE 与市值类仅为探索性。')
  lines.push('- NCBCEL 与 NCBEILQ027S 为同一 FRED 序列（数值逐期相同）；市值/GDP、Tobin Q 的分子与 AIAE 股权分项同源，指标间相关偏高。')
  lines.push('- Shiller 月均价；跳月执行减轻 Working 效应，不能消除。')
  lines.push('- 循环平移保留自相关但打断预测关系；长 horizon 不重叠样本极少。')
  lines.push('- 不计税、单市场、成本假设简化。')
  lines.push('')
  lines.push('## 解释性选择')
  lines.push('')
  for (const c of res.choices) lines.push(`- ${c}`)
  lines.push('')
  return lines.join('\n')
}

async function atomicWrite(path, text) {
  const tmp = `${path}.tmp`
  await writeFile(tmp, text)
  await rename(tmp, path)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const dataDir = join(root, 'data-raw', 'sp500-backtest')
  const skipShift = process.argv.includes('--skip-shift')
  const tradeB = process.argv.includes('--fast') ? 500 : BOOT_B
  console.log(`Running v2 predict skipShift=${skipShift} tradeB=${tradeB}…`)
  const res = await runAllPredict(dataDir, { skipShift, tradeB })
  const report = formatPredictReport(res)
  // strip bulky fields for JSON
  const json = {
    prereg: res.prereg,
    elapsedMs: res.elapsedMs,
    dataEnd: res.dataEnd,
    judgmentsA: res.judgmentsA,
    common: res.common,
    longWin: res.longWin,
    coverage: res.coverage,
    refTests: res.refTests,
    refHolm: res.refHolm,
    secondary: res.secondary,
    robustness: res.robustness,
    trade: {
      evalStart: res.trade.evalStart,
      evalEnd: res.trade.evalEnd,
      nMonths: res.trade.nMonths,
      judgments: res.trade.judgments,
      variants: res.trade.variants,
    },
    choices: res.choices,
  }
  await mkdir(dataDir, { recursive: true })
  await atomicWrite(join(dataDir, 'results-v2.json'), JSON.stringify(json, null, 2) + '\n')
  await atomicWrite(join(root, 'docs/research/sp500-valuation-predict-results-v2-2026-11-15.md'), report)
  console.log(`done in ${(res.elapsedMs / 1000).toFixed(1)}s`)
  for (const j of res.judgmentsA) {
    console.log(`${j.id}: ${j.verdict} R2=${j.oosR2} p=${j.shiftP} pHolm=${j.pHolm}`)
  }
  for (const j of res.trade.judgments) {
    console.log(`${j.name}: ${j.verdict} dCER=${j.deltaCer} pHolm=${j.pHolm}`)
  }
}
