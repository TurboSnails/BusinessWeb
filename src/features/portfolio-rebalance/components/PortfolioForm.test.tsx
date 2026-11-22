import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PortfolioForm } from './PortfolioForm'
import type { PriceIndex, RunInput } from '../types'
import { createDefaultInput } from '../urlState'

afterEach(() => cleanup())

function indexWithMasters(): PriceIndex {
  return {
    schemaVersion: 1,
    generatedAt: '2026-11-22T00:00:00Z',
    items: [
      { symbol: 'AAPL', name: '苹果', group: 'growth', first: '2010-01-04', last: '2026-11-20', asOf: '2026-11-20', status: 'ok', dividendStatus: 'ok', holders: [{ who: '段永平（H&H）', weight: 0.411, asOf: '2026-09-30' }, { who: '巴菲特（伯克希尔）', weight: 0.25, asOf: '2026-09-30' }] },
      { symbol: 'AVGO', name: '博通', group: 'growth', first: '2010-01-04', last: '2026-11-20', asOf: '2026-11-20', status: 'ok', dividendStatus: 'ok' },
      { symbol: 'KO', name: '可口可乐', group: 'stable', first: '2010-01-04', last: '2026-11-20', asOf: '2026-11-20', status: 'ok', dividendStatus: 'ok', holders: [{ who: '巴菲特（伯克希尔）', weight: 0.113, asOf: '2026-09-30' }] },
      { symbol: 'QQQ', name: '纳指 100 ETF', group: 'benchmark', first: '2010-01-04', last: '2026-11-20', asOf: '2026-11-20', status: 'ok', dividendStatus: 'ok' },
    ],
  }
}

function renderForm(index = indexWithMasters(), value: RunInput = { ...createDefaultInput(), symbols: ['AAPL', 'KO'], weights: [0.5, 0.5] }) {
  const onChange = vi.fn()
  const onSubmit = vi.fn()
  render(<PortfolioForm index={index} value={value} onChange={onChange} onSubmit={onSubmit} defaultStart="2020-01-02" />)
  return { onChange, onSubmit }
}

describe('PortfolioForm 大师长期持仓', () => {
  it('只渲染 index 中的代码，不要求完整 universe', () => {
    renderForm(indexWithMasters(), { ...createDefaultInput(), symbols: ['AAPL', 'KO'], weights: [0.5, 0.5] })
    expect(screen.getAllByText('苹果').length).toBeGreaterThan(0)
    expect(screen.queryByText('英伟达')).toBeNull()
    expect(screen.getByText('大师长期持仓（13F）')).toBeTruthy()
    expect(document.querySelectorAll('.pr-check').length).toBe(4)
  })

  it('有 holders 的代码显示大师徽标，并带持有人说明', () => {
    renderForm()
    const badge = screen.getByLabelText(/大师长期持仓：段永平/)
    expect(badge.textContent).toBe('大师')
    expect(badge.getAttribute('aria-label')).toContain('巴菲特（伯克希尔）')
    expect(screen.queryByLabelText(/大师长期持仓：.*博通/)).toBeNull()
  })

  it('大师长期持仓 details 默认收起，展开后按投资人分组列出', () => {
    renderForm()
    const details = screen.getByText('大师长期持仓（13F）').closest('details')
    expect(details).toBeTruthy()
    expect(details?.open).toBe(false)
    fireEvent.click(screen.getByText('大师长期持仓（13F）'))
    expect(details?.open).toBe(true)
    expect(screen.getByRole('heading', { name: '巴菲特（伯克希尔）', level: 4 })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '段永平（H&H）', level: 4 })).toBeTruthy()
    const holdings = screen.getByRole('heading', { name: '巴菲特（伯克希尔）', level: 4 }).closest('section')
    expect(holdings?.textContent).toMatch(/苹果/)
    expect(holdings?.textContent).toMatch(/41\.1%|25\.0%/)
    expect(holdings?.textContent).toMatch(/可口可乐/)
    expect(holdings?.textContent).toContain('11.3%')
    expect(screen.getByText(/长期持有：最新一期 13F 中占组合 5% 以上/)).toBeTruthy()
  })
})
