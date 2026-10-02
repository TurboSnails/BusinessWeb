import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HeatmapSection from './HeatmapSection'

vi.mock('./TradingViewHeatmap', () => ({ default: ({ dataSource }: { dataSource: string }) => <div data-testid={`tv-${dataSource}`} /> }))
vi.mock('./IndexHeatmap', () => ({ default: ({ market }: { market: string }) => <div data-testid={`index-${market}`} /> }))

beforeEach(() => { localStorage.clear(); Object.defineProperty(window, 'innerWidth', { value: 1400, configurable: true }) })
afterEach(() => { cleanup(); localStorage.clear() })

describe('市场热力图布局', () => {
  it('宽屏默认并排展示全部 5 张图，每张图的容器有确定高度', () => {
    render(<HeatmapSection />)
    for (const id of ['tv-SPX500', 'tv-NASDAQ100', 'index-hsi', 'index-hstech', 'index-csi500']) expect(screen.getByTestId(id)).toBeTruthy()
    const body = screen.getByTestId('tv-SPX500').parentElement as HTMLElement
    expect(body.style.height).toBe('440px') // widget 用 height:100%，父级必须有确定高度，否则会塌成一条
    expect(screen.getByRole('button', { name: '全屏查看 标普500' })).toBeTruthy()
    expect(screen.queryByTestId('tv-HSCEI')).toBeNull() // 恒生中国企业已换成恒生指数
    const hsi = screen.getByTestId('index-hsi').parentElement as HTMLElement
    expect(hsi.style.height).toBe('480px')
    expect((hsi.parentElement as HTMLElement).style.gridColumn).toBe('') // 恒指与恒生科技并排，不独占整行
    expect((screen.getByTestId('index-hstech').parentElement as HTMLElement).style.height).toBe('480px')
    const china = screen.getByTestId('index-csi500').parentElement as HTMLElement
    expect(china.style.height).toBe('600px')
    expect((china.parentElement as HTMLElement).style.gridColumn).toBe('1 / -1') // 中证500 独占整行
  })

  it('标签页顺序：标普500、纳斯达克100、恒生指数、恒生科技指数、中证500', () => {
    Object.defineProperty(window, 'innerWidth', { value: 600, configurable: true })
    render(<HeatmapSection />)
    const names = screen.getAllByRole('button').map(b => b.textContent ?? '').filter(t => /标普500|纳斯达克100|恒生指数|恒生科技指数|中证500/.test(t)).map(t => t.replace(/[^一-龥A-Za-z0-9]/g, ''))
    expect(names).toEqual(['标普500', '纳斯达克100', '恒生指数', '恒生科技指数', '中证500'])
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
    expect(screen.getByTestId('index-csi500')).toBeTruthy()
  })
})
