import type { Bar, NewsItem, Timeframe } from '../types'
import { TIMEFRAMES } from '../types'

export const TF_LABEL: Record<Timeframe, string> = {
  '1m': '1分钟',
  '5m': '5分钟',
  '15m': '15分钟',
  '30m': '30分钟',
  '1h': '1小时',
  '4h': '4小时',
  '1d': '日线',
  '1w': '周线',
  '1mo': '月线',
}

export const INTRADAY: ReadonlySet<Timeframe> = new Set(['1m', '5m', '15m', '30m', '1h', '4h'])

export function isTimeframe(v: string | null | undefined): v is Timeframe {
  return !!v && (TIMEFRAMES as readonly string[]).includes(v)
}

export interface ExchangeParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

/** 按交易所时区拆出年月日时分（不走浏览器本地时区） */
export function exchangeParts(tSec: number, timezone: string): ExchangeParts {
  const d = new Date(tSec * 1000)
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d)
    const get = (type: string): string => parts.find(p => p.type === type)?.value ?? '0'
    let hour = Number(get('hour'))
    // 部分环境午夜会给出 24
    if (hour === 24) hour = 0
    return {
      year: Number(get('year')),
      month: Number(get('month')),
      day: Number(get('day')),
      hour,
      minute: Number(get('minute')),
    }
  } catch {
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
    }
  }
}

/** 交易所日历日 YYYY-MM-DD（日/周/月线横轴用，避免浏览器本地时区偏移一天） */
export function exchangeCalendarDate(tSec: number, timezone: string): string {
  const p = exchangeParts(tSec, timezone)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/**
 * 喂给 lightweight-charts 的 time：
 * - 分钟/小时：UTCTimestamp（横轴用 tickMarkFormatter 按交易所时区显示）
 * - 日/周/月：BusinessDay 字符串（按交易所日历，不随浏览器时区偏移）
 */
export function toChartTime(tSec: number, timezone: string, tf: Timeframe): string | number {
  if (INTRADAY.has(tf)) return tSec
  return exchangeCalendarDate(tSec, timezone)
}

/** 交易所时区格式化；分钟线带时分 */
export function formatBarTime(tSec: number, timezone: string, tf: Timeframe): string {
  const p = exchangeParts(tSec, timezone)
  const date = `${p.year}/${String(p.month).padStart(2, '0')}/${String(p.day).padStart(2, '0')}`
  if (!INTRADAY.has(tf)) return date
  return `${date} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

export function formatShortDate(tSec: number, timezone: string): string {
  const p = exchangeParts(tSec, timezone)
  return `${p.year}/${String(p.month).padStart(2, '0')}/${String(p.day).padStart(2, '0')}`
}

/** 横轴刻度：日线显示月/日；分钟线显示时:分（交易所时区） */
export function formatTickMark(
  tSecOrBiz: number | string,
  timezone: string,
  tf: Timeframe,
): string {
  if (typeof tSecOrBiz === 'string') {
    // BusinessDay YYYY-MM-DD
    const [, m, d] = tSecOrBiz.split('-').map(Number)
    if (INTRADAY.has(tf)) return tSecOrBiz
    return `${m}月${d}日`
  }
  const p = exchangeParts(tSecOrBiz, timezone)
  if (INTRADAY.has(tf)) {
    return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
  }
  return `${p.month}月${p.day}日`
}

/** 新闻时间落到哪根 K：找最后一个 bar.t <= newsSec */
export function barIndexForNews(bars: readonly Bar[], newsIso: string): number {
  const sec = Math.floor(new Date(newsIso).getTime() / 1000)
  if (!Number.isFinite(sec) || !bars.length) return -1
  if (sec < bars[0].t) return -1
  let lo = 0, hi = bars.length - 1, ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (bars[mid].t <= sec) { ans = mid; lo = mid + 1 }
    else hi = mid - 1
  }
  return ans
}

export interface NewsMark {
  barIndex: number
  t: number
  ids: string[]
  titles: string[]
}

/** 同一根 K 上的多条新闻合并 */
export function groupNewsMarks(bars: readonly Bar[], news: readonly NewsItem[]): NewsMark[] {
  const map = new Map<number, NewsMark>()
  for (const n of news) {
    const idx = barIndexForNews(bars, n.time)
    if (idx < 0) continue
    const cur = map.get(idx)
    if (cur) {
      cur.ids.push(n.id)
      cur.titles.push(n.title)
    } else {
      map.set(idx, { barIndex: idx, t: bars[idx].t, ids: [n.id], titles: [n.title] })
    }
  }
  return [...map.values()].sort((a, b) => a.barIndex - b.barIndex)
}

export function fmtVolume(v: number): string {
  if (!Number.isFinite(v)) return '—'
  if (Math.abs(v) >= 1e8) return `${(v / 1e8).toFixed(2)}亿`
  if (Math.abs(v) >= 1e4) return `${(v / 1e4).toFixed(2)}万`
  return v.toLocaleString('zh-CN', { maximumFractionDigits: 0 })
}

export function fmtPrice(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const digits = Math.abs(n) >= 1000 ? 2 : Math.abs(n) >= 1 ? 2 : 4
  return n.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
