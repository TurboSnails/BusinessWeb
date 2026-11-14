// 周报投影：只含日期与待核事实，绝不带金额/比例/名称。
import { addDays } from '../invest-start/checks.js'
import type { Day } from '../invest-start/types.js'
import { planReviewStatus } from './schedule.js'
import type { PlanDocument } from './types.js'

export type PlanWeeklyFacts = {
  snapshotDate: Day
  dueDate: Day | null
  upcomingDate: Day | null
  deferred: boolean
}

/** 云端 updatedAt / 本机 updatedAt → YYYY-MM-DD（调用方注入已是日历日时可直接传入） */
export function snapshotDayFromInstant(iso: string, fallback: Day): Day {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return fallback
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(t))
}

/**
 * 仅当有「过期仍待核」或「未来 7 天（含今天）内检查日」时返回事实；否则 null。
 * due 优先；deferred 仅当 due 对应最新检查记录 outcome=deferred。
 */
export function planWeeklyFacts(doc: PlanDocument, today: Day): PlanWeeklyFacts | null {
  if (!doc.review) return null
  const status = planReviewStatus(doc.review, today)
  const dueDate = status.due ?? null
  const windowEnd = addDays(today, 6)
  const upcomingDate =
    status.next >= today && status.next <= windowEnd ? status.next : null
  if (!dueDate && !upcomingDate) return null

  let deferred = false
  if (dueDate) {
    const related = doc.history
      .filter(h => h.scheduledDate === dueDate)
      .sort((a, b) => a.checkedAt.localeCompare(b.checkedAt))
    const latest = related.at(-1)
    deferred = latest?.outcome === 'deferred'
  }

  return {
    snapshotDate: snapshotDayFromInstant(doc.updatedAt, today),
    dueDate,
    upcomingDate: dueDate ? null : upcomingDate,
    deferred,
  }
}
