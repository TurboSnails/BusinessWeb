import React from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Home from './Home'
import RecentUpdates from '../components/RecentUpdates'
import { SITE_UPDATES } from '../data/siteUpdates'
import { WORKBENCH_TOOLS } from '../data/siteMap'

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

const stubFetch = (impl: () => Promise<unknown>) =>
  vi.stubGlobal('fetch', vi.fn(() => impl()) as unknown as typeof fetch)

const changelog = (n: number) => ({
  generatedAt: '2026-10-04T00:00:00.000Z',
  versions: [
    {
      tag: 'unreleased',
      date: null,
      commits: Array.from({ length: n }, (_, i) => ({
        hash: `h${i}`, subject: `更新${i}`, author: 'a', date: '2026-10-04',
      })),
    },
  ],
})

describe('Home', () => {
  it('第一屏是工作台：标题、跳转按钮、8 个常用工具', () => {
    render(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1, name: '工作台' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /跳转到页面/ })).toBeTruthy()
    const tools = within(screen.getByRole('region', { name: '常用工具' })).getAllByRole('link')
    expect(tools.map(a => a.getAttribute('href'))).toEqual(WORKBENCH_TOOLS.map(t => t.path))
  })

  it('本机没有数据时不显示最近访问和我的记录', () => {
    render(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.queryByRole('heading', { name: '最近访问' })).toBeNull()
    expect(screen.queryByRole('heading', { name: '我的记录' })).toBeNull()
  })

  it('有最近访问时显示对应链接', () => {
    localStorage.setItem('businessweb.recent-pages.v1', JSON.stringify(['/monitor', '/dcf']))
    render(<MemoryRouter><Home /></MemoryRouter>)
    const list = screen.getByRole('region', { name: '最近访问' })
    expect(within(list).getAllByRole('link').map(a => a.getAttribute('href'))).toEqual(['/monitor', '/dcf'])
  })

  it('有候选池时显示我的记录卡片', () => {
    localStorage.setItem('rn-candidates', JSON.stringify([{ market: 'us', code: 'AAPL', addedAt: '2026-10-01T00:00:00.000Z' }]))
    render(<MemoryRouter><Home /></MemoryRouter>)
    const box = screen.getByRole('region', { name: '我的记录' })
    expect(within(box).getByRole('link', { name: /候选池/ }).getAttribute('href')).toBe('/research-notes')
    expect(box.textContent).toContain('1 条')
    expect(box.textContent).toContain('AAPL')
  })

  it('localStorage 抛错时首页照常渲染', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    render(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1, name: '工作台' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '我的记录' })).toBeNull()
    spy.mockRestore()
  })

  it('读者区有书名、副标题与「开始阅读」按钮', () => {
    stubFetch(() => new Promise(() => {}))
    render(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 2, name: /正念投资/ })).toBeTruthy()
    expect(screen.getByText(/不盯盘、不预测的普通人投资方法/)).toBeTruthy()
    expect(screen.getByRole('link', { name: '开始阅读' }).getAttribute('href')).toBe('/first-book')
    expect(screen.getByRole('link', { name: '看目录' }).getAttribute('href')).toBe('/first-book/slow-is-fast')
    expect(screen.queryByRole('heading', { name: '最近更新' })).toBeNull()
  })

  it('三个栏目入口', () => {
    stubFetch(() => new Promise(() => {}))
    render(<MemoryRouter><Home /></MemoryRouter>)
    for (const h of ['/invest', '/ai', '/life']) {
      expect(screen.getAllByRole('link').some(a => a.getAttribute('href') === h), h).toBe(true)
    }
  })

  it('首页不出现起始金额 300，栏目卡片用 *** 与目标 400 万', () => {
    stubFetch(() => new Promise(() => {}))
    const { container } = render(<MemoryRouter><Home /></MemoryRouter>)
    expect(container.textContent).not.toMatch(/300/)
    expect(container.textContent).toContain('从 *** 到目标 400 万')
  })

})

describe('RecentUpdates', () => {
  it('显示最近 5 项已上线需求及使用入口', () => {
    render(<MemoryRouter><RecentUpdates /></MemoryRouter>)
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    for (const update of SITE_UPDATES.slice(0, 5)) {
      expect(screen.getByRole('link', { name: update.title }).getAttribute('href')).toBe(update.href)
      expect(screen.getByText(update.description)).toBeTruthy()
    }
  })

  it('不再读取或展示 Git 提交记录', () => {
    stubFetch(async () => ({ ok: true, json: async () => changelog(9) }))
    const { container } = render(<MemoryRouter><RecentUpdates /></MemoryRouter>)
    expect(fetch).not.toHaveBeenCalled()
    expect(container.textContent).not.toMatch(/更新0|chore:|feat\(|regenerate changelog/)
  })
})
