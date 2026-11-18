/** MACD(12,26,9) 收盘卖策略买卖点（观察用，不参与网格回测）。 */

export type MacdBar = { date: string; open: number; close: number }
export type MacdSignal = {
  date: string
  side: 'buy' | 'sell'
  price: number
  signalDate: string
  ret?: number
  forced?: boolean
}
export type MacdCloseResult = {
  signals: MacdSignal[]
  pendingBuy?: { signalDate: string }
  holding: boolean
}

export const MACD_WARMUP = 120

export function windowBounds(bars: { date: string }[], warmup: number, window?: { from: string; to: string }): [number, number] {
  if (!window) return [warmup, bars.length - 1]
  let lo = bars.findIndex((bar, i) => i >= warmup && bar.date >= window.from)
  if (lo < 0) lo = bars.length
  let hi = -1
  for (let i = bars.length - 1; i >= 0; i--) if (bars[i].date <= window.to) { hi = i; break }
  return [lo, hi]
}

export function macdCloseSignals(bars: MacdBar[], {
  fast = 12, slow = 26, signal = 9, warmup = MACD_WARMUP, bull, window,
}: {
  fast?: number; slow?: number; signal?: number; warmup?: number
  bull?: (date: string) => boolean | undefined
  window?: { from: string; to: string }
} = {}): MacdCloseResult {
  const signals: MacdSignal[] = []
  if (!bars.length) return { signals, holding: false }
  const kf = 2 / (fast + 1), ks = 2 / (slow + 1), kd = 2 / (signal + 1)
  let emaFast = bars[0].close, emaSlow = bars[0].close, dea = 0
  let prior: [number, number] | undefined
  let holding = false, pending = false, pendingSell = false, entry = 0
  const [lo, hi] = windowBounds(bars, warmup, window)
  for (let i = 0; i <= hi; i++) {
    const bar = bars[i]
    if (i) { emaFast += kf * (bar.close - emaFast); emaSlow += ks * (bar.close - emaSlow) }
    const dif = emaFast - emaSlow
    dea += kd * (dif - dea)
    const gold = !!prior && prior[0] <= prior[1] && dif > dea
    const dead = !!prior && prior[0] >= prior[1] && dif < dea
    prior = [dif, dea]
    if (pendingSell) {
      holding = false; pendingSell = false
      signals.push({ date: bar.date, side: 'sell', price: bar.open, signalDate: bars[i - 1].date, ret: entry > 0 ? bar.open / entry - 1 : undefined })
    }
    let boughtToday = false
    if (pending) {
      holding = true; pending = false; entry = bar.open; boughtToday = true
      signals.push({ date: bar.date, side: 'buy', price: bar.open, signalDate: bars[i - 1].date })
    }
    if (i < lo) continue
    if (window && i === hi) {
      if (holding) {
        holding = false
        signals.push({ date: bar.date, side: 'sell', price: bar.close, signalDate: bar.date, ret: entry > 0 ? bar.close / entry - 1 : undefined, forced: true })
      }
      break
    }
    if (holding && dead && boughtToday) pendingSell = true
    else if (holding && dead) {
      holding = false
      signals.push({ date: bar.date, side: 'sell', price: bar.close, signalDate: bar.date, ret: entry > 0 ? bar.close / entry - 1 : undefined })
    } else if (!holding && gold && bull?.(bar.date) !== false) {
      pending = true
    }
  }
  return { signals, holding, pendingBuy: !window && pending ? { signalDate: bars.at(-1)!.date } : undefined }
}
