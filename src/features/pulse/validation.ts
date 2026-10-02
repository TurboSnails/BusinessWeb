// 每日复盘云同步的严格校验：服务端（api/pulse-sync.ts）与客户端共用，拒绝未知字段、越界数值与非法日期。
export type ReviewRecord = {
  date: string; weekday: string
  ztCount: number; ztSealRate: string; ztOpen: number
  dtCount: number; dtSealRate: string; dtOpen: number
  volume: number; upDown: string; shszcy: string
  lbRate: string; lbCount: number; maxBoard: number
  top5Amount: number; top5Turnover: number
  inflow: string; outflow: string
  updatedAt: string
}
export type ReviewTombstone = { date: string; deleted: true; updatedAt: string }
export type PulsePayload = { schemaVersion: 1; reviews: Array<ReviewRecord | ReviewTombstone> }

export const MAX_REVIEWS = 500
const INT_KEYS = ['ztCount', 'ztOpen', 'dtCount', 'dtOpen', 'lbCount', 'maxBoard'] as const
const NUM_KEYS = ['volume', 'top5Amount', 'top5Turnover'] as const
const SHORT_KEYS = ['weekday', 'ztSealRate', 'dtSealRate', 'upDown', 'shszcy', 'lbRate'] as const
const LONG_KEYS = ['inflow', 'outflow'] as const
const REVIEW_KEYS = new Set<string>(['date', 'updatedAt', ...INT_KEYS, ...NUM_KEYS, ...SHORT_KEYS, ...LONG_KEYS])
const TOMBSTONE_KEYS = new Set(['date', 'deleted', 'updatedAt'])

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}

export function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))
}

const text = (value: unknown, max: number): boolean => typeof value === 'string' && value.length <= max

export function isTombstone(item: unknown): item is ReviewTombstone {
  return object(item) && item.deleted === true
}

export function validReviewItem(item: unknown): item is ReviewRecord | ReviewTombstone {
  if (!object(item) || !validDate(item.date) || !validTimestamp(item.updatedAt)) return false
  if (item.deleted !== undefined) {
    return item.deleted === true && Object.keys(item).every(key => TOMBSTONE_KEYS.has(key))
  }
  if (!Object.keys(item).every(key => REVIEW_KEYS.has(key))) return false
  return INT_KEYS.every(key => Number.isSafeInteger(item[key]) && (item[key] as number) >= 0 && (item[key] as number) <= 100_000) &&
    NUM_KEYS.every(key => typeof item[key] === 'number' && Number.isFinite(item[key]) && (item[key] as number) >= 0 && (item[key] as number) <= 1e9) &&
    SHORT_KEYS.every(key => text(item[key], 50)) && LONG_KEYS.every(key => text(item[key], 500))
}

export function validPulsePayload(value: unknown): value is PulsePayload {
  if (!object(value) || value.schemaVersion !== 1 || !Array.isArray(value.reviews) || value.reviews.length > MAX_REVIEWS) return false
  if (Object.keys(value).some(key => key !== 'schemaVersion' && key !== 'reviews')) return false
  const dates = new Set<string>()
  return value.reviews.every(item => {
    if (!validReviewItem(item) || dates.has(item.date)) return false
    dates.add(item.date)
    return true
  })
}
