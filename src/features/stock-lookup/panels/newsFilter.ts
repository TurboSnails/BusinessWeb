import type { NewsItem, NewsSentiment, NewsTopic } from '../types'

export type NewsRange = '7d' | '30d' | 'all'

export interface NewsFilterState {
  range: NewsRange
  topics: NewsTopic[]
  sentiments: NewsSentiment[]
  publishers: string[]
  showSummary: boolean
}

export const DEFAULT_NEWS_FILTER: NewsFilterState = {
  range: '30d',
  topics: [],
  sentiments: [],
  publishers: [],
  showSummary: false,
}

export function newsInRange(items: NewsItem[], range: NewsRange, now = Date.now()): NewsItem[] {
  if (range === 'all') return items
  const days = range === '7d' ? 7 : 30
  const cutoff = now - days * 24 * 60 * 60 * 1000
  return items.filter(n => {
    const t = Date.parse(n.time)
    return Number.isFinite(t) && t >= cutoff
  })
}

export function countByTopic(items: NewsItem[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const n of items) out[n.topic] = (out[n.topic] ?? 0) + 1
  return out
}

export function countBySentiment(items: NewsItem[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const n of items) out[n.sentiment] = (out[n.sentiment] ?? 0) + 1
  return out
}

export function countByPublisher(items: NewsItem[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const n of items) out[n.publisher] = (out[n.publisher] ?? 0) + 1
  return out
}

/** 多选：空数组 = 全部；有值则命中任一即可 */
export function filterNews(items: NewsItem[], state: NewsFilterState, now = Date.now()): NewsItem[] {
  let list = newsInRange(items, state.range, now)
  if (state.topics.length) list = list.filter(n => state.topics.includes(n.topic))
  if (state.sentiments.length) list = list.filter(n => state.sentiments.includes(n.sentiment))
  if (state.publishers.length) list = list.filter(n => state.publishers.includes(n.publisher))
  return list
}

export function toggleMulti<T extends string>(selected: T[], value: T): T[] {
  return selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value]
}

export interface NewsDayGroup {
  dayKey: string
  label: string
  items: NewsItem[]
}

/** 按交易所时区的日历日分组，组内新→旧 */
export function groupNewsByDay(items: NewsItem[], timezone: string): NewsDayGroup[] {
  const map = new Map<string, NewsItem[]>()
  for (const n of items) {
    const dayKey = formatDayKey(n.time, timezone)
    const arr = map.get(dayKey) ?? []
    arr.push(n)
    map.set(dayKey, arr)
  }
  const keys = [...map.keys()].sort((a, b) => b.localeCompare(a))
  return keys.map(dayKey => {
    const dayItems = (map.get(dayKey) ?? []).slice().sort((a, b) => Date.parse(b.time) - Date.parse(a.time))
    return { dayKey, label: dayKey, items: dayItems }
  })
}

function formatDayKey(iso: string, timezone: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return '未知日期'
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d)
  } catch {
    return d.toISOString().slice(0, 10)
  }
}
