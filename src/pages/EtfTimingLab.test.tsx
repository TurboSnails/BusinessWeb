import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import EtfTimingLab from './EtfTimingLab'
import { fixture } from '../features/etf-timing/fixtures'

const NOW = new Date('2026-11-16T02:00:00Z')
const renderPage = (now = NOW) => render(<MemoryRouter><EtfTimingLab now={now} /></MemoryRouter>)
const okFetch = () => vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => fixture() })))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('择时实验页', () => {
  it('固定提示 + 本周结论大字 + 三个数字', async () => {
    okFetch()
    renderPage()
    expect(screen.getByText('观察中，未验证，不是买卖指令')).toBeTruthy()
    expect(await screen.findByRole('heading', { name: '本周：偏防守，规则不开新仓' })).toBeTruthy()
    const summary = screen.getByRole('region', { name: '本周：偏防守，规则不开新仓' })
    expect(summary.textContent).toContain('1 只规则持有中')
    expect(summary.textContent).toContain('1 只近 7 天有新信号')
    expect(summary.textContent).toContain('截至 11月13日')
    expect(document.body.textContent).not.toMatch(/建议买入|建议卖出|立即买|立即卖/)
  })

  it('名单分组：近 7 天新信号、较早进场持有、空仓折叠；不重复出现', async () => {
    okFetch()
    renderPage()
    const recent = await screen.findByRole('region', { name: '近 7 天新信号' })
    expect(within(recent).getByText('芯片ETF')).toBeTruthy()
    expect(within(recent).getByText('11月10日进场')).toBeTruthy()
    const holding = screen.getByRole('region', { name: '规则持有中' })
    expect(within(holding).queryByText('芯片ETF')).toBeNull()
    expect(within(holding).getByText('没有。')).toBeTruthy()
    const fold = screen.getByText(/空仓（近 7 天无信号）/, { selector: 'h3' }).closest('details')!
    expect(fold.open).toBe(false)
    expect(within(fold).getByText('上证50ETF')).toBeTruthy()
  })

  it('长历史检验：持有 → 择时对比带单位与差值，分组通过/未通过，可切换区间与对照策略', async () => {
    okFetch()
    renderPage()
    expect(await screen.findByText('部分通过：两项都过 1 / 2')).toBeTruthy()
    const t = screen.getByRole('region', { name: '长历史检验结果' })
    expect(within(t).getByText('3.1%')).toBeTruthy()
    expect(within(t).getByText('4.8%')).toBeTruthy()
    expect(within(t).getByText('+1.7')).toBeTruthy()
    expect(within(t).getByText('浅 27.3')).toBeTruthy()
    expect(within(t).getByText('两项都通过 · 1')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '2015 股灾' }))
    expect(within(screen.getByRole('region', { name: '长历史检验结果' })).getByText('7.7%')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: '长历史检验结果' })).queryByText('MACD')).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: '显示对照策略' }))
    expect(within(screen.getByRole('region', { name: '长历史检验结果' })).getByText('MACD')).toBeTruthy()
  })

  it('加载失败给出说明；静态样本外结论照常显示', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })))
    renderPage()
    expect(await screen.findByText('实验数据暂时无法加载')).toBeTruthy()
    expect(screen.getByText('「MACD 优秀」名单：不采用')).toBeTruthy()
  })

  it('记录过期超过 9 天时提示', async () => {
    okFetch()
    renderPage(new Date('2026-11-30T02:00:00Z'))
    expect(await screen.findByText(/影子记录已 17 天未更新/)).toBeTruthy()
  })
})

describe('择时实验页图表', () => {
  it('状态总览格与收益/回撤成对条形图', async () => {
    okFetch()
    renderPage()
    const grid = await screen.findByRole('group', { name: '状态总览' })
    expect(within(grid).getByText(/近 7 天进场 1/)).toBeTruthy()
    expect(within(grid).getByTitle(/芯片ETF.*近 7 天进场/)).toBeTruthy()
    const figs = document.querySelectorAll('figure.et-chart')
    expect(figs.length).toBe(2)
    expect(figs[1].textContent).toContain('最大回撤')
    expect(figs[0].querySelectorAll('.et-bar__fill--timing').length).toBeGreaterThan(0)
  })
})
