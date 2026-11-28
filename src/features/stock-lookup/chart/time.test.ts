import { describe, expect, it } from 'vitest'
import {
  exchangeCalendarDate, exchangeParts, formatBarTime, formatShortDate, formatTickMark, toChartTime,
} from './time'

describe('exchange time', () => {
  // 2026-10-23 09:30 America/New_York = 13:30 UTC（fixtures/bars-MRVL-1d 最后一根）
  const nyOpen = 1792762200

  it('日线：交易所日历日，不随浏览器本地时区偏移', () => {
    expect(exchangeCalendarDate(nyOpen, 'America/New_York')).toBe('2026-10-23')
    expect(toChartTime(nyOpen, 'America/New_York', '1d')).toBe('2026-10-23')
    expect(formatBarTime(nyOpen, 'America/New_York', '1d')).toBe('2026/10/23')
    expect(formatShortDate(nyOpen, 'America/New_York')).toBe('2026/10/23')
    expect(formatTickMark('2026-10-23', 'America/New_York', '1d')).toBe('10月23日')
  })

  it('美股分钟线：09:30 开盘显示 09:30', () => {
    const p = exchangeParts(nyOpen, 'America/New_York')
    expect(p.hour).toBe(9)
    expect(p.minute).toBe(30)
    expect(formatBarTime(nyOpen, 'America/New_York', '1m')).toBe('2026/10/23 09:30')
    expect(toChartTime(nyOpen, 'America/New_York', '1m')).toBe(nyOpen)
    expect(formatTickMark(nyOpen, 'America/New_York', '1m')).toBe('09:30')
  })

  it('UTC 傍晚时间戳按纽约仍是当日（避免本地 +4 滚到次日）', () => {
    // 2026-11-26 21:00 UTC → 纽约 16:00 仍是 11/26；若用浏览器 Asia/Dubai 会是 11/27
    const eveningUtc = Math.floor(Date.UTC(2026, 10, 26, 21, 0, 0) / 1000)
    expect(exchangeCalendarDate(eveningUtc, 'America/New_York')).toBe('2026-11-26')
    expect(toChartTime(eveningUtc, 'America/New_York', '1d')).toBe('2026-11-26')
  })
})
