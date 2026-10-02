import type { LimitUpResult } from './limitUp'

const DATA_KEY = 'limit-up:data:v1'
const VIEW_KEY = 'limit-up:view:v1'
const TTL = 5 * 60 * 1000
const keyOf = (date: string, only: boolean): string => `${date}:${only ? 1 : 0}`
function read(): Record<string, LimitUpResult> {
  try { const data = JSON.parse(sessionStorage.getItem(DATA_KEY) || '{}'); return data && typeof data === 'object' && !Array.isArray(data) ? data : {} } catch { return {} }
}
export function getLimitUpCache(date: string, only: boolean): { result: LimitUpResult; fresh: boolean } | null {
  const data = read()[keyOf(date, only)]
  if (!data || !['ready', 'closed', 'empty'].includes(data.status) || !Array.isArray(data.concepts) || !Number.isFinite(Date.parse(data.fetchedAt))) return null
  if (data.dataDate !== null && (typeof data.dataDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.dataDate))) return null
  if (!data.concepts.every(c => c && typeof c.name === 'string' && Number.isFinite(c.changePercent) && Number.isFinite(c.stockCount) && Array.isArray(c.stocks) && c.stocks.every(s => s && typeof s.code === 'string' && typeof s.name === 'string' && typeof s.changePercent === 'number' && typeof s.currentPrice === 'number' && Number.isFinite(s.marketCap) && Number.isFinite(s.consecutiveDays)))) return null
  const age = Date.now() - Date.parse(data.fetchedAt)
  return { result: data, fresh: age >= 0 && age < TTL }
}
export function saveLimitUpCache(date: string, only: boolean, result: LimitUpResult): void {
  try {
    const data = { ...read(), [keyOf(date, only)]: result }
    const entries = Object.entries(data).filter(([, r]) => r && Number.isFinite(Date.parse(r.fetchedAt))).sort((a, b) => Date.parse(b[1].fetchedAt) - Date.parse(a[1].fetchedAt)).slice(0, 20)
    sessionStorage.setItem(DATA_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch { /* 禁止存储或超额时仍允许正常加载 */ }
}
export function readLimitUpView(today: string): { date: string; only: boolean } {
  try {
    const data = JSON.parse(sessionStorage.getItem(VIEW_KEY) || 'null')
    // 新的一天默认查询当天，避免昨天默认日期永久固定。
    if (data?.savedDay === today && typeof data.only === 'boolean' && typeof data.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date) && data.date <= today) return { date: data.date, only: data.only }
  } catch { /* 损坏或禁用存储时使用默认日期 */ }
  return { date: today, only: true }
}
export function saveLimitUpView(date: string, only: boolean, today: string): void {
  try { sessionStorage.setItem(VIEW_KEY, JSON.stringify({ date, only, savedDay: today })) } catch { /* 存储不可用 */ }
}
