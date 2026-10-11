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
      expect(screen.getByText(g.title), g.title).toBeTruthy()
      for (const l of g.links) {
        const a = screen.getAllByRole('link').find(x => x.getAttribute('href') === l.path)
        expect(a, l.path).toBeTruthy()
      }
    }
  })

  it('行情组直接展开，做成一行弱化的标签，带少看提示', () => {
    wrap(<InvestHub />)
    const group = screen.getByRole('region', { name: '行情（少看）' })
    expect(group.closest('details')).toBeNull()
    expect(within(group).getByText(/少看行情/)).toBeTruthy()
    expect(within(group).getAllByRole('link')).toHaveLength(3)
  })

  it('研究、估值、计划三组是卡片：显示短说明而不是长说明', () => {
    wrap(<InvestHub />)
    const research = screen.getByRole('region', { name: '研究标的' })
    const card = within(research).getByRole('link', { name: /产业格局/ })
    expect(card.textContent).toContain('按行业看龙头')
    expect(card.textContent).not.toContain('前沿科技')
  })

  it('已舍弃组默认折叠，放在页面最后', () => {
    const { container } = wrap(<InvestHub />)
    const folds = container.querySelectorAll('details')
    expect(folds).toHaveLength(1)
    expect(folds[0].open).toBe(false)
    expect(folds[0].querySelector('summary')?.textContent).toBe('已舍弃')
    expect(container.querySelector('main')?.lastElementChild).toBe(folds[0])
  })

  it('顶部是「读这本书」横幅，链接到 /first-book 并给出推荐顺序', () => {
    wrap(<InvestHub />)
    const banner = screen.getByRole('link', { name: /《正念投资》/ })
    expect(banner.getAttribute('href')).toBe('/first-book')
    expect(banner.textContent).toMatch(/读书.*定规则.*选标的.*用工具/)
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
