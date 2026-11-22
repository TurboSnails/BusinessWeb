import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LeaveOneOut } from './LeaveOneOut'
import { compareSet } from '../engine'
import { createConclusionFixture } from '../fixtures'

afterEach(() => cleanup())

function names(): Record<string, string> {
  return { AVGO: '博通', META: 'Meta', CB: '安达保险' }
}

describe('LeaveOneOut', () => {
  it('显示年化与回撤变化，两个变化列均为中性色', () => {
    const fixture = createConclusionFixture()
    const { container } = render(<LeaveOneOut comparison={fixture.comparison} input={fixture.input} names={names()} />)
    expect(screen.getByRole('heading', { name: '逐一剔除一只（历史敏感性，不是卖出排序）' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: '去掉后年化变化（百分点）' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: '去掉后回撤变化（百分点）' })).toBeTruthy()
    expect(screen.getByText('−1.0 个点')).toBeTruthy()
    expect(screen.getByText('加深 8.0 点')).toBeTruthy()
    expect(screen.getByText(/负数表示去掉后年化下降（它在本区间拉高了结果）/)).toBeTruthy()
    for (const cell of container.querySelectorAll('.pr-change')) {
      expect(cell.classList.contains('pr-positive')).toBe(false)
      expect(cell.classList.contains('pr-negative')).toBe(false)
    }
  })

  it('不足一年改用累计收益变化', () => {
    const fixture = createConclusionFixture()
    fixture.comparison.custom.active.start = '2026-01-01'
    fixture.comparison.custom.active.end = '2026-06-01'
    for (const row of fixture.comparison.leaveOneOut) {
      row.active.start = '2026-01-01'
      row.active.end = '2026-06-01'
    }
    render(<LeaveOneOut comparison={fixture.comparison} input={fixture.input} names={names()} />)
    expect(screen.getByRole('columnheader', { name: '去掉后累计收益变化（百分点）' })).toBeTruthy()
    expect(screen.getByText('−20.0 个点')).toBeTruthy()
    expect(screen.queryByRole('columnheader', { name: '去掉后年化变化（百分点）' })).toBeNull()
  })

  it('大跌切换下标注稳定资产行同时包含规则变化', () => {
    const fixture = createConclusionFixture()
    fixture.input.switch = { stable: 'CB', entry: 0.2, gap: 0.05, step: 0.25, recover: 0.05 }
    render(<LeaveOneOut comparison={fixture.comparison} input={fixture.input} names={names()} />)
    const stableRow = screen.getByText('安达保险').closest('tr')
    expect(stableRow?.textContent).toContain('去掉它后无法执行大跌切换，这一行同时包含规则变化。')
    expect(screen.getByText(/不能用于判断稳定资产的独立作用/)).toBeTruthy()
  })

  it('恰好一个日历周年仍使用年化差', () => {
    const fixture = createConclusionFixture()
    fixture.comparison.custom.active.start = '2023-01-03'
    fixture.comparison.custom.active.end = '2024-01-03'
    render(<LeaveOneOut comparison={fixture.comparison} input={fixture.input} names={names()} />)
    expect(screen.getByRole('columnheader', { name: '去掉后年化变化（百分点）' })).toBeTruthy()
    expect(screen.queryByRole('columnheader', { name: '去掉后累计收益变化（百分点）' })).toBeNull()
  })

  it('剔除行窗口不同时显示实际区间并停用差值', () => {
    const fixture = createConclusionFixture()
    fixture.comparison.leaveOneOut[0].active.start = '2021-01-04'
    render(<LeaveOneOut comparison={fixture.comparison} input={fixture.input} names={names()} />)
    const row = screen.getByText('博通').closest('tr')!
    expect(row.textContent).toContain('实际区间 2021-01-04 — 2026-01-01。')
    expect(row.textContent).toContain('该行交易日与原组合不同，不作比较')
    const cells = row.querySelectorAll('td')
    expect(cells[3].textContent).toBe('—')
    expect(cells[5].textContent).toBe('—')
  })

  it('剔除行起止相同但内部多一天时停用两列差值', () => {
    const dates = ['2024-01-31', '2024-02-01', '2024-02-02', '2025-02-03']
    const { input } = createConclusionFixture()
    input.symbols = ['AAPL', 'MSFT', 'RKLB']
    const comparison = compareSet({
      AAPL: { dates, adjClose: [100, 300, 150, 100] },
      MSFT: { dates, adjClose: [100, 100, 100, 100] },
      RKLB: { dates: dates.filter((_, i) => i !== 1), adjClose: [100, 100, 100] },
    }, input)
    render(<LeaveOneOut comparison={comparison} input={input} names={{}} />)
    const row = screen.getByText('RKLB', { exact: true }).closest('tr')!
    expect(row.textContent).toContain('该行交易日与原组合不同，不作比较')
    expect([...row.querySelectorAll('.pr-change')].map(cell => cell.textContent)).toEqual(['—', '—'])
  })

  it('两只股票时追加单资产提示', () => {
    const fixture = createConclusionFixture()
    fixture.input.symbols = ['AVGO', 'META']
    fixture.input.weights = [0.5, 0.5]
    fixture.comparison.leaveOneOut = fixture.comparison.leaveOneOut.slice(0, 2)
    render(<LeaveOneOut comparison={fixture.comparison} input={fixture.input} names={names()} />)
    expect(screen.getByText('剔除后只剩一只股票，该行不再是分散组合之间的比较。')).toBeTruthy()
  })
})
