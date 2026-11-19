import type { MacroSnapshot } from '../macro/indicators'
import type { IndexSnapshot } from '../macro/valuation'
import type { AutomaticSnapshot } from '../market-cycle/automation'
import type { CycleSnapshot } from '../market-cycle/engine'
import type { Breadth, MarketSlice, Reading } from './model'

export const FILES = {
  macro: 'macro-us.json', cycle: 'market-cycle.json', auto: 'market-cycle-auto.json',
  indexes: 'index-history.json', public: 'us-market-data.json', slices: 'us-market-slices.json', breadth: 'us-market-breadth.json',
}
export const FEED_FIELDS = { macro: 'series', cycle: 'markets', auto: 'facts', indexes: 'indexes', public: 'series', slices: 'slices', breadth: 'breadth' } as const
export type Feed = keyof typeof FILES
export interface Snapshots {
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
    macro: macro && { ...macro, series: mergeRecords(old.macro?.series, next.macro?.series ?? {}, row => row?.latest?.date) as MacroSnapshot['series'] },
    cycle: fit(old.cycle, next.cycle),
    auto: fit(old.auto, next.auto),
    indexes: fit(old.indexes, next.indexes),
    public: next.public && { ...next.public, series: mergeRecords(old.public?.series, next.public.series, latest) } || old.public,
    slices: next.slices && { ...old.slices, ...next.slices, slices: Object.values(mergeRecords(oldSlices, newSlices, latest)) } || old.slices,
    breadth: next.breadth && { breadth: mergeRecords(old.breadth?.breadth, next.breadth.breadth, row => row?.date) } || old.breadth,
  }
}
