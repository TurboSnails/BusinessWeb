import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  sessionStorage.clear()
  vi.stubGlobal('scrollTo', vi.fn())
  vi.stubGlobal('fetch', async () => ({ ok: true, status: 200, json: async () => [] }) as Response)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

async function mount(path: string) {
  vi.doMock('../features/stock-lookup/StockLookup', () => ({
    default: () => <div data-testid="stock-lookup">个股查询面板</div>,
  }))
  const { default: ResearchNotes } = await import('./ResearchNotes')
  const router = createMemoryRouter([
    { path: '/research-notes', element: <ResearchNotes /> },
  ], { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

describe('公司研究 · 个股查询页签', () => {
  it('?tab=lookup 选中个股查询且懒加载内容', async () => {
    const router = await mount('/research-notes?tab=lookup&s=MRVL')
    await screen.findByRole('heading', { level: 1, name: '公司研究' }, { timeout: 10_000 })
    const tab = await screen.findByRole('tab', { name: /个股查询/ })
    expect(tab.getAttribute('aria-selected')).toBe('true')
    expect(await screen.findByTestId('stock-lookup')).toBeTruthy()
    expect(router.state.location.search).toContain('tab=lookup')
    expect(router.state.location.search).toContain('s=MRVL')
  }, 20_000)

  it('从公司库切到个股查询写入 tab=lookup', async () => {
    const router = await mount('/research-notes?tab=companies')
    await screen.findByRole('heading', { level: 1, name: '公司研究' }, { timeout: 10_000 })
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /个股查询/ }))
    })
    await waitFor(() => expect(router.state.location.search).toContain('tab=lookup'))
    expect(await screen.findByTestId('stock-lookup')).toBeTruthy()
  }, 20_000)
})
