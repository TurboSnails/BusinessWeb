import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { mockSvgGeometry } from '../macro-posture/composite/timeline/testUtils'
import MiniSparkline, { sparkFormatter, sparkIndexAt } from './MiniSparkline'

afterEach(cleanup)

const HISTORY: [string, number][] = [
  ['2026-06-05', 276],
  ['2026-07-03', 301],
  ['2026-08-07', 330],
  ['2026-09-04', 298],
  ['2026-10-02', 340],
  ['2026-11-19', 352],
]

function setup(history = HISTORY, display = '高收益债利差 352 个基点，近 4 周变化 +12 个基点（11 月 19 日）。') {
  render(<MiniSparkline history={history} label="高收益债利差" display={display} />)
  const svg = screen.getByTestId('mr-sparkline').querySelector('svg') as SVGSVGElement
  const readout = () => screen.getByTestId('mr-spark-readout').textContent
  return { svg, readout }
}

describe('sparkFormatter：沿用读数句子里的单位', () => {
  it('按最新观测在句子里找对应的数', () => {
    expect(sparkFormatter('联储资产……近 13 周变化 +0.57%，未达阈值', 0.5652)(0.2346)).toBe('+0.23%')
    expect(sparkFormatter('联储资产……近 13 周变化 +0.57%', 0.5652)(-0.4)).toBe('−0.40%')
    expect(sparkFormatter('高收益债利差 352 个基点，近 4 周变化 +12 个基点', 352)(276)).toBe('276 个基点')
    expect(sparkFormatter('盈利收益率 4.25%，美债 5.13%，相差 −0.88 个百分点', -0.8837)(1.6388)).toBe('1.64 个百分点')
    expect(sparkFormatter('盈利收益率 4.25%，美债 5.13%，相差 −0.88 个百分点', -0.8837)(-0.8837)).toBe('−0.88 个百分点')
    expect(sparkFormatter('市盈率为 23.55 倍（2026 年 11 月）', 23.55)(27.87)).toBe('27.87 倍')
    expect(sparkFormatter('VIX 35.89 点，三个月 VIX 30.94 点，两者之比为 1.16 倍', 1.15998)(0.8127)).toBe('0.81 倍')
    expect(sparkFormatter('40.82% 的可用行业站上各自的 10 个月均线', 40.8163)(71.4285)).toBe('71.43%')
  })

  it('没有可对应的单位：保留两位小数、负号用 −', () => {
    expect(sparkFormatter(undefined, 1)(1.23456)).toBe('1.23')
    expect(sparkFormatter('读数暂缺', 1)(-0.5)).toBe('−0.50')
    expect(sparkFormatter('市盈率为 23.55 倍', 30)(30)).toBe('30.00')
  })
})

describe('MiniSparkline 交互', () => {
  it('默认显示最新点并高亮', () => {
    const { svg, readout } = setup()
    expect(readout()).toBe('最新 2026-11-19 · 352 个基点')
    expect(svg.querySelector('.mr-spark__dot--latest')).toBeTruthy()
    expect(svg.querySelector('.mr-spark__dot--active')).toBeNull()
    expect(svg.querySelector('title')?.textContent).toContain('最新 352 个基点')
  })

  it('指针悬停：外框与 viewBox 宽高比不同，也按 getScreenCTM 指到正确的点', () => {
    const { svg, readout } = setup()
    // viewBox 220×48 放进 660×48 的盒子：按高度缩放（1 倍），水平居中留白 220。
    mockSvgGeometry(svg, { left: 10, top: 50, width: 660, height: 48 }, { width: 220, height: 48 })
    const origin = 10 + 220
    const xAt = (index: number) => origin + 5 + (index / 5) * 210
    fireEvent.pointerMove(svg, { clientX: xAt(2), clientY: 70, pointerType: 'mouse' })
    expect(readout()).toBe('2026-08-07 · 330 个基点')
    expect(svg.getAttribute('data-active-index')).toBe('2')
    expect(svg.querySelector('.mr-spark__dot--active')).toBeTruthy()
    expect(svg.querySelector('.mr-spark__cursor')).toBeTruthy()
    fireEvent.pointerMove(svg, { clientX: xAt(0) - 30, clientY: 70, pointerType: 'mouse' })
    expect(readout()).toBe('2026-06-05 · 276 个基点')
    fireEvent.pointerMove(svg, { clientX: xAt(5) + 2, clientY: 70, pointerType: 'mouse' })
    expect(readout()).toBe('2026-11-19 · 352 个基点（最新）')
    fireEvent.pointerLeave(svg, { pointerType: 'mouse' })
    expect(readout()).toBe('最新 2026-11-19 · 352 个基点')
  })

  it('触摸：轻触选点，抬手后保留读数', () => {
    const { svg, readout } = setup()
    mockSvgGeometry(svg, { left: 0, top: 0, width: 220, height: 48 }, { width: 220, height: 48 })
    fireEvent.pointerDown(svg, { clientX: 5 + (3 / 5) * 210, clientY: 20, pointerType: 'touch', button: 0 })
    expect(readout()).toBe('2026-09-04 · 298 个基点')
    fireEvent.pointerUp(svg, { pointerType: 'touch' })
    fireEvent.pointerLeave(svg, { pointerType: 'touch' })
    expect(readout()).toBe('2026-09-04 · 298 个基点')
  })

  it('键盘：← → 逐点，Home / End 跳首尾，Esc 与失焦收起', () => {
    const { svg, readout } = setup()
    act(() => svg.focus())
    fireEvent.keyDown(svg, { key: 'ArrowLeft' })
    expect(readout()).toBe('2026-11-19 · 352 个基点（最新）')
    fireEvent.keyDown(svg, { key: 'ArrowLeft' })
    expect(readout()).toBe('2026-10-02 · 340 个基点')
    fireEvent.keyDown(svg, { key: 'ArrowRight' })
    fireEvent.keyDown(svg, { key: 'ArrowRight' })
    expect(readout()).toBe('2026-11-19 · 352 个基点（最新）')
    fireEvent.keyDown(svg, { key: 'Home' })
    expect(readout()).toBe('2026-06-05 · 276 个基点')
    fireEvent.keyDown(svg, { key: 'ArrowLeft' })
    expect(readout()).toBe('2026-06-05 · 276 个基点')
    fireEvent.keyDown(svg, { key: 'End' })
    expect(svg.getAttribute('data-active-index')).toBe('5')
    fireEvent.keyDown(svg, { key: 'Escape' })
    expect(readout()).toBe('最新 2026-11-19 · 352 个基点')
    fireEvent.keyDown(svg, { key: 'Home' })
    fireEvent.blur(svg)
    expect(readout()).toBe('最新 2026-11-19 · 352 个基点')
  })

  it('没有单位信息时保留两位小数；少于两个点不画', () => {
    render(<MiniSparkline history={[['2026-01-01', 1.234], ['2026-02-01', -0.5]]} label="某指标" />)
    expect(screen.getByTestId('mr-spark-readout').textContent).toBe('最新 2026-02-01 · −0.50')
    cleanup()
    const { container } = render(<MiniSparkline history={[['2026-01-01', 1]]} label="单点" />)
    expect(container.firstChild).toBeNull()
  })

  it('sparkIndexAt 夹在首尾之间', () => {
    expect(sparkIndexAt(-50, 6)).toBe(0)
    expect(sparkIndexAt(5, 6)).toBe(0)
    expect(sparkIndexAt(110, 6)).toBe(3)
    expect(sparkIndexAt(500, 6)).toBe(5)
    expect(sparkIndexAt(100, 1)).toBe(0)
  })
})
