import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dailyFixture } from '../daily.fixture'
import TimelineView from './TimelineView'
import { CHART_LEFT, CHART_RIGHT } from './chartMath'
import { indexAtOrBefore, mergeRuns, segmentsInRange, toDailyPoints } from './dailyMath'
import { mockSvgGeometry } from './testUtils'

// 1976-01-02 … 2026-11-20 的工作日，约 1.33 万行。
const points = toDailyPoints(dailyFixture.rows)
const lastIndex = points.length - 1
const width = 640
const plotWidth = width - CHART_LEFT - CHART_RIGHT

let frames: FrameRequestCallback[] = []

function flushFrames(): void {
  act(() => {
    const pending = frames
    frames = []
    pending.forEach(callback => callback(0))
  })
}

beforeEach(() => {
  frames = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback)
    return frames.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function setup() {
  render(<TimelineView mode="day" points={points} changes={dailyFixture.changes} />)
  const chart = screen.getByTestId('mp-timeline-chart') as unknown as SVGSVGElement
  const days = () => Number(chart.getAttribute('data-visible-days'))
  const start = () => chart.getAttribute('data-visible-start')
  const end = () => chart.getAttribute('data-visible-end')
  const caption = () => document.querySelector('.mp-timeline__caption time')?.textContent
  return { chart, days, start, end, caption }
}

function hoverDate(chart: SVGSVGElement, date: string): HTMLElement {
  mockSvgGeometry(chart, { left: 0, top: 0, width, height: 380 }, { width, height: 380 })
  const from = indexAtOrBefore(points, chart.getAttribute('data-visible-start')!)
  const to = indexAtOrBefore(points, chart.getAttribute('data-visible-end')!)
  const target = indexAtOrBefore(points, date)
  const clientX = CHART_LEFT + ((target - from) / (to - from)) * plotWidth
  fireEvent.pointerMove(chart, { clientX, clientY: 120, pointerType: 'mouse', pointerId: 1 })
  flushFrames()
  return screen.getByTestId('mp-timeline-tooltip')
}

describe('每日时间线：默认视图与区间', () => {
  it('默认近 3 年，最新一天标「最新 · 11 月 20 日」', () => {
    const { chart, start, end, caption } = setup()
    expect(chart.closest('figure')?.getAttribute('data-granularity')).toBe('day')
    expect(start()).toBe('2023-11-20')
    expect(end()).toBe('2026-11-20')
    expect(screen.getByRole('button', { name: '近 3 年' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('mp-timeline-latest').textContent).toBe('最新 · 11 月 20 日')
    expect(caption()).toBe('2026-11-20')
    expect(document.querySelector('.mp-timeline__caption')?.textContent).toContain('月中预估')
    expect(document.querySelector('.mp-timeline__range-readout')?.textContent).toContain('个交易日')
  })

  it('区间按钮：近 1 年、近 3 个月、本月、全部', () => {
    const { days, start } = setup()
    fireEvent.click(screen.getByRole('button', { name: '近 1 年' }))
    expect(start()).toBe('2025-11-20')
    fireEvent.click(screen.getByRole('button', { name: '近 3 个月' }))
    expect(start()).toBe('2026-08-20')
    fireEvent.click(screen.getByRole('button', { name: '本月' }))
    expect(start()).toBe('2026-11-02')
    expect(days()).toBe(15)
    fireEvent.click(screen.getByRole('button', { name: '全部' }))
    expect(start()).toBe('1976-01-02')
    expect(days()).toBe(points.length)
  })
})

describe('每日时间线：绘制', () => {
  it('色带按连续相同档位合并成区段，而不是每天一个矩形', () => {
    const { chart } = setup()
    const range = { start: indexAtOrBefore(points, '2023-11-20'), end: lastIndex }
    const expectedFinal = segmentsInRange(mergeRuns(points, point => point.final), range).length
    const expectedRegime = segmentsInRange(mergeRuns(points, point => point.regime), range).length
    expect(chart.querySelectorAll('rect[data-band="final"]').length).toBe(expectedFinal)
    expect(chart.querySelectorAll('rect[data-band="regime"]').length).toBe(expectedRegime)
    expect(expectedFinal).toBeLessThan(range.end - range.start)
  })

  it('全部视图按像素抽稀价格线；近 2 年及更短逐日绘制', () => {
    const { chart, days } = setup()
    fireEvent.click(screen.getByRole('button', { name: '全部' }))
    const all = Number(chart.getAttribute('data-line-points'))
    expect(all).toBeLessThanOrEqual(plotWidth * 2 + 2)
    expect(all).toBeLessThan(points.length / 5)
    fireEvent.click(screen.getByRole('button', { name: '近 2 年' }))
    expect(Number(chart.getAttribute('data-line-points'))).toBe(days())
    fireEvent.click(screen.getByRole('button', { name: '近 3 个月' }))
    expect(Number(chart.getAttribute('data-line-points'))).toBe(days())
  })

  it('色带上用小三角标出档位变化日，最近一次加重', () => {
    const { chart } = setup()
    const ticks = chart.querySelectorAll('.mp-timeline__change-tick')
    expect(ticks.length).toBeGreaterThan(0)
    expect(chart.querySelectorAll('.mp-timeline__change-tick.is-latest[data-change-layer="final"]').length).toBe(1)
  })
})

describe('每日时间线：悬浮读数', () => {
  it('精确到日：日期、收盘、两个档位、月中预估、衰退期', () => {
    const { chart } = setup()
    const tip = hoverDate(chart, '2026-11-20')
    expect(tip.querySelector('strong')?.textContent).toBe('2026-11-20')
    const last = points[lastIndex]
    expect(tip.textContent).toContain('收盘')
    expect(tip.textContent).toContain(last.spx.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
    expect(tip.textContent).toContain('周期档位')
    expect(tip.textContent).toContain('最终档位')
    expect(tip.textContent).toContain('月中预估')
    expect(tip.textContent).toContain('衰退期否')
  })

  it('月末最后一个交易日显示「月末正式定档」', () => {
    const { chart } = setup()
    const tip = hoverDate(chart, '2026-10-30')
    expect(tip.querySelector('strong')?.textContent).toBe('2026-10-30')
    expect(tip.textContent).toContain('月末正式定档')
  })

  it('变化日显示变化原因', () => {
    const { chart } = setup()
    const change = dailyFixture.changes.filter(item => item.layer === 'final').at(-1)!
    const tip = hoverDate(chart, change.d)
    expect(tip.querySelector('strong')?.textContent).toBe(change.d)
    const box = screen.getByTestId('mp-timeline-tooltip-change')
    expect(box.textContent).toContain('最终档位：')
    expect(box.textContent).toContain(change.reason)
  })

  it('衰退期内显示「是」', () => {
    const { chart } = setup()
    fireEvent.change(screen.getByLabelText('衰退前后区间'), { target: { value: '2020-02-03_2020-04-30' } })
    const tip = hoverDate(chart, '2020-03-16')
    expect(tip.querySelector('strong')?.textContent).toBe('2020-03-16')
    expect(tip.textContent).toContain('衰退期是')
  })
})

describe('每日时间线：键盘与日期输入', () => {
  it('← → 一天，Shift 一个月，Alt 一年，+/− 缩放，0 复位到近 3 年', () => {
    const { chart, days, caption, start } = setup()
    act(() => chart.focus())
    fireEvent.keyDown(chart, { key: 'ArrowLeft' })
    expect(caption()).toBe('2026-11-19')
    fireEvent.keyDown(chart, { key: 'ArrowRight' })
    expect(caption()).toBe('2026-11-20')
    fireEvent.keyDown(chart, { key: 'ArrowLeft', shiftKey: true })
    expect(caption()).toBe('2026-10-20')
    fireEvent.keyDown(chart, { key: 'ArrowLeft', altKey: true })
    expect(caption()).toBe('2025-10-20')
    fireEvent.keyDown(chart, { key: 'ArrowRight', altKey: true })
    expect(caption()).toBe('2026-10-20')

    const before = days()
    fireEvent.keyDown(chart, { key: '+' })
    expect(days()).toBeLessThan(before)
    fireEvent.keyDown(chart, { key: '-' })
    fireEvent.keyDown(chart, { key: '-' })
    expect(days()).toBeGreaterThan(before)

    fireEvent.keyDown(chart, { key: '0' })
    expect(start()).toBe('2023-11-20')
    expect(caption()).toBe('2026-11-20')
  })

  it('日期输入限定范围；休市日显示此前最近一个交易日，并平移可见区间', () => {
    const { caption, start, end } = setup()
    const input = screen.getByLabelText('按日期查看档位') as HTMLInputElement
    expect(input.type).toBe('date')
    expect(input.min).toBe('1976-01-02')
    expect(input.max).toBe('2026-11-20')
    fireEvent.change(input, { target: { value: '2024-03-16' } })
    expect(caption()).toBe('2024-03-15')
    fireEvent.change(input, { target: { value: '2008-10-10' } })
    expect(caption()).toBe('2008-10-10')
    expect(start()).toBe('2008-10-10')
    expect(end()! > '2011-01-01').toBe(true)
    // 范围外（如输入年份时的中间状态）不跳转。
    fireEvent.change(input, { target: { value: '0002-10-10' } })
    expect(caption()).toBe('2008-10-10')
  })
})
