import React from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import InvestHub from './InvestHub'
import LifeLab from './LifeLab'
import { INVEST_GROUPS } from '../data/siteMap'

afterEach(cleanup)

const wrap = (el: JSX.Element) => render(<MemoryRouter>{el}</MemoryRouter>)

describe('InvestHub', () => {
  it('渲染全部分组标题与每个入口链接', () => {
    wrap(<InvestHub />)
    for (const g of INVEST_GROUPS) {
      expect(screen.getAllByText(g.title).length, g.title).toBeGreaterThan(0)
      for (const l of g.links) {
        const a = screen.getAllByRole('link').find(x => x.getAttribute('href') === l.path)
        expect(a, l.path).toBeTruthy()
      }
    }
  })

  it('四个流程分组按顺序出现：观察盘 → 分析筛选 → 候选池 → 工具与参考', () => {
    wrap(<InvestHub />)
    const titles = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)
    expect(titles.filter(t => ['观察盘', '分析筛选', '候选池', '工具与参考'].includes(t ?? ''))).toEqual(['观察盘', '分析筛选', '候选池', '工具与参考'])
    const tools = screen.getByRole('region', { name: '工具与参考' })
    expect(within(tools).getAllByRole('link').map(a => a.getAttribute('href'))).toEqual(['/valuation', '/dcf', '/grid-trading', '/invest/etf', '/industry-etf', '/notes'])
  })

  it('观察盘只有一张整行主卡片，五个细节页收进默认折叠区', () => {
    wrap(<InvestHub />)
    const watch = screen.getByRole('region', { name: '观察盘' })
    const fold = watch.querySelector('details')!
    expect(fold.open).toBe(false)
    expect(fold.querySelector('summary')?.textContent).toMatch(/细节页/)
    expect(within(fold).getAllByRole('link').map(a => a.getAttribute('href'))).toEqual(['/monitor', '/pulse', '/daily-analysis', '/sector-rotation', '/limit-up-analysis'])
    const main = within(watch).getAllByRole('link').filter(a => !fold.contains(a))
    expect(main.map(a => a.getAttribute('href'))).toEqual(['/watch'])
    expect(main[0].closest('ul')?.className).toContain('inv-cards--single')
  })

  it('分析筛选的卡片显示短说明而不是长说明', () => {
    wrap(<InvestHub />)
    const research = screen.getByRole('region', { name: '分析筛选' })
    const card = within(research).getByRole('link', { name: /产业格局/ })
    expect(card.textContent).toContain('行业结构、龙头与格局')
    expect(card.textContent).not.toContain('前沿科技')
  })

  it('候选池显示本机候选数量，并有「研究筛出」入口', () => {
    localStorage.setItem('rn-candidates', JSON.stringify([
      { market: 'us', code: 'AAPL', addedAt: '2026-10-01T00:00:00.000Z' },
      { market: 'cn', code: '600519', addedAt: '2026-10-02T00:00:00.000Z' },
    ]))
    try {
      wrap(<InvestHub />)
      const pool = screen.getByRole('region', { name: '候选池' })
      const main = within(pool).getByRole('link', { name: /我的候选池/ })
      expect(main.getAttribute('href')).toBe('/candidates')
      expect(main.textContent).toContain('2 家')
      expect(within(pool).getByRole('link', { name: /研究筛出/ }).getAttribute('href')).toBe('/candidates?tab=research')
    } finally {
      localStorage.removeItem('rn-candidates')
    }
  })

  it('已舍弃组默认折叠，展开后为小标签样式，放在页面最后', () => {
    const { container } = wrap(<InvestHub />)
    const fold = container.querySelector('main')?.lastElementChild as HTMLDetailsElement
    expect(fold.tagName).toBe('DETAILS')
    expect(fold.open).toBe(false)
    expect(fold.querySelector('summary')?.textContent).toBe('已舍弃')
    expect(fold.querySelectorAll('.ui-chip')).toHaveLength(4)
  })

  it('顶部是「规则」：书和投资计划两条横幅', () => {
    wrap(<InvestHub />)
    const banner = screen.getByRole('link', { name: /《正念投资》/ })
    expect(banner.getAttribute('href')).toBe('/first-book')
    expect(banner.textContent).toMatch(/读书.*定计划.*看盘.*选公司.*用工具/)
    expect(screen.getByRole('link', { name: /投资计划/ }).getAttribute('href')).toBe('/investment-plan-2026')
  })
})

describe('LifeLab', () => {
  it('LifeLab 标出“准备中”并给出阶段', () => {
    wrap(<LifeLab />)
    expect(screen.getByRole('heading', { level: 1, name: '自由空间' })).toBeTruthy()
    expect(screen.getAllByText('准备中').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/400/).length).toBeGreaterThan(0)
  })

  it('LifeLab 不公开起始金额：用 *** 代替，只写目标 400 万', () => {
    const { container } = wrap(<LifeLab />)
    expect(container.textContent).not.toMatch(/300/)
    expect(screen.getByRole('heading', { level: 2, name: '*** → 目标 400 万' })).toBeTruthy()
  })
})
