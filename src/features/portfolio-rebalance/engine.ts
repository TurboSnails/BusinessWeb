import type {
  CompareSet,
  Distance,
  Episode,
  PriceBook,
  Rule,
  RunInput,
  RunResult,
  Trade,
  TradeReason,
} from './types'

const WEIGHT_TOL = 1e-9

/** 其余不动时，权重从 w 到边界 b 所需涨跌幅：g = b(1−w)/((1−b)w) − 1 */
export function riseToBound(w: number, b: number): number {
  if (w <= 0 || w >= 1 || b <= 0 || b >= 1) return NaN
  return (b * (1 - w)) / ((1 - b) * w) - 1
}

function assertValidInput(input: RunInput): void {
  const { symbols, weights } = input
  if (symbols.length === 0) throw new Error('至少选择一只股票')
  if (symbols.length !== weights.length) throw new Error('代码与权重数量不一致')
  if (new Set(symbols).size !== symbols.length) throw new Error('代码有重复')
  for (const w of weights) {
    if (!(w > 0)) throw new Error('权重必须为正')
  }
  const sum = weights.reduce((a, b) => a + b, 0)
  if (Math.abs(sum - 1) > WEIGHT_TOL) {
    throw new Error(`权重合计须为 100%（当前 ${(sum * 100).toFixed(2)}%）`)
  }
  if (input.switch && !symbols.includes(input.switch.stable)) {
    throw new Error('稳定资产必须在组合内')
  }
}

function periodKey(date: string, every: 'month' | 'quarter' | 'year'): string {
  const y = date.slice(0, 4)
  const m = Number(date.slice(5, 7))
  if (every === 'month') return `${y}-${String(m).padStart(2, '0')}`
  if (every === 'quarter') return `${y}-Q${Math.ceil(m / 3)}`
  return y
}

function bandsFor(rule: Rule, targets: number[]): Array<[number, number] | null> {
  if (rule.kind === 'relative') {
    return targets.map((t) => [t * (1 - rule.pct), t * (1 + rule.pct)])
  }
  if (rule.kind === 'absolute') {
    return targets.map((t) => [t - rule.points, t + rule.points])
  }
  return targets.map(() => null)
}

function breached(
  w: number[],
  bands: Array<[number, number] | null>,
): { symbolIdx: number; weight: number } | null {
  for (let j = 0; j < w.length; j++) {
    const b = bands[j]
    if (!b) continue
    if (!(b[0] < w[j] && w[j] < b[1])) return { symbolIdx: j, weight: w[j] }
  }
  return null
}

function commonDates(
  book: PriceBook,
  symbols: string[],
  start?: string,
  end?: string,
): string[] {
  let set: Set<string> | null = null
  for (const s of symbols) {
    const series = book[s]
    if (!series || series.dates.length === 0) throw new Error(`缺少价格数据：${s}`)
    const next = new Set(series.dates)
    if (!set) {
      set = next
      continue
    }
    const inter = new Set<string>()
    for (const d of set) if (next.has(d)) inter.add(d)
    set = inter
  }
  let dates = set ? Array.from(set).sort() : []
  if (start) dates = dates.filter((d) => d >= start)
  if (end) dates = dates.filter((d) => d <= end)
  if (dates.length < 2) throw new Error('共同交易日不足')
  return dates
}

type Pending =
  | { day: number; kind: 'band' | 'calendar' | 'restore' | 'timeout'; peakAt?: number }
  | { day: number; kind: 'step'; stableIdx: number }

function timeoutDays(months: number): number {
  return Math.round((months * 365.25) / 12)
}

function computeDistance(
  symbols: string[],
  weights: number[],
  targets: number[],
  rule: Rule,
): Distance[] {
  if (rule.kind === 'buyHold' || rule.kind === 'calendar') return []
  const bands = bandsFor(rule, targets)
  return symbols.map((symbol, j) => {
    const b = bands[j]!
    const w = weights[j]
    return {
      symbol,
      weight: w,
      lower: b[0],
      upper: b[1],
      riseToUpper: riseToBound(w, b[1]),
      fallToLower: riseToBound(w, b[0]),
    }
  })
}

function maxDrawdown(dates: string[], equity: number[]): RunResult['maxDrawdown'] {
  let peak = equity[0]
  let peakDay = dates[0]
  let trough = 0
  let troughDay = dates[0]
  let peakAtTrough = dates[0]
  for (let i = 0; i < equity.length; i++) {
    if (equity[i] > peak) {
      peak = equity[i]
      peakDay = dates[i]
    }
    const dd = equity[i] / peak - 1
    if (dd < trough) {
      trough = dd
      troughDay = dates[i]
      peakAtTrough = peakDay
    }
  }
  return { value: trough, peak: peakAtTrough, trough: troughDay }
}

function yearlyReturns(dates: string[], equity: number[]): { year: number; ret: number }[] {
  const byYear = new Map<number, { lastEq: number }>()
  for (let i = 0; i < dates.length; i++) {
    const y = Number(dates[i].slice(0, 4))
    const cur = byYear.get(y)
    if (!cur) byYear.set(y, { lastEq: equity[i] })
    else cur.lastEq = equity[i]
  }
  const years = [...byYear.keys()].sort((a, b) => a - b)
  const out: { year: number; ret: number }[] = []
  for (let i = 0; i < years.length; i++) {
    const y = years[i]
    const info = byYear.get(y)!
    const startEq = i === 0 ? equity[0] : byYear.get(years[i - 1])!.lastEq
    out.push({ year: y, ret: info.lastEq / startEq - 1 })
  }
  return out
}

export function runBacktest(book: PriceBook, input: RunInput): RunResult {
  assertValidInput(input)
  const symbols = input.symbols
  const targets = [...input.weights]
  const sw = input.switch
  const signalSym = input.signal ?? 'QQQ'
  const needSignal = Boolean(sw)
  if (needSignal && !book[signalSym]) throw new Error(`缺少信号指数数据：${signalSym}`)

  const alignSyms = needSignal ? [...symbols, signalSym] : [...symbols]
  const firstCommon = commonDates(book, alignSyms)
  const requestedStart = input.start
  let startAdjusted = false
  let start = firstCommon[0]
  if (requestedStart) {
    if (requestedStart < start) startAdjusted = true
    else start = requestedStart
  }
  const dates = commonDates(book, alignSyms, start, input.end)
  start = dates[0]
  const end = dates[dates.length - 1]

  const px = symbols.map((s) => {
    const series = book[s]
    const m = new Map<string, number>()
    for (let i = 0; i < series.dates.length; i++) m.set(series.dates[i], series.adjClose[i])
    return m
  })
  const signalPx = needSignal
    ? (() => {
        const series = book[signalSym]
        const m = new Map<string, number>()
        for (let i = 0; i < series.dates.length; i++) m.set(series.dates[i], series.adjClose[i])
        return m
      })()
    : null

  const k = symbols.length
  let w = [...targets]
  let eq = 1
  const eqs: number[] = [1]
  const trades: Trade[] = []
  let totalCost = 0
  let totalTurnover = 0
  let pending: Pending | null = null

  const stableIdx = sw ? symbols.indexOf(sw.stable) : -1
  let inStress = false
  let peak = signalPx ? signalPx.get(dates[0])! : 0
  let nextLevel = 0
  let stableBase = 0
  let sold = 0
  let steps = 0
  let entryDayIdx = -1
  let ep: Episode | null = null
  const episodes: Episode[] = []

  const bands = bandsFor(input.rule, targets)
  const costRate = input.cost
  const initial = input.initial

  const applyFullRebalance = (day: string, reason: TradeReason, trigger?: Trade['trigger']) => {
    const amounts: Record<string, number> = {}
    let turnover = 0
    for (let j = 0; j < k; j++) {
      const delta = targets[j] - w[j]
      amounts[symbols[j]] = delta * eq * initial
      turnover += Math.abs(delta)
    }
    turnover *= 0.5
    eq *= 1 - turnover * costRate
    totalCost += turnover * costRate
    totalTurnover += turnover
    w = [...targets]
    trades.push({ date: day, reason, trigger, amounts })
  }

  const doStep = (day: string, si: number): boolean => {
    const preEq = eq
    let amtDollars = stableBase * (sw?.step ?? 0)
    if (sw?.cap != null) {
      const allowed = stableBase * sw.cap
      const room = allowed - sold
      if (room <= 1e-12) return false
      amtDollars = Math.min(amtDollars, room)
    }
    const amt = Math.min(w[si], amtDollars / preEq)
    if (amt <= 1e-15) return false
    let cand = -1
    let best = Infinity
    for (let j = 0; j < k; j++) {
      if (j === si) continue
      const score = w[j] / targets[j]
      if (score < best) {
        best = score
        cand = j
      }
    }
    if (cand < 0) return false
    const amounts: Record<string, number> = {}
    for (const s of symbols) amounts[s] = 0
    amounts[symbols[si]] = -amt * preEq * initial
    amounts[symbols[cand]] = amt * preEq * initial
    w[si] -= amt
    w[cand] += amt
    const turnover = amt
    eq = preEq * (1 - turnover * costRate)
    totalCost += turnover * costRate
    totalTurnover += turnover
    sold += amt * preEq
    trades.push({ date: day, reason: 'switchStep', amounts })
    steps += 1
    if (ep) ep.steps = steps
    return true
  }

  for (let i = 1; i < dates.length; i++) {
    const d0 = dates[i - 1]
    const d = dates[i]
    const rets = px.map((m) => m.get(d)! / m.get(d0)! - 1)
    eq *= 1 + w.reduce((s, wj, j) => s + wj * rets[j], 0)
    const vals = w.map((wj, j) => wj * (1 + rets[j]))
    const sv = vals.reduce((a, b) => a + b, 0)
    w = vals.map((v) => v / sv)

    if (pending && pending.day === i) {
      if (pending.kind === 'step') {
        doStep(d, pending.stableIdx)
      } else if (pending.kind === 'restore' || pending.kind === 'timeout') {
        const reason: TradeReason =
          pending.kind === 'timeout' ? 'switchTimeout' : 'switchRecover'
        applyFullRebalance(d, reason)
        if (ep) {
          episodes.push({ ...ep, steps })
          ep = null
        }
        inStress = false
        if (pending.peakAt != null) peak = pending.peakAt
        else if (signalPx) peak = signalPx.get(d)!
        nextLevel = 0
        steps = 0
        sold = 0
        stableBase = 0
        entryDayIdx = -1
      } else {
        const hit = breached(w, bands)
        applyFullRebalance(
          d,
          pending.kind === 'calendar' ? 'calendar' : 'band',
          hit ? { symbol: symbols[hit.symbolIdx], weight: hit.weight } : undefined,
        )
      }
      pending = null
    }

    if (sw && signalPx) {
      const q = signalPx.get(d)!
      if (!inStress) {
        peak = Math.max(peak, q)
        const dd = q / peak - 1
        if (dd <= -sw.entry) {
          inStress = true
          stableBase = w[stableIdx] * eq
          sold = 0
          nextLevel = -sw.entry
          steps = 0
          entryDayIdx = i
          ep = { enter: d, steps: 0, recover: null, exit: null }
          if (i + 1 < dates.length) pending = { day: i + 1, kind: 'step', stableIdx }
        } else if (!pending && i + 1 < dates.length) {
          if (input.rule.kind === 'calendar') {
            if (periodKey(d, input.rule.every) !== periodKey(dates[i + 1], input.rule.every)) {
              pending = { day: i + 1, kind: 'calendar' }
            }
          } else if (input.rule.kind === 'relative' || input.rule.kind === 'absolute') {
            if (breached(w, bands)) pending = { day: i + 1, kind: 'band' }
          }
        }
      } else {
        const dd = q / peak - 1
        const recoverLevel = sw.recover === 'newHigh' ? 0 : -sw.recover
        const elapsed =
          entryDayIdx >= 0
            ? (Date.parse(d) - Date.parse(dates[entryDayIdx])) / 86400000
            : 0
        const timedOut =
          sw.timeoutMonths != null && elapsed >= timeoutDays(sw.timeoutMonths)
        if (dd >= recoverLevel) {
          if (ep) {
            ep.recover = d
            ep.exit = 'recover'
          }
          if (i + 1 < dates.length) pending = { day: i + 1, kind: 'restore', peakAt: q }
        } else if (timedOut) {
          if (ep) {
            ep.recover = d
            ep.exit = 'timeout'
          }
          if (i + 1 < dates.length) pending = { day: i + 1, kind: 'timeout', peakAt: q }
        } else if (dd <= nextLevel - sw.gap) {
          nextLevel -= sw.gap
          const canStep = sw.cap == null || sold < stableBase * sw.cap - 1e-12
          if (canStep && i + 1 < dates.length) {
            pending = { day: i + 1, kind: 'step', stableIdx }
          }
        }
      }
    } else if (!pending && i + 1 < dates.length) {
      if (input.rule.kind === 'calendar') {
        if (periodKey(d, input.rule.every) !== periodKey(dates[i + 1], input.rule.every)) {
          pending = { day: i + 1, kind: 'calendar' }
        }
      } else if (input.rule.kind === 'relative' || input.rule.kind === 'absolute') {
        if (breached(w, bands)) pending = { day: i + 1, kind: 'band' }
      }
    }

    eqs.push(eq)
  }

  if (ep) episodes.push({ ...ep, steps })

  const rets = eqs.slice(1).map((e, i) => e / eqs[i] - 1)
  const n = rets.length
  const mean = n ? rets.reduce((a, b) => a + b, 0) / n : 0
  const variance = n ? rets.reduce((a, r) => a + (r - mean) ** 2, 0) / n : 0
  const years = (Date.parse(end) - Date.parse(start)) / (365.25 * 86400000)
  const final = eqs[eqs.length - 1]
  const cagr = years > 0 ? final ** (1 / years) - 1 : 0
  const vol = Math.sqrt(variance * 252)
  const mdd = maxDrawdown(dates, eqs)
  const finalWeights: Record<string, number> = {}
  for (let j = 0; j < k; j++) finalWeights[symbols[j]] = w[j]

  return {
    start,
    end,
    startAdjusted,
    dates,
    equity: eqs,
    final,
    finalAmount: final * initial,
    cagr,
    vol,
    maxDrawdown: mdd,
    cer: 252 * (mean - 1.5 * variance),
    trades,
    tradeCount: trades.length,
    annualTurnover: years > 0 ? totalTurnover / years : 0,
    totalCost,
    finalWeights,
    yearly: yearlyReturns(dates, eqs),
    distance: computeDistance(symbols, w, targets, input.rule),
    episodes,
  }
}

export function equalWeightInput(input: RunInput): RunInput {
  const n = input.symbols.length
  return {
    ...input,
    weights: input.symbols.map(() => 1 / n),
  }
}

export function leaveOneOutInputs(
  input: RunInput,
): { dropped: string; input: RunInput }[] {
  return input.symbols.map((dropped, di) => {
    const remainW = input.weights.filter((_, j) => j !== di)
    const remainS = input.symbols.filter((_, j) => j !== di)
    const droppedW = input.weights[di]
    const scale = 1 / (1 - droppedW)
    const weights = remainW.map((w) => w * scale)
    let rule = input.rule
    if (rule.kind === 'absolute') {
      rule = { kind: 'absolute', points: rule.points * scale }
    }
    let sw = input.switch
    if (sw && sw.stable === dropped) sw = undefined
    return {
      dropped,
      input: { ...input, symbols: remainS, weights, rule, switch: sw },
    }
  })
}

export function compareSet(book: PriceBook, input: RunInput): CompareSet {
  const active = runBacktest(book, input)
  const window = { start: active.start, end: active.end }
  const holdInput: RunInput = { ...input, ...window, rule: { kind: 'buyHold' }, switch: undefined }
  const custom = {
    hold: runBacktest(book, holdInput),
    active,
  }
  const eqIn = { ...equalWeightInput(input), ...window }
  const equal = {
    hold: runBacktest(book, { ...eqIn, rule: { kind: 'buyHold' }, switch: undefined }),
    active: runBacktest(book, eqIn),
  }
  const benchmarks: CompareSet['benchmarks'] = { QQQ: null, QQQE: null }
  for (const b of ['QQQ', 'QQQE'] as const) {
    if (!book[b]) continue
    try {
      benchmarks[b] = runBacktest(book, {
        symbols: [b],
        weights: [1],
        rule: { kind: 'buyHold' },
        ...window,
        cost: input.cost,
        initial: input.initial,
      })
    } catch {
      benchmarks[b] = null
    }
  }
  const leaveOneOut = leaveOneOutInputs(input).map(({ dropped, input: lo }) => ({
    dropped,
    hold: runBacktest(book, { ...lo, ...window, rule: { kind: 'buyHold' }, switch: undefined }),
    active: runBacktest(book, { ...lo, ...window }),
  }))
  return { custom, equal, benchmarks, leaveOneOut }
}
