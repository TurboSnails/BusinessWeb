import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { mockSvgGeometry } from '../macro-posture/composite/timeline/testUtils'
import LongHistoryChart, {
  LONG_H,
  LONG_PAD,
  LONG_W,
  availableRanges,
  cutByYears,
  defaultRangeId,
  extremumLabelY,
  historySpanYears,
  indexAtSvgX,
  labelAnchor,
  rangeEnabled,
} from './LongHistoryChart'

afterEach(cleanup)

function monthly(n: number, end = '2026-10-01', startValue = 10): [string, number][] {
  const endDate = new Date(end + 'T00:00:00Z')
  return Array.from({ length: n }, (_, k) => {
    const i = n - 1 - k
    const d = new Date(endDate)
    d.setUTCMonth(d.getUTCMonth() - i)
    const iso = d.toISOString().slice(0, 10)
    return [iso, startValue + k] as [string, number]
  })
}

function quarterly(n: number, end = '2026-10-01'): [string, number][] {
  const endDate = new Date(end + 'T00:00:00Z')
  return Array.from({ length: n }, (_, k) => {
    const i = n - 1 - k
    const d = new Date(endDate)
    d.setUTCMonth(d.getUTCMonth() - i * 3)
    return [d.toISOString().slice(0, 10), 50 + Math.sin(k) * 10] as [string, number]
  })
}

function daily(n: number, end = '2026-10-01'): [string, number][] {
  const endDate = new Date(end + 'T00:00:00Z')
  return Array.from({ length: n }, (_, k) => {
    const i = n - 1 - k
    const d = new Date(endDate)
    d.setUTCDate(d.getUTCDate() - i)
    return [d.toISOString().slice(0, 10), 100 + k / 10] as [string, number]
  })
}

describe('cutByYears / historySpanYears：按日期截取', () => {
  it('月频：5 年约 60 点，不是 slice(-60) 误伤季度', () => {
    const pts = monthly(240) // 20 年
    const five = cutByYears(pts, 5)
    expect(five.length).toBeGreaterThanOrEqual(58)
    expect(five.length).toBeLessThanOrEqual(62)
    expect(five[0][0] >= '2021-10-01').toBe(true)
    expect(five[five.length - 1][0]).toBe(pts[pts.length - 1][0])
  })

  it('季频：5 年约 20 点，不会误显示成 15 年', () => {
    const pts = quarterly(80) // 20 年季度
    const five = cutByYears(pts, 5)
    expect(five.length).toBeGreaterThanOrEqual(18)
    expect(five.length).toBeLessThanOrEqual(22)
    const span = historySpanYears(five)
    expect(span).toBeGreaterThan(4.5)
    expect(span).toBeLessThan(5.5)
  })

  it('日频：按日期截 1 年', () => {
    const pts = daily(800)
    const one = cutByYears(pts, 1)
    expect(historySpanYears(one)).toBeLessThan(1.05)
    expect(one.length).toBeGreaterThan(300)
  })

  it('years=null 返回全部', () => {
    const pts = monthly(30)
    expect(cutByYears(pts, null)).toBe(pts)
  })
})

describe('availableRanges / defaultRangeId', () => {
  it('历史 < 5 年只显示全部', () => {
    expect(availableRanges(4.2).map(r => r.id)).toEqual(['all'])
    expect(availableRanges(4.2)[0].label).toBe('全部')
    expect(defaultRangeId(4.2)).toBe('all')
  })

  it('5–10 年显示 5 年 / 全部（约 N 年）', () => {
    const r = availableRanges(7.4)
    expect(r.map(x => x.id)).toEqual(['5y', 'all'])
    expect(r[1].label).toMatch(/全部（约 7 年）/)
    expect(defaultRangeId(7.4)).toBe('all')
  })

  it('更长显示 5 / 10 / 20 / 全部，默认 10 年', () => {
    const r = availableRanges(25)
    expect(r.map(x => x.id)).toEqual(['5y', '10y', '20y', 'all'])
    expect(r[3].label).toMatch(/全部（约 25 年）/)
    expect(defaultRangeId(25)).toBe('10y')
  })

  it('区间内点数 < 2 时禁用', () => {
    const sparse: [string, number][] = [
      ...monthly(100, '2010-01-01'),
      ['2026-10-01', 99],
    ]
    expect(rangeEnabled(sparse, 5)).toBe(false)
    expect(rangeEnabled(sparse, null)).toBe(true)
  })
})

describe('extremumLabelY / labelAnchor', () => {
  it('标注 y 始终在 [0, H] 内；贴边时翻到另一侧', () => {
    for (const y of [0, 2, LONG_PAD.t, LONG_H / 2, LONG_H - LONG_PAD.b, LONG_H - 1, LONG_H]) {
      for (const kind of ['max', 'min'] as const) {
        const ly = extremumLabelY(y, kind)
        expect(ly).toBeGreaterThanOrEqual(0)
        expect(ly).toBeLessThanOrEqual(LONG_H)
      }
    }
    // 点几乎贴底：下方越界 → 翻到上方
    expect(extremumLabelY(LONG_H - 2, 'min')).toBeLessThan(LONG_H - 2)
    // 点几乎贴顶：上方越界 → 翻到下方
    expect(extremumLabelY(2, 'max')).toBeGreaterThan(2)
    expect(extremumLabelY(LONG_PAD.t, 'max')).toBe(LONG_PAD.t - 6)
  })

  it('左右靠边按像素切换锚点', () => {
    expect(labelAnchor(LONG_PAD.l + 10)).toBe('start')
    expect(labelAnchor(LONG_W / 2)).toBe('middle')
    expect(labelAnchor(LONG_W - LONG_PAD.r - 10)).toBe('end')
  })
})

describe('indexAtSvgX', () => {
  it('夹在首尾', () => {
    expect(indexAtSvgX(-10, 10)).toBe(0)
    expect(indexAtSvgX(LONG_W + 50, 10)).toBe(9)
    expect(indexAtSvgX(LONG_PAD.l, 10)).toBe(0)
    expect(indexAtSvgX(LONG_W - LONG_PAD.r, 10)).toBe(9)
  })
})

describe('LongHistoryChart UI', () => {
  it('默认 10 年；切换按钮按历史长度出现；纵轴有最小最大刻度', () => {
    const pts = monthly(240)
    render(<LongHistoryChart points={pts} label="测试" digits={0} />)
    expect(screen.getByRole('button', { name: '10 年', pressed: true })).toBeTruthy()
    expect(screen.getByRole('button', { name: '5 年' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '20 年' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /全部（约/ })).toBeTruthy()
    const axis = document.querySelectorAll('text.macro-long__axis')
    expect(axis.length).toBe(2)
  })

  it('季频切 5 年：跨度约 5 年（不是按点数截出的 15 年）', () => {
    const pts = quarterly(80)
    render(<LongHistoryChart points={pts} label="股权占比" />)
    fireEvent.click(screen.getByRole('button', { name: '5 年' }))
    const img = screen.getByRole('img')
    const label = img.getAttribute('aria-label') ?? ''
    // aria 含起止年：起点应在终点前约 5 年
    const startYear = Number(label.match(/(\d{4})年至今/)?.[1])
    expect(startYear).toBeGreaterThanOrEqual(2020)
    expect(startYear).toBeLessThanOrEqual(2022)
  })

  it('指针悬停：外框与 viewBox 比例不同时仍用 getScreenCTM 指到正确点', () => {
    const pts = monthly(120)
    render(<LongHistoryChart points={pts} label="悬停" digits={0} />)
    const svg = screen.getByRole('img') as unknown as SVGSVGElement
    mockSvgGeometry(svg, { left: 10, top: 50, width: 1280, height: 150 }, { width: LONG_W, height: LONG_H })
    const scale = 150 / LONG_H
    const ox = 10 + (1280 - LONG_W * scale) / 2
    const last = pts.length - 1
    // 默认 10y ≈ 全部 120 月
    const xAt = (i: number) => ox + (LONG_PAD.l + (i / last) * (LONG_W - LONG_PAD.l - LONG_PAD.r)) * scale
    fireEvent.pointerMove(svg, { clientX: xAt(0), clientY: 100, pointerType: 'mouse' })
    expect(screen.getByText(new RegExp(pts[0][0].slice(0, 7)))).toBeTruthy()
    fireEvent.pointerLeave(svg, { pointerType: 'mouse' })
  })

  it('键盘 ← → 移动读数；svg 可聚焦', () => {
    const pts = monthly(120)
    render(<LongHistoryChart points={pts} label="键盘" digits={0} />)
    const svg = screen.getByRole('img') as unknown as SVGSVGElement
    expect(svg.tabIndex).toBe(0)
    act(() => svg.focus())
    fireEvent.keyDown(svg, { key: 'ArrowLeft' })
    const live = document.querySelector('.macro-long__pct')!
    expect(live.getAttribute('aria-live')).toBe('polite')
    expect(live.textContent).toMatch(/\d{4}-\d{2}/)
  })

  it('极值标注的 y 属性在 [0, H] 内', () => {
    // 构造：最高在首点、最低在末点，贴上下边
    const pts = monthly(120).map((p, i, a) => {
      if (i === 0) return [p[0], 200] as [string, number]
      if (i === a.length - 1) return [p[0], 0] as [string, number]
      return [p[0], 100] as [string, number]
    })
    render(<LongHistoryChart points={pts} label="极值" digits={0} />)
    fireEvent.click(screen.getByRole('button', { name: /全部/ }))
    const labels = Array.from(document.querySelectorAll('text.macro-long__label'))
    expect(labels.length).toBeGreaterThanOrEqual(1)
    for (const t of labels) {
      const y = Number(t.getAttribute('y'))
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(LONG_H)
    }
  })

  it('历史不足 24 点不渲染', () => {
    const { container } = render(<LongHistoryChart points={monthly(10)} label="短" />)
    expect(container.firstChild).toBeNull()
  })
})
