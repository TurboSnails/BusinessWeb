import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import FundamentalQuant from './FundamentalQuant'
import { FACTORS, RESEARCH_STATUS, STRATEGIES } from '../features/fundamental-quant/content'
import { resolveSeo } from '../utils/seo'
import { findInvestEntry, searchPages } from '../data/siteMap'

afterEach(cleanup)
function Location(): JSX.Element { const location = useLocation(); return <output data-testid="location">{location.search}</output> }
function renderPage(search = ''): void {
  render(<MemoryRouter initialEntries={[`/invest/fundamental-quant${search}`]}><FundamentalQuant /><Location /></MemoryRouter>)
}
function factorSection(): HTMLElement { return screen.getByRole('region', { name: '因子手册' }) }

describe('基本面量化研究手册', () => {
  it('搜索和类别叠加筛选，空结果可重置，并更新可分享的 URL', () => {
    renderPage()
    const section = factorSection()
    fireEvent.click(within(section).getByRole('button', { name: '质量' }))
    fireEvent.change(screen.getByRole('searchbox', { name: '搜索因子' }), { target: { value: '应计' } })
    expect(within(section).getByRole('status').textContent).toContain('显示 1 /')
    expect(screen.getByTestId('location').textContent).toContain('category=')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '不存在的因子' } })
    expect(screen.getByRole('heading', { name: '没有匹配的因子' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '显示全部因子' }))
    expect(within(section).getByRole('status').textContent).toContain(`显示 ${FACTORS.length} / ${FACTORS.length}`)
    expect(screen.getByTestId('location').textContent).toBe('')
  })

  it('深链恢复筛选、忽略无效类别，并可见打开后的口径说明', () => {
    renderPage('?category=unknown&q=EP&from=research')
    expect(within(factorSection()).getByRole('status').textContent).toContain('显示 1 /')
    expect(within(factorSection()).getByRole('button', { name: '全部', pressed: true })).toBeTruthy()
    const summary = screen.getByText('盈利收益率', { selector: 'strong' }).closest('summary')!
    const details = summary.parentElement!
    fireEvent.click(summary)
    expect(details.hasAttribute('open')).toBe(true)
    expect(details.textContent).toContain('负值单列')
    fireEvent.click(screen.getByRole('button', { name: '清空筛选' }))
    expect(screen.getByTestId('location').textContent).toBe('?from=research')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '   ' } })
    expect(screen.getByTestId('location').textContent).toBe('?from=research')
  })

  it('自查不会把策略升级为已验证，重新进入页面重置勾选', () => {
    renderPage()
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    expect(screen.getAllByRole('status').some(item => item.textContent === '本次自查：1 / 10 项')).toBe(true)
    expect(screen.getAllByText(RESEARCH_STATUS, { exact: true })).toHaveLength(3)
    cleanup()
    renderPage()
    expect((screen.getAllByRole('checkbox')[0] as HTMLInputElement).checked).toBe(false)
  })

  it('入口、搜索、SEO 与公司研究链接可用', () => {
    renderPage()
    expect(findInvestEntry('/invest/fundamental-quant')?.link.label).toBe('基本面量化')
    expect(searchPages('基本面量化').some(page => page.path === '/invest/fundamental-quant')).toBe(true)
    expect(resolveSeo('/invest/fundamental-quant')).toMatchObject({ known: true, title: '基本面量化｜书籍方法、因子与策略验证' })
    expect(screen.getByRole('link', { name: '公司研究' }).getAttribute('href')).toBe('/research-notes')
    expect(screen.getByRole('link', { name: '综合估值' }).getAttribute('href')).toBe('/invest/comprehensive-valuation')
    expect(screen.getByRole('link', { name: '我的候选池' }).getAttribute('href')).toBe('/candidates')
    expect(STRATEGIES.every(card => card.backtest === null && card.ledger === 'rule-only')).toBe(true)
  })
})
