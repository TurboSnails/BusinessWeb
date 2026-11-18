/** 择时 + B+KD10（Y1）买卖点：观察用。 */
import { MACD_WARMUP, windowBounds } from './macd-signals'

export type Kd10Bar = { date: string; open: number; high: number; low: number; close: number }
export type Kd10Reason = '金叉' | '站上10日线' | '死叉' | '熊市破10日线' | '期末平仓'
export type Kd10Signal = {
  date: string
  side: 'buy' | 'sell'
  price: number
  signalDate: string
  reason: Kd10Reason
  ret?: number
  forced?: boolean
}
export type Kd10Result = {
  signals: Kd10Signal[]
  pendingBuy?: { signalDate: string; reason: Kd10Reason }
  holding: boolean
}
export const KD10_THRESHOLD = 5.3

export function kd10Signals(
  bars: Kd10Bar[],
  bullOf: (date: string) => boolean | undefined,
  { warmup = MACD_WARMUP, window }: { warmup?: number; window?: { from: string; to: string } } = {},
): Kd10Result {
  const signals: Kd10Signal[] = []
  const n = bars.length
  if (!n) return { signals, holding: false }
  const gold: boolean[] = [], dead: boolean[] = []
  let emaFast = bars[0].close, emaSlow = bars[0].close, dea = 0, prior: [number, number] | undefined
  for (let i = 0; i < n; i++) {
    if (i) { emaFast += 2 / 13 * (bars[i].close - emaFast); emaSlow += 2 / 27 * (bars[i].close - emaSlow) }
    const dif = emaFast - emaSlow; dea += 2 / 10 * (dif - dea)
    gold.push(!!prior && prior[0] <= prior[1] && dif > dea)
    dead.push(!!prior && prior[0] >= prior[1] && dif < dea)
    prior = [dif, dea]
  }
  const above: boolean[] = [], below: boolean[] = [], kd: number[] = []
  let sum = 0, k = 50, d = 50
  for (let i = 0; i < n; i++) {
    sum += bars[i].close; if (i >= 10) sum -= bars[i - 10].close
    const ma = i >= 9 ? sum / 10 : NaN
    const eps = Math.abs(bars[i].close) * 1e-9
    above.push(i >= 9 && bars[i].close > ma + eps)
    below.push(i >= 9 && bars[i].close < ma - eps)
    let hi = -Infinity, lo = Infinity
    for (let j = Math.max(0, i - 8); j <= i; j++) { hi = Math.max(hi, bars[j].high); lo = Math.min(lo, bars[j].low) }
    const rsv = hi > lo ? 100 * (bars[i].close - lo) / (hi - lo) : 50
    k = (2 * k + rsv) / 3; d = (2 * d + k) / 3; kd.push(k - d)
  }
  const [lo, hi] = windowBounds(bars, warmup, window)
  let holding = false, entry = 0, entryIndex = -1
  let pending: { side: 'buy' | 'sell'; reason: Kd10Reason } | undefined
  const exitReason = (i: number, bull: boolean | undefined): Kd10Reason | undefined =>
    dead[i] ? '死叉' : bull === false && below[i] ? '熊市破10日线' : undefined
  for (let i = 0; i <= hi; i++) {
    const bar = bars[i]
    if (pending) {
      if (pending.side === 'buy') { holding = true; entry = bar.open; entryIndex = i }
      else holding = false
      signals.push({
        date: bar.date, side: pending.side, price: bar.open, signalDate: bars[i - 1].date, reason: pending.reason,
        ...(pending.side === 'sell' && entry > 0 ? { ret: bar.open / entry - 1 } : {}),
      })
      pending = undefined
    }
    if (i < lo) continue
    if (window && i === hi) {
      if (holding) {
        holding = false
        signals.push({ date: bar.date, side: 'sell', price: bar.close, signalDate: bar.date, reason: '期末平仓', ret: entry > 0 ? bar.close / entry - 1 : undefined, forced: true })
      }
      break
    }
    const bull = bullOf(bar.date)
    if (holding) {
      const why = exitReason(i, bull)
      if (!why) continue
      if (entryIndex === i) pending = { side: 'sell', reason: why }
      else {
        holding = false
        signals.push({ date: bar.date, side: 'sell', price: bar.close, signalDate: bar.date, reason: why, ret: entry > 0 ? bar.close / entry - 1 : undefined })
      }
      continue
    }
    if (bull === false) continue
    if (gold[i]) pending = { side: 'buy', reason: '金叉' }
    else if (i > 0 && above[i] && !above[i - 1] && kd[i] >= KD10_THRESHOLD) pending = { side: 'buy', reason: '站上10日线' }
  }
  return {
    signals, holding,
    pendingBuy: !window && pending?.side === 'buy' ? { signalDate: bars.at(-1)!.date, reason: pending.reason } : undefined,
  }
}

export function bullLookup(points: { date: string; bull: boolean | null }[]): (date: string) => boolean | undefined {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))
  return date => {
    let lo = 0, hi = sorted.length - 1, found = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (sorted[mid].date <= date) { found = mid; lo = mid + 1 } else hi = mid - 1
    }
    const bull = found < 0 ? null : sorted[found].bull
    return bull === null ? undefined : bull
  }
}
