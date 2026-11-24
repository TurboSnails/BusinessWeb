/**
 * 月末定档是否已更新。上月底的定档最晚在本月第一个交易日早上（北京时间）出来；
 * 留两天余量：本月 3 日起，若正式定档还停在更早的月份，视为过期。
 * 与 scripts/check-strategy-freshness.mjs 规则相同。
 */
export const GRACE_DAYS = 2

function previousMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

/** today 为 YYYY-MM-DD（按北京时间的日期） */
export function officialFreshness(officialMonth: string | null | undefined, today: string): {
  stale: boolean
  expected: string
} {
  const expected = previousMonth(today.slice(0, 7))
  const day = Number(today.slice(8, 10))
  if (day <= GRACE_DAYS) return { stale: false, expected }
  return { stale: !officialMonth || officialMonth < expected, expected }
}

/** 当前北京时间的日期 YYYY-MM-DD */
export function beijingToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

export function monthText(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return `${y} 年 ${m} 月`
}
