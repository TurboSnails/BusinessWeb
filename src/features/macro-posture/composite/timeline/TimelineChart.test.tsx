import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TimelineChart from '../TimelineChart'
import { CHART_LEFT, CHART_RIGHT } from './chartMath'
import { makeTimeline, mockSvgGeometry } from './testUtils'

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

function setup(timeline = makeTimeline()) {
  render(<TimelineChart timeline={timeline} />)
  const chart = screen.getByTestId('mp-timeline-chart') as unknown as SVGSVGElement
  const months = () => Number(chart.getAttribute('data-visible-months'))
  const caption = () => document.querySelector('.mp-timeline__caption time')?.textContent
  return { chart, months, caption }
}

describe('TimelineChart 区间与键盘', () => {
  it('默认显示全部，并在最后一个月标出「最新」', () => {
    const { chart, months, caption } = setup()
    expect(months()).toBe(646)
    expect(caption()).toBe('2026-10')
    expect(chart.getAttribute('viewBox')).toBe('0 0 640 380')
    expect(chart.querySelector('.mp-timeline__latest')?.textContent).toBe('最新')
    expect(screen.getByText('最终档位')).toBeTruthy()
    expect(screen.getByText('周期档位')).toBeTruthy()
  })

  it('区间按钮改变可见月份数', () => {
    const { chart, months } = setup()
    fireEvent.click(screen.getByRole('button', { name: '近 5 年' }))
    expect(months()).toBe(60)
    expect(chart.getAttribute('data-visible-start')).toBe('2021-11')
    expect(screen.getByRole('button', { name: '近 5 年' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '近 2 年' }))
    expect(months()).toBe(24)
    fireEvent.click(screen.getByRole('button', { name: '近 10 年' }))
    expect(months()).toBe(120)
    fireEvent.click(screen.getByRole('button', { name: '近 30 年' }))
    expect(months()).toBe(360)
    fireEvent.click(screen.getByRole('button', { name: '全部' }))
    expect(months()).toBe(646)
  })

  it('纵轴对数刻度随可见区间重新计算', () => {
    const { chart } = setup()
    const full = chart.getAttribute('data-y-ticks')
    fireEvent.click(screen.getByRole('button', { name: '近 2 年' }))
    const recent = chart.getAttribute('data-y-ticks')
    expect(recent).not.toBe(full)
    const values = (recent ?? '').split(',').map(Number)
    // 近 2 年价格在 3,600–4,600 之间，刻度必须落在可见范围内。
    expect(values.length).toBeGreaterThanOrEqual(2)
    expect(values.every(value => value > 3000 && value < 5200)).toBe(true)
  })

  it('衰退前后下拉：起点前 24 个月到结束后 12 个月', () => {
    const { chart, months } = setup()
    fireEvent.change(screen.getByLabelText('衰退前后区间'), { target: { value: '2008-01_2009-06' } })
    expect(chart.getAttribute('data-visible-start')).toBe('2006-01')
    expect(chart.getAttribute('data-visible-end')).toBe('2010-06')
    expect(months()).toBe(54)
  })

  it('键盘移动光标、缩放、跳首尾与复位', () => {
    const { chart, months, caption } = setup()
    act(() => chart.focus())
    fireEvent.keyDown(chart, { key: 'ArrowLeft' })
    expect(caption()).toBe('2026-09')
    fireEvent.keyDown(chart, { key: 'ArrowLeft', shiftKey: true })
    expect(caption()).toBe('2025-09')
    fireEvent.keyDown(chart, { key: 'ArrowRight' })
    expect(caption()).toBe('2025-10')

    fireEvent.keyDown(chart, { key: '+' })
    const zoomedIn = months()
    expect(zoomedIn).toBeLessThan(646)
    fireEvent.keyDown(chart, { key: '+' })
    expect(months()).toBeLessThan(zoomedIn)
    fireEvent.keyDown(chart, { key: '-' })
    expect(months()).toBeGreaterThan(zoomedIn - 1 - (646 - zoomedIn))

    fireEvent.keyDown(chart, { key: 'Home' })
    expect(caption()).toBe('1973-01')
    expect(chart.getAttribute('data-visible-start')).toBe('1973-01')
    fireEvent.keyDown(chart, { key: 'End' })
    expect(caption()).toBe('2026-10')
    expect(chart.getAttribute('data-visible-end')).toBe('2026-10')

    fireEvent.keyDown(chart, { key: '0' })
    expect(months()).toBe(646)
    expect(caption()).toBe('2026-10')
  })

  it('双击复位到全部区间', () => {
    const { chart, months, caption } = setup()
    fireEvent.click(screen.getByRole('button', { name: '近 2 年' }))
    fireEvent.keyDown(chart, { key: 'ArrowLeft' })
    fireEvent.doubleClick(chart)
    expect(months()).toBe(646)
    expect(caption()).toBe('2026-10')
  })

  it('月份下拉跳到区间外的月份时自动平移可见区间', () => {
    const { chart, caption } = setup()
    fireEvent.click(screen.getByRole('button', { name: '近 2 年' }))
    fireEvent.change(screen.getByLabelText('按月份查看档位'), { target: { value: '429' } })
    expect(caption()).toBe('2008-10')
    expect(chart.getAttribute('data-visible-start')).toBe('2008-10')
  })
})

describe('TimelineChart 指针换算', () => {
  const width = 640
  const plotWidth = width - CHART_LEFT - CHART_RIGHT

  function hover(chart: SVGSVGElement, clientX: number): string | null | undefined {
    fireEvent.pointerMove(chart, { clientX, clientY: 120, pointerType: 'mouse', pointerId: 1 })
    flushFrames()
    return screen.queryByTestId('mp-timeline-tooltip')?.querySelector('strong')?.textContent
  }

  it('容器宽高比与 viewBox 不同：最左、正中、最右指到正确月份', () => {
    const { chart } = setup()
    mockSvgGeometry(chart, { left: 40, top: 300, width: 1600, height: 380 }, { width, height: 380 })
    const origin = 40 + 480
    expect(hover(chart, origin + CHART_LEFT)).toBe('1973-01')
    expect(hover(chart, origin + CHART_LEFT + plotWidth / 2)).toBe('1999-12')
    expect(hover(chart, origin + CHART_LEFT + plotWidth)).toBe('2026-10')
    expect(document.querySelector('.mp-timeline__caption time')?.textContent).toBe('2026-10')
  })

  it('缩放后按当前可见区间换算，提示卡给出档位与衰退信息', () => {
    const { chart } = setup()
    fireEvent.change(screen.getByLabelText('衰退前后区间'), { target: { value: '2008-01_2009-06' } })
    mockSvgGeometry(chart, { left: 0, top: 0, width: 1280, height: 760 }, { width, height: 380 })
    // 2006-01 … 2010-06，共 54 个月；2008-10 是第 33 个（偏移 33/53）。
    const clientX = (CHART_LEFT + (33 / 53) * plotWidth) * 2
    expect(hover(chart, clientX)).toBe('2008-10')
    const tip = screen.getByTestId('mp-timeline-tooltip')
    expect(tip.textContent).toContain('月均价')
    expect(tip.textContent).toContain('最终档位')
    expect(tip.textContent).toContain('周期档位')
    expect(tip.textContent).toContain('衰退期是')
  })

  it('按住拖动平移可见区间', () => {
    const { chart } = setup()
    fireEvent.click(screen.getByRole('button', { name: '近 5 年' }))
    mockSvgGeometry(chart, { left: 0, top: 0, width, height: 380 }, { width, height: 380 })
    fireEvent.pointerDown(chart, { clientX: 400, clientY: 100, pointerType: 'mouse', pointerId: 7, button: 0 })
    fireEvent.pointerMove(chart, { clientX: 400 + plotWidth / 2, clientY: 100, pointerType: 'mouse', pointerId: 7 })
    flushFrames()
    fireEvent.pointerUp(chart, { clientX: 400 + plotWidth / 2, clientY: 100, pointerType: 'mouse', pointerId: 7 })
    // 向右拖半个图宽 = 往前看约半个跨度（59 个月的一半，四舍五入后 29 个月）。
    expect(chart.getAttribute('data-visible-end')).toBe('2024-05')
    expect(Number(chart.getAttribute('data-visible-months'))).toBe(60)
  })
})
