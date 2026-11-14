import React from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import ResearchNotes from './ResearchNotes'

beforeAll(() => {
  vi.stubGlobal('scrollTo', () => {})
  // 研究方法页只请求评级复盘 JSON；返回空对象让它显示「待积累」状态
  vi.stubGlobal('fetch', async () => ({ ok: false, json: async () => ({}) }) as Response)
})
afterEach(() => cleanup())

const renderMethod = (): void => {
  render(
    <MemoryRouter initialEntries={['/research-notes?tab=method']}>
      <Routes><Route path="/research-notes" element={<ResearchNotes />} /></Routes>
    </MemoryRouter>,
  )
}

describe('研究方法：林奇两主线 + 巴菲特边界', () => {
  it('总纲写明两主一辅，并说明与书 19.3/19.4 的差异', () => {
    renderMethod()
    expect(screen.getByText('研究方法 · 林奇两主线 + 巴菲特边界')).toBeTruthy()
    const overview = screen.getByRole('region', { name: '总纲' })
    expect(within(overview).getByText(/林奇定节奏/)).toBeTruthy()
    expect(within(overview).getByText(/巴菲特定边界/)).toBeTruthy()
    expect(within(overview).getByText(/好公司，合理价格/)).toBeTruthy()
    expect(within(overview).getByText(/书 19\.3\/19\.4/)).toBeTruthy()
  })

  it('两条主线是价值回归与快速增长，各有研究清单与买卖纪律', () => {
    renderMethod()
    const value = screen.getByRole('region', { name: '主线：价值回归' })
    expect(within(value).getByText('正常盈利')).toBeTruthy()
    expect(within(value).getByText('历史估值带不偷看未来')).toBeTruthy()
    expect(within(value).getByRole('columnheader', { name: '卖出看什么' })).toBeTruthy()
    expect(within(value).getByRole('link', { name: '第20章 价值回归' }).getAttribute('href')).toBe(`/first-book/read/${encodeURIComponent('第20章-价值回归.md')}`)
    const growth = screen.getByRole('region', { name: '主线：快速增长' })
    expect(within(growth).getByText('单位经济与复制质量')).toBeTruthy()
    expect(within(growth).getByText(/不把 PEG 当买入按钮/)).toBeTruthy()
    expect(within(growth).getByRole('link', { name: '第21章 快速增长' })).toBeTruthy()
  })

  it('巴菲特作辅助层：能力圈、六项护城河财务检验、安全边际', () => {
    renderMethod()
    const buffett = screen.getByRole('region', { name: '巴菲特辅助层' })
    expect(within(buffett).getByText('能力圈：三句话检验')).toBeTruthy()
    for (const name of ['定价权', '毛利稳定', '资本回报', '盈利持续', '财务稳健', '需求韧性']) expect(within(buffett).getByText(name)).toBeTruthy()
    expect(within(buffett).getByText('安全边际与长期持有')).toBeTruthy()
    expect(within(buffett).getByRole('link', { name: '第23章 能力圈与护城河' })).toBeTruthy()
  })

  it('困境反转、周期、资产只作选读', () => {
    renderMethod()
    for (const name of ['困境反转', '周期型', '资产型']) expect(screen.getByRole('region', { name: `选读：${name}` })).toBeTruthy()
    expect(screen.queryByRole('region', { name: '主线：困境反转' })).toBeNull()
  })

  it('链接到机会雷达、林奇分类、牛熊周期回测，并保留评级复盘与通用纪律', () => {
    renderMethod()
    expect(screen.getByRole('link', { name: '机会雷达' }).getAttribute('href')).toBe('/radar')
    expect(screen.getAllByRole('link', { name: /林奇分类/ })[0].getAttribute('href')).toBe('/research-notes?tab=companies&v=lynch')
    expect(screen.getByRole('link', { name: '牛熊周期规则回测' }).getAttribute('href')).toBe('/monitor?tab=market-cycle')
    for (const title of ['数据与口径纪律', '对抗检验', '最终返回标准', '仓位与风控']) expect(screen.getByRole('heading', { name: title })).toBeTruthy()
    expect(screen.getByText(/程序化研究页的规则/)).toBeTruthy()
    // 旧版通用 PM 标准的立论页不再作为主体
    expect(screen.queryByText('立论：资深 PM 七问')).toBeNull()
  })
})
