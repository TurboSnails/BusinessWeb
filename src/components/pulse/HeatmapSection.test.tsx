import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HeatmapSection from './HeatmapSection'

vi.mock('./TradingViewHeatmap', () => ({ default: ({ dataSource }: { dataSource: string }) => <div data-testid={`tv-${dataSource}`} /> }))
vi.mock('./ChinaHeatmap', () => ({ default: () => <div data-testid="china" /> }))

beforeEach(() => { localStorage.clear(); Object.defineProperty(window, 'innerWidth', { value: 1400, configurable: true }) })
afterEach(() => { cleanup(); localStorage.clear() })

describe('市场热力图布局', () => {
  it('宽屏默认并排展示全部 4 张图，每张图的容器有确定高度', () => {
    render(<HeatmapSection />)
    for (const id of ['tv-SPX500', 'tv-NASDAQ100', 'tv-HSCEI', 'china']) expect(screen.getByTestId(id)).toBeTruthy()
    const body = screen.getByTestId('tv-SPX500').parentElement as HTMLElement
    expect(body.style.height).toBe('420px') // widget 用 height:100%，父级必须有确定高度，否则会塌成一条
    expect(screen.getByRole('button', { name: '全屏查看 标普500' })).toBeTruthy()
  })

  it('窄屏默认标签页；切换布局会记住选择', () => {
    Object.defineProperty(window, 'innerWidth', { value: 600, configurable: true })
    render(<HeatmapSection />)
    expect(screen.getByRole('button', { name: '标签页' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByTestId('tv-NASDAQ100')).toBeNull() // 懒加载：没点过的 tab 不挂载
    fireEvent.click(screen.getByRole('button', { name: /纳斯达克100/ }))
    expect(screen.getByTestId('tv-NASDAQ100')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '并排' }))
    expect(localStorage.getItem('pulse_heatmap_layout')).toBe('grid')
    expect(screen.getByTestId('china')).toBeTruthy()
  })
})
