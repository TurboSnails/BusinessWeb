import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LeaveOneOut } from './LeaveOneOut'
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

  it('两只股票时追加单资产提示', () => {
    const fixture = createConclusionFixture()
    fixture.input.symbols = ['AVGO', 'META']
    fixture.input.weights = [0.5, 0.5]
    fixture.comparison.leaveOneOut = fixture.comparison.leaveOneOut.slice(0, 2)
    render(<LeaveOneOut comparison={fixture.comparison} input={fixture.input} names={names()} />)
    expect(screen.getByText('剔除后只剩一只股票，该行不再是分散组合之间的比较。')).toBeTruthy()
  })
})
