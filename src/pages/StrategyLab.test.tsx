import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import data from '../features/strategy-lab/data/late-cycle.json'
import { pct } from '../features/strategy-lab/LateCycleStudy'
import StrategyLab, { STRATEGY_LAB_LEAD } from './StrategyLab'

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

  it('百分比用「−」号', () => {
    expect(pct(-0.338)).toBe('−33.8%')
    expect(pct(0.05, 1, true)).toBe('+5.0%')
    expect(pct(null)).toBe('—')
  })
})
