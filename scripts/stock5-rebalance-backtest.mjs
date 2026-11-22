// 五只股票目标权重再平衡回测（预注册 docs/research/stock5-rebalance-backtest-prereg-2026-11-21.md）
// Node 24 ESM、无 npm 依赖、纯函数可导出；输出不依赖当前时间（下载时间只出现在 SOURCES / 报告数据说明）。
// 用法：node scripts/stock5-rebalance-backtest.mjs
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PREREG = 'stock5-rebalance-backtest-prereg-2026-11-21'
export const SEED = 20261121
export const BOOT_B = 10_000
export const BLOCK_MEAN = 20
export const GAMMA = 3
export const COST_MAIN = 0.001
export const COST_HIGH = 0.003
export const EVAL_START = '2021-08-25'
export const SUB_A_END = '2023-12-29'
export const SUB_B_START = '2024-01-02'
export const LATE_START = '2022-02-25'
export const STOCKS = ['AVGO', 'MSFT', 'META', 'SOFI', 'RKLB']
export const BENCHMARKS = ['QQQ', 'QQEW']
export const ALL_SYMBOLS = [...STOCKS, ...BENCHMARKS]

const round = (v, d = 6) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(d)))
const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length

/** 总体方差（/n），用于 CER。 */
export function popVar(xs) {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length
}

export function sampleStd(xs) {
  if (xs.length < 2) return null
  const m = mean(xs)
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1))
}

/** 日频 CER：252 × (mean − γ/2 · popVar) */
export function cer(rets, gamma = GAMMA) {
  if (!rets.length) return null
  return 252 * (mean(rets) - (gamma / 2) * popVar(rets))
}

export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Politis–Romano 平稳块：块长 ~ Geometric(p), E[L]=meanLen。 */
export function stationaryBlockBootstrap(n, meanLen, rng) {
  const p = 1 / meanLen
  const idx = new Array(n)
  let i = 0
  while (i < n) {
    let pos = Math.floor(rng() * n)
    do {
      idx[i++] = pos
      pos = (pos + 1) % n
    } while (i < n && rng() > p)
  }
  return idx
}

export function bootstrapDeltaCer(xs, ys, { B = BOOT_B, meanLen = BLOCK_MEAN, seed = SEED, gamma = GAMMA } = {}) {
  const n = xs.length
  const obs = cer(xs, gamma) - cer(ys, gamma)
  const rng = mulberry32(seed)
  const boots = new Array(B)
  for (let b = 0; b < B; b++) {
    const idx = stationaryBlockBootstrap(n, meanLen, rng)
    const xb = idx.map(i => xs[i])
    const yb = idx.map(i => ys[i])
    boots[b] = cer(xb, gamma) - cer(yb, gamma)
  }
  boots.sort((a, b) => a - b)
  const pOneSided = boots.filter(v => v <= 0).length / B
  const lo = boots[Math.floor(0.025 * B)]
  const hi = boots[Math.min(B - 1, Math.ceil(0.975 * B) - 1)]
  return { deltaCer: obs, p: pOneSided, ci95: [lo, hi] }
}

/** Holm 校正，输入 [{id,p}]，返回带 pHolm 的同序数组副本。 */
export function holmCorrect(tests, alpha = 0.1) {
  const m = tests.length
  const ordered = tests.map((t, i) => ({ ...t, _i: i })).sort((a, b) => a.p - b.p)
  const adj = new Array(m)
  let running = 0
  for (let j = 0; j < m; j++) {
    const raw = (m - j) * ordered[j].p
    running = Math.max(running, raw)
    adj[j] = Math.min(1, running)
  }
  const out = tests.map(t => ({ ...t }))
  for (let j = 0; j < m; j++) {
    out[ordered[j]._i].pHolm = adj[j]
    out[ordered[j]._i].holmRank = j + 1
  }
  out.alpha = alpha
  return out
}

export const AVGO_SPLIT_DATE = '2024-07-15'
export const AVGO_SPLIT_FACTOR = 10

/** MM/DD/YYYY → YYYY-MM-DD */
export function parseUsDate(s) {
  if (typeof s !== 'string') return null
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim())
  if (!m) return null
  const mm = m[1].padStart(2, '0')
  const dd = m[2].padStart(2, '0')
  return `${m[3]}-${mm}-${dd}`
}

/** "$1,234.56" / "1,234.56" / 1234.56 → number */
export function parseMoney(s) {
  if (typeof s === 'number' && Number.isFinite(s)) return s
  if (typeof s !== 'string') return NaN
  const cleaned = s.replace(/[$,\s]/g, '')
  if (!cleaned) return NaN
  return Number(cleaned)
}

/**
 * 解析 Nasdaq historical JSON → {date, close}[]（升序）。
 * 收盘价已拆股调整、未分红调整。
 */
export function parseNasdaqHistorical(json) {
  const rows = json?.data?.tradesTable?.rows
  if (!Array.isArray(rows)) throw new Error('missing data.tradesTable.rows')
  const byDate = new Map()
  for (const r of rows) {
    const date = parseUsDate(r.date)
    const close = parseMoney(r.close)
    if (!date || !(close > 0)) continue
    byDate.set(date, close) // 同日后者覆盖；源数据倒序，升序后自然最后写的是较新？倒序遍历时同日少见，保留首次即可
  }
  return [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, close]) => ({ date, close }))
}

/**
 * 解析 Nasdaq dividends JSON → {date, amount}[]（仅 type=Cash）。
 * data 为 null 时返回 { rows: [], missing: true }。
 * AVGO：除息日 < 2024-07-15 的金额 ÷ 10。
 */
export function parseNasdaqDividends(json, { symbol = null } = {}) {
  if (json?.data == null) return { rows: [], missing: true }
  const raw = json.data?.dividends?.rows
  if (!Array.isArray(raw)) return { rows: [], missing: false }
  const byDate = new Map()
  for (const r of raw) {
    if (r.type !== 'Cash') continue
    const date = parseUsDate(r.exOrEffDate)
    let amount = parseMoney(r.amount)
    if (!date || !Number.isFinite(amount) || !(amount > 0)) continue
    if (symbol === 'AVGO' && date < AVGO_SPLIT_DATE) amount /= AVGO_SPLIT_FACTOR
    byDate.set(date, (byDate.get(date) ?? 0) + amount)
  }
  const rows = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, amount]) => ({ date, amount }))
  return { rows, missing: false }
}

/**
 * 总分红回报指数：TR_0=P_0，TR_t = TR_{t-1} * (P_t + D_t) / P_{t-1}。
 * 输出 {date, adjclose}[]，供对齐与模拟（字段名沿用 adjclose=TR）。
 */
export function buildTotalReturnSeries(priceRows, dividendRows = []) {
  const divMap = new Map(dividendRows.map(d => [d.date, d.amount]))
  if (!priceRows.length) return []
  const out = [{ date: priceRows[0].date, adjclose: priceRows[0].close, close: priceRows[0].close }]
  for (let i = 1; i < priceRows.length; i++) {
    const prev = priceRows[i - 1]
    const cur = priceRows[i]
    const D = divMap.get(cur.date) ?? 0
    const r = (cur.close + D) / prev.close - 1
    const tr = out[i - 1].adjclose * (1 + r)
    out.push({ date: cur.date, adjclose: tr, close: cur.close })
  }
  return out
}

/** 单日总分红收益 r_t = (P_t + D_t)/P_{t-1} − 1 */
export function dailyTotalReturn(prevClose, close, dividend = 0) {
  return (close + dividend) / prevClose - 1
}

/** 对齐七代码共同交易日；返回剔除日列表与价格矩阵。 */
export function alignCommonDates(seriesBySymbol, symbols = ALL_SYMBOLS) {
  const maps = Object.fromEntries(symbols.map(s => [s, new Map(seriesBySymbol[s].map(r => [r.date, r.adjclose]))]))
  const allDates = new Set()
  for (const s of symbols) for (const d of maps[s].keys()) allDates.add(d)
  const sorted = [...allDates].sort()
  const dropped = []
  const dates = []
  const prices = Object.fromEntries(symbols.map(s => [s, []]))
  for (const d of sorted) {
    const ok = symbols.every(s => maps[s].has(d) && Number.isFinite(maps[s].get(d)) && maps[s].get(d) > 0)
    if (!ok) {
      const missing = symbols.filter(s => !(maps[s].has(d) && Number.isFinite(maps[s].get(d)) && maps[s].get(d) > 0))
      dropped.push({ date: d, missing })
      continue
    }
    dates.push(d)
    for (const s of symbols) prices[s].push(maps[s].get(d))
  }
  return { dates, prices, dropped }
}

/** 单日涨跌超 ±50% 的记录（用拆股调整收盘价，不含分红再投资）。 */
export function findLargeMoves(seriesBySymbol, threshold = 0.5) {
  const out = []
  for (const [sym, rows] of Object.entries(seriesBySymbol)) {
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1].close ?? rows[i - 1].adjclose
      const b = rows[i].close ?? rows[i].adjclose
      if (!(a > 0)) continue
      const r = b / a - 1
      if (Math.abs(r) >= threshold) {
        out.push({ symbol: sym, date: rows[i].date, prevDate: rows[i - 1].date, prev: a, price: b, ret: r })
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol))
}

/**
 * 判断阈值触发：任一只 |w_i - target| >= thresholdAbs
 * @param {number[]} weights
 * @param {number} targetW 目标等权
 * @param {number} thresholdAbs 绝对偏离（如 0.05）
 */
export function shouldTriggerThreshold(weights, targetW, thresholdAbs) {
  return weights.some(w => Math.abs(w - targetW) >= thresholdAbs - 1e-15)
}

/** 恰好边界：偏离 == thresholdAbs 时触发。 */
export function isAtThresholdBoundary(weight, targetW, thresholdAbs) {
  return Math.abs(Math.abs(weight - targetW) - thresholdAbs) < 1e-12
}

/**
 * 多资产再平衡模拟。
 * @param {string[]} dates
 * @param {Record<string, number[]>} prices 各代码与 dates 对齐的价格
 * @param {string[]} stocks 参与组合的代码
 * @param {{
 *   mode: 'BH'|'threshold'|'calendar',
 *   thresholdAbs?: number,
 *   calendar?: 'M'|'Q',
 *   cost?: number,
 *   execLag?: 0|1,  // 1=次日成交（主设定），0=当日成交
 *   startDate?: string,
 *   endDate?: string|null,
 * }} opts
 */
export function simulateRebalance(dates, prices, stocks, opts = {}) {
  return runStrategy(dates, prices, stocks, opts)
}

/**
 * 清晰版模拟：execLag=1 次日成交；execLag=0 当日收盘成交（决策后立即调仓）。
 */
export function simulateRebalanceCore(dates, prices, stocks, cfg) {
  const {
    mode, thresholdAbs, calendar, cost, execLag, startIdx, endIdx, targetW, k,
  } = cfg
  const n = dates.length
  const monthKey = d => d.slice(0, 7)
  const quarterKey = d => {
    const m = Number(d.slice(5, 7))
    return `${d.slice(0, 4)}-Q${Math.ceil(m / 3)}`
  }
  const isPeriodEnd = i => {
    if (i >= endIdx) return false
    if (calendar === 'M') return monthKey(dates[i]) !== monthKey(dates[i + 1])
    return quarterKey(dates[i]) !== quarterKey(dates[i + 1])
  }

  const equity = new Array(n).fill(null)
  const portR = new Array(n).fill(null)
  const turnoverArr = new Array(n).fill(null)
  const rebalanced = new Array(n).fill(false)
  const weightsPath = new Array(n).fill(null)
  const decideFlags = new Array(n).fill(false)

  let w = Array(k).fill(targetW)
  let eq = 1
  equity[startIdx] = 1
  weightsPath[startIdx] = w.slice()
  turnoverArr[startIdx] = 0
  portR[startIdx] = null // 建仓日无收益

  let pendingExec = null // 计划成交的绝对下标
  let triggerCount = 0
  let cumTurnover = 0
  let cumCost = 0
  let firstDecisionDate = null
  let firstExecDate = null

  // 起始日决策（等权阈值不会触发；月末可能挂次日）
  if (mode === 'calendar' && isPeriodEnd(startIdx) && execLag === 1 && startIdx + 1 <= endIdx) {
    pendingExec = startIdx + 1
    decideFlags[startIdx] = true
    firstDecisionDate = dates[startIdx]
  }

  for (let i = startIdx + 1; i <= endIdx; i++) {
    // 1) 价格漂移
    const rets = stocks.map(s => prices[s][i] / prices[s][i - 1] - 1)
    const gross = w.reduce((s, wi, j) => s + wi * rets[j], 0)
    eq *= 1 + gross
    const vals = w.map((wi, j) => wi * (1 + rets[j]))
    const sumV = vals.reduce((a, b) => a + b, 0)
    w = vals.map(v => v / sumV)

    let turn = 0
    let dayCost = 0

    if (execLag === 1) {
      // 2a) 若本日是挂单成交日：按漂移后权重调回等权
      if (pendingExec === i) {
        turn = 0.5 * w.reduce((s, wi) => s + Math.abs(wi - targetW), 0)
        dayCost = turn * cost
        eq *= 1 - dayCost
        cumTurnover += turn
        cumCost += dayCost
        w = Array(k).fill(targetW)
        rebalanced[i] = true
        triggerCount++
        if (firstExecDate == null) firstExecDate = dates[i]
        pendingExec = null
      }
      // 3a) 收盘决策
      let decide = false
      if (mode === 'threshold') decide = shouldTriggerThreshold(w, targetW, thresholdAbs)
      else if (mode === 'calendar') decide = isPeriodEnd(i)
      if (decide) {
        decideFlags[i] = true
        if (firstDecisionDate == null) firstDecisionDate = dates[i]
        if (i + 1 <= endIdx) pendingExec = i + 1
      }
    } else {
      // 2b) 当日成交：漂移后立即按规则决策并成交
      let decide = false
      if (mode === 'threshold') decide = shouldTriggerThreshold(w, targetW, thresholdAbs)
      else if (mode === 'calendar') decide = isPeriodEnd(i)
      if (decide) {
        decideFlags[i] = true
        if (firstDecisionDate == null) firstDecisionDate = dates[i]
        turn = 0.5 * w.reduce((s, wi) => s + Math.abs(wi - targetW), 0)
        dayCost = turn * cost
        eq *= 1 - dayCost
        cumTurnover += turn
        cumCost += dayCost
        w = Array(k).fill(targetW)
        rebalanced[i] = true
        triggerCount++
        if (firstExecDate == null) firstExecDate = dates[i]
      }
    }

    equity[i] = eq
    portR[i] = eq / equity[i - 1] - 1
    turnoverArr[i] = turn
    weightsPath[i] = w.slice()
  }

  const evalIdx = []
  for (let i = startIdx + 1; i <= endIdx; i++) if (portR[i] != null) evalIdx.push(i)
  const rets = evalIdx.map(i => portR[i])

  return {
    equity,
    portR,
    turnover: turnoverArr,
    rebalanced,
    weightsPath,
    decideFlags,
    evalIdx,
    rets,
    startIdx,
    endIdx,
    triggerCount,
    cumTurnover,
    cumCost,
    firstDecisionDate,
    firstExecDate,
    finalWeights: weightsPath[endIdx],
    finalEquity: equity[endIdx],
    targetW,
    stocks: stocks.slice(),
  }
}

/** 包装：对外 API */
export function runStrategy(dates, prices, stocks, opts = {}) {
  const n = dates.length
  const startDate = opts.startDate ?? EVAL_START
  const endDate = opts.endDate ?? null
  const startIdx = dates.findIndex(d => d >= startDate)
  if (startIdx < 0) throw new Error(`no date >= ${startDate}`)
  let endIdx = n - 1
  if (endDate) {
    for (let i = n - 1; i >= 0; i--) {
      if (dates[i] <= endDate) { endIdx = i; break }
    }
  }
  const k = stocks.length
  return simulateRebalanceCore(dates, prices, stocks, {
    mode: opts.mode ?? 'BH',
    thresholdAbs: opts.thresholdAbs ?? 0.05,
    calendar: opts.calendar ?? 'M',
    cost: opts.cost ?? COST_MAIN,
    execLag: opts.execLag ?? 1,
    startIdx,
    endIdx,
    targetW: 1 / k,
    k,
  })
}

/** 单资产买入持有（QQQ/QQEW）。 */
export function runBuyHoldSingle(dates, prices, symbol, opts = {}) {
  const startDate = opts.startDate ?? EVAL_START
  const endDate = opts.endDate ?? null
  const startIdx = dates.findIndex(d => d >= startDate)
  let endIdx = dates.length - 1
  if (endDate) {
    for (let i = dates.length - 1; i >= 0; i--) {
      if (dates[i] <= endDate) { endIdx = i; break }
    }
  }
  const n = dates.length
  const equity = new Array(n).fill(null)
  const portR = new Array(n).fill(null)
  let eq = 1
  equity[startIdx] = 1
  for (let i = startIdx + 1; i <= endIdx; i++) {
    const r = prices[symbol][i] / prices[symbol][i - 1] - 1
    eq *= 1 + r
    equity[i] = eq
    portR[i] = r
  }
  const evalIdx = []
  for (let i = startIdx + 1; i <= endIdx; i++) evalIdx.push(i)
  return {
    equity,
    portR,
    turnover: evalIdx.map(() => 0),
    rebalanced: new Array(n).fill(false),
    weightsPath: null,
    evalIdx,
    rets: evalIdx.map(i => portR[i]),
    startIdx,
    endIdx,
    triggerCount: 0,
    cumTurnover: 0,
    cumCost: 0,
    firstDecisionDate: null,
    firstExecDate: null,
    finalWeights: [1],
    finalEquity: equity[endIdx],
    targetW: 1,
    stocks: [symbol],
  }
}

export function maxDrawdownInfo(equity, dates, startIdx, endIdx) {
  let peak = equity[startIdx]
  let peakDate = dates[startIdx]
  let maxDd = 0
  let ddStart = dates[startIdx]
  let ddEnd = dates[startIdx]
  let troughDate = dates[startIdx]
  for (let i = startIdx; i <= endIdx; i++) {
    const e = equity[i]
    if (e == null) continue
    if (e > peak) {
      peak = e
      peakDate = dates[i]
    }
    const dd = e / peak - 1
    if (dd < maxDd) {
      maxDd = dd
      ddStart = peakDate
      ddEnd = dates[i]
      troughDate = dates[i]
    }
  }
  return { maxDrawdown: maxDd, ddStart, ddEnd, troughDate }
}

export function computeMetrics(sim, dates) {
  const { rets, evalIdx, startIdx, endIdx, equity, triggerCount, cumTurnover, cumCost, finalWeights, stocks } = sim
  if (!rets.length) return null
  const years = rets.length / 252
  const finalEq = equity[endIdx]
  const cagr = years > 0 ? finalEq ** (1 / years) - 1 : null
  const vol = sampleStd(rets) != null ? sampleStd(rets) * Math.sqrt(252) : null
  const sharpe = sampleStd(rets) > 0 ? (mean(rets) * 252) / (sampleStd(rets) * Math.sqrt(252)) : null
  const dd = maxDrawdownInfo(equity, dates, startIdx, endIdx)
  const calmar = dd.maxDrawdown < 0 && cagr != null ? cagr / Math.abs(dd.maxDrawdown) : null
  const turnoverAnn = years > 0 ? cumTurnover / years : null
  const maxWeight = finalWeights ? Math.max(...finalWeights) : null
  return {
    n: rets.length,
    start: dates[startIdx],
    end: dates[endIdx],
    finalEquity: round(finalEq),
    cagr: round(cagr),
    vol: round(vol),
    sharpe: round(sharpe),
    maxDrawdown: round(dd.maxDrawdown),
    ddStart: dd.ddStart,
    ddEnd: dd.ddEnd,
    calmar: round(calmar),
    triggerCount,
    turnoverAnn: round(turnoverAnn),
    cumCost: round(cumCost),
    finalWeights: finalWeights ? finalWeights.map(w => round(w)) : null,
    maxWeight: round(maxWeight),
    stocks,
    cer: round(cer(rets)),
    rets,
    evalIdx,
  }
}

/** 剔除对 ΔCER 贡献最大的连续 W 日：选使剩余 ΔCER 最小的窗口。 */
export function deltaCerAfterDropBestWindow(retsA, retsB, window = 60) {
  const n = retsA.length
  if (n <= window) return null
  let worst = Infinity
  let worstStart = 0
  for (let i = 0; i + window <= n; i++) {
    const xa = retsA.filter((_, j) => j < i || j >= i + window)
    const xb = retsB.filter((_, j) => j < i || j >= i + window)
    const d = cer(xa) - cer(xb)
    if (d < worst) {
      worst = d
      worstStart = i
    }
  }
  return { deltaCer: worst, startOffset: worstStart }
}

export function subperiodDeltaCer(retsA, retsB, dates, evalIdx, ranges) {
  const out = {}
  for (const [name, [a, b]] of Object.entries(ranges)) {
    const xa = []
    const xb = []
    for (let k = 0; k < evalIdx.length; k++) {
      const d = dates[evalIdx[k]]
      if (d >= a && d <= b) {
        xa.push(retsA[k])
        xb.push(retsB[k])
      }
    }
    out[name] = xa.length ? cer(xa) - cer(xb) : null
  }
  return out
}

/** 成本前净值路径：用 cost=0 重跑。 */
export function rebalancePnlDecomposition(dates, prices, stocks, costMain = COST_MAIN) {
  const bh = runStrategy(dates, prices, stocks, { mode: 'BH', cost: 0 })
  const t5Gross = runStrategy(dates, prices, stocks, { mode: 'threshold', thresholdAbs: 0.05, cost: 0 })
  const t5Net = runStrategy(dates, prices, stocks, { mode: 'threshold', thresholdAbs: 0.05, cost: costMain })
  const end = bh.endIdx
  const diffGross = t5Gross.equity[end] - bh.equity[end]
  const costDrag = t5Gross.equity[end] - t5Net.equity[end]
  const diffNet = t5Net.equity[end] - bh.equity[end]
  return {
    bhFinal: bh.equity[end],
    t5GrossFinal: t5Gross.equity[end],
    t5NetFinal: t5Net.equity[end],
    diffGross,
    costDrag,
    diffNet,
    t5CumCost: t5Net.cumCost,
  }
}

function verdictFromChecks(deltaCer, checks) {
  if (deltaCer <= 0) return '无效'
  if (checks.every(Boolean)) return '有效'
  return '未证实'
}

export function dataPaths(sym) {
  return {
    historical: `${sym}.nasdaq.historical.json`,
    dividends: `${sym}.nasdaq.dividends.json`,
  }
}

async function loadData(dataDir) {
  const seriesBySymbol = {}
  const priceBySymbol = {}
  const divMeta = {}
  const rawMeta = {}
  for (const sym of ALL_SYMBOLS) {
    const paths = dataPaths(sym)
    const histText = await readFile(join(dataDir, paths.historical), 'utf8')
    const divText = await readFile(join(dataDir, paths.dividends), 'utf8')
    const histJson = JSON.parse(histText)
    const divJson = JSON.parse(divText)
    const prices = parseNasdaqHistorical(histJson)
    const { rows: divs, missing } = parseNasdaqDividends(divJson, { symbol: sym })
    const tr = buildTotalReturnSeries(prices, divs)
    seriesBySymbol[sym] = tr
    priceBySymbol[sym] = prices
    divMeta[sym] = { count: divs.length, missing, rows: divs }
    rawMeta[sym] = {
      historicalSha256: createHash('sha256').update(histText).digest('hex'),
      dividendsSha256: createHash('sha256').update(divText).digest('hex'),
      firstDate: prices[0]?.date,
      lastDate: prices.at(-1)?.date,
      rows: prices.length,
      dividendCount: divs.length,
      dividendsMissing: missing,
    }
  }
  return { seriesBySymbol, priceBySymbol, divMeta, rawMeta }
}

function fmtPct(v, d = 2) {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${(v * 100).toFixed(d)}%`
}

function fmtNum(v, d = 4) {
  if (v == null || !Number.isFinite(v)) return '—'
  return v.toFixed(d)
}

export async function runBacktest(rootDir) {
  const dataDir = join(rootDir, 'data-raw', 'stock5-rebalance')
  const { seriesBySymbol, priceBySymbol, divMeta, rawMeta } = await loadData(dataDir)
  const { dates, prices, dropped } = alignCommonDates(seriesBySymbol)
  const largeMoves = findLargeMoves(
    Object.fromEntries(ALL_SYMBOLS.map(s => [s, priceBySymbol[s].map(r => ({ date: r.date, close: r.close }))])),
  )

  const lastCommon = dates[dates.length - 1]
  const evalDates = dates.filter(d => d >= EVAL_START)
  if (!evalDates.length) throw new Error('no eval dates')

  const baseOpts = { cost: COST_MAIN, execLag: 1, startDate: EVAL_START }

  const sims = {
    BH: runStrategy(dates, prices, STOCKS, { ...baseOpts, mode: 'BH' }),
    T5: runStrategy(dates, prices, STOCKS, { ...baseOpts, mode: 'threshold', thresholdAbs: 0.05 }),
    M: runStrategy(dates, prices, STOCKS, { ...baseOpts, mode: 'calendar', calendar: 'M' }),
    QQQ: runBuyHoldSingle(dates, prices, 'QQQ', baseOpts),
    QQEW: runBuyHoldSingle(dates, prices, 'QQEW', baseOpts),
  }

  const metrics = {}
  for (const [k, sim] of Object.entries(sims)) {
    metrics[k] = computeMetrics(sim, dates)
  }

  // 主比较自助法
  const bootT5 = bootstrapDeltaCer(sims.T5.rets, sims.BH.rets)
  const bootM = bootstrapDeltaCer(sims.M.rets, sims.BH.rets)
  const holm = holmCorrect([
    { id: 'T5_vs_BH', p: bootT5.p },
    { id: 'M_vs_BH', p: bootM.p },
  ], 0.1)

  const ranges = {
    subA: [EVAL_START, SUB_A_END],
    subB: [SUB_B_START, lastCommon],
  }
  const subT5 = subperiodDeltaCer(sims.T5.rets, sims.BH.rets, dates, sims.T5.evalIdx, ranges)
  const subM = subperiodDeltaCer(sims.M.rets, sims.BH.rets, dates, sims.M.evalIdx, ranges)
  const dropT5 = deltaCerAfterDropBestWindow(sims.T5.rets, sims.BH.rets, 60)
  const dropM = deltaCerAfterDropBestWindow(sims.M.rets, sims.BH.rets, 60)

  // 成本 0.30%
  const t5High = runStrategy(dates, prices, STOCKS, { ...baseOpts, mode: 'threshold', thresholdAbs: 0.05, cost: COST_HIGH })
  const mHigh = runStrategy(dates, prices, STOCKS, { ...baseOpts, mode: 'calendar', calendar: 'M', cost: COST_HIGH })
  const bhHigh = runStrategy(dates, prices, STOCKS, { ...baseOpts, mode: 'BH', cost: COST_HIGH })
  const dCerT5High = cer(t5High.rets) - cer(bhHigh.rets)
  const dCerMHigh = cer(mHigh.rets) - cer(bhHigh.rets)

  // 逐一剔除
  const leaveOneOut = {}
  for (const drop of STOCKS) {
    const kept = STOCKS.filter(s => s !== drop)
    const thr = 0.0625 // 6.25 个百分点
    const bh = runStrategy(dates, prices, kept, { ...baseOpts, mode: 'BH' })
    const t5 = runStrategy(dates, prices, kept, { ...baseOpts, mode: 'threshold', thresholdAbs: thr })
    const m = runStrategy(dates, prices, kept, { ...baseOpts, mode: 'calendar', calendar: 'M' })
    leaveOneOut[drop] = {
      stocks: kept,
      thresholdAbs: thr,
      BH: computeMetrics(bh, dates),
      T5: computeMetrics(t5, dates),
      M: computeMetrics(m, dates),
      deltaCerT5: cer(t5.rets) - cer(bh.rets),
      deltaCerM: cer(m.rets) - cer(bh.rets),
    }
  }

  const t5LooPos = STOCKS.filter(s => leaveOneOut[s].deltaCerT5 > 0).length
  const mLooPos = STOCKS.filter(s => leaveOneOut[s].deltaCerM > 0).length

  function buildChecks(deltaCer, holmP, sub, drop, dCerHigh, looPos) {
    const a = holmP < 0.1
    const b = sub.subA > 0 && sub.subB > 0
    const c = drop?.deltaCer > 0
    const d = dCerHigh > 0
    const e = looPos >= 4
    return {
      a, b, c, d, e,
      values: {
        holmP, subA: sub.subA, subB: sub.subB,
        drop60: drop?.deltaCer, dCerHigh, looPos,
        deltaCer,
      },
      verdict: verdictFromChecks(deltaCer, [a, b, c, d, e]),
    }
  }

  const deltaCerT5 = bootT5.deltaCer
  const deltaCerM = bootM.deltaCer
  const checksT5 = buildChecks(deltaCerT5, holm.find(t => t.id === 'T5_vs_BH').pHolm, subT5, dropT5, dCerT5High, t5LooPos)
  const checksM = buildChecks(deltaCerM, holm.find(t => t.id === 'M_vs_BH').pHolm, subM, dropM, dCerMHigh, mLooPos)

  // 增量比较
  const bootT5M = bootstrapDeltaCer(sims.T5.rets, sims.M.rets)
  const bootT5Qqew = bootstrapDeltaCer(sims.T5.rets, sims.QQEW.rets)
  const bootT5Qqq = bootstrapDeltaCer(sims.T5.rets, sims.QQQ.rets)

  // 稳健性
  const robust = {
    sameDay: {},
    costHigh: {
      T5: { deltaCer: dCerT5High, ...computeMetrics(t5High, dates) },
      M: { deltaCer: dCerMHigh, ...computeMetrics(mHigh, dates) },
      BH: computeMetrics(bhHigh, dates),
    },
    T10: null,
    Q: null,
    lateStart: null,
  }
  {
    const bh = runStrategy(dates, prices, STOCKS, { ...baseOpts, mode: 'BH', execLag: 0 })
    const t5 = runStrategy(dates, prices, STOCKS, { ...baseOpts, mode: 'threshold', thresholdAbs: 0.05, execLag: 0 })
    const m = runStrategy(dates, prices, STOCKS, { ...baseOpts, mode: 'calendar', calendar: 'M', execLag: 0 })
    robust.sameDay = {
      BH: computeMetrics(bh, dates),
      T5: computeMetrics(t5, dates),
      M: computeMetrics(m, dates),
      deltaCerT5: cer(t5.rets) - cer(bh.rets),
      deltaCerM: cer(m.rets) - cer(bh.rets),
    }
  }
  {
    const bh = runStrategy(dates, prices, STOCKS, { ...baseOpts, mode: 'BH' })
    const t10 = runStrategy(dates, prices, STOCKS, { ...baseOpts, mode: 'threshold', thresholdAbs: 0.10 })
    const q = runStrategy(dates, prices, STOCKS, { ...baseOpts, mode: 'calendar', calendar: 'Q' })
    robust.T10 = {
      metrics: computeMetrics(t10, dates),
      deltaCer: cer(t10.rets) - cer(bh.rets),
    }
    robust.Q = {
      metrics: computeMetrics(q, dates),
      deltaCer: cer(q.rets) - cer(bh.rets),
    }
  }
  {
    const opts = { ...baseOpts, startDate: LATE_START }
    const bh = runStrategy(dates, prices, STOCKS, { ...opts, mode: 'BH' })
    const t5 = runStrategy(dates, prices, STOCKS, { ...opts, mode: 'threshold', thresholdAbs: 0.05 })
    const m = runStrategy(dates, prices, STOCKS, { ...opts, mode: 'calendar', calendar: 'M' })
    robust.lateStart = {
      BH: computeMetrics(bh, dates),
      T5: computeMetrics(t5, dates),
      M: computeMetrics(m, dates),
      deltaCerT5: cer(t5.rets) - cer(bh.rets),
      deltaCerM: cer(m.rets) - cer(bh.rets),
    }
  }

  const decomp = rebalancePnlDecomposition(dates, prices, STOCKS, COST_MAIN)

  // 手工核对：起始→第一次 T5 触发日，BH 与 T5 净值（扣成本前）
  const t5Gross = runStrategy(dates, prices, STOCKS, { ...baseOpts, mode: 'threshold', thresholdAbs: 0.05, cost: 0 })
  const bhGross = runStrategy(dates, prices, STOCKS, { ...baseOpts, mode: 'BH', cost: 0 })
  const firstDec = sims.T5.firstDecisionDate
  let manualCheck = null
  if (firstDec) {
    const i = dates.indexOf(firstDec)
    manualCheck = {
      firstDecisionDate: firstDec,
      firstExecDate: sims.T5.firstExecDate,
      bhEquityOnDecision: bhGross.equity[i],
      t5EquityOnDecision: t5Gross.equity[i],
      equal: Math.abs(bhGross.equity[i] - t5Gross.equity[i]) < 1e-12,
    }
  }

  const result = {
    prereg: PREREG,
    version: 'v2',
    dataSource: 'nasdaq',
    evalStart: EVAL_START,
    evalEnd: lastCommon,
    nDays: sims.BH.rets.length,
    rawMeta,
    divMeta: Object.fromEntries(ALL_SYMBOLS.map(s => [s, { count: divMeta[s].count, missing: divMeta[s].missing }])),
    dropped,
    largeMoves,
    qqewDividendsMissing: divMeta.QQEW.missing,
    avgoSplit: { date: AVGO_SPLIT_DATE, factor: AVGO_SPLIT_FACTOR },
    metrics,
    main: {
      T5: {
        deltaCer: deltaCerT5,
        p: bootT5.p,
        pHolm: holm.find(t => t.id === 'T5_vs_BH').pHolm,
        ci95: bootT5.ci95,
        checks: checksT5,
      },
      M: {
        deltaCer: deltaCerM,
        p: bootM.p,
        pHolm: holm.find(t => t.id === 'M_vs_BH').pHolm,
        ci95: bootM.ci95,
        checks: checksM,
      },
    },
    incremental: {
      T5_vs_M: bootT5M,
      T5_vs_QQEW: bootT5Qqew,
      T5_vs_QQQ: bootT5Qqq,
    },
    decomp,
    robust,
    leaveOneOut,
    manualCheck,
    firstT5: {
      decision: sims.T5.firstDecisionDate,
      exec: sims.T5.firstExecDate,
      triggerCount: sims.T5.triggerCount,
    },
  }

  return result
}

export function renderMarkdown(result) {
  const { metrics: m, main, incremental, decomp, robust, leaveOneOut, largeMoves, dropped, rawMeta, manualCheck } = result
  const lines = []
  lines.push('# 五只股票目标权重再平衡回测结果（2026-11-21）')
  lines.push('')
  lines.push(`> 预注册：\`${result.prereg}\`（**v2**，Nasdaq 数据源）。评估区间 ${result.evalStart} → ${result.evalEnd}（${result.nDays} 个收益日）。主成本 0.10%；次日收盘成交；自助法 B=${BOOT_B}、块长均值 ${BLOCK_MEAN}、种子 ${SEED}；Holm 族错误率 10%。γ=3；CER=252×(mean−γ/2·总体方差)。Sharpe 无风险利率取 0。`)
  lines.push('>')
  lines.push('> 价格：Nasdaq historical（已拆股、未分红调整）；日总回报 `r=(P_t+D_t)/P_{t-1}−1`；AVGO 拆股前现金分红 ÷10；**QQEW 分红接口失败，仅用价格收益**。')
  lines.push('>')
  lines.push('> **事后选股偏差**：AVGO/MSFT/META/SOFI/RKLB 于 2026-11 在已知历史走势后选出；与 QQQ/QQEW 的比较只作描述，不能作为选股能力证据。')
  lines.push('')

  lines.push('## 判定表（主比较 vs BH）')
  lines.push('')
  lines.push('| 方案 | 判定 | ΔCER | 95% CI | p | p(Holm) | (a) Holm p<0.10 | (b) 两子期>0 | (c) 剔60日后>0 | (d) 成本0.30%后>0 | (e) 剔除≥4/5 >0 |')
  lines.push('|---|---|---:|---|---:|---:|---|---|---|---|---|')
  for (const id of ['T5', 'M']) {
    const x = main[id]
    const c = x.checks
    const v = c.values
    lines.push(`| ${id} | **${c.verdict}** | ${fmtPct(x.deltaCer)} | [${fmtPct(x.ci95[0])}, ${fmtPct(x.ci95[1])}] | ${fmtNum(x.p, 4)} | ${fmtNum(x.pHolm, 4)} | ${c.a ? '是' : '否'} (${fmtNum(v.holmP, 4)}) | ${c.b ? '是' : '否'} (${fmtPct(v.subA)} / ${fmtPct(v.subB)}) | ${c.c ? '是' : '否'} (${fmtPct(v.drop60)}) | ${c.d ? '是' : '否'} (${fmtPct(v.dCerHigh)}) | ${c.e ? '是' : '否'} (${v.looPos}/5) |`)
  }
  lines.push('')
  lines.push('子期与稳健判定明细：')
  lines.push('')
  lines.push('| 方案 | 2021-08-25–2023-12-29 | 2024-01-02–末 | 剔贡献最大连续60日后 | 成本0.30% ΔCER |')
  lines.push('|---|---:|---:|---:|---:|')
  for (const id of ['T5', 'M']) {
    const v = main[id].checks.values
    lines.push(`| ${id} | ${fmtPct(v.subA)} | ${fmtPct(v.subB)} | ${fmtPct(v.drop60)} | ${fmtPct(v.dCerHigh)} |`)
  }
  lines.push('')

  lines.push('## 次要指标（主设定）')
  lines.push('')
  lines.push('| 方案 | 期末净值 | CAGR | 年化波动 | 最大回撤 | 回撤起止 | Calmar | Sharpe(rf=0) | 触发次数 | 年化换手 | 累计成本 | 期末最大单只权重 |')
  lines.push('|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|')
  for (const id of ['BH', 'T5', 'M', 'QQQ', 'QQEW']) {
    const x = m[id]
    lines.push(`| ${id} | ${fmtNum(x.finalEquity, 4)} | ${fmtPct(x.cagr)} | ${fmtPct(x.vol)} | ${fmtPct(x.maxDrawdown)} | ${x.ddStart}→${x.ddEnd} | ${fmtNum(x.calmar, 3)} | ${fmtNum(x.sharpe, 3)} | ${x.triggerCount} | ${fmtPct(x.turnoverAnn)} | ${fmtPct(x.cumCost, 3)} | ${fmtPct(x.maxWeight)} |`)
  }
  lines.push('')
  lines.push('期末各股权重（BH / T5 / M）：')
  lines.push('')
  lines.push('| 代码 | BH | T5 | M |')
  lines.push('|---|---:|---:|---:|')
  for (let i = 0; i < STOCKS.length; i++) {
    lines.push(`| ${STOCKS[i]} | ${fmtPct(m.BH.finalWeights[i])} | ${fmtPct(m.T5.finalWeights[i])} | ${fmtPct(m.M.finalWeights[i])} |`)
  }
  lines.push('')

  lines.push('## 再平衡收益分解（T5 vs BH）')
  lines.push('')
  lines.push('| 项目 | 数值 |')
  lines.push('|---|---:|')
  lines.push(`| BH 期末净值 | ${fmtNum(decomp.bhFinal, 6)} |`)
  lines.push(`| T5 成本前期末净值 | ${fmtNum(decomp.t5GrossFinal, 6)} |`)
  lines.push(`| T5 扣成本后期末净值 | ${fmtNum(decomp.t5NetFinal, 6)} |`)
  lines.push(`| 成本前差额 (T5−BH) | ${fmtNum(decomp.diffGross, 6)} |`)
  lines.push(`| 成本拖累 (毛−净) | ${fmtNum(decomp.costDrag, 6)} |`)
  lines.push(`| 扣成本后差额 | ${fmtNum(decomp.diffNet, 6)} |`)
  lines.push(`| T5 累计成本（占路径扣减乘积口径） | ${fmtPct(decomp.t5CumCost, 3)} |`)
  lines.push('')

  lines.push('## 增量比较（报告 p 值，不纳入主族）')
  lines.push('')
  lines.push('| 比较 | ΔCER | p | 95% CI |')
  lines.push('|---|---:|---:|---|')
  for (const [k, v] of Object.entries(incremental)) {
    lines.push(`| ${k} | ${fmtPct(v.deltaCer)} | ${fmtNum(v.p, 4)} | [${fmtPct(v.ci95[0])}, ${fmtPct(v.ci95[1])}] |`)
  }
  lines.push('')

  lines.push('## 稳健性（不改变判定）')
  lines.push('')
  lines.push('### 当日收盘成交')
  lines.push('')
  lines.push('| 方案 | 期末净值 | CAGR | 最大回撤 | ΔCER vs BH |')
  lines.push('|---|---:|---:|---:|---:|')
  lines.push(`| BH | ${fmtNum(robust.sameDay.BH.finalEquity, 4)} | ${fmtPct(robust.sameDay.BH.cagr)} | ${fmtPct(robust.sameDay.BH.maxDrawdown)} | — |`)
  lines.push(`| T5 | ${fmtNum(robust.sameDay.T5.finalEquity, 4)} | ${fmtPct(robust.sameDay.T5.cagr)} | ${fmtPct(robust.sameDay.T5.maxDrawdown)} | ${fmtPct(robust.sameDay.deltaCerT5)} |`)
  lines.push(`| M | ${fmtNum(robust.sameDay.M.finalEquity, 4)} | ${fmtPct(robust.sameDay.M.cagr)} | ${fmtPct(robust.sameDay.M.maxDrawdown)} | ${fmtPct(robust.sameDay.deltaCerM)} |`)
  lines.push('')
  lines.push('### 成本 0.30%')
  lines.push('')
  lines.push('| 方案 | 期末净值 | CAGR | ΔCER vs BH |')
  lines.push('|---|---:|---:|---:|')
  lines.push(`| BH | ${fmtNum(robust.costHigh.BH.finalEquity, 4)} | ${fmtPct(robust.costHigh.BH.cagr)} | — |`)
  lines.push(`| T5 | ${fmtNum(robust.costHigh.T5.finalEquity, 4)} | ${fmtPct(robust.costHigh.T5.cagr)} | ${fmtPct(robust.costHigh.T5.deltaCer)} |`)
  lines.push(`| M | ${fmtNum(robust.costHigh.M.finalEquity, 4)} | ${fmtPct(robust.costHigh.M.cagr)} | ${fmtPct(robust.costHigh.M.deltaCer)} |`)
  lines.push('')
  lines.push('### 阈值 10 个百分点（T10）与每季度固定（Q）')
  lines.push('')
  lines.push('| 方案 | 期末净值 | CAGR | 最大回撤 | 触发次数 | ΔCER vs BH |')
  lines.push('|---|---:|---:|---:|---:|---:|')
  lines.push(`| T10 | ${fmtNum(robust.T10.metrics.finalEquity, 4)} | ${fmtPct(robust.T10.metrics.cagr)} | ${fmtPct(robust.T10.metrics.maxDrawdown)} | ${robust.T10.metrics.triggerCount} | ${fmtPct(robust.T10.deltaCer)} |`)
  lines.push(`| Q | ${fmtNum(robust.Q.metrics.finalEquity, 4)} | ${fmtPct(robust.Q.metrics.cagr)} | ${fmtPct(robust.Q.metrics.maxDrawdown)} | ${robust.Q.metrics.triggerCount} | ${fmtPct(robust.Q.deltaCer)} |`)
  lines.push('')
  lines.push('### 起点 2022-02-25')
  lines.push('')
  lines.push('| 方案 | 期末净值 | CAGR | 最大回撤 | ΔCER vs BH |')
  lines.push('|---|---:|---:|---:|---:|')
  lines.push(`| BH | ${fmtNum(robust.lateStart.BH.finalEquity, 4)} | ${fmtPct(robust.lateStart.BH.cagr)} | ${fmtPct(robust.lateStart.BH.maxDrawdown)} | — |`)
  lines.push(`| T5 | ${fmtNum(robust.lateStart.T5.finalEquity, 4)} | ${fmtPct(robust.lateStart.T5.cagr)} | ${fmtPct(robust.lateStart.T5.maxDrawdown)} | ${fmtPct(robust.lateStart.deltaCerT5)} |`)
  lines.push(`| M | ${fmtNum(robust.lateStart.M.finalEquity, 4)} | ${fmtPct(robust.lateStart.M.cagr)} | ${fmtPct(robust.lateStart.M.maxDrawdown)} | ${fmtPct(robust.lateStart.deltaCerM)} |`)
  lines.push('')

  lines.push('## 逐一剔除一只（剩四只各 25%，阈值 6.25 个百分点）')
  lines.push('')
  lines.push('| 剔除 | BH 期末 | T5 期末 | M 期末 | ΔCER T5−BH | ΔCER M−BH | T5 触发 |')
  lines.push('|---|---:|---:|---:|---:|---:|---:|')
  for (const drop of STOCKS) {
    const x = leaveOneOut[drop]
    lines.push(`| ${drop} | ${fmtNum(x.BH.finalEquity, 4)} | ${fmtNum(x.T5.finalEquity, 4)} | ${fmtNum(x.M.finalEquity, 4)} | ${fmtPct(x.deltaCerT5)} | ${fmtPct(x.deltaCerM)} | ${x.T5.triggerCount} |`)
  }
  lines.push('')

  lines.push('## 数据说明')
  lines.push('')
  lines.push('| 代码 | 首末日期 | 行数 | 现金分红条数 | hist sha256（前12） |')
  lines.push('|---|---|---:|---:|---|')
  for (const sym of ALL_SYMBOLS) {
    const x = rawMeta[sym]
    const divNote = x.dividendsMissing ? '缺失(仅价格)' : String(x.dividendCount)
    lines.push(`| ${sym} | ${x.firstDate} → ${x.lastDate} | ${x.rows} | ${divNote} | ${x.historicalSha256.slice(0, 12)}… |`)
  }
  lines.push('')
  lines.push(`共同交易日：评估 ${result.evalStart} → ${result.evalEnd}。剔除交易日 ${dropped.length} 个` + (dropped.length ? `（${dropped.slice(0, 20).map(d => d.date).join(', ')}${dropped.length > 20 ? ', …' : ''}）` : '（无）') + '。')
  lines.push('')
  lines.push('AVGO 2024-07-15 一拆十：价格序列已拆股调整；除息日早于该日的 Cash 分红金额 ÷10。QQEW 分红文件 data=null，增量比较 T5 vs QQEW 基于价格收益。交叉核对见 SOURCES.md。')
  lines.push('')
  if (largeMoves.length) {
    lines.push('单日 ±50% 以上涨跌（拆股调整收盘价）：')
    lines.push('')
    lines.push('| 代码 | 日期 | 前日 | 当日价 | 涨跌 |')
    lines.push('|---|---|---:|---:|---:|')
    for (const r of largeMoves) {
      lines.push(`| ${r.symbol} | ${r.date} | ${fmtNum(r.prev, 4)} | ${fmtNum(r.price, 4)} | ${fmtPct(r.ret)} |`)
    }
    lines.push('')
  } else {
    lines.push('单日 ±50% 以上涨跌：无（与预注册 v2 / manager 交叉核对一致）。')
    lines.push('')
  }
  if (manualCheck) {
    lines.push(`手工核对（起始日→第一次 T5 触发日 ${manualCheck.firstDecisionDate}，扣成本前）：BH 净值=${fmtNum(manualCheck.bhEquityOnDecision, 10)}，T5 净值=${fmtNum(manualCheck.t5EquityOnDecision, 10)}，相同=${manualCheck.equal}。成交日=${manualCheck.firstExecDate}。`)
    lines.push('')
  }

  lines.push('## 局限')
  lines.push('')
  lines.push('- **事后选股**：五只股票在 2026-11 已知走势后选定；相对指数的优势不能推广为选股能力。')
  lines.push('- 样本约 5 年、单一路径；平稳块自助法依赖块长 20；统计功效有限。')
  lines.push('- 不计税；成本为固定单边费率近似，未建模冲击与停牌。')
  lines.push('- 次日收盘成交假设不可在实盘精确复制；当日成交稳健性仅作对照。')
  lines.push('- 历史结果不代表未来，不构成投资建议。结论均为条件化表述（在本预注册规则与样本下）。')
  lines.push('')
  lines.push('## 解释性选择（预注册未写死）')
  lines.push('- 单边换手 = ½ Σ\\|w_i − target\\|；成本从再平衡当日收盘净值扣除。')
  lines.push('- 「剔贡献最大连续60日」= 选择使剩余 ΔCER **最小** 的 60 日窗口后，要求剩余 ΔCER>0。')
  lines.push('- 自助法单侧 p = #{ΔCER*≤0}/B；主比较 Holm α=0.10。')
  lines.push('- 数据为 Nasdaq historical + dividends（v2）；总分红回报指数作模拟价格输入。')
  lines.push('- QQEW 缺分红 → 价格收益；不影响主判定族。')
  lines.push('')

  return `${lines.join('\n')}\n`
}

async function atomicWrite(path, content) {
  const tmp = `${path}.tmp`
  await writeFile(tmp, content, 'utf8')
  await rename(tmp, path)
}

async function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const dataDir = join(root, 'data-raw', 'stock5-rebalance')
  for (const sym of ALL_SYMBOLS) {
    const { historical, dividends } = dataPaths(sym)
    for (const f of [historical, dividends]) {
      try {
        await readFile(join(dataDir, f), 'utf8')
      } catch {
        console.error(`缺少数据文件 ${f}（目录 ${dataDir}）。`)
        process.exit(2)
      }
    }
  }
  const result = await runBacktest(root)
  const md = renderMarkdown(result)
  const outMd = join(root, 'docs', 'research', 'stock5-rebalance-backtest-results-2026-11-21.md')
  const outJson = join(root, 'data-raw', 'stock5-rebalance', 'results.json')
  await mkdir(dirname(outMd), { recursive: true })
  await atomicWrite(outMd, md)
  // JSON：去掉可能不稳定的大数组以保持可读；保留判定所需标量
  const jsonOut = JSON.parse(JSON.stringify(result, (k, v) => {
    if (k === 'rets' || k === 'evalIdx') return undefined
    return v
  }))
  await atomicWrite(outJson, `${JSON.stringify(jsonOut, null, 2)}\n`)
  console.log(`eval ${result.evalStart} → ${result.evalEnd} (${result.nDays} days)`)
  console.log(`T5: ${result.main.T5.checks.verdict} ΔCER=${(result.main.T5.deltaCer * 100).toFixed(2)}%`)
  console.log(`M:  ${result.main.M.checks.verdict} ΔCER=${(result.main.M.deltaCer * 100).toFixed(2)}%`)
  console.log(`wrote ${outMd}`)
  console.log(`wrote ${outJson}`)
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  main().catch(err => {
    console.error(err)
    process.exit(1)
  })
}
