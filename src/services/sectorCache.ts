import { clsProxy } from './clsProxy'
import { shanghaiDate } from './limitUp'

export interface CachedSector { name: string; code: string; changePercent: number; rank: number; date: string }
export interface SectorView {
  day: string
  updatedAt?: string | null
  selectedDates: string[]
  sectorDataByDate: Record<string, CachedSector[]>
  plateRawDataByDate: Record<string, any[]>
  filterType: 'industry' | 'concept'
  topN: number
  sortBy: 'change' | 'rank'
}
const VIEW_KEY = 'sector-rotation:view:v1'
const RAW_KEY = 'sector-rotation:raw:v1'
const fallback = new Map<string, any>()
const pending = new Map<string, Promise<any>>()
const object = (v: any) => v && typeof v === 'object' && !Array.isArray(v)
const datePattern = /^\d{4}-\d{2}-\d{2}$/
function read(key: string): any { if (fallback.has(key)) return fallback.get(key); try { return JSON.parse(sessionStorage.getItem(key) || 'null') } catch { return null } }
function write(key: string, value: any) { try { sessionStorage.setItem(key, JSON.stringify(value)); fallback.delete(key) } catch { fallback.set(key, value) } }
function validRaw(body: any, date: string): boolean {
  return body?.code === 200 && Array.isArray(body?.data?.plate_stock) && body.data.plate_stock.every((p: any) => object(p) && Array.isArray(p.stock_list) && p.stock_list.every((s: any) => {
    const time = String(s?.time || '')
    return !datePattern.test(time.slice(0, 10)) || time.slice(0, 10) === date
  }))
}
export function readSectorView(day = shanghaiDate()): SectorView | null {
  const v = read(VIEW_KEY)
  if (!object(v) || v.day !== day || !Array.isArray(v.selectedDates) || !v.selectedDates.length || !v.selectedDates.every((d: any) => typeof d === 'string' && datePattern.test(d)) || !object(v.sectorDataByDate) || !object(v.plateRawDataByDate) || !['concept', 'industry'].includes(v.filterType) || !['rank', 'change'].includes(v.sortBy) || !Number.isInteger(v.topN) || v.topN < 1 || v.topN > 100) return null
  if (!Object.entries(v.sectorDataByDate).every(([date, items]) => datePattern.test(date) && Array.isArray(items) && items.every((s: any) => object(s) && typeof s.name === 'string' && typeof s.code === 'string' && s.date === date && Number.isFinite(s.changePercent) && Number.isFinite(s.rank)))) return null
  if (!Object.entries(v.plateRawDataByDate).every(([date, items]) => datePattern.test(date) && validRaw({ code: 200, data: { plate_stock: items } }, date))) return null
  if (!Object.keys(v.sectorDataByDate).length) return null
  return v
}
export function saveSectorView(view: SectorView) { write(VIEW_KEY, view) }
export function sectorStorageStatus(): string | null { try { return sessionStorage.getItem('sector-rotation:database-status') } catch { return null } }
export function peekSectorPayload(date: string): any {
  const raw = read(RAW_KEY)
  return object(raw) && validRaw(raw[date], date) ? raw[date] : null
}
export function sectorUpdatedAt(date: string): string | null {
  const dates = read('sector-rotation:updated-at')
  return object(dates) && typeof dates[date] === 'string' ? dates[date] : null
}
export async function loadSectorPayload(date: string, refresh = false, signal?: AbortSignal): Promise<any> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const raw = read(RAW_KEY)
  const cached = object(raw) ? raw[date] : null
  if (!refresh && validRaw(cached, date)) return cached
  // Only share requests without a page-owned abort signal, so leaving a page
  // cannot cancel another caller's request.
  if (!signal && pending.has(date)) return pending.get(date)!
  const request = (async () => {
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(abort, 15_000)
    try {
      const response = await fetch(clsProxy(`https://x-quote.cls.cn/v2/quote/a/plate/up_down_analysis?up_limit=0&date=${date.replace(/-/g, '')}`), { signal: controller.signal, headers: { Accept: 'application/json' } })
      if (!response.ok) throw new Error(`板块请求失败（HTTP ${response.status}）`)
      const body = await response.json()
      if (!validRaw(body, date)) throw new Error('板块数据无效或日期不匹配')
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const stored = read(RAW_KEY)
      const next = { ...(object(stored) ? stored : {}), [date]: body }
      Object.keys(next).sort().slice(0, Math.max(0, Object.keys(next).length - 40)).forEach(key => delete next[key])
      write(RAW_KEY, next)
      const timestamps = read('sector-rotation:updated-at')
      const fetchedAt = response.headers.get('X-Sector-Fetched-At')
      write('sector-rotation:updated-at', { ...(object(timestamps) ? timestamps : {}), [date]: fetchedAt && Number.isFinite(Date.parse(fetchedAt)) ? fetchedAt : new Date().toISOString() })
      try { sessionStorage.setItem('sector-rotation:database-status', response.headers.get('X-Sector-Cache') || 'unknown') } catch { /* optional status */ }
      return body
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
  })()
  if (!signal) pending.set(date, request)
  try { return await request } finally { if (!signal && pending.get(date) === request) pending.delete(date) }
}
