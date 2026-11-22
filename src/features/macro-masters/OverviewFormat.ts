import type { Master, Reading, ReadingKey } from './types'
import { MASTERS } from './masters'
import { sourceHref, sourceLabel } from './chips'
import { copperGoldUnitNote, displayDate, formattedReading, formattedReadingParts, number } from './format'

/** 姓氏简称：去掉名字前缀与「爵士」 */
export function shortName(name: string): string {
  const parts = name.split('·')
  const rest = parts.length > 1 ? parts.slice(1).join('·') : name
  return rest.replace(/爵士$/, '')
}

export function formatReadingValue(reading: Reading, value = reading.value): string {
  return formattedReading(reading, value)
}

export function formatReadingParts(reading: Reading, value = reading.value) {
  return formattedReadingParts(reading, value)
}

/** 仅格式化裸数字（历史分位等无单位场景） */
export function formatBareNumber(value: number): string {
  return number(value)
}

export function formatReadingDate(date: string, frequency?: Reading['frequency']): string {
  return displayDate(date, frequency)
}

export function formatDirection(reading: Pick<Reading, 'direction' | 'frequency'>): string | undefined {
  if (!reading.direction) return undefined
  const word = reading.direction === 'up' ? '上升' : reading.direction === 'down' ? '下降' : '持平'
  if (reading.frequency === 'quarterly') return `较上季${word}`
  return word
}

/** 近一月方向：箭头 + 文案 */
export function formatDirectionArrow(reading: Pick<Reading, 'direction' | 'frequency'>): string | undefined {
  if (!reading.direction) return undefined
  const arrow = reading.direction === 'up' ? '↑' : reading.direction === 'down' ? '↓' : '→'
  const word = reading.direction === 'up' ? '上升' : reading.direction === 'down' ? '下降' : '持平'
  if (reading.frequency === 'quarterly') return `${arrow} 较上季${word}`
  return `${arrow} ${word}`
}

export function formatHistoryPosition(reading: Pick<Reading, 'longPercentile' | 'longPercentileSince' | 'percentile' | 'percentileYears'>): string[] {
  const parts: string[] = []
  if (reading.longPercentile !== undefined) {
    const since = reading.longPercentileSince ?? '—'
    parts.push(`${since} 年以来第 ${formatBareNumber(reading.longPercentile)} 百分位`)
  }
  if (reading.percentile !== undefined) {
    const years = reading.percentileYears ?? 10
    parts.push(`近 ${formatBareNumber(years)} 年第 ${formatBareNumber(reading.percentile)} 百分位`)
  }
  return parts
}

/** 历史位置刻度条：优先长历史分位 */
export type HistoryBarModel = {
  percentile: number
  label: string
  window: string
  secondary?: string
  ariaLabel: string
}

export function historyBarModel(
  reading: Pick<Reading, 'longPercentile' | 'longPercentileSince' | 'percentile' | 'percentileYears'>,
): HistoryBarModel | null {
  if (reading.longPercentile !== undefined) {
    const since = reading.longPercentileSince ?? '—'
    const label = `第 ${formatBareNumber(reading.longPercentile)} 百分位`
    const window = `${since} 年以来`
    const secondary = reading.percentile !== undefined
      ? `近 ${formatBareNumber(reading.percentileYears ?? 10)} 年第 ${formatBareNumber(reading.percentile)}`
      : undefined
    return {
      percentile: reading.longPercentile,
      label,
      window,
      secondary,
      ariaLabel: `${window}${label}`,
    }
  }
  if (reading.percentile !== undefined) {
    const years = reading.percentileYears ?? 10
    const label = `第 ${formatBareNumber(reading.percentile)} 百分位`
    const window = `近 ${formatBareNumber(years)} 年`
    return {
      percentile: reading.percentile,
      label,
      window,
      ariaLabel: `${window}${label}`,
    }
  }
  return null
}

export function formatLastMove(reading: Reading): string | undefined {
  const move = reading.lastMove
  if (!move) return undefined
  const from = formattedReading(reading, move.from)
  const to = formattedReading(reading, move.to)
  const verb = move.to > move.from ? '上调' : move.to < move.from ? '下调' : '调整'
  return `最近一次调整：${move.date}，由 ${from} ${verb}到 ${to}`
}

export type WatcherEntry = { name: string; proxy: boolean; slug: Master['slug'] }

/** 哪些大师在看这个读数：同口径优先，近似在后 */
export function watchersFor(key: ReadingKey): WatcherEntry[] {
  const direct: WatcherEntry[] = []
  const proxy: WatcherEntry[] = []
  for (const master of MASTERS) {
    const short = shortName(master.name)
    let hasDirect = false
    let hasProxy = false
    for (const ind of master.indicators) {
      if (ind.readings?.includes(key)) hasDirect = true
      if (ind.proxyReadings?.includes(key)) hasProxy = true
    }
    if (hasDirect) direct.push({ name: short, proxy: false, slug: master.slug })
    else if (hasProxy) proxy.push({ name: short, proxy: true, slug: master.slug })
  }
  return [...direct, ...proxy]
}

export function formatWatchersGrouped(key: ReadingKey): string {
  const watchers = watchersFor(key)
  if (!watchers.length) return '—'
  const direct = watchers.filter(w => !w.proxy).map(w => w.name)
  const proxy = watchers.filter(w => w.proxy).map(w => w.name)
  const parts: string[] = []
  if (direct.length) parts.push(`同口径：${direct.join('、')}`)
  if (proxy.length) parts.push(`近似：${proxy.join('、')}`)
  return parts.join('　')
}

export function formatWatchersCount(key: ReadingKey): string {
  const watchers = watchersFor(key)
  if (!watchers.length) return '—'
  const direct = watchers.filter(w => !w.proxy).length
  const proxy = watchers.filter(w => w.proxy).length
  const parts: string[] = []
  if (direct) parts.push(`同口径 ${direct}`)
  if (proxy) parts.push(`近似 ${proxy}`)
  return parts.join(' · ')
}

/** 某位大师的指标里是否用到该读数 */
export function masterUsesReading(slug: Master['slug'], key: ReadingKey): 'exact' | 'proxy' | null {
  const master = MASTERS.find(m => m.slug === slug)
  if (!master) return null
  let proxy = false
  for (const ind of master.indicators) {
    if (ind.readings?.includes(key)) return 'exact'
    if (ind.proxyReadings?.includes(key)) proxy = true
  }
  return proxy ? 'proxy' : null
}

export function sourceDisplay(source: string): { label: string; href?: string } {
  return { label: sourceLabel(source), href: sourceHref(source) }
}

export function extraUnitNote(reading: Reading): string | undefined {
  if (reading.key === 'copperGold') return copperGoldUnitNote(reading.unit)
  return undefined
}
