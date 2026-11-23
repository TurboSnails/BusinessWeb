import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CompositeState, TierId } from '../macro-posture/composite/types'
import { compositeFixture } from '../macro-posture/composite/fixture'
import { CHART_LEFT, CHART_RIGHT } from '../macro-posture/composite/timeline/chartMath'
import { mockSvgGeometry } from '../macro-posture/composite/timeline/testUtils'
import BacktestPanel, { agreementRows, buildRadarTimeline } from './BacktestPanel'
import { radarFixture } from './fixture'
import type { RadarFile } from './types'

vi.mock('../macro-posture/composite/load', () => ({
  useCompositePosture: vi.fn(),
}))

import { useCompositePosture } from '../macro-posture/composite/load'

const mockedComposite = vi.mocked(useCompositePosture)
const TIERS: TierId[] = ['offense', 'lean-offense', 'neutral', 'lean-defense', 'defense']
const MONTHS = 646 // 1973-01 … 2026-10

function monthAt(index: number): string {
  return `${1973 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

/** 雷达与大师每 5 个月轮换一档；2008-10 起的 6 个月两者都是防守（一致），其余多数月份不一致。 */
function radarRows(): RadarFile['backtest']['timeline'] {
  return Array.from({ length: MONTHS }, (_, index) => {
    const d = monthAt(index)
    const crisis = d >= '2008-10' && d <= '2009-03'
    return {
      d,
      radar: crisis ? 'defense' : TIERS[Math.floor(index / 5) % 5],
      masters: crisis ? 'defense' : TIERS[(Math.floor(index / 5) + 2) % 5],
      spx: Math.round(100 * Math.pow(1.006, index) * 100) / 100,
    }
  })
}

function macroTimeline(): CompositeState & { status: 'ready' } {
  const base = compositeFixture()
  return {
    status: 'ready',
    data: {
      ...base,
      backtest: {
        ...base.backtest,
        timeline: Array.from({ length: MONTHS }, (_, index) => {
          const d = monthAt(index)
          return { d, regime: 'neutral', final: 'neutral', spx: 100, rec: d >= '2008-01' && d <= '2009-06' ? 1 : 0 }
        }),
      },
    },
  }
}

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
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

function renderPanel(composite: CompositeState) {
  mockedComposite.mockReturnValue(composite)
  const base = radarFixture()
  render(<BacktestPanel data={{ ...base, backtest: { ...base.backtest, timeline: radarRows() } }} />)
  const chart = screen.getByTestId('mp-timeline-chart') as unknown as SVGSVGElement
  return { chart }
}

const width = 640
const plotWidth = width - CHART_LEFT - CHART_RIGHT

function hoverIndex(chart: SVGSVGElement, index: number, range: { start: number; end: number }): HTMLElement {
  // 外框比 viewBox 宽两倍、高度相同：内容按高度缩放后水平居中，验证 getScreenCTM 换算。
  mockSvgGeometry(chart, { left: 20, top: 100, width: width * 2, height: 380 }, { width, height: 380 })
  const svgX = CHART_LEFT + ((index - range.start) / (range.end - range.start)) * plotWidth
  fireEvent.pointerMove(chart, { clientX: 20 + width / 2 + svgX, clientY: 220, pointerType: 'mouse', pointerId: 1 })
  flushFrames()
  return screen.getByTestId('mp-timeline-tooltip')
}

function rows(tip: HTMLElement): Record<string, string> {
  return Object.fromEntries([...tip.querySelectorAll('dl > div')].map(row => [
    row.querySelector('dt')?.textContent ?? '',
    row.querySelector('dd')?.textContent ?? '',
  ]))
}

describe('buildRadarTimeline / agreementRows', () => {
  it('按月份合并衰退标记：雷达在上带、大师在下带', () => {
    const { points, hasRecession } = buildRadarTimeline(
      [
        { d: '2008-09', radar: 'neutral', masters: 'defense', spx: 1200 },
        { d: '2008-10', radar: 'defense', masters: 'defense', spx: 950 },
        { d: '2026-11', radar: null, masters: 'neutral', spx: 7600 },
      ],
      [{ d: '2008-09', rec: 1 }, { d: '2008-10', rec: 1 }],
    )
    expect(hasRecession).toBe(true)
    expect(points).toEqual([
      { d: '2008-09', spx: 1200, final: 'neutral', regime: 'defense', rec: 1 },
      { d: '2008-10', spx: 950, final: 'defense', regime: 'defense', rec: 1 },
      { d: '2026-11', spx: 7600, final: null, regime: 'neutral', rec: 0 },
    ])
  })

  it('宏观攻守时间线缺失或月份对不上：不画衰退', () => {
    const rowsIn = [{ d: '2008-10', radar: 'defense' as const, masters: 'defense' as const, spx: 950 }]
    expect(buildRadarTimeline(rowsIn, null)).toEqual({ points: [{ d: '2008-10', spx: 950, final: 'defense', regime: 'defense', rec: 0 }], hasRecession: false })
    expect(buildRadarTimeline(rowsIn, undefined).hasRecession).toBe(false)
    expect(buildRadarTimeline(rowsIn, [{ d: '1990-01', rec: 1 }]).hasRecession).toBe(false)
  })

  it('一致 / 不一致（说明偏向与档数）/ 无法比较', () => {
    const pairs = (rows: ReturnType<typeof agreementRows>) => rows.map(row => [row.label, row.value])
    expect(pairs(agreementRows({ final: 'defense', regime: 'defense' }))).toEqual([['是否一致', '一致']])
    expect(pairs(agreementRows({ final: 'lean-defense', regime: 'lean-offense' }))).toEqual([['是否一致', '不一致'], ['差几档', '雷达偏防守 2 档']])
    expect(pairs(agreementRows({ final: 'offense', regime: 'neutral' }))).toEqual([['是否一致', '不一致'], ['差几档', '雷达偏进攻 2 档']])
    expect(pairs(agreementRows({ final: null, regime: 'neutral' }))).toEqual([['是否一致', '无法比较']])
    expect(agreementRows({ final: null, regime: 'neutral' })[0].caption).toBe('雷达与大师方案无法比较（有一方证据不足）')
  })
})

describe('雷达月度档位时间线', () => {
  it('默认近 10 年，带名与图例为雷达 / 大师方案', () => {
    const { chart } = renderPanel(macroTimeline())
    expect(chart.getAttribute('data-visible-months')).toBe('120')
    expect(chart.getAttribute('data-visible-start')).toBe('2016-11')
    expect(screen.getByRole('button', { name: '近 10 年' }).getAttribute('aria-pressed')).toBe('true')
    expect([...chart.querySelectorAll('.mp-timeline__band-label')].map(node => node.textContent)).toEqual(['雷达档位', '大师档位'])
    expect(document.querySelector('.mp-timeline__legend-note')?.textContent).toContain('下带「大师方案档位」')
    expect(screen.getByText('灰色阴影为美国官方认定的衰退期（NBER）')).toBeTruthy()
    expect(chart.querySelectorAll('.mp-timeline__recession').length).toBe(0)
  })

  it('切到全部后悬停 2008-10：月均价、雷达、大师、一致、衰退期', () => {
    const { chart } = renderPanel(macroTimeline())
    fireEvent.click(screen.getByRole('button', { name: '全部' }))
    expect(chart.getAttribute('data-visible-months')).toBe(String(MONTHS))
    expect(chart.querySelectorAll('.mp-timeline__recession').length).toBe(1)
    const tip = hoverIndex(chart, 429, { start: 0, end: MONTHS - 1 })
    expect(tip.querySelector('strong')?.textContent).toBe('2008-10')
    expect(rows(tip)).toEqual({
      月均价: (Math.round(100 * Math.pow(1.006, 429) * 100) / 100).toLocaleString('zh-CN'),
      雷达档位: '防守',
      大师方案档位: '防守',
      是否一致: '一致',
      衰退期: '是',
    })
  })

  it('悬停最新月：不一致时说明偏向；读数同步', () => {
    const { chart } = renderPanel(macroTimeline())
    const tip = hoverIndex(chart, MONTHS - 1, { start: MONTHS - 120, end: MONTHS - 1 })
    expect(tip.querySelector('strong')?.textContent).toBe('2026-10')
    // 645 → 第 129 组：雷达 TIERS[4]=防守，大师 TIERS[1]=偏进攻
    expect(rows(tip)).toMatchObject({ 雷达档位: '防守', 大师方案档位: '偏进攻', 是否一致: '不一致', 差几档: '雷达偏防守 3 档', 衰退期: '否' })
    expect(document.querySelector('.mp-timeline__caption')?.textContent).toContain('雷达与大师方案不一致（雷达偏防守 3 档）')
  })

  it('拖动平移可见区间', () => {
    const { chart } = renderPanel(macroTimeline())
    mockSvgGeometry(chart, { left: 0, top: 0, width, height: 380 }, { width, height: 380 })
    fireEvent.pointerDown(chart, { clientX: 300, clientY: 100, pointerType: 'mouse', pointerId: 3, button: 0 })
    fireEvent.pointerMove(chart, { clientX: 300 + plotWidth / 2, clientY: 100, pointerType: 'mouse', pointerId: 3 })
    flushFrames()
    fireEvent.pointerUp(chart, { clientX: 300 + plotWidth / 2, clientY: 100, pointerType: 'mouse', pointerId: 3 })
    expect(chart.getAttribute('data-visible-end')).not.toBe('2026-10')
    expect(chart.getAttribute('data-visible-months')).toBe('120')
  })

  it('宏观攻守读取失败：不画衰退阴影与图例，悬停没有衰退行，不报错', () => {
    const { chart } = renderPanel({ status: 'error', message: 'HTTP 404' })
    expect(screen.queryByText('灰色阴影为美国官方认定的衰退期（NBER）')).toBeNull()
    expect(screen.queryByLabelText('衰退前后区间')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '全部' }))
    expect(chart.querySelectorAll('.mp-timeline__recession').length).toBe(0)
    const tip = hoverIndex(chart, 429, { start: 0, end: MONTHS - 1 })
    expect(Object.keys(rows(tip))).toEqual(['月均价', '雷达档位', '大师方案档位', '是否一致'])
  })

  it('宏观攻守加载中同样降级', () => {
    renderPanel({ status: 'loading' })
    expect(screen.queryByLabelText('衰退前后区间')).toBeNull()
    expect(screen.getByTestId('mr-dual-timeline')).toBeTruthy()
  })
})
