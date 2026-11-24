import React from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CompositeState, TierId } from '../macro-posture/composite/types'
import { compositeFixture } from '../macro-posture/composite/fixture'
import { CHART_LEFT, CHART_RIGHT } from '../macro-posture/composite/timeline/chartMath'
import { mockSvgGeometry } from '../macro-posture/composite/timeline/testUtils'
import BacktestPanel, {
  buildRadarTimeline,
  formatSharpeGapSentences,
  periodItems,
  sharpeGapSentence,
  yearSpanFromRange,
} from './BacktestPanel'
import { backtestRadarFixture, backtestSharpeGaps } from './backtest.fixture'
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

function radarRows(): RadarFile['backtest']['timeline'] {
  return Array.from({ length: MONTHS }, (_, index) => {
    const d = monthAt(index)
    const crisis = d >= '2008-10' && d <= '2009-03'
    return {
      d,
      radar: crisis ? 'defense' : TIERS[Math.floor(index / 5) % 5],
      spx: Math.round(100 * Math.pow(1.006, index) * 100) / 100,
      score: -0.2,
      dims: [0, -0.5, 0, 0, 1],
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
  const base = backtestRadarFixture()
  render(<BacktestPanel data={{ ...base, backtest: { ...base.backtest, timeline: radarRows() } }} />)
  const chart = screen.getByTestId('mp-timeline-chart') as unknown as SVGSVGElement
  return { chart }
}

const width = 640
const plotWidth = width - CHART_LEFT - CHART_RIGHT

function hoverIndex(chart: SVGSVGElement, index: number, range: { start: number; end: number }): HTMLElement {
  mockSvgGeometry(chart, { left: 20, top: 100, width: width * 2, height: 380 }, { width, height: 380 })
  const svgX = CHART_LEFT + ((index - range.start) / (range.end - range.start)) * plotWidth
  fireEvent.pointerMove(chart, { clientX: 20 + width / 2 + svgX, clientY: 220, pointerType: 'mouse', pointerId: 1 })
  flushFrames()
  return screen.getByTestId('mp-timeline-tooltip')
}

function tipRows(tip: HTMLElement): Record<string, string> {
  return Object.fromEntries([...tip.querySelectorAll('dl > div')].map(row => [
    row.querySelector('dt')?.textContent ?? '',
    row.querySelector('dd')?.textContent ?? '',
  ]))
}

describe('buildRadarTimeline', () => {
  it('按月份合并衰退标记：雷达在上带、下带为空', () => {
    const { points, hasRecession } = buildRadarTimeline(
      [
        { d: '2008-09', radar: 'neutral', spx: 1200, score: 0, dims: [] },
        { d: '2008-10', radar: 'defense', spx: 950, score: -1, dims: [] },
        { d: '2026-11', radar: null, spx: 7600, score: null, dims: [] },
      ],
      [{ d: '2008-09', rec: 1 }, { d: '2008-10', rec: 1 }],
    )
    expect(hasRecession).toBe(true)
    expect(points).toEqual([
      { d: '2008-09', spx: 1200, final: 'neutral', regime: null, rec: 1 },
      { d: '2008-10', spx: 950, final: 'defense', regime: null, rec: 1 },
      { d: '2026-11', spx: 7600, final: null, regime: null, rec: 0 },
    ])
  })

  it('宏观攻守时间线缺失或月份对不上：不画衰退', () => {
    const rowsIn = [{ d: '2008-10', radar: 'defense' as const, spx: 950, score: -1, dims: [0] }]
    expect(buildRadarTimeline(rowsIn, null)).toEqual({ points: [{ d: '2008-10', spx: 950, final: 'defense', regime: null, rec: 0 }], hasRecession: false })
    expect(buildRadarTimeline(rowsIn, undefined).hasRecession).toBe(false)
    expect(buildRadarTimeline(rowsIn, [{ d: '1990-01', rec: 1 }]).hasRecession).toBe(false)
  })
})

describe('sharpeGapSentence', () => {
  it('区间包含 0：写差异在抽样误差内', () => {
    const gap = backtestSharpeGaps()[0]
    const text = sharpeGapSentence(gap)
    expect(text).toContain('包含 0')
    expect(text).toContain('差异在抽样误差内')
    expect(text).not.toContain('高于')
    expect(text).not.toContain('低于')
  })

  it('区间不含 0：写高于或低于', () => {
    const gap = backtestSharpeGaps()[2]
    const text = sharpeGapSentence(gap)
    expect(text).toContain('不含 0')
    expect(text).toContain('高于')
    expect(text).not.toContain('差异在抽样误差内')
  })

  it('差值与区间相同的对照合并成一句', () => {
    const sentences = formatSharpeGapSentences(backtestSharpeGaps())
    expect(sentences).toHaveLength(2)
    expect(sentences[0]).toContain('恒定七成股票、全程持有标普（两者夏普按构造相同）')
    expect(sentences[0]).toContain('差异在抽样误差内')
    expect(sentences[1]).toContain('10 个月均线')
    expect(sentences[1]).toContain('高于')
  })
})

describe('时段标签', () => {
  it('从 trainRange / testRange 抽出年份', () => {
    expect(yearSpanFromRange('1973-01–1999-12')).toBe('1973–1999')
    expect(yearSpanFromRange('2000-01–2026-10')).toBe('2000–2026')
    expect(periodItems('1973-01–1999-12', '2000-01–2026-10').map(i => i.label)).toEqual([
      '验证期 2000–2026',
      '训练期 1973–1999',
      '全样本',
    ])
  })
})

describe('回测结论与时段表', () => {
  it('有 verdict 时渲染结论段；默认验证期；雷达行高亮', () => {
    mockedComposite.mockReturnValue({ status: 'loading' })
    render(<BacktestPanel data={backtestRadarFixture()} />)
    expect(screen.getByTestId('mr-backtest-verdict').textContent).toContain('雷达全样本夏普')
    expect(screen.getByRole('button', { name: /验证期/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /验证期/ }).textContent).toMatch(/2000/)
    expect(screen.getByRole('button', { name: /训练期/ }).textContent).toMatch(/1995|1973/)
    const table = screen.getByTestId('mr-backtest-table')
    expect(table.querySelectorAll('tbody tr')).toHaveLength(4)
    expect(table.textContent).toContain('年化')
    expect(table.textContent).toContain('波动')
    expect(table.textContent).toContain('最大回撤')
    expect(table.textContent).toContain('夏普')
    expect(table.textContent).toContain('平均仓位')
    expect(table.textContent).toContain('年均调仓次数')
    expect(table.querySelector('tr[data-row="radar"]')?.classList.contains('is-highlight')).toBe(true)
    // 默认验证期：雷达年化 7.8%
    expect(within(table.querySelector('tr[data-row="radar"]') as HTMLElement).getAllByRole('cell')[0].textContent).toMatch(/7\.8%/)
  })

  it('时段切换改变表格数字', () => {
    mockedComposite.mockReturnValue({ status: 'loading' })
    render(<BacktestPanel data={backtestRadarFixture()} />)
    const row = () => screen.getByTestId('mr-backtest-table').querySelector('tr[data-row="radar"]') as HTMLElement
    expect(within(row()).getAllByRole('cell')[0].textContent).toMatch(/7\.8%/)
    fireEvent.click(screen.getByRole('button', { name: /训练期/ }))
    expect(within(row()).getAllByRole('cell')[0].textContent).toMatch(/10\.5%/)
    fireEvent.click(screen.getByRole('button', { name: '全样本' }))
    expect(within(row()).getAllByRole('cell')[0].textContent).toMatch(/9\.2%/)
  })

  it('无 verdict 时不渲染结论段', () => {
    mockedComposite.mockReturnValue({ status: 'loading' })
    const base = backtestRadarFixture()
    const { verdict: _omit, ...rest } = base.backtest
    render(<BacktestPanel data={{ ...base, backtest: { ...rest } }} />)
    expect(screen.queryByTestId('mr-backtest-verdict')).toBeNull()
  })

  it('稳健性小表与夏普差说明', () => {
    mockedComposite.mockReturnValue({ status: 'loading' })
    render(<BacktestPanel data={backtestRadarFixture()} />)
    expect(screen.getByTestId('mr-bt-robust-note').textContent).toContain('用月末收盘价代替月均价')
    expect(screen.getByTestId('mr-bt-robust').textContent).toContain('月均价')
    expect(screen.getByTestId('mr-bt-robust').textContent).toContain('月末收盘')
    const gaps = screen.getByTestId('mr-sharpe-gaps')
    expect(gaps.textContent).toContain('两者夏普按构造相同')
    expect(gaps.textContent).toContain('差异在抽样误差内')
    expect(gaps.textContent).toContain('高于')
    expect(gaps.querySelectorAll('p')).toHaveLength(2)
  })

  it('披露默认收起，标题含条数', () => {
    mockedComposite.mockReturnValue({ status: 'loading' })
    render(<BacktestPanel data={backtestRadarFixture()} />)
    const details = screen.getByTestId('mr-disclosures')
    expect(details).toBeInstanceOf(HTMLDetailsElement)
    expect((details as HTMLDetailsElement).open).toBe(false)
    expect(details.querySelector('summary')?.textContent).toMatch(/方法与披露（4 条）/)
  })
})

describe('雷达月度档位时间线（单带）', () => {
  it('默认近 10 年，只画雷达一条带', () => {
    const { chart } = renderPanel(macroTimeline())
    expect(chart.getAttribute('data-visible-months')).toBe('120')
    expect(chart.getAttribute('data-visible-start')).toBe('2016-11')
    const timeline = screen.getByTestId('mr-radar-timeline')
    expect(within(timeline).getByRole('button', { name: '近 10 年' }).getAttribute('aria-pressed')).toBe('true')
    expect([...chart.querySelectorAll('.mp-timeline__band-label')].map(node => node.textContent)).toEqual(['雷达档位'])
    expect(chart.querySelectorAll('[data-band="regime"]').length).toBe(0)
    expect(document.querySelector('.mp-timeline__legend-note')?.textContent).toContain('雷达档位')
    expect(screen.getByText('灰色阴影为美国官方认定的衰退期（NBER）')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: '雷达月度档位' })).toBeTruthy()
  })

  it('切到全部后悬停 2008-10：月均价、雷达、衰退期；无下带', () => {
    const { chart } = renderPanel(macroTimeline())
    fireEvent.click(within(screen.getByTestId('mr-radar-timeline')).getByRole('button', { name: '全部' }))
    expect(chart.getAttribute('data-visible-months')).toBe(String(MONTHS))
    expect(chart.querySelectorAll('.mp-timeline__recession').length).toBe(1)
    const tip = hoverIndex(chart, 429, { start: 0, end: MONTHS - 1 })
    expect(tip.querySelector('strong')?.textContent).toBe('2008-10')
    expect(tipRows(tip)).toEqual({
      月均价: (Math.round(100 * Math.pow(1.006, 429) * 100) / 100).toLocaleString('zh-CN'),
      雷达档位: '防守',
      衰退期: '是',
    })
  })

  it('宏观攻守读取失败：不画衰退阴影与图例，悬停没有衰退行，不报错', () => {
    const { chart } = renderPanel({ status: 'error', message: 'HTTP 404' })
    expect(screen.queryByText('灰色阴影为美国官方认定的衰退期（NBER）')).toBeNull()
    expect(screen.queryByLabelText('衰退前后区间')).toBeNull()
    fireEvent.click(within(screen.getByTestId('mr-radar-timeline')).getByRole('button', { name: '全部' }))
    expect(chart.querySelectorAll('.mp-timeline__recession').length).toBe(0)
    const tip = hoverIndex(chart, 429, { start: 0, end: MONTHS - 1 })
    expect(Object.keys(tipRows(tip))).toEqual(['月均价', '雷达档位'])
  })

  it('宏观攻守加载中同样降级', () => {
    renderPanel({ status: 'loading' })
    expect(screen.queryByLabelText('衰退前后区间')).toBeNull()
    expect(screen.getByTestId('mr-radar-timeline')).toBeTruthy()
  })
})
