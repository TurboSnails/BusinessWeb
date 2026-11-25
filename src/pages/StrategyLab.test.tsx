import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import data from '../features/strategy-lab/data/late-cycle.json'
import daily from '../features/strategy-lab/data/daily-execution.json'
import vt from '../features/strategy-lab/data/vol-target.json'
import vol from '../features/strategy-lab/data/etf-volume.json'
import { pct } from '../features/strategy-lab/LateCycleStudy'
import StrategyLab, { STRATEGY_LAB_LEAD } from './StrategyLab'

vi.mock('../features/combined-strategy/load', () => ({
  useCombinedStrategy: vi.fn(() => ({ status: 'ready', data: { current: { instruction: '股票仓位保持在你上限的 85%，本月不用调。' } } })),
}))

function renderPage(): void {
  render(
    <MemoryRouter initialEntries={['/invest/strategy-lab']}>
      <StrategyLab />
    </MemoryRouter>,
  )
}

describe('研究中页签', () => {
  it('页头说明不影响仓位，TrioNav 第四个页签为当前页', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('研究中')
    expect(screen.getByTestId('lab-lead').textContent).toBe(STRATEGY_LAB_LEAD)
    const trio = screen.getByRole('navigation', { name: '策略相关页面' })
    const lab = within(trio).getByRole('link', { name: '待验证 · 研究中' })
    expect(lab.getAttribute('href')).toBe('/invest/strategy-lab')
    expect(lab.getAttribute('aria-current')).toBe('page')
    expect(within(trio).getByRole('link', { name: '结论 · 综合策略' }).getAttribute('aria-current')).toBeNull()
  })

  it('回调事件表逐行对应研究结果，汇总表含扩张后段一行', () => {
    renderPage()
    const events = screen.getByTestId('lab-events')
    expect(within(events).getAllByRole('row')).toHaveLength(data.events.length + 1)
    const e2020 = data.events.find(e => e.peak === '2020-02-19')!
    expect(within(events).getByText(`${e2020.peak} → ${e2020.trough}`)).toBeTruthy()
    expect(screen.getByTestId('lab-groups').textContent).toContain('偏热且进攻侧（扩张后段）')
    expect(screen.getByTestId('lab-verdict-a').textContent).toContain(data.verdictA)
  })

  it('四个候选都显示预注册结论', () => {
    renderPage()
    const table = screen.getByTestId('lab-candidates')
    for (const id of ['K1', 'K2', 'K3', 'K4'] as const) {
      expect(table.textContent).toContain(data.verdictB[id])
    }
    expect(table.textContent).toContain(pct(data.strategies.base.full.dailyMaxDd))
  })

  it('按日执行研究：研究列表、三个写法的预注册结论', () => {
    renderPage()
    const index = screen.getByRole('navigation', { name: '研究列表' })
    expect(within(index).getAllByRole('link').map(a => a.getAttribute('href'))).toEqual(['#lab-v01', '#lab-etf-volume', '#lab-vol-target', '#lab-daily-execution', '#lab-late-cycle'])
    expect(screen.getByTestId('lab-daily-answer').textContent).toContain(daily.answer)
    const table = screen.getByTestId('lab-daily-table')
    for (const id of ['D1', 'D2', 'D3'] as const) expect(table.textContent).toContain(daily.verdict[id])
    expect(within(table).getAllByRole('row')).toHaveLength(5)
  })

  it('有效策略初版：美股读数来自综合策略，A 股读数加载失败时有提示', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    renderPage()
    expect(screen.getByTestId('lab-v01-us-now').textContent).toBe('股票仓位保持在你上限的 85%，本月不用调。')
    expect(await screen.findByText('读数暂时加载不了')).toBeTruthy()
    expect(within(screen.getByTestId('lab-v01')).getByRole('link', { name: 'ETF 择时观察（逐只信号）' }).getAttribute('href')).toBe('/lab/etf-timing')
    vi.unstubAllGlobals()
  })

  it('波动率目标：三个写法的结论、同等仓位对照与当前读数', () => {
    renderPage()
    const table = screen.getByTestId('lab-vt-table')
    for (const id of ['VT1', 'VT2', 'VT3'] as const) expect(table.textContent).toContain(vt.verdict[id])
    expect(within(screen.getByTestId('lab-vt-events')).getAllByRole('row')).toHaveLength(9)
    expect(screen.getByTestId('lab-vt-now').textContent).toContain(vt.sigmaNow.k.toFixed(2))
  })

  it('A 股成交量检验：三个条件的判定', () => {
    renderPage()
    const table = screen.getByTestId('lab-etf-volume-table')
    for (const id of ['V1', 'V2', 'V3'] as const) expect(table.textContent).toContain(vol.decision[id].text)
    expect(within(table).getAllByRole('row')).toHaveLength(5)
  })

  it('百分比用「−」号', () => {
    expect(pct(-0.338)).toBe('−33.8%')
    expect(pct(0.05, 1, true)).toBe('+5.0%')
    expect(pct(null)).toBe('—')
  })
})
