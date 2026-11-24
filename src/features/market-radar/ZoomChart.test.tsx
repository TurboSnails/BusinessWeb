import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { mockSvgGeometry } from '../macro-posture/composite/timeline/testUtils'
import MiniSparkline from './MiniSparkline'
import { dateTicks, formatPrice, logTicks, niceTicks, rightAxisNote, tickLabel, unitOf } from './ZoomChart'

afterEach(cleanup)

// 101 个月末观测：2000-01 起，数值等于下标
const HISTORY: [string, number][] = Array.from({ length: 101 }, (_, i) => {
  const year = 2000 + Math.floor(i / 12)
  const month = String((i % 12) + 1).padStart(2, '0')
  return [`${year}-${month}-28`, i]
})

function openZoom() {
  render(<MiniSparkline history={HISTORY} label="测试指标" display="读数为 100.00 倍" />)
  const spark = screen.getByTestId('mr-sparkline').querySelector('svg') as SVGSVGElement
  fireEvent.doubleClick(spark)
  const svg = screen.getByTestId('mr-zoom-svg') as unknown as SVGSVGElement
  // viewBox 720×320 原样铺满，客户端坐标等于 viewBox 坐标
  mockSvgGeometry(svg, { left: 0, top: 0, width: 720, height: 320 }, { width: 720, height: 320 })
  const range = () => svg.getAttribute('data-range')
  return { svg, range }
}

describe('刻度', () => {
  it('纵轴取整齐步长', () => {
    expect(niceTicks(0, 100)).toEqual([0, 25, 50, 75, 100])
    expect(niceTicks(16.4, 111.5)).toEqual([25, 50, 75, 100])
    expect(niceTicks(-6.1, 3.2)).toEqual([-5, -2.5, 0, 2.5])
    expect(niceTicks(5, 5)).toEqual([5])
  })

  it('刻度只写数字，单位从读数里取出', () => {
    expect(tickLabel(-2.5)).toBe('−2.5')
    expect(tickLabel(0.1 + 0.2)).toBe('0.3')
    expect(unitOf('−0.88 个百分点')).toBe('个百分点')
    expect(unitOf('40.82%')).toBe('%')
    expect(unitOf('84.63')).toBe('')
  })

  it('横轴按跨度选年份，长跨度取整齐的年份倍数', () => {
    const dates = HISTORY.map(([d]) => d)
    const ticks = dateTicks(dates, { start: 0, end: 100 })
    // 8 个年份边界超过 7 个上限，改为每 2 年一个，取偶数年
    expect(ticks.map(t => t.label)).toEqual(['2002', '2004', '2006', '2008'])
    const months = dateTicks(dates, { start: 0, end: 6 })
    expect(months[0].label).toBe('2000-02')
  })
})

describe('迷你图放大弹框', () => {
  it('双击迷你图或点「放大」打开，Esc 关闭', () => {
    render(<MiniSparkline history={HISTORY} label="测试指标" display="读数为 100.00 倍" />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '放大查看测试指标' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByTestId('mr-zoom-span').textContent).toBe('2000-01-28 → 2008-05-28')
    expect(screen.getByRole('dialog').textContent).toContain('单位：倍')
    // 挂在 body 上，不在迷你图的 figure 里
    expect(screen.getByTestId('mr-sparkline').contains(screen.getByRole('dialog'))).toBe(false)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('滚轮以指针位置为中心缩放，向下滚动缩小回全部', () => {
    const { svg, range } = openZoom()
    expect(range()).toBe('0-100')
    // 指针在绘图区正中（LEFT 56 + 648 / 2 = 380）
    fireEvent.wheel(svg, { deltaY: -200, clientX: 380 })
    const [start, end] = range()!.split('-').map(Number)
    expect(end - start).toBeLessThan(100)
    expect(Math.abs((start + end) / 2 - 50)).toBeLessThanOrEqual(1)
    for (let i = 0; i < 10; i++) fireEvent.wheel(svg, { deltaY: 200, clientX: 380 })
    expect(range()).toBe('0-100')
  })

  it('左右按钮与拖动平移，「全部」复原', () => {
    const { svg, range } = openZoom()
    fireEvent.click(screen.getByRole('button', { name: '放大' }))
    fireEvent.click(screen.getByRole('button', { name: '放大' }))
    const zoomed = range()!.split('-').map(Number)
    const span = zoomed[1] - zoomed[0]
    expect(span).toBe(49)
    fireEvent.click(screen.getByRole('button', { name: '向左移动' }))
    expect(range()).toBe(`${zoomed[0] - 12}-${zoomed[1] - 12}`)
    fireEvent.click(screen.getByRole('button', { name: '向右移动' }))
    expect(range()).toBe(zoomed.join('-'))
    // 向右拖 162 像素（绘图区宽 648 的四分之一）→ 视窗左移四分之一跨度
    fireEvent.pointerDown(svg, { clientX: 300, pointerId: 1, pointerType: 'mouse', button: 0 })
    fireEvent.pointerMove(svg, { clientX: 462, pointerId: 1, pointerType: 'mouse' })
    fireEvent.pointerUp(svg, { clientX: 462, pointerId: 1, pointerType: 'mouse' })
    expect(range()).toBe(`${zoomed[0] - 12}-${zoomed[1] - 12}`)
    fireEvent.click(screen.getByRole('button', { name: '全部' }))
    expect(range()).toBe('0-100')
  })

  it('指针：悬停显示十字线与读数，方向键逐点移动', () => {
    const { svg } = openZoom()
    expect(screen.queryByTestId('mr-zoom-pointer')).toBeNull()
    // 下标 25 位于 56 + 25 / 100 × 648 = 218
    fireEvent.pointerMove(svg, { clientX: 218, pointerType: 'mouse' })
    const pointer = screen.getByTestId('mr-zoom-pointer')
    expect(pointer.querySelectorAll('line')).toHaveLength(2)
    expect(pointer.textContent).toContain('2002-02-28')
    expect(pointer.textContent).toContain('25.00 倍')
    fireEvent.keyDown(svg, { key: 'ArrowRight' })
    expect(screen.getByTestId('mr-zoom-pointer').textContent).toContain('2002-03-28')
  })
})

describe('叠加序列（金银比上的金、银价格）', () => {
  const GOLD = HISTORY.map(([d], i) => [d, 300 + i * 30] as [string, number])
  const SILVER = HISTORY.map(([d], i) => [d, 5 + i * 0.4] as [string, number])
  const OVERLAYS = [
    { id: 'gold', label: '黄金', unit: '美元/盎司', history: GOLD },
    { id: 'silver', label: '白银', unit: '美元/盎司', history: SILVER },
  ]

  it('对数刻度与价格格式', () => {
    expect(logTicks(4.6, 3900)).toEqual([10, 100, 1000])
    expect(logTicks(30, 400)).toEqual([50, 100, 200])
    expect(formatPrice(3651.4)).toBe('3,651')
    expect(formatPrice(43.147)).toBe('43.1')
    expect(formatPrice(0.9)).toBe('0.90')
    expect(rightAxisNote([{ label: '黄金', unit: '美元/盎司' }, { label: '白银', unit: '美元/盎司' }])).toBe('右轴：美元/盎司，对数')
    expect(rightAxisNote([{ label: '黄金', unit: '美元/盎司' }, { label: '白银', unit: '美元/盎司' }, { label: '标普 500', unit: '点' }]))
      .toBe('右轴对数：黄金、白银为美元/盎司，标普 500 为点')
  })

  it('放大图画出金、银两条叠加线，图例可隐藏，指针读数列出三个数', () => {
    render(<MiniSparkline history={HISTORY} label="金银比" display="读数为 100.00 倍" overlays={OVERLAYS} />)
    fireEvent.doubleClick(screen.getByTestId('mr-sparkline').querySelector('svg') as SVGSVGElement)
    const svg = screen.getByTestId('mr-zoom-svg') as unknown as SVGSVGElement
    mockSvgGeometry(svg, { left: 0, top: 0, width: 720, height: 320 }, { width: 720, height: 320 })
    expect(screen.getByTestId('mr-zoom-overlay-gold').getAttribute('d')).toMatch(/^M/)
    expect(screen.getByTestId('mr-zoom-overlay-silver').getAttribute('d')).toMatch(/^M/)
    // 默认各自缩放：每条线在可见区间内撑满绘图区高度（顶 14、底 290，留约 6% 边距），没有共用刻度，右端标注最新值
    const yRange = (id: string) => {
      const ys = [...(screen.getByTestId(`mr-zoom-overlay-${id}`).getAttribute('d') ?? '').matchAll(/[ML][\d.]+,([\d.]+)/g)].map(m => Number(m[1]))
      return [Math.min(...ys), Math.max(...ys)]
    }
    for (const id of ['gold', 'silver']) {
      const [top, bottom] = yRange(id)
      expect(top).toBeLessThan(40)
      expect(bottom).toBeGreaterThan(264)
    }
    expect(svg.querySelectorAll('.mr-zoom__rtick')).toHaveLength(0)
    expect(screen.getByTestId('mr-zoom-end-gold').textContent).toBe('3,300')
    expect(screen.getByTestId('mr-zoom-end-silver').textContent).toBe('45.0')
    expect(screen.getByTestId('mr-zoom-legend').textContent).toContain('各自缩放（对数）')
    // 放大到后半段仍撑满高度，不会被压平
    fireEvent.click(screen.getByRole('button', { name: '放大' }))
    fireEvent.click(screen.getByRole('button', { name: '放大' }))
    const [zoomTop, zoomBottom] = yRange('gold')
    expect(zoomBottom - zoomTop).toBeGreaterThan(220)
    fireEvent.click(screen.getByRole('button', { name: '全部' }))
    // 切换到同一对数轴：出现右轴刻度，刻度为整齐的 1、2、5 × 10^n，不带多余小数；右端标签收起
    fireEvent.click(screen.getByRole('button', { name: '各自缩放' }))
    expect(screen.getByRole('button', { name: '同一对数轴' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('mr-zoom-legend').textContent).toContain('右轴：美元/盎司，对数')
    const rightTicks = [...svg.querySelectorAll('.mr-zoom__rtick text')].map(t => t.textContent)
    expect(rightTicks.length).toBeGreaterThan(1)
    expect(rightTicks.every(t => /^[\d,]+$/.test(t ?? ''))).toBe(true)
    expect(screen.queryByTestId('mr-zoom-end-gold')).toBeNull()
    // 有右轴时绘图区宽 720 − 56 − 56 = 608；下标 50 位于 56 + 304 = 360
    fireEvent.pointerMove(svg, { clientX: 360, pointerType: 'mouse' })
    const pointer = screen.getByTestId('mr-zoom-pointer')
    expect(pointer.textContent).toContain('2004-03-28')
    expect(pointer.textContent).toContain('50.00 倍')
    expect(pointer.textContent).toContain('黄金 1,800')
    expect(pointer.textContent).toContain('白银 25.0')
    fireEvent.click(screen.getByRole('button', { name: '白银' }))
    expect(screen.getByRole('button', { name: '白银' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.queryByTestId('mr-zoom-overlay-silver')).toBeNull()
    expect(screen.getByTestId('mr-zoom-pointer').textContent).not.toContain('白银')
    // 迷你图本身只画主序列
    expect(screen.getByTestId('mr-sparkline').querySelectorAll('path')).toHaveLength(1)
  })
})
