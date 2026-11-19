import type { MacroSnapshot, SeriesKey } from '../macro/indicators'

export type Point = [string, number]
export type MarketGroup = 'broad' | 'size' | 'style' | 'sector' | 'participants'
export interface Reading {
  name: string
  unit: string
  source: string
  scope: string
  frequency: string
  history: Point[]
  releasedAt?: string
  note?: string
  benchmark5y?: number
  benchmark10y?: number
  refreshError?: string
}
export interface MarketSlice {
  id: string
  name: string
  group: Exclude<MarketGroup, 'participants'>
  symbol: string
  scope: string
  source: string
  priceNote?: string
  history: Point[]
  volume?: Point[]
  valuation?: { date: string; value: number; source?: string; scope?: string; history?: Point[] }
  earnings?: { date: string; value: number; source?: string; scope?: string; history?: Point[] }
}
export interface Breadth {
  date: string
  above50?: number
  above200: number
  covered: number
  total: number
  source: string
  scope: string
  history?: Point[]
  /** Daily share recomputed from today's membership (survivorship bias noted in backfillScope). */
  backfill?: Point[]
  backfillScope?: string
  /** 52-week highs/lows (closing basis) and one-day advancers/decliners on `date`. */
  highsLows?: { date: string; covered: number; newHighs: number; newLows: number; advancers: number; decliners: number; netHighsPct: number }
  /** Daily net new highs (% of covered members), recomputed from today's membership. */
  netHighs?: Point[]
  comparison?: {
    date: string
    above50?: number
    above200: number
    currentAbove50?: number
    currentAbove200?: number
    covered: number
    total: number
    basis: 'dated-membership' | 'matched-current-membership'
    scope: string
  }
}

export const nyDate = (now = new Date()): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)

export function freshness(date: string, frequency: string, asOf: string): string {
  const age = (Date.parse(asOf) - Date.parse(date)) / 86_400_000
  if (!Number.isFinite(age) || age < 0) return '日期待核对'
  if (/季|quarter/i.test(frequency)) return age <= 220 ? '正常披露滞后' : '沿用上期'
  if (/月|month/i.test(frequency)) return age <= 80 ? '正常披露滞后' : '沿用上期'
  if (/周|week/i.test(frequency)) return age <= 14 ? '正常披露滞后' : '沿用上期'
  return age <= 5 ? '近期观测' : '沿用上期'
}

export function periodReturn(history: Point[], days: number): number | undefined {
  const first = history.at(-days - 1), last = history.at(-1)
  return first && last && first[1] > 0 ? (last[1] / first[1] - 1) * 100 : undefined
}

export function compareReturns(history: Point[], benchmark: Point[], days: number): number | undefined {
  if (!history.length || history.at(-1)?.[0] !== benchmark.at(-1)?.[0]) return undefined
  const dates = new Set(history.map(([date]) => date))
  const bench = benchmark.filter(([date]) => dates.has(date))
  const common = new Set(bench.map(([date]) => date))
  const a = periodReturn(history.filter(([date]) => common.has(date)), days), b = periodReturn(bench, days)
  return a === undefined || b === undefined ? undefined : a - b
}

export function relativeVolume(history: Point[], sessions?: Point[], shortSessions: string[] = []): number | undefined {
  const shortened = new Set(shortSessions)
  if (sessions?.length && shortened.has(sessions.at(-1)![0])) return undefined
  const regular = history.filter(([date]) => !shortened.has(date))
  if (sessions) {
    const expected = sessions.filter(([date]) => !shortened.has(date)).slice(-21)
    if (expected.length !== 21 || regular.slice(-21).some(([date], i) => date !== expected[i][0])) return undefined
  }
  const latest = regular.at(-1)?.[1]
  const baseline = regular.slice(-21, -1)
  if (baseline.length !== 20 || latest === undefined || latest <= 0 || baseline.some(([, value]) => value <= 0)) return undefined
  return latest / (baseline.reduce((sum, [, value]) => sum + value, 0) / 20)
}

type Direction = 'improving' | 'steady' | 'worsening'
export type BreadthDirection = 'improving' | 'steady' | 'weakening'

export function recentDirection(history: Point[], asOf: string): Direction | undefined {
  const last = history.at(-1)
  if (!last || freshness(last[0], '每日', asOf) !== '近期观测') return undefined
  const prior = history.slice(0, -1).reverse().find(([date]) => {
    const age = (Date.parse(last[0]) - Date.parse(date)) / 86_400_000
    return age >= 4 && age <= 10
  })
  if (!prior) return undefined
  return last[1] > prior[1] ? 'worsening' : last[1] < prior[1] ? 'improving' : 'steady'
}

export function qualifiedBreadth(row: Breadth | undefined): row is Breadth {
  return !!row && row.total > 0 && row.covered <= row.total && row.covered / row.total >= 0.95 && row.above200 >= 0 && row.above200 <= 100
}

export function breadthChange(row: Breadth | undefined, asOf: string): { direction: BreadthDirection; date: string; delta: number; scope: string } | undefined {
  if (!qualifiedBreadth(row) || freshness(row.date, '每日', asOf) !== '近期观测') return undefined
  const lookback = (date: string) => (Date.parse(row.date) - Date.parse(date)) / 86_400_000
  const nearWeek = (date: string) => lookback(date) >= 4 && lookback(date) <= 10
  const compare = (date: string, prior: number, current: number, scope: string) => {
    if (![prior, current].every(v => v >= 0 && v <= 100)) return undefined
    const delta = Math.round((current - prior) * 100) / 100
    const direction: BreadthDirection = delta > 0 ? 'improving' : delta < 0 ? 'weakening' : 'steady'
    return { direction, date, delta, scope }
  }
  const published = row.history?.slice().reverse().find(([date]) => nearWeek(date))
  if (published) return compare(published[0], published[1], row.above200, '各期已发布宽度')
  const prior = row.comparison
  if (!prior || !nearWeek(prior.date) || prior.total < 1 || prior.covered > prior.total || prior.covered / prior.total < 0.95) return undefined
  const current = prior.basis === 'matched-current-membership' ? prior.currentAbove200 : row.above200
  return current === undefined ? undefined : compare(prior.date, prior.above200, current, prior.scope)
}

export function decideMarket({ breadth, volumeConfirmed, credit }: { breadth?: BreadthDirection; volumeConfirmed?: boolean; credit?: Direction }) {
  if (!breadth || !credit) return { label: '证据不足', detail: '等待同口径宽度、成交与信用利差。' }
  if (breadth === 'weakening' && credit === 'worsening') return { label: '防守压力上升', detail: '成分股参与度回落，高收益债利差走阔。' }
  if ((breadth === 'improving' && credit === 'worsening') || (breadth === 'weakening' && credit === 'improving')) {
    return { label: '信号分歧', detail: '市场宽度和信用风险的变化指向不同。' }
  }
  if (volumeConfirmed === undefined) return { label: '证据不足', detail: '等待可比的上涨日成交。' }
  if (breadth === 'improving' && volumeConfirmed && credit !== 'worsening') return { label: '修复证据增强', detail: '更多成分股参与，上涨日放量，信用利差企稳。' }
  return { label: '修复待确认', detail: '继续观察上涨参与度、成交和信用利差。' }
}

export function macroReading(snap: MacroSnapshot | undefined, key: SeriesKey, name: string, frequency: string, scope = '美国市场'): Reading | undefined {
  const item = snap?.series[key]
  if (!item?.latest) return undefined
  const source = item.fred ? `https://fred.stlouisfed.org/series/${item.fred}` : item.source ?? ''
  const points = new Map([...item.long ?? [], ...item.history, [item.latest.date, item.latest.value] as Point])
  return { name, unit: item.unit, source, scope, frequency, history: [...points].sort(([a], [b]) => a.localeCompare(b)), note: item.note }
}
