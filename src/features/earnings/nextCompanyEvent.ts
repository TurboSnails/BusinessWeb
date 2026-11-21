import { venueOf } from '../candidates/markets'
import { venueKey, type EarningsCalendar, type EarningsItem, type EarningsMarket } from './model'

const TIME_ZONE = { us: 'America/New_York', hk: 'Asia/Hong_Kong', cn: 'Asia/Shanghai' }

/** 实际披露日、当期 EPS 或对应报告期的营收，均可确认披露。 */
export function hasReported(event: EarningsItem): boolean {
  const result = event.result
  return Boolean(event.appoint?.actual) || result?.epsActual != null || (
    result?.revenueActual != null && !!event.periodEnd && result.revenuePeriodEnd === event.periodEnd
  )
}

/** 财报条目的日期使用交易所当地日期。快照创建日只表示采集时点。 */
export function nextCompanyEvent(cal: EarningsCalendar | null, market: EarningsMarket, code: string, now = new Date()): EarningsItem | null {
  if (!cal) return null
  const key = venueKey(market, code)
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE[venueOf(market)], year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
  const upcoming = cal.items.filter(event =>
    event.date >= today && venueKey(event.market, event.code) === key && !hasReported(event),
  )
  return upcoming.sort((a, b) => a.date.localeCompare(b.date))[0] ?? null
}
