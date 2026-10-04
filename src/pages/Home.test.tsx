import React from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Home from './Home'
import RecentUpdates from '../components/RecentUpdates'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const stubFetch = (impl: () => Promise<unknown>) =>
  vi.stubGlobal('fetch', (() => impl()) as unknown as typeof fetch)

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
  })

  it('三个栏目入口', () => {
    stubFetch(() => new Promise(() => {}))
    render(<MemoryRouter><Home /></MemoryRouter>)
    for (const h of ['/invest', '/ai', '/life']) {
      expect(screen.getAllByRole('link').some(a => a.getAttribute('href') === h), h).toBe(true)
    }
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
  it('最多显示 5 条', async () => {
    stubFetch(async () => ({ ok: true, json: async () => changelog(9) }))
    render(<RecentUpdates />)
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(5))
    expect(screen.getByText('更新0')).toBeTruthy()
    expect(screen.queryByText('更新5')).toBeNull()
  })

  it('加载失败时整块不显示', async () => {
    stubFetch(async () => { throw new Error('down') })
    const { container } = render(<RecentUpdates />)
    await new Promise(r => setTimeout(r, 20))
    expect(container.innerHTML).toBe('')
  })

  it('空提交列表时整块不显示', async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ generatedAt: 'x', versions: [] }) }))
    const { container } = render(<RecentUpdates />)
    await new Promise(r => setTimeout(r, 20))
    expect(container.innerHTML).toBe('')
  })

  it('响应非 ok 时整块不显示', async () => {
    stubFetch(async () => ({ ok: false, status: 404, json: async () => ({}) }))
    const { container } = render(<RecentUpdates />)
    await new Promise(r => setTimeout(r, 20))
    expect(container.innerHTML).toBe('')
  })
})
