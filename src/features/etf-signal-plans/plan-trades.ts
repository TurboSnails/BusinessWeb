import { bullLookup, kd10Signals } from './kd10-signals'
import { macdCloseSignals, windowBounds } from './macd-signals'

export type PlanKey = 'cyb' | 'hs' | 'macd'
export type PlanBar = { date: string; open: number; high: number; low: number; close: number }
export type PlanSignal = { date: string; side: 'buy' | 'sell'; price: number; signalDate: string; reason: string; ret?: number; forced?: boolean }
export type PlanResult = { key: PlanKey; name: string; signals: PlanSignal[]; pendingBuy?: { signalDate: string; reason: string }; holding: boolean }
type BullPoint = { date: string; bull: boolean | null }

export const PLAN_NAMES: Record<PlanKey, string> = { cyb: '创业板择时', hs: '沪深300择时', macd: '纯MACD' }

export function cybPlan(bars: PlanBar[], r2: BullPoint[]): PlanResult {
  const result = kd10Signals(bars, bullLookup(r2))
  return { key: 'cyb', name: PLAN_NAMES.cyb, ...result }
}

export function hsPlan(bars: PlanBar[], h1: BullPoint[]): PlanResult {
  const result = macdCloseSignals(bars, { bull: bullLookup(h1) })
  return {
    key: 'hs', name: PLAN_NAMES.hs, holding: result.holding,
    signals: result.signals.map(signal => ({ ...signal, reason: signal.side === 'buy' ? '金叉' : '死叉' })),
    ...(result.pendingBuy ? { pendingBuy: { signalDate: result.pendingBuy.signalDate, reason: '金叉' } } : {}),
  }
}

export function macdPlan(bars: PlanBar[]): PlanResult {
  const result = macdCloseSignals(bars)
  return {
    key: 'macd', name: PLAN_NAMES.macd, holding: result.holding,
    signals: result.signals.map(signal => ({ ...signal, reason: signal.side === 'buy' ? '金叉' : '死叉' })),
    ...(result.pendingBuy ? { pendingBuy: { signalDate: result.pendingBuy.signalDate, reason: '金叉' } } : {}),
  }
}

export const PLAN_COST = 0.001
export const PLAN_WARMUP = 120
const MIN_ROWS = 120, ANNUAL_MIN_ROWS = 244, ANNUAL_MIN_DAYS = 365

export type PlanWindow = { from: string; to: string }
export type PlanBacktest = {
  first: string; last: string; sessions: number; years: number
  total: number; cagr?: number; mdd: number; calmar?: number
  natural: number; wins: number
  winRate?: number; avgWin?: number; avgLoss?: number; payoff?: number; best?: number; worst?: number
  /** 单笔平均盈亏：已完成交易收益的算术平均（不含期末强制平仓） */
  avgRet?: number
  hold?: number
}
export type PlanYearly = { year: number; result: PlanBacktest }[]

function signalsIn(key: PlanKey, bars: PlanBar[], bull: (date: string) => boolean | undefined, window: PlanWindow): PlanSignal[] {
  if (key === 'cyb') return kd10Signals(bars, bull, { warmup: PLAN_WARMUP, window }).signals
  return macdCloseSignals(bars, { bull: key === 'macd' ? undefined : bull, warmup: PLAN_WARMUP, window }).signals.map(signal => ({
    ...signal, reason: signal.forced ? '期末平仓' : signal.side === 'buy' ? '金叉' : '死叉',
  }))
}

export function backtestPlan(
  key: PlanKey, bars: PlanBar[], bull: (date: string) => boolean | undefined,
  window: PlanWindow = { from: '1900-01-01', to: '9999-12-31' },
): PlanBacktest | undefined {
  const [start, end] = windowBounds(bars, PLAN_WARMUP, window)
  if (end - start + 1 < MIN_ROWS) return undefined
  const signals = signalsIn(key, bars, bull, window)
  const f = PLAN_COST
  let cash = 1, q = 0, entryCash = 0, peak = 1, mdd = 0, k = 0
  const rets: number[] = []
  for (let i = start; i <= end; i++) {
    const bar = bars[i]
    while (k < signals.length && signals[k].date < bar.date) k++
    for (; k < signals.length && signals[k].date === bar.date; k++) {
      const signal = signals[k]
      if (signal.side === 'buy' && !q) { q = cash / (signal.price * (1 + f)); entryCash = cash; cash = 0 }
      else if (signal.side === 'sell' && q) { cash = q * signal.price * (1 - f); q = 0; if (!signal.forced) rets.push(cash / entryCash - 1) }
    }
    const value = cash + q * bar.close
    peak = Math.max(peak, value); mdd = Math.min(mdd, value / peak - 1)
  }
  const days = (Date.parse(bars[end].date) - Date.parse(bars[start].date)) / 86_400_000, years = days / 365.25
  const cagr = end - start + 1 >= ANNUAL_MIN_ROWS && days >= ANNUAL_MIN_DAYS && cash > 0 ? Math.expm1(Math.log(cash) / years) : undefined
  const wins = rets.filter(ret => ret > 0), losses = rets.filter(ret => ret <= 0)
  const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined
  const avgWin = mean(wins), avgLoss = mean(losses)
  const hold = start + 1 <= end ? bars[end].close * (1 - f) / (bars[start + 1].open * (1 + f)) - 1 : undefined
  return {
    first: bars[start].date, last: bars[end].date, sessions: end - start + 1, years,
    total: cash - 1, cagr, mdd, calmar: cagr !== undefined && mdd < 0 ? cagr / -mdd : undefined,
    natural: rets.length, wins: wins.length, winRate: rets.length ? wins.length / rets.length : undefined,
    avgWin, avgLoss, payoff: avgWin !== undefined && avgLoss !== undefined && avgLoss < 0 ? avgWin / -avgLoss : undefined,
    best: rets.length ? Math.max(...rets) : undefined, worst: rets.length ? Math.min(...rets) : undefined,
    avgRet: mean(rets), hold,
  }
}

export function backtestPlanYearly(key: PlanKey, bars: PlanBar[], bull: (date: string) => boolean | undefined): PlanYearly {
  if (!bars.length) return []
  const out: PlanYearly = []
  for (let year = Number(bars[0].date.slice(0, 4)); year <= Number(bars.at(-1)!.date.slice(0, 4)); year++) {
    const result = backtestPlan(key, bars, bull, { from: `${year}-01-01`, to: `${year}-12-31` })
    if (result) out.push({ year, result })
  }
  return out
}

export function yearlySummary(yearly: PlanYearly) {
  const rets = yearly.map(item => item.result.total)
  return {
    years: rets.length, positive: rets.filter(ret => ret > 0).length,
    avg: rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : undefined,
    worst: rets.length ? Math.min(...rets) : undefined,
  }
}
