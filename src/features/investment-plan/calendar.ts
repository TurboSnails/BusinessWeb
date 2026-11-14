// 薄适配 invest-start/calendar：review 投影丢弃 mode；回链 invest/my-plan。
import {
  ICS_CAVEAT,
  ICS_DESCRIPTION,
  ICS_FILENAME,
  ICS_SUMMARY,
  buildIcs,
  downloadIcs,
  publicPageUrl,
} from '../invest-start/calendar'
import type { Day } from '../invest-start/types'
import { SITE_ORIGIN } from '../../utils/seo'
import type { PlanReview } from './types'

export { ICS_CAVEAT, ICS_DESCRIPTION, ICS_FILENAME, ICS_SUMMARY, downloadIcs }

export function planPageUrl(
  locationOrigin: string = typeof window !== 'undefined' ? window.location.origin : SITE_ORIGIN,
  baseUrl: string = typeof import.meta !== 'undefined' ? (import.meta.env.BASE_URL ?? '/') : '/',
  siteOrigin: string = SITE_ORIGIN,
): string {
  return publicPageUrl(locationOrigin, baseUrl, siteOrigin, 'invest/my-plan')
}

/** 导出 .ics：丢弃 mode（不在 ics 带比例）；无金额/答案/标的 */
export function buildPlanIcs(params: {
  review: PlanReview
  today: Day
  now?: Date
  pageUrl?: string
}): string {
  const { review, today, now = new Date(), pageUrl = planPageUrl() } = params
  return buildIcs({
    review: {
      id: review.id,
      anchor: review.anchor,
      intervalMonths: review.intervalMonths,
      calendarSequence: review.calendarSequence,
      completedDates: review.completedDates,
    },
    today,
    now,
    pageUrl,
  })
}

export function downloadPlanIcs(review: PlanReview, today: Day, doc: Document = document): void {
  const text = buildPlanIcs({ review, today })
  downloadIcs(text, doc)
}
