import type { MacroSnapshot } from '../macro/indicators'
import type { IndexSnapshot } from '../macro/valuation'
import type { AutomaticSnapshot } from '../market-cycle/automation'
import type { CycleSnapshot } from '../market-cycle/engine'
import type { Breadth, MarketSlice, Reading } from './model'

export const FILES = {
  rates: 'us-equity-bond-spread.json', macro: 'macro-us.json', cycle: 'market-cycle.json', auto: 'market-cycle-auto.json',
  indexes: 'index-history.json', public: 'us-market-data.json', slices: 'us-market-slices.json', breadth: 'us-market-breadth.json',
}
export const FEED_FIELDS = { rates: 'latestReal', macro: 'series', cycle: 'markets', auto: 'facts', indexes: 'indexes', public: 'series', slices: 'slices', breadth: 'breadth' } as const
export type Feed = keyof typeof FILES
type YieldPoint = { date: string; value: number }
export interface Snapshots {
  rates?: { generatedAt: string; latestReal?: YieldPoint; latestYield?: YieldPoint }
  macro?: MacroSnapshot
  cycle?: CycleSnapshot
  auto?: AutomaticSnapshot
  indexes?: IndexSnapshot
  public?: { series: Record<string, Reading>; warnings?: string[] }
  slices?: { slices: MarketSlice[]; shortSessions?: string[] }
  breadth?: { breadth: Record<string, Breadth> }
}

function mergeRecords<T>(previous: Record<string, T> | undefined, incoming: Record<string, T>, date: (item: T) => string | undefined): Record<string, T> {
  const merged = { ...previous }
  for (const [key, item] of Object.entries(incoming)) {
    const newer = date(item)
    const older = merged[key] ? date(merged[key]) : undefined
    if (newer && (!older || newer >= older)) merged[key] = item
  }
  return merged
}

const latest = (row: { history: [string, number][] }) => row?.history?.at(-1)?.[0]
const fit = <T extends { generatedAt: string }>(old: T | undefined, next: T | undefined) =>
  next && (!old || next.generatedAt >= old.generatedAt) ? next : old

export function mergeSnapshots(old: Snapshots, next: Snapshots): Snapshots {
  const macro = fit(old.macro, next.macro)
  const oldSlices = Object.fromEntries((old.slices?.slices ?? []).map(slice => [slice.id, slice]))
  const newSlices = Object.fromEntries((next.slices?.slices ?? []).map(slice => [slice.id, slice]))
  return {
    rates: fit(old.rates, next.rates),
    macro: macro && { ...macro, series: mergeRecords(old.macro?.series, next.macro?.series ?? {}, row => row?.latest?.date) as MacroSnapshot['series'] },
    cycle: fit(old.cycle, next.cycle),
    auto: fit(old.auto, next.auto),
    indexes: fit(old.indexes, next.indexes),
    public: next.public && { ...next.public, series: mergeRecords(old.public?.series, next.public.series, latest) } || old.public,
    slices: next.slices && { ...old.slices, ...next.slices, slices: Object.values(mergeRecords(oldSlices, newSlices, latest)) } || old.slices,
    breadth: next.breadth && { breadth: mergeRecords(old.breadth?.breadth, next.breadth.breadth, row => row?.date) } || old.breadth,
  }
}

/** The spread snapshot preserves the observation dates for these two latest yields. */
export function rateComponents(rates: Snapshots['rates']): Record<string, Reading> {
  const real = rates?.latestReal
  const nominal = rates?.latestYield
  if (!real || !real.date || !Number.isFinite(real.value)) return {}
  const common = { unit: '%', frequency: '日频', source: 'https://fred.stlouisfed.org/series/DFII10' }
  const readings: Record<string, Reading> = {
    tips10: { ...common, name: '10 年期实际收益率', scope: '美国 10 年期通胀保值国债固定期限收益率。', history: [[real.date, real.value]] },
  }
  if (nominal?.date === real.date && Number.isFinite(nominal.value)) {
    readings.breakeven10 = { ...common, name: '10 年期通胀补偿', source: 'https://fred.stlouisfed.org/series/T10YIE',
      scope: '同日 10 年期名义美债收益率减去 TIPS 实际收益率，反映市场定价的通胀补偿，含风险和流动性溢价。',
      history: [[real.date, Math.round((nominal.value - real.value) * 1000) / 1000]] }
  }
  return readings
}
