import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import EtfTimingLab from './EtfTimingLab'
import { fixture } from '../features/etf-timing/fixtures'

const NOW = new Date('2026-11-16T02:00:00Z')
const renderPage = (now = NOW) => render(<MemoryRouter><EtfTimingLab now={now} /></MemoryRouter>)
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('择时实验页', () => {
  it('固定显示「观察中，未验证，不是买卖指令」，并展示本周状态与 ETF 表', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => fixture() })))
    renderPage()
    expect(screen.getByText('观察中，未验证，不是买卖指令')).toBeTruthy()
    const table = await screen.findByRole('region', { name: 'ETF 规则状态' })
    expect(within(table).getByText('芯片ETF')).toBeTruthy()
    expect(screen.getByText('偏防守（不开新仓）')).toBeTruthy()
    expect(screen.getByText('偏进攻（可开仓）')).toBeTruthy()
    // 不出现买卖指令措辞
    expect(document.body.textContent).not.toMatch(/建议买入|建议卖出|立即买|立即卖/)
  })

  it('筛选「近 7 天有信号」只留最近有进出场的 ETF', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => fixture() })))
    renderPage()
    await screen.findByRole('region', { name: 'ETF 规则状态' })
    fireEvent.click(screen.getByRole('button', { name: '近 7 天有信号' }))
    const rows = within(screen.getByRole('region', { name: 'ETF 规则状态' })).getAllByRole('row')
    expect(rows).toHaveLength(2) // 表头 + 芯片ETF
  })

  it('长历史检验：显示部分通过与验收结果，可切换区间', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => fixture() })))
    renderPage()
    expect(await screen.findByText('部分通过：两项都过 1 / 2')).toBeTruthy()
    const t = screen.getByRole('region', { name: '长历史检验结果' })
    expect(within(t).getByText('4.8')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '2015 股灾' }))
    expect(within(screen.getByRole('region', { name: '长历史检验结果' })).getByText('7.7')).toBeTruthy()
  })

  it('加载失败给出说明；静态样本外结论照常显示', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })))
    renderPage()
    expect(await screen.findByText('实验数据暂时无法加载')).toBeTruthy()
    expect(screen.getByText('「MACD 优秀」名单：不采用')).toBeTruthy()
  })

  it('记录过期超过 9 天时提示', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => fixture() })))
    renderPage(new Date('2026-11-30T02:00:00Z'))
    expect(await screen.findByText(/影子记录已 17 天未更新/)).toBeTruthy()
  })
})
