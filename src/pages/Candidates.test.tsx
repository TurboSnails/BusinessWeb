import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Candidates from './Candidates'

vi.mock('../features/candidates/links', async importOriginal => {
  const actual = await importOriginal<typeof import('../features/candidates/links')>()
  return {
    ...actual,
    readToolSources: () => ({
      dcf: [{ market: 'cn', code: '600519', savedAt: '2026-10-05T00:00:00Z', input: { currency: 'CNY' }, result: { price: 1600, mos: 0.12 } }],
      valuation: [],
      grid: [],
    }),
  }
})

const seed = (items: unknown[]): void => localStorage.setItem('rn-candidates', JSON.stringify(items))
const renderAt = (path = '/candidates') => render(<MemoryRouter initialEntries={[path]}><Candidates /></MemoryRouter>)

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('scrollTo', () => {})
  // 公司库补全数据：测试里只用内置的手工研究公司
  vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => [] }) as unknown as Response)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('候选池页', () => {
  it('空池：显示概况、使用流程和去哪里加公司', () => {
    renderAt()
    expect(screen.getByRole('heading', { level: 1, name: '候选池' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /我的候选 · 0/ }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('list', { name: '使用流程' })).toBeTruthy()
    expect(screen.getByText('候选池还是空的。')).toBeTruthy()
  })

  it('每家公司带好参数进入估值、DCF；只有 A 股显示网格；已做的 DCF 回显在估值进度里', () => {
    seed([
      { market: 'cn', code: '600519', addedAt: '2026-10-01T00:00:00.000Z', note: '等 1400 以下' },
      { market: 'us', code: 'AAPL', addedAt: '2026-10-02T00:00:00.000Z' },
    ])
    renderAt()
    expect(screen.getByRole('link', { name: '估值工作台 600519' }).getAttribute('href')).toBe('/valuation?market=cn&code=600519')
    expect(screen.getByRole('link', { name: 'DCF AAPL' }).getAttribute('href')).toMatch(/^\/dcf\?.*code=AAPL.*market=us.*currency=USD/)
    expect(screen.getByRole('link', { name: '网格 600519' }).getAttribute('href')).toMatch(/^\/grid-trading\?code=600519/)
    expect(screen.queryByRole('link', { name: '网格 AAPL' })).toBeNull()

    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0].textContent).toContain('CNY 1,600')
    expect(rows[0].textContent).toContain('安全边际 12%')
    expect(rows[1].textContent).toContain('尚未估值')
    expect(screen.getByText('已做估值').nextElementSibling?.textContent).toBe('1 / 2')
  })

  it('清空需要在页面里二次确认，取消不删除', () => {
    seed([{ market: 'us', code: 'AAPL', addedAt: '2026-10-02T00:00:00.000Z' }])
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: '清空' }))
    const confirm = screen.getByRole('group', { name: '确认清空' })
    fireEvent.click(within(confirm).getByRole('button', { name: '取消' }))
    expect(screen.getAllByRole('row')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: '清空' }))
    fireEvent.click(screen.getByRole('button', { name: '确认清空' }))
    expect(screen.getByText('候选池还是空的。')).toBeTruthy()
  })

  it('研究筛出：一键加入我的池，再点一次移出', async () => {
    renderAt('/candidates?tab=research')
    expect(screen.getByRole('heading', { name: /^研究筛出/ })).toBeTruthy()
    const add = screen.getAllByRole('button', { name: /^加入我的池/ })[0]
    const label = add.getAttribute('aria-label')!
    fireEvent.click(add)
    const added = screen.getByRole('button', { name: label.replace('加入我的池', '移出我的池') })
    expect(added.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('tab', { name: /我的候选 · 1/ })).toBeTruthy()
    expect(JSON.parse(localStorage.getItem('rn-candidates')!)).toHaveLength(1)

    fireEvent.click(screen.getByRole('tab', { name: /我的候选/ }))
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(2))
    fireEvent.click(screen.getByRole('tab', { name: '研究筛出' }))
    fireEvent.click(screen.getByRole('button', { name: label.replace('加入我的池', '移出我的池') }))
    expect(screen.getByRole('tab', { name: /我的候选 · 0/ })).toBeTruthy()
  })

  it('研究筛出：每行有 DCF 入口，可按 DCF 筛选', () => {
    renderAt('/candidates?tab=research&view=4')
    expect(screen.getAllByRole('link', { name: /^算 DCF/ }).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: '未算' }))
    expect(screen.getAllByRole('link', { name: /^算 DCF/ }).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: '已算 DCF' }))
    expect(screen.queryAllByRole('link', { name: /^算 DCF/ })).toHaveLength(0)
  })
})
