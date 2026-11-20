import React from 'react'
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { nearestIndex, weekStart, weeklyCloses, withinPriceRange } from './chartSeries'
import HistoryChart from './HistoryChart'
import type { Point } from './model'

const DAY = 86_400_000
const iso = (time: number) => new Date(time).toISOString().slice(0, 10)
const fmt = (value: number) => value.toFixed(2)

/** Weekday closes from `from` to `to` inclusive, rising by 1 each session. */
const weekdays = (from: string, to: string): Point[] => {
  const points: Point[] = []
  for (let time = Date.parse(from); time <= Date.parse(to); time += DAY) {
    const day = new Date(time).getUTCDay()
    if (day !== 0 && day !== 6) points.push([iso(time), points.length])
  }
  return points
}

/** Same weekly bucketing as the chart but written independently (walk back to Monday). */
const mondayOf = (date: string): string => {
  let time = Date.parse(date)
  while (new Date(time).getUTCDay() !== 1) time -= DAY
  return iso(time)
}

/** Share of shown readings below the latest one, matching the legend percentile. */
const rankOf = (points: Point[]): number => {
  const latest = points[points.length - 1][1]
  return Math.round((points.filter(([, value]) => value < latest).length / points.length) * 100)
}

const stubRect = (svg: SVGElement): void => {
  svg.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 320, bottom: 120, width: 320, height: 120, toJSON: () => ({}) }) as DOMRect
}

const legendText = (container: HTMLElement): string => container.querySelector('.us-chart__legend')?.textContent ?? ''
const readoutDate = (container: HTMLElement): string => container.querySelector('.us-chart__caption time')?.textContent ?? ''
const linePath = (container: HTMLElement): string => container.querySelector('.us-chart__line')?.getAttribute('d') ?? ''
const pathPoints = (container: HTMLElement): number => (linePath(container).match(/L/g) ?? []).length + 1

describe('weekStart', () => {
  it('maps days to their Monday, across week and year boundaries', () => {
    expect(weekStart('2026-11-16')).toBe('2026-11-16') // Monday stays
    expect(weekStart('2026-11-18')).toBe('2026-11-16') // Wednesday
    expect(weekStart('2026-11-22')).toBe('2026-11-16') // Sunday belongs to the previous Monday
    expect(weekStart('2026-01-01')).toBe('2025-12-29') // Thursday in the last ISO week of 2025
  })
})

describe('weeklyCloses', () => {
  it('keeps the last available close per week with mixed sampling', () => {
    const mixed: Point[] = [
      ['2026-11-02', 1], ['2026-11-03', 2], ['2026-11-06', 3], // Wed/Thu gap, Friday wins
      ['2026-11-09', 4], ['2026-11-10', 5], ['2026-11-11', 6], ['2026-11-12', 7], ['2026-11-13', 8],
      ['2026-11-18', 9], // single Wednesday reading
    ]
    const sample = weeklyCloses(mixed)
    expect(sample.points).toEqual([['2026-11-06', 3], ['2026-11-13', 8], ['2026-11-18', 9]])
    expect(sample.latestWeekAsOf).toBe('2026-11-18')
  })

  it('drops weeks with no readings and records the as-of date of a week ending mid-week', () => {
    const gapped: Point[] = [['2026-11-06', 1], ['2026-11-20', 2]]
    expect(weeklyCloses(gapped).points).toEqual(gapped)
    expect(weeklyCloses(gapped).latestWeekAsOf).toBeUndefined()
    expect(weeklyCloses([...gapped, ['2026-11-18', 3]]).latestWeekAsOf).toBe('2026-11-18')
  })
})

describe('withinPriceRange', () => {
  it('clips to the last year anchored at the latest point and keeps the boundary day', () => {
    const history: Point[] = [['2025-11-19', 0], ['2025-11-20', 1], ['2026-11-20', 2]]
    expect(withinPriceRange(history, '1y')).toEqual([['2025-11-20', 1], ['2026-11-20', 2]])
    expect(withinPriceRange(history, 'all')).toBe(history)
  })
})

describe('nearestIndex', () => {
  it('picks the closest date across a gap', () => {
    const gapped: Point[] = [['2026-11-06', 1], ['2026-11-20', 2]]
    expect(nearestIndex(gapped, Date.parse('2026-11-11'))).toBe(0)
    expect(nearestIndex(gapped, Date.parse('2026-11-14'))).toBe(1)
  })
})

describe('HistoryChart', () => {
  const gapped: Point[] = [['2026-11-02', 1], ['2026-11-03', 2], ['2026-11-20', 3]]

  it('plots metric charts by calendar date and hovers the nearest date', () => {
    const { container } = render(<HistoryChart points={gapped} label="测试" format={fmt} />)
    // 18 calendar days span: last point at x=316.0, middle session lands near x=21.3 (index scale would center it).
    const d = linePath(container)
    expect(d).toContain('L316.0')
    expect(d).toMatch(/L21\.3/)
    expect(readoutDate(container)).toBe('2026-11-20')
    expect(legendText(container)).toContain('均值（虚线）2.00')
    expect(legendText(container)).toContain('67% 的观测（3 个）')
    const svg = container.querySelector('svg')!
    stubRect(svg)
    fireEvent.pointerMove(svg, { clientX: 8, clientY: 60 }) // just after 2026-11-02, its closest session
    expect(readoutDate(container)).toBe('2026-11-02')
    expect(container.querySelector('.us-chart__cursor')?.getAttribute('x1')).toBe('4')
    fireEvent.pointerMove(svg, { clientX: 200, clientY: 60 }) // ≈ 2026-11-13, closer to 11-20
    expect(readoutDate(container)).toBe('2026-11-20')
    expect(container.querySelector('.us-chart__cursor')?.getAttribute('x1')).toBe('316')
    fireEvent.pointerMove(svg, { clientX: -50, clientY: 60 }) // left of the plot clamps to the first session
    expect(readoutDate(container)).toBe('2026-11-02')
    fireEvent.pointerMove(svg, { clientX: 9999, clientY: 60 }) // right of the plot clamps to the latest session
    expect(readoutDate(container)).toBe('2026-11-20')
  })

  it('keeps the hover read-out valid when points change under a stale hover', () => {
    const long = weekdays('2020-01-01', '2026-11-20')
    const { container, rerender } = render(<HistoryChart points={long} label="价格" format={fmt} priceRange="all" />)
    const svg = container.querySelector('svg')!
    stubRect(svg)
    fireEvent.pointerMove(svg, { clientX: 160, clientY: 60 }) // mid-2023
    expect(readoutDate(container) > '2022-01-01').toBe(true)
    const short = weekdays('2026-01-01', '2026-11-20')
    rerender(<HistoryChart points={short} label="价格" format={fmt} priceRange="1y" />)
    // The old hover time predates the new series, so the read-out clamps to its first session.
    expect(readoutDate(container)).toBe('2026-01-01')
    expect(container.querySelector('.us-chart__dot')).toBeTruthy()
  })

  it('samples 5y price charts to weekly closes and labels the latest week by its as-of date', () => {
    const daily = weekdays('2019-01-01', '2026-11-18') // ends on a Wednesday
    const { container } = render(<HistoryChart points={daily} label="价格" format={fmt} priceRange="5y" />)
    const end = Date.parse('2026-11-18')
    const inRange = daily.filter(([date]) => end - Date.parse(date) <= 5 * 365.25 * DAY)
    const byWeek = new Map<string, Point>()
    for (const point of inRange) byWeek.set(mondayOf(point[0]), point)
    const expected = [...byWeek.values()]
    expect(pathPoints(container)).toBe(expected.length)
    const mean = expected.reduce((sum, [, value]) => sum + value, 0) / expected.length
    expect(legendText(container)).toContain(`均值（虚线）${mean.toFixed(2)}`)
    expect(legendText(container)).toContain(`最新值高于区间内 ${rankOf(expected)}% 的每周最后可用收盘（${expected.length} 个）`)
    expect(legendText(container)).toContain('最新一周取截至 2026-11-18 的最后可用收盘')
  })

  it('keeps 1y price charts on daily closes without a weekly note', () => {
    const daily = weekdays('2019-01-01', '2026-11-18')
    const { container } = render(<HistoryChart points={daily} label="价格" format={fmt} priceRange="1y" />)
    const end = Date.parse('2026-11-18')
    const inRange = daily.filter(([date]) => end - Date.parse(date) <= 365.25 * DAY)
    expect(pathPoints(container)).toBe(inRange.length)
    const mean = inRange.reduce((sum, [, value]) => sum + value, 0) / inRange.length
    expect(legendText(container)).toContain(`均值（虚线）${mean.toFixed(2)}`)
    expect(legendText(container)).toContain(`最新值高于区间内 ${rankOf(inRange)}% 的日收盘（${inRange.length} 个）`)
    expect(legendText(container)).not.toContain('最新一周取截至')
  })

  it('computes the legend on the shown weekly sample, not the raw daily input', () => {
    const weeks: Point[] = [
      ['2026-10-26', 10], ['2026-10-27', 11], ['2026-10-28', 12], ['2026-10-29', 13], ['2026-10-30', 14],
      ['2026-11-02', 20], ['2026-11-03', 19], ['2026-11-04', 18], ['2026-11-05', 17], ['2026-11-06', 16],
      ['2026-11-09', 30], ['2026-11-10', 29], ['2026-11-11', 28], ['2026-11-12', 27], ['2026-11-13', 26],
      ['2026-11-16', 22], ['2026-11-17', 23], ['2026-11-18', 24], ['2026-11-19', 25], ['2026-11-20', 21],
    ]
    const { container } = render(<HistoryChart points={weeks} label="价格" format={fmt} priceRange="5y" />)
    // Weekly closes 14/16/26/21: mean 19.25, latest 21 above 2 of 4 readings.
    expect(legendText(container)).toContain('均值（虚线）19.25')
    expect(legendText(container)).toContain('50% 的每周最后可用收盘（4 个）')
    expect(legendText(container)).not.toContain('最新一周取截至')
    expect(legendText(container)).not.toContain('高于区间内 50% 的时间')
  })

  it('renders nothing until at least three plotted points exist', () => {
    const { container } = render(<HistoryChart points={gapped.slice(0, 2)} label="价格" format={fmt} priceRange="5y" />)
    expect(container.firstChild).toBeNull()
  })
})
