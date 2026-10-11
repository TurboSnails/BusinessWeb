import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Home from './Home'
import RecentUpdates from '../components/RecentUpdates'
import { SITE_UPDATES } from '../data/siteUpdates'

afterEach(() => {
  cleanup()
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
  it('首屏有书名、副标题与「开始阅读」按钮', () => {
    stubFetch(() => new Promise(() => {}))
    render(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1, name: /正念投资/ })).toBeTruthy()
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

  it('投资大师名句 8 条，直接展示，不需要点击展开', () => {
    stubFetch(() => new Promise(() => {}))
    const { container } = render(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 2, name: '投资大师名句' })).toBeTruthy()
    expect(container.querySelector('details')).toBeNull()
    expect(container.querySelectorAll('section.quotes blockquote').length).toBe(8)
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
