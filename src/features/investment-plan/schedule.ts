// 检查日 / 定投预算日：薄适配 invest-start/checks 纯函数。
import { addMonths, daysBetween, occurrence, reviewStatus } from '../invest-start/checks.js'
import type { Day } from '../invest-start/types.js'
import type { Contribution, PlanReview } from './types.js'

export type PlanReviewStatus = {
  due?: Day
  next: Day
  daysToNext: number
}

export function planReviewStatus(review: PlanReview, today: Day): PlanReviewStatus {
  return reviewStatus(
    {
      id: review.id,
      anchor: review.anchor,
      intervalMonths: review.intervalMonths,
      completedDates: review.completedDates,
      calendarSequence: review.calendarSequence,
    },
    today,
  )
}

/** 定投：最近一期未 ack 才 1 条；不补累计漏扣 */
export function contributionDue(c: Contribution, today: Day): Day | undefined {
  if (!c.enabled) return undefined
  const done = new Set(c.acknowledgedDates)
  let k = 0
  let lastPast: Day | undefined
  while (k < 2000) {
    const d = addMonths(c.anchor, k * c.intervalMonths)
    if (d > today) break
    lastPast = d
    k++
  }
  if (lastPast && !done.has(lastPast)) return lastPast
  return undefined
}

export function contributionNext(c: Contribution, today: Day): Day {
  let k = 0
  while (k < 2000 && addMonths(c.anchor, k * c.intervalMonths) <= today) k++
  return addMonths(c.anchor, k * c.intervalMonths)
}

export function rollingOccurrences(
  anchor: Day,
  intervalMonths: 1 | 3 | 6,
  today: Day,
  count: number,
): Day[] {
  // 含今天起的未来窗口
  let k = 0
  while (k < 2000 && addMonths(anchor, k * intervalMonths) < today) k++
  const out: Day[] = []
  for (let i = 0; i < count; i++) out.push(addMonths(anchor, (k + i) * intervalMonths))
  return out
}

export { occurrence, daysBetween, addMonths }
