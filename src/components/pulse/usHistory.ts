// 全球行情页「美股指数 K 线与成交」的数据层。
// 指数日线：/api/grid-market?kind=candles（服务端整理 Yahoo chart，日期已是纽约交易日）；周 / 月线在前端聚合。
// 全美成交量：每日工作流写入的 Cboe 全美股票成交量静态文件（单位亿股）。
import { candlesUrl, parseCandlesPayload } from '../../features/company-chart/candles'
import { periodKey } from './chinaHistory'
import type { HistoryCandle } from './chinaHistory'

export type UsIndexSymbol = 'us^GSPC' | 'us^IXIC' | 'us^DJI'
export type UsPeriod = 'day' | 'week' | 'month'
export type UsVolumeMetric = 'index' | 'market'
export type VolumePoint = { date: string; volume: number }

export const usIndexes: { id: UsIndexSymbol; label: string; code: string }[] = [
  { id: 'us^GSPC', label: '标普 500', code: '^GSPC' },
  { id: 'us^IXIC', label: '纳斯达克综合', code: '^IXIC' },
  { id: 'us^DJI', label: '道琼斯工业', code: '^DJI' },
]
export const usPeriods: { id: UsPeriod; label: string }[] = [{ id: 'day', label: '日' }, { id: 'week', label: '周' }, { id: 'month', label: '月' }]

export const NY_TIME_ZONE = 'America/New_York'
export const nyToday = (now = new Date()) => now.toLocaleDateString('sv-SE', { timeZone: NY_TIME_ZONE })
export const nyClock = (now = new Date()) => now.toLocaleTimeString('en-GB', { timeZone: NY_TIME_ZONE, hour12: false })

/** 当前周期是否仍在交易中：日线以纽约 16:00 收盘（留 15 分钟数据延迟）为界，周 / 月线在当期内都算进行中。 */
export function isOngoing(date: string, period: UsPeriod, now = new Date()): boolean {
  const today = nyToday(now)
  if (periodKey(date, period) !== periodKey(today, period)) return false
  return period !== 'day' || nyClock(now) < '16:15:00'
}

/** 股数 → 亿股 */
export const toYi = (shares: number) => shares / 1e8

/** 按周 / 月累加成交量；日线原样返回。 */
export function aggregateVolume(rows: VolumePoint[], period: UsPeriod): VolumePoint[] {
  if (period === 'day') return rows.slice()
  const grouped = new Map<string, VolumePoint>()
  for (const row of rows) {
    const key = periodKey(row.date, period), previous = grouped.get(key)
    grouped.set(key, { date: row.date, volume: (previous?.volume ?? 0) + row.volume })
  }
  return [...grouped.values()]
}

/**
 * Cboe 静态文件里只有最近约 13 个月是逐日记录，更早的每周只保留一天（周末抽样，不是周合计）。
 * 只取末尾连续的逐日段：相邻两天间隔不超过 4 个自然日（周末加一天假期）。
 */
export function dailySegment(history: VolumePoint[]): VolumePoint[] {
  let start = history.length - 1
  while (start > 0 && (Date.parse(history[start].date) - Date.parse(history[start - 1].date)) / 86_400_000 <= 4) start--
  return history.slice(start)
}

/** 解析 Cboe 全美成交量；文件缺失、被 SPA 回退成网页或结构不对时返回 null（页面据此隐藏选项）。 */
export function parseCboeVolume(json: unknown): VolumePoint[] | null {
  const history = (json as { series?: { volume?: { unit?: unknown; history?: unknown } } } | null)?.series?.volume
  if (!history || history.unit !== '亿股' || !Array.isArray(history.history)) return null
  const rows: VolumePoint[] = []
  for (const point of history.history) {
    if (!Array.isArray(point)) return null
    const [date, value] = point
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
    rows.push({ date, volume: value })
  }
  rows.sort((a, b) => a.date.localeCompare(b.date))
  const segment = dailySegment(rows)
  return segment.length >= 20 ? segment : null
}

/**
 * 全美成交量按周期聚合。逐日段的第一天是抽样边界，所在的周 / 月前面缺了几天，
 * 聚合后丢掉这一期，免得把不完整的一期画成「成交骤降」。
 */
export function aggregateMarketVolume(daily: VolumePoint[], period: UsPeriod): VolumePoint[] {
  const rows = aggregateVolume(daily, period)
  return period === 'day' || !daily.length ? rows : rows.filter(r => periodKey(r.date, period) !== periodKey(daily[0].date, period))
}

export type UsIndexResult = { rows: HistoryCandle[]; fetchedAt: string }
const indexCache = new Map<string, { at: number; result: UsIndexResult }>()

export async function fetchUsIndex(symbol: UsIndexSymbol, signal: AbortSignal, force = false): Promise<UsIndexResult> {
  const hit = indexCache.get(symbol)
  if (!force && hit && Date.now() - hit.at < 300_000) return hit.result
  const response = await fetch(candlesUrl(symbol), { signal })
  if (!response.ok) throw new Error('美股指数行情暂时无法获取，请重试')
  const { rows } = parseCandlesPayload(await response.json(), symbol)
  if (!rows.length) throw new Error('行情源未返回美股指数数据，请稍后重试')
  const result = { rows, fetchedAt: new Date().toISOString() }
  indexCache.set(symbol, { at: Date.now(), result })
  return result
}

const BASE = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')
let marketVolume: Promise<VolumePoint[] | null> | null = null

/** Cboe 静态文件只取一次；任何失败都当作「没有全美成交量」，不影响指数图。 */
export function loadMarketVolume(): Promise<VolumePoint[] | null> {
  marketVolume ??= fetch(`${BASE}data/us-market-data.json`)
    .then(r => r.ok ? r.json() : null)
    .then(parseCboeVolume)
    .catch(() => null)
  return marketVolume
}

/** 仅供测试重置模块缓存 */
export function resetUsHistoryCache() { indexCache.clear(); marketVolume = null }
