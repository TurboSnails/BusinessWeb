import React from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import SectionChrome from './SectionChrome'

afterEach(cleanup)

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <SectionChrome />
    </MemoryRouter>
  )

describe('SectionChrome', () => {
  it('分组内页面显示面包屑：Live › 投资 › 页面名', () => {
    renderAt('/valuation')
    const crumb = screen.getByRole('navigation', { name: '面包屑' })
    expect(within(crumb).getAllByRole('link').map(a => a.textContent)).toEqual(['Live', '投资'])
    expect(crumb.textContent).toContain('估值工作台')
  })

  it('同组切换条列出同组页面，当前项高亮', () => {
    renderAt('/valuation')
    const tabs = screen.getByRole('navigation', { name: '同组页面' })
    const links = within(tabs).getAllByRole('link')
    expect(links.map(a => a.textContent)).toEqual(['综合估值', 'AI 降价与利润', '基本面量化', '估值工作台', 'DCF 计算器', '网格交易', 'ETF 流派地图', 'ETF 清单', '研究笔记', '债基研究报告'])
    expect(links[3].getAttribute('aria-current')).toBe('page')
    expect(links[0].getAttribute('aria-current')).toBeNull()
  })

  it('深层路径仍落在同组并高亮父入口', () => {
    renderAt('/grid-trading/records/abc')
    const tabs = screen.getByRole('navigation', { name: '同组页面' })
    const current = within(tabs).getAllByRole('link').find(a => a.getAttribute('aria-current') === 'page')
    expect(current?.textContent).toBe('网格交易')
  })

  it('候选池一组只有候选池与机会雷达两页，用同组切换条互相跳转', () => {
    renderAt('/candidates')
    expect(screen.getByRole('navigation', { name: '面包屑' }).textContent).toContain('候选池')
    const links = within(screen.getByRole('navigation', { name: '同组页面' })).getAllByRole('link')
    expect(links.map(a => a.getAttribute('href'))).toEqual(['/candidates', '/radar'])
  })

  it('观察盘的细节页切换条里第一个是「观察盘」，可以随时回到一页总览', () => {
    renderAt('/limit-up-analysis')
    const links = within(screen.getByRole('navigation', { name: '同组页面' })).getAllByRole('link')
    expect(links.map(a => a.getAttribute('href'))).toEqual(['/watch', '/monitor', '/pulse', '/daily-analysis', '/sector-rotation', '/limit-up-analysis'])
  })

  it('每日分析旧版有独立面包屑，并仍归属每日分析入口', () => {
    renderAt('/daily-analysis/legacy')
    expect(screen.getByRole('navigation', { name: '面包屑' }).textContent).toContain('每日分析 · 历史旧版')
    expect(within(screen.getByRole('navigation', { name: '同组页面' })).getByRole('link', { current: 'page' }).getAttribute('href')).toBe('/daily-analysis')
  })

  it('已舍弃页面顶部显示舍弃说明，正常页面不显示', () => {
    renderAt('/trading-philosophy')
    expect(screen.getByRole('note').textContent).toMatch(/已舍弃.*短线/)
    cleanup()
    renderAt('/valuation')
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('/invest 本身、首页、/ai、未知路径都不渲染', () => {
    for (const p of ['/invest', '/', '/ai', '/life', '/about', '/nope']) {
      const { container, unmount } = renderAt(p)
      expect(container.innerHTML, p).toBe('')
      unmount()
    }
  })
})
