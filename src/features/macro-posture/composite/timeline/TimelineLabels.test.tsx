import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TimelineView from './TimelineView'
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

const width = 640
const plotWidth = width - CHART_LEFT - CHART_RIGHT

function hoverLast(chart: SVGSVGElement): HTMLElement {
  mockSvgGeometry(chart, { left: 0, top: 0, width, height: 380 }, { width, height: 380 })
  fireEvent.pointerMove(chart, { clientX: CHART_LEFT + plotWidth, clientY: 120, pointerType: 'mouse', pointerId: 1 })
  flushFrames()
  return screen.getByTestId('mp-timeline-tooltip')
}

describe('时间线文案（labels）', () => {
  it('不传 labels 时保持宏观攻守的默认文案', () => {
    render(<TimelineView mode="month" points={makeTimeline()} />)
    const chart = screen.getByTestId('mp-timeline-chart')
    expect(chart.querySelector('title')?.textContent).toBe('标普月均价对数走势、最终档位与周期档位')
    expect([...chart.querySelectorAll('.mp-timeline__band-label')].map(node => node.textContent)).toEqual(['最终档位', '周期档位'])
    expect(document.querySelector('.mp-timeline__legend-note')?.textContent).toBe('上带「最终档位」含战术修正与修复确认；下带「周期档位」只看经济周期')
    expect(screen.getByText('灰色阴影为美国官方认定的衰退期（NBER）')).toBeTruthy()
    expect(screen.getByLabelText('衰退前后区间')).toBeTruthy()
    const caption = document.querySelector('.mp-timeline__caption')?.textContent
    expect(caption).toBe('2026-10 · 月均价 4,739.12 · 最终档位 中性 · 周期档位 偏防守 · 非衰退期')
    const tip = hoverLast(chart as unknown as SVGSVGElement)
    expect([...tip.querySelectorAll('dt')].map(node => node.textContent)).toEqual(['月均价', '最终档位', '周期档位', '衰退期'])
  })

  it('自定义 labels、默认区间与追加行生效', () => {
    render(
      <TimelineView
        mode="month"
        points={makeTimeline()}
        defaultPreset="近 10 年"
        labels={{
          title: '自定义标题',
          top: '上带甲',
          bottom: '下带乙',
          tooltipTop: '甲档位',
          tooltipBottom: '乙档位',
          legendNote: '自定义说明',
        }}
        details={point => [{ label: '附加', value: point.d, caption: `附加 ${point.d}` }]}
      />,
    )
    const chart = screen.getByTestId('mp-timeline-chart')
    expect(chart.getAttribute('data-visible-months')).toBe('120')
    expect(screen.getByRole('button', { name: '近 10 年' }).getAttribute('aria-pressed')).toBe('true')
    expect(chart.querySelector('title')?.textContent).toBe('自定义标题')
    expect([...chart.querySelectorAll('.mp-timeline__band-label')].map(node => node.textContent)).toEqual(['上带甲', '下带乙'])
    expect(document.querySelector('.mp-timeline__legend-note')?.textContent).toBe('自定义说明')
    expect(screen.queryByText('最终档位')).toBeNull()
    const caption = document.querySelector('.mp-timeline__caption')?.textContent ?? ''
    expect(caption).toBe('2026-10 · 月均价 4,739.12 · 甲档位 中性 · 乙档位 偏防守 · 附加 2026-10 · 非衰退期')
    const tip = hoverLast(chart as unknown as SVGSVGElement)
    expect([...tip.querySelectorAll('dt')].map(node => node.textContent)).toEqual(['月均价', '甲档位', '乙档位', '附加', '衰退期'])
  })

  it('recession 为 null：不画衰退图例、衰退选择与衰退行', () => {
    render(<TimelineView mode="month" points={makeTimeline(646, [])} labels={{ recession: null }} />)
    expect(screen.queryByText('灰色阴影为美国官方认定的衰退期（NBER）')).toBeNull()
    expect(screen.queryByLabelText('衰退前后区间')).toBeNull()
    expect(document.querySelector('.mp-timeline__caption')?.textContent).not.toContain('衰退')
    const tip = hoverLast(screen.getByTestId('mp-timeline-chart') as unknown as SVGSVGElement)
    expect(tip.textContent).not.toContain('衰退')
  })
})
