import { describe, expect, it } from 'vitest'
import { makeDailyFixture } from '../daily.fixture'
import {
  currentMonthRange,
  dailyRecessionWindows,
  dailyXTicks,
  decimateMinMax,
  indexAtOrBefore,
  latestDayLabel,
  lowerBoundDate,
  mergeRuns,
  monthStartIndices,
  recentMonthsRange,
  segmentsInRange,
  shiftMonths,
  stepByMonths,
  toDailyPoints,
  type ChartPoint,
} from './dailyMath'

const file = makeDailyFixture({ start: '2018-01-01', end: '2026-11-20' })
const points = toDailyPoints(file.rows)

describe('每日行转换', () => {
  it('档位编码转为档位，-1 为证据不足，收盘非正的行跳过', () => {
    const rows = [
      ['2026-11-18', 6500, -1, 2, 0, 0],
      ['2026-11-19', 0, 1, 1, 0, 0],
      ['2026-11-20', 6538.76, 0, 4, 0, 1],
    ] as typeof file.rows
    expect(toDailyPoints(rows)).toEqual([
      { d: '2026-11-18', spx: 6500, regime: null, final: 'neutral', official: 0, rec: 0 },
      { d: '2026-11-20', spx: 6538.76, regime: 'offense', final: 'defense', official: 0, rec: 1 },
    ])
  })
})

describe('日期查找（二分）', () => {
  it('休市日退回前一个交易日，早于首日取首日', () => {
    const saturday = '2024-03-16'
    const index = indexAtOrBefore(points, saturday)
    expect(points[index].d).toBe('2024-03-15')
    expect(indexAtOrBefore(points, '1990-01-01')).toBe(0)
    expect(indexAtOrBefore(points, '2030-01-01')).toBe(points.length - 1)
    expect(points[lowerBoundDate(points, saturday)].d).toBe('2024-03-18')
  })

  it('按自然月平移，月底收在目标月最后一天', () => {
    expect(shiftMonths('2026-03-31', -1)).toBe('2026-02-28')
    expect(shiftMonths('2024-03-31', -1)).toBe('2024-02-29')
    expect(shiftMonths('2026-01-15', -13)).toBe('2024-12-15')
    expect(shiftMonths('2026-11-20', 2)).toBe('2027-01-20')
  })

  it('一个月 / 一年跳转落在最近的交易日', () => {
    const last = points.length - 1
    expect(points[stepByMonths(points, last, -1)].d).toBe('2026-10-20')
    // 2025-11-20 是周四；2025-10-19 是周日 → 退回周五。
    expect(points[stepByMonths(points, stepByMonths(points, last, -1), -12)].d).toBe('2025-10-20')
    const sunday = indexAtOrBefore(points, '2025-10-19')
    expect(points[sunday].d).toBe('2025-10-17')
    expect(points[stepByMonths(points, sunday, 1)].d).toBe('2025-11-17')
    expect(stepByMonths(points, last, 1)).toBe(last)
  })
})

describe('区间', () => {
  it('近 N 个月从最新日往前 N 个月当天或之后的第一个交易日开始', () => {
    const r3y = recentMonthsRange(points, 36)
    expect(points[r3y.start].d).toBe('2023-11-20')
    expect(r3y.end).toBe(points.length - 1)
    const r3m = recentMonthsRange(points, 3)
    expect(points[r3m.start].d).toBe('2026-08-20')
    expect(recentMonthsRange(points, null)).toEqual({ start: 0, end: points.length - 1 })
  })

  it('本月从当月第一个交易日开始；月初几天按最小跨度补足', () => {
    const month = currentMonthRange(points)
    expect(points[month.start].d).toBe('2026-11-02')
    const early = toDailyPoints(makeDailyFixture({ start: '2026-09-01', end: '2026-11-02' }).rows)
    const short = currentMonthRange(early)
    expect(short.end - short.start).toBe(4)
  })
})

describe('色带区段合并', () => {
  const sample: ChartPoint[] = ['offense', 'offense', 'neutral', 'neutral', 'neutral', null, 'offense'].map((final, index) => ({
    d: `2026-01-${String(index + 1).padStart(2, '0')}`,
    spx: 100,
    final: final as ChartPoint['final'],
    regime: null,
    rec: 0,
  }))

  it('连续相同档位合并为一个区段', () => {
    expect(mergeRuns(sample, point => point.final)).toEqual([
      { start: 0, end: 1, value: 'offense' },
      { start: 2, end: 4, value: 'neutral' },
      { start: 5, end: 5, value: null },
      { start: 6, end: 6, value: 'offense' },
    ])
  })

  it('只取与可见区间相交的区段', () => {
    const segments = mergeRuns(sample, point => point.final)
    expect(segmentsInRange(segments, { start: 3, end: 5 }).map(segment => segment.start)).toEqual([2, 5])
    expect(segmentsInRange(segments, { start: 6, end: 6 }).map(segment => segment.start)).toEqual([6])
  })

  it('真实规模：一万多行的区段数远小于行数', () => {
    const big = toDailyPoints(makeDailyFixture().rows)
    expect(big.length).toBeGreaterThan(13_000)
    const segments = mergeRuns(big, point => point.final)
    expect(segments.length).toBeLessThan(big.length / 20)
    expect(segments[segments.length - 1].end).toBe(big.length - 1)
  })
})

describe('按像素抽稀', () => {
  it('点数不多时全部保留', () => {
    const values = [1, 2, 3, 4, 5]
    expect(decimateMinMax(values, { start: 1, end: 3 }, 10)).toEqual([1, 2, 3])
  })

  it('每列保留最高与最低，首尾保留，总点数不超过两倍列数加二', () => {
    const values = Array.from({ length: 10_000 }, (_, index) => 100 + Math.sin(index / 7) * 10 + index / 100)
    values[4321] = 1
    values[7777] = 999
    const kept = decimateMinMax(values, { start: 0, end: values.length - 1 }, 500)
    expect(kept.length).toBeLessThanOrEqual(1002)
    expect(kept[0]).toBe(0)
    expect(kept[kept.length - 1]).toBe(values.length - 1)
    expect(kept).toContain(4321)
    expect(kept).toContain(7777)
    expect([...kept].sort((a, b) => a - b)).toEqual(kept)
    expect(new Set(kept).size).toBe(kept.length)
  })
})

describe('每日横轴刻度', () => {
  const starts = monthStartIndices(points)

  it('近 3 个月按交易日标「月-日」，首尾为完整日期', () => {
    const range = recentMonthsRange(points, 3)
    const ticks = dailyXTicks(points, starts, range, 1150)
    expect(ticks[0].mode).toBe('day')
    expect(ticks[0].label).toBe('2026-08-20')
    expect(ticks[ticks.length - 1].label).toBe('2026-11-20')
    expect(ticks.slice(1, -1).every(tick => /^\d{2}-\d{2}$/.test(tick.label))).toBe(true)
  })

  it('近 3 年按季度或月对齐到自然月；全部按年', () => {
    const three = dailyXTicks(points, starts, recentMonthsRange(points, 36), 1150)
    expect(three[1].mode).toBe('month')
    expect(three.slice(1, -1).every(tick => /^\d{4}-(01|04|07|10)$/.test(tick.label))).toBe(true)
    expect(three[0].label).toBe('2023-11-20')
    const all = dailyXTicks(points, starts, { start: 0, end: points.length - 1 }, 558)
    expect(all[1].mode).toBe('year')
    expect(all.slice(1, -1).every(tick => /^\d{4}$/.test(tick.label))).toBe(true)
  })
})

describe('每日横轴刻度：窄屏不重名', () => {
  const starts = monthStartIndices(points)

  it('近 3 年在窄屏按年标注时，首尾写到月份，内部年份不与端点重名', () => {
    const ticks = dailyXTicks(points, starts, recentMonthsRange(points, 36), 274)
    expect(ticks[0].label).toBe('2023-11')
    expect(ticks[ticks.length - 1].label).toBe('2026-11')
    const labels = ticks.map(tick => tick.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('近 3 个月在窄屏按月标注时，首尾为完整日期', () => {
    const ticks = dailyXTicks(points, starts, recentMonthsRange(points, 3), 274)
    expect(ticks[0].label).toBe('2026-08-20')
    expect(ticks[ticks.length - 1].label).toBe('2026-11-20')
  })
})

describe('衰退窗口与最新标签', () => {
  it('衰退起点前 24 个月到结束后 12 个月', () => {
    const windows = dailyRecessionWindows(points)
    const covid = windows.find(window => window.label === '2020-02 — 2020-04')
    expect(covid).toBeTruthy()
    expect(points[covid!.range.start].d).toBe('2018-02-05')
    expect(points[covid!.range.end].d).toBe('2021-04-30')
  })

  it('「最新 · 11 月 20 日」', () => {
    expect(latestDayLabel('2026-11-20')).toBe('最新 · 11 月 20 日')
    expect(latestDayLabel('2026-01-05')).toBe('最新 · 1 月 5 日')
  })
})
