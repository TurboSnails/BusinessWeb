import React from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import InvestHub from './InvestHub'
import AiStudio from './AiStudio'
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

  it('盯盘观察组是默认折叠的 details，并带提示语', () => {
    const { container } = wrap(<InvestHub />)
    const details = container.querySelector('details')
    expect(details).toBeTruthy()
    expect(details?.hasAttribute('open')).toBe(false)
    expect(within(details as HTMLElement).getByText(/少看行情/)).toBeTruthy()
  })

  it('「读这本书」突出显示并链接到 /first-book', () => {
    wrap(<InvestHub />)
    expect(screen.getByRole('link', { name: /我的书/ }).getAttribute('href')).toBe('/first-book')
  })
})

describe('AiStudio / LifeLab', () => {
  it('AiStudio 标出“准备中”并给出路线', () => {
    wrap(<AiStudio />)
    expect(screen.getByRole('heading', { level: 1, name: 'AI 与独立开发' })).toBeTruthy()
    expect(screen.getAllByText('准备中').length).toBeGreaterThan(0)
    expect(screen.getByText(/正念投资 AI/)).toBeTruthy()
  })

  it('LifeLab 标出“准备中”并给出阶段', () => {
    wrap(<LifeLab />)
    expect(screen.getByRole('heading', { level: 1, name: '自由生活实验' })).toBeTruthy()
    expect(screen.getAllByText('准备中').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/400/).length).toBeGreaterThan(0)
  })
})
