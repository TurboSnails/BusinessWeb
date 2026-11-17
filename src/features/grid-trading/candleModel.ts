import type { Candle } from './types'

export type ChartPoint = { time: string; value: number }
export const CHART_RANGES = [{ label: '近三个月', count: 60 }, { label: '近半年', count: 120 }, { label: '近一年', count: 250 }, { label: '全部', count: Infinity }] as const

/** Observation-only math: never writes to grid account or fills missing observations. */
export function candleIndicators(rows: Candle[]): { ma10: ChartPoint[]; ma20: ChartPoint[]; dif: ChartPoint[]; dea: ChartPoint[]; histogram: ChartPoint[] } {
  const ma = (n: number): ChartPoint[] => {
    let sum = 0
    return rows.flatMap((r, i) => {
      sum += r.close
      if (i >= n) sum -= rows[i - n].close
      return i < n - 1 ? [] : [{ time: r.date, value: sum / n }]
    })
  }
  let fast = rows[0]?.close ?? 0, slow = fast, dea = 0
  const difPoints: ChartPoint[] = [], deaPoints: ChartPoint[] = [], histogram: ChartPoint[] = []
  rows.forEach((r, i) => {
    if (i) { fast += 2 / 13 * (r.close - fast); slow += 2 / 27 * (r.close - slow) }
    const dif = fast - slow
    dea += 2 / 10 * (dif - dea)
    if (i >= 25) {
      difPoints.push({ time: r.date, value: dif }); deaPoints.push({ time: r.date, value: dea })
      histogram.push({ time: r.date, value: 2 * (dif - dea) })
    }
  })
  return { ma10: ma(10), ma20: ma(20), dif: difPoints, dea: deaPoints, histogram }
}

export function chartRows(input: Candle[]): Candle[] {
  const unique = new Map<string, Candle>()
  for (const r of input) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || ![r.close, r.high, r.low].every(v => Number.isFinite(v) && v > 0) || r.low > r.high || r.close < r.low || r.close > r.high) continue
    unique.set(r.date, r)
  }
  return [...unique.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export const hasOpen = (r: Candle): r is Candle & { open: number } => typeof r.open === 'number' && Number.isFinite(r.open) && r.open >= r.low && r.open <= r.high
export const hasVolume = (r: Candle): r is Candle & { volume: number } => typeof r.volume === 'number' && Number.isFinite(r.volume) && r.volume >= 0
