// @ts-ignore Node 测试环境
import { readFileSync } from 'node:fs'
// @ts-ignore
import { resolve } from 'node:path'
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fileResponse = (rel: string): Response => {
  try {
    const text = readFileSync(resolve('public/data', rel), 'utf8')
    return { ok: true, status: 200, json: async () => JSON.parse(text) } as Response
  } catch {
    return { ok: false, status: 404, json: async () => ({}) } as Response
  }
}

beforeEach(() => {
  vi.resetModules()
  sessionStorage.clear()
  vi.stubGlobal('scrollTo', vi.fn())
  vi.stubGlobal('fetch', async (url: string) => fileResponse(String(url).replace(/^.*?data\//, '')))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

async function mount(path: string) {
  const { default: ResearchNotes } = await import('./ResearchNotes')
  const { default: CompanyDetail } = await import('./CompanyDetail')
  const router = createMemoryRouter([
    { path: '/research-notes', element: <ResearchNotes /> },
    { path: '/research-notes/:market/:code', element: <CompanyDetail /> },
  ], { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

describe('公司库 URL 筛选与返回（H1 / L8 / M2 / L6）', () => {
  it('搜索与评级写入 URL（replace），刷新后仍在', async () => {
    const router = await mount('/research-notes?tab=companies')
    await screen.findByRole('heading', { level: 1, name: '公司研究' }, { timeout: 20_000 })
    const search = await screen.findByRole('textbox', { name: '搜索公司名称或代码' })
    await act(async () => { fireEvent.change(search, { target: { value: 'aapl' } }) })
    await waitFor(() => expect(router.state.location.search).toContain('q=aapl'))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^条件关注/ })) })
    await waitFor(() => expect(decodeURIComponent(router.state.location.search)).toContain('rating=条件关注'))
  }, 30_000)

  it('一级页签切换用 push：返回键能回到上一个页签', async () => {
    const router = await mount('/research-notes?tab=companies')
    await screen.findByRole('heading', { level: 1, name: '公司研究' }, { timeout: 20_000 })
    await act(async () => { fireEvent.click(screen.getByRole('tab', { name: /研究方法/ })) })
    await waitFor(() => expect(router.state.location.search).toContain('tab=method'))
    await act(async () => { router.navigate(-1) })
    await waitFor(() => {
      const s = router.state.location.search
      expect(s.includes('tab=method')).toBe(false)
    })
  }, 30_000)

  it('详情「返回公司研究」链到带原筛选的列表 URL', async () => {
    const router = await mount('/research-notes?tab=companies&m=us&q=AAPL')
    await screen.findByRole('heading', { level: 1, name: '公司研究' }, { timeout: 20_000 })
    const company = await waitFor(() => {
      const a = screen.getAllByRole('link').find(el => (el.getAttribute('href') || '').includes('/research-notes/us/AAPL'))
      if (!a) throw new Error('no AAPL link')
      return a
    }, { timeout: 20_000 })
    await act(async () => { fireEvent.click(company) })
    await waitFor(() => expect(router.state.location.pathname).toBe('/research-notes/us/AAPL'))
    const back = await screen.findByRole('link', { name: /返回公司研究/ })
    expect(back.getAttribute('href')).toContain('q=AAPL')
    expect(back.getAttribute('href')).toContain('tab=companies')
  }, 30_000)

  it('加载中显示加载提示，不显示假空状态；候选计数有 aria-live', async () => {
    let release!: () => void
    const gate = new Promise<void>(r => { release = r })
    vi.stubGlobal('fetch', async (url: string) => {
      const rel = String(url).replace(/^.*?data\//, '')
      if (rel === 'us.json') await gate
      return fileResponse(rel)
    })
    await mount('/research-notes?tab=companies')
    await screen.findByRole('heading', { level: 1, name: '公司研究' }, { timeout: 20_000 })
    expect(screen.getByRole('status').textContent).toMatch(/正在加载/)
    expect(screen.queryByRole('button', { name: '清除筛选' })).toBeNull()
    expect(document.querySelector('.rn-info-bar__links [aria-live="polite"]')).toBeTruthy()
    await act(async () => { release() })
  }, 30_000)
})
