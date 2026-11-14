// 检查日：纯函数，today 由调用方注入。日期按本地日历日（YYYY-MM-DD）计算，
// 天数差用 Date.UTC 换算，不用毫秒差 / 86400000 直接算本地时间（避开夏令时）。
import type { Day, ReviewSchedule } from './types'

const parts = (d: Day): [number, number, number] => d.split('-').map(Number) as [number, number, number]
const pad = (n: number): string => String(n).padStart(2, '0')
const fmt = (y: number, m: number, d: number): Day => `${y}-${pad(m)}-${pad(d)}`

/** 浏览器本地的今天 */
export function localToday(now: Date = new Date()): Day {
  return fmt(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

/** 加 n 个月；锚点日号 ≤ 28，所以不需要夹到月末 */
export function addMonths(day: Day, n: number): Day {
  const [y, m, d] = parts(day)
  const idx = y * 12 + (m - 1) + n
  return fmt(Math.floor(idx / 12), (idx % 12) + 1, d)
}

export function addDays(day: Day, n: number): Day {
  const [y, m, d] = parts(day)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}

export function daysBetween(from: Day, to: Day): number {
  const [y1, m1, d1] = parts(from)
  const [y2, m2, d2] = parts(to)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

/** 第 k 次检查日（k 从 0 起），总从原锚点算，不累加 */
export const occurrence = (r: Pick<ReviewSchedule, 'anchor' | 'intervalMonths'>, k: number): Day => addMonths(r.anchor, k * r.intervalMonths)

/** .ics 导出的有限序列：未来两年（季度 8 次、半年 4 次） */
export const exportCount = (intervalMonths: 3 | 6): number => (intervalMonths === 3 ? 8 : 4)

export interface ReviewStatus {
  /** 最近一次已过（含今天）且未完成的检查日；只给一条 */
  due?: Day
  /** 下一个尚未到来的检查日 */
  next: Day
  daysToNext: number
}

export function reviewStatus(r: ReviewSchedule, today: Day): ReviewStatus {
  const done = new Set(r.completedDates)
  let k = 0
  let lastPast: Day | undefined
  // 锚点在未来时 lastPast 为空；最多遍历 2000 次（500 年季度）防御异常输入
  while (k < 2000 && occurrence(r, k) <= today) {
    lastPast = occurrence(r, k)
    k++
  }
  const next = occurrence(r, k)
  const due = lastPast && !done.has(lastPast) ? lastPast : undefined
  return { due, next, daysToNext: daysBetween(today, next) }
}

/** 标记某个具体计划日已检查（只记录「检查过」，不代表交易过） */
export function completeReview(r: ReviewSchedule, day: Day): ReviewSchedule {
  if (r.completedDates.includes(day)) return r
  return { ...r, completedDates: [...r.completedDates, day].sort().slice(-200) }
}
