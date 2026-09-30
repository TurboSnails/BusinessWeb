// @ts-ignore 测试环境在 Node 中运行，项目未安装 @types/node
import { readFileSync } from 'node:fs'
// @ts-ignore
import { resolve } from 'node:path'
import React from 'react'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import ResearchNotes from './ResearchNotes'
import CompanyDetail from './CompanyDetail'

// 程序化补全公司（public/data/*.json）的烟雾测试：列表加载、分页、搜索、评级筛选、详情页
beforeAll(() => {
  vi.stubGlobal('scrollTo', () => {})
  vi.stubGlobal('fetch', async (url: string) => {
    const u = String(url)
    const name = u.includes('us.json') ? 'us.json' : u.includes('hk.json') ? 'hk.json' : u.includes('adr.json') ? 'adr.json' : u.includes('lynch.json') ? 'lynch.json' : 'cn.json'
    const text = readFileSync(resolve('public/data', name), 'utf8')
    return { ok: true, json: async () => JSON.parse(text) } as Response
  })
})
afterEach(() => cleanup())

const renderAt = (path: string): void => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/research-notes" element={<ResearchNotes />} />
        <Route path="/research-notes/:market/:code" element={<CompanyDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('补全公司：研究笔记列表与详情', () => {
  it('沪深列表加载补全数据，支持搜索与评级筛选、分页', async () => {
    renderAt('/research-notes?tab=category&m=cn')
    await waitFor(() => expect(screen.getByText(/显示更多/)).toBeTruthy(), { timeout: 8000 })
    const box = screen.getByPlaceholderText('搜索公司名称或代码') as HTMLInputElement
    fireEvent.change(box, { target: { value: '宁德时代' } })
    await waitFor(() => expect(screen.getAllByText(/宁德时代/).length).toBeGreaterThan(0))
    expect(screen.queryByText(/显示更多/)).toBeNull()
    fireEvent.change(box, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /^回避 \d+/ }))
    await waitFor(() => expect(screen.queryAllByText(/^回避/).length).toBeGreaterThan(0))
  })

  it('美股列表包含标普500 补全公司，并标注程序化', async () => {
    renderAt('/research-notes?tab=category&m=us')
    await waitFor(() => expect(screen.getByText(/显示更多/)).toBeTruthy(), { timeout: 8000 })
    fireEvent.change(screen.getByPlaceholderText('搜索公司名称或代码'), { target: { value: 'ACN' } })
    await waitFor(() => expect(screen.getAllByText(/埃森哲/).length).toBeGreaterThan(0))
    expect(screen.getAllByText('程序化').length).toBeGreaterThan(0)
  })

  it('补全公司详情页渲染程序化标识、三情景与买入纪律', async () => {
    renderAt('/research-notes/us/ACN')
    await waitFor(() => expect(screen.getByText('程序化研究页')).toBeTruthy(), { timeout: 8000 })
    expect(screen.getAllByText(/Bear/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/合理买入区/).length).toBeGreaterThan(0)
  })

  it('A 股补全公司详情页可渲染', async () => {
    renderAt('/research-notes/cn/002594')
    await waitFor(() => expect(screen.getByText('程序化研究页')).toBeTruthy(), { timeout: 8000 })
    expect(screen.getAllByText(/比亚迪/).length).toBeGreaterThan(0)
  })
})

describe('林奇分组、港股、导出', () => {
  it('林奇分组视图：类型筛选与护城河证据', async () => {
    renderAt('/research-notes?tab=category&m=cn&v=lynch')
    await waitFor(() => expect(screen.getAllByText('快速增长型').length).toBeGreaterThan(1), { timeout: 8000 })
    fireEvent.click(screen.getByRole('button', { name: /^周期型 \d+/ }))
    await waitFor(() => expect(screen.queryAllByText('周期型').length).toBeGreaterThan(1))
    expect(screen.getByText(/导出当前/)).toBeTruthy()
  })

  it('港股标签页列表可加载并搜索腾讯', async () => {
    renderAt('/research-notes?tab=category&m=hk')
    await waitFor(() => expect(screen.getByPlaceholderText('搜索公司名称或代码')).toBeTruthy(), { timeout: 8000 })
    fireEvent.change(screen.getByPlaceholderText('搜索公司名称或代码'), { target: { value: '腾讯' } })
    await waitFor(() => expect(screen.getAllByText(/腾讯控股/).length).toBeGreaterThan(0), { timeout: 8000 })
  })

  it('详情页渲染林奇分类卡与护城河证据', async () => {
    renderAt('/research-notes/us/ACN')
    await waitFor(() => expect(screen.getByText(/林奇分类：/)).toBeTruthy(), { timeout: 8000 })
    expect(screen.getAllByText('定价权').length).toBeGreaterThan(0)
  })

  it('全部公司列表有导出按钮', async () => {
    renderAt('/research-notes?tab=category&m=us')
    await waitFor(() => expect(screen.getByText(/导出当前筛选/)).toBeTruthy(), { timeout: 8000 })
    expect(screen.getByText(/导出该市场全部/)).toBeTruthy()
  })

  it('美股非标普标签：三组与未估值', async () => {
    renderAt('/research-notes?tab=category&m=adr')
    await waitFor(() => expect(screen.getAllByText(/台积电/).length).toBeGreaterThan(0), { timeout: 8000 })
    expect(screen.getAllByText(/^中概 \d+/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/^未估值 \d+/).length).toBeGreaterThan(0)
  })

  it('切换市场后筛选被重置：沪深选「优先关注」再切到美股非标普仍有公司', async () => {
    renderAt('/research-notes?tab=category&m=cn')
    await waitFor(() => expect(screen.getByText(/显示更多/)).toBeTruthy(), { timeout: 8000 })
    fireEvent.click(screen.getByRole('button', { name: /^优先关注 \d+/ }))
    fireEvent.click(screen.getByRole('button', { name: '美股非标普' }))
    await waitFor(() => expect(screen.getAllByText(/台积电/).length).toBeGreaterThan(0), { timeout: 8000 })
  })
})
