import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import EquityCurves, {
  placeEndLabels,
  renormalizeCurve,
  sliceCurveRange,
  yearAxisTicks,
} from './EquityCurves'
import { backtestCurves } from './backtest.fixture'

afterEach(cleanup)

const curves = backtestCurves()

describe('EquityCurves 纯函数', () => {
  it('区间切片：全部 / 2000 年以来 / 近 10 年', () => {
    expect(sliceCurveRange(curves, 'all')).toEqual({ start: 0, end: curves.length - 1 })
    const since = sliceCurveRange(curves, 'since2000')
    expect(curves[since.start].d).toBe('2000-01')
    expect(since.end).toBe(curves.length - 1)
    const y10 = sliceCurveRange(curves, 'y10')
    expect(y10.end - y10.start + 1).toBe(120)
    expect(y10.end).toBe(curves.length - 1)
  })

  it('按区间起点重新归一到 1', () => {
    const range = sliceCurveRange(curves, 'since2000')
    const series = renormalizeCurve(curves, range, 'radar')
    expect(series[0]).toBeCloseTo(1, 6)
    const base = curves[range.start].radar
    expect(series[10]).toBeCloseTo(curves[range.start + 10].radar / base, 6)
  })

  it('年份刻度 5–7 个', () => {
    const range = sliceCurveRange(curves, 'all')
    const ticks = yearAxisTicks(curves, range, 7)
    expect(ticks.length).toBeGreaterThanOrEqual(5)
    expect(ticks.length).toBeLessThanOrEqual(7)
    expect(ticks[0].label).toMatch(/^\d{4}$/)
  })

  it('末端标签错开；贴顶也能排开；放不下返回 null', () => {
    const placed = placeEndLabels(
      [
        { id: 'a', label: 'A', y: 100 },
        { id: 'b', label: 'B', y: 101 },
        { id: 'c', label: 'C', y: 102 },
      ],
      { top: 10, bottom: 200, gap: 12 },
    )
    expect(placed).not.toBeNull()
    expect(placed![1].y - placed![0].y).toBeGreaterThanOrEqual(12)
    expect(placed![2].y - placed![1].y).toBeGreaterThanOrEqual(12)

    const nearTop = placeEndLabels(
      [
        { id: 'a', label: 'A', y: 12 },
        { id: 'b', label: 'B', y: 13 },
        { id: 'c', label: 'C', y: 14 },
        { id: 'd', label: 'D', y: 15 },
      ],
      { top: 10, bottom: 200, gap: 12 },
    )
    expect(nearTop).not.toBeNull()
    expect(nearTop![0].y).toBeGreaterThanOrEqual(14)

    const cramped = placeEndLabels(
      [
        { id: 'a', label: 'A', y: 10 },
        { id: 'b', label: 'B', y: 11 },
        { id: 'c', label: 'C', y: 12 },
        { id: 'd', label: 'D', y: 13 },
      ],
      { top: 10, bottom: 40, gap: 12 },
    )
    expect(cramped).toBeNull()
  })
})

describe('EquityCurves 交互', () => {
  it('图例隐藏一条线后路径减少', () => {
    render(<EquityCurves curves={curves} />)
    const chart = screen.getByTestId('mr-eq-chart')
    expect(chart.querySelectorAll('[data-series]')).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: '按综合分持仓' }))
    expect(screen.getByRole('button', { name: '按综合分持仓' }).getAttribute('aria-pressed')).toBe('false')
    expect(chart.querySelectorAll('[data-series]')).toHaveLength(3)
    expect(chart.querySelector('[data-series="radar"]')).toBeNull()
  })

  it('区间切换后文字等价物按新起点归一', () => {
    render(<EquityCurves curves={curves} />)
    const text = screen.getByTestId('mr-eq-text')
    // 默认全部：末点相对起点归一
    const allRadar = within(text).getByTestId('mr-eq-end-radar').textContent
    fireEvent.click(screen.getByRole('button', { name: '近 10 年' }))
    const y10Radar = within(screen.getByTestId('mr-eq-text')).getByTestId('mr-eq-end-radar').textContent
    expect(y10Radar).not.toBe(allRadar)
    // 近 10 年起点归一后，末点仍是有限正数
    expect(Number(y10Radar?.replace('−', '-'))).toBeGreaterThan(0)
  })

  it('回撤视图：纵轴为回撤、路径仍在', () => {
    render(<EquityCurves curves={curves} />)
    fireEvent.click(screen.getByRole('button', { name: '回撤' }))
    expect(screen.getByRole('button', { name: '回撤' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('mr-eq-chart').getAttribute('data-mode')).toBe('drawdown')
    expect(screen.getByTestId('mr-eq-chart').querySelectorAll('[data-series]').length).toBe(4)
    expect(screen.getByTestId('mr-eq-yaxis').textContent).toMatch(/%|回撤/)
  })

  it('悬停后方向键移动读数', () => {
    render(<EquityCurves curves={curves} />)
    const chart = screen.getByTestId('mr-eq-chart')
    fireEvent.focus(chart)
    fireEvent.keyDown(chart, { key: 'ArrowLeft' })
    const tip = screen.getByTestId('mr-eq-tip')
    expect(tip.textContent).toMatch(/\d{4}-\d{2}/)
    expect(tip.textContent).toContain('按综合分持仓')
  })

  it('横轴有多个年份刻度', () => {
    render(<EquityCurves curves={curves} />)
    const labels = [...screen.getByTestId('mr-eq-xaxis').querySelectorAll('text')]
      .map(el => el.textContent)
    expect(labels.length).toBeGreaterThanOrEqual(5)
    expect(labels.every(t => /^\d{4}$/.test(t ?? ''))).toBe(true)
  })
})
