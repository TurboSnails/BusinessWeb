// 公司页走势图的日线数据：统一走 /api/grid-market?kind=candles（server/market.mjs）。
// 沪深/港股为腾讯 fqkline 原样转发，美股为服务端把 Yahoo chart 整理成同形结构（data[symbol].day）。
import { parseHistory, type HistoryCandle } from '../../components/pulse/chinaHistory'

export type Adjustment = 'qfq' | 'none' | 'split'
export interface CandlesResult {
  rows: HistoryCandle[]
  fetchedAt: string
  source: 'tencent' | 'yahoo'
  adjustment: Adjustment
  /** 被丢弃的无效行数（缺值、高低价矛盾等） */
  dropped: number
}

const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')
const isoDay = (d: Date): string => d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })

/** 近三年日线；周线由前端按自然周聚合 */
export function candlesUrl(symbol: string, today = new Date()): string {
  const begin = new Date(today)
  begin.setFullYear(begin.getFullYear() - 3)
  return `${API_BASE}/api/grid-market?${new URLSearchParams({ kind: 'candles', symbol, begin: isoDay(begin), end: isoDay(today) })}`
}

/** 逐行校验（复用 chinaHistory.parseHistory 的规则），坏行丢弃而不是整张图失败 */
export function parseCandleRows(raw: unknown): { rows: HistoryCandle[]; dropped: number } {
  if (!Array.isArray(raw) || raw.length === 0) return { rows: [], dropped: 0 }
  const good: unknown[] = []
  for (const row of raw) {
    try { parseHistory([row]); good.push(row) } catch { /* 丢弃 */ }
  }
  return { rows: good.length ? parseHistory(good) : [], dropped: raw.length - good.length }
}

export function parseCandlesPayload(json: unknown, symbol: string): Omit<CandlesResult, 'fetchedAt'> {
  const body = (json ?? {}) as { source?: string; data?: Record<string, { qfqday?: unknown; day?: unknown } | undefined> }
  const node = body.data?.[symbol]
  const yahoo = body.source === 'yahoo'
  const hasQfq = Array.isArray(node?.qfqday) && (node?.qfqday as unknown[]).length > 0
  const { rows, dropped } = parseCandleRows(hasQfq ? node?.qfqday : node?.day)
  return { rows, dropped, source: yahoo ? 'yahoo' : 'tencent', adjustment: yahoo ? 'split' : hasQfq ? 'qfq' : 'none' }
}

export async function fetchCandles(symbol: string, signal: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<CandlesResult> {
  const response = await fetchImpl(candlesUrl(symbol), { signal })
  if (!response.ok) throw new Error(response.status === 400 ? '代码不受行情接口支持' : '行情服务暂时不可用')
  const json: unknown = await response.json()
  return { ...parseCandlesPayload(json, symbol), fetchedAt: new Date().toISOString() }
}
