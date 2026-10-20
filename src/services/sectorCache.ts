import { clsProxy } from './clsProxy'
import { shanghaiDate } from './limitUp'

export interface CachedSector { name: string; code: string; changePercent: number; rank: number; date: string }
/** 财联社 up_down_analysis 返回的单个板块；字段随接口版本变化，只在使用处按需读取 */
export type ClsPlate = Record<string, unknown>
/** 通过 validRaw 校验的接口返回：每个板块都带 stock_list 数组 */
export interface ClsPlatePayload { code: 200; data: { plate_stock: ClsPlate[] } }
export interface SectorView {
  day: string
  updatedAt?: string | null
  selectedDates: string[]
  sectorDataByDate: Record<string, CachedSector[]>
  plateRawDataByDate: Record<string, ClsPlate[]>
  filterType: 'industry' | 'concept'
  topN: number
  sortBy: 'change' | 'rank'
}
const VIEW_KEY = 'sector-rotation:view:v1'
const RAW_KEY = 'sector-rotation:raw:v1'
const fallback = new Map<string, unknown>()
const pending = new Map<string, Promise<ClsPlatePayload>>()
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
// 只读属性时用：与原先的可选链访问等价（数组也允许）
const props = (v: unknown): Record<string, unknown> | undefined => (v !== null && typeof v === 'object' ? v as Record<string, unknown> : undefined)
const datePattern = /^\d{4}-\d{2}-\d{2}$/
function read(key: string): unknown { if (fallback.has(key)) return fallback.get(key); try { return JSON.parse(sessionStorage.getItem(key) || 'null') } catch { return null } }
function write(key: string, value: unknown) { try { sessionStorage.setItem(key, JSON.stringify(value)); fallback.delete(key) } catch { fallback.set(key, value) } }
function validRaw(body: unknown, date: string): body is ClsPlatePayload {
  const plates = props(props(body)?.data)?.plate_stock
  return props(body)?.code === 200 && Array.isArray(plates) && plates.every(p => object(p) && Array.isArray(p.stock_list) && p.stock_list.every(s => {
    const time = String(props(s)?.time || '')
    return !datePattern.test(time.slice(0, 10)) || time.slice(0, 10) === date
  }))
}
export function readSectorView(day = shanghaiDate()): SectorView | null {
  const v = read(VIEW_KEY)
  if (!object(v) || v.day !== day || !Array.isArray(v.selectedDates) || !v.selectedDates.length || !v.selectedDates.every(d => typeof d === 'string' && datePattern.test(d)) || !object(v.sectorDataByDate) || !object(v.plateRawDataByDate) || !['concept', 'industry'].includes(v.filterType as string) || !['rank', 'change'].includes(v.sortBy as string) || !Number.isInteger(v.topN) || (v.topN as number) < 1 || (v.topN as number) > 100) return null
  if (!Object.entries(v.sectorDataByDate).every(([date, items]) => datePattern.test(date) && Array.isArray(items) && items.every(s => object(s) && typeof s.name === 'string' && typeof s.code === 'string' && s.date === date && Number.isFinite(s.changePercent) && Number.isFinite(s.rank)))) return null
  if (!Object.entries(v.plateRawDataByDate).every(([date, items]) => datePattern.test(date) && validRaw({ code: 200, data: { plate_stock: items } }, date))) return null
  if (!Object.keys(v.sectorDataByDate).length) return null
  return v as unknown as SectorView
}
export function saveSectorView(view: SectorView) { write(VIEW_KEY, view) }
export function sectorStorageStatus(): string | null { try { return sessionStorage.getItem('sector-rotation:database-status') } catch { return null } }
export function peekSectorPayload(date: string): ClsPlatePayload | null {
  const raw = read(RAW_KEY)
  return object(raw) && validRaw(raw[date], date) ? raw[date] as ClsPlatePayload : null
}
export function sectorUpdatedAt(date: string): string | null {
  const dates = read('sector-rotation:updated-at')
  return object(dates) && typeof dates[date] === 'string' ? dates[date] : null
}
export async function loadSectorPayload(date: string, refresh = false, signal?: AbortSignal): Promise<ClsPlatePayload> {
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
      const body: unknown = await response.json()
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
