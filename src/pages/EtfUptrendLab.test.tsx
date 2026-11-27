import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import EtfUptrendLab from './EtfUptrendLab'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

const INDEX = {
  days: [{ d: '2026-11-26', asof: '2026-11-26', at: '2026-11-26T15:00:00', st: 'ok', n: { all: 2 }, notes: [] }],
  status: {},
  schedule: { times: [], tz: 'Asia/Shanghai' },
  source_page: '',
}

const DAY = {
  d: '2026-11-26',
  cats: ['t0', 'industry', 'broad_index', 'trend_retracement', 'new_pool', 'unique_rep'],
  rows: [
    ['20:510300', '沪深300ETF', 0],
    ['20:159915', '创业板ETF', 1 << 3],
  ],
}

function stubFetch(): void {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('index.json')) return { ok: true, status: 200, json: async () => INDEX }
    if (url.includes('detail.json')) return { ok: true, status: 200, json: async () => ({}) }
    if (url.includes('/days/')) return { ok: true, status: 200, json: async () => DAY }
    if (url.includes('reconstructed')) return { ok: false, status: 404, json: async () => ({}) }
    return { ok: false, status: 404, json: async () => ({}) }
  }))
}

describe('EtfUptrendLab 页签键盘', () => {
  it('只有当前分类在 Tab 顺序里；方向键 / Home / End 切换并更新 aria-selected', async () => {
    stubFetch()
    render(<MemoryRouter><EtfUptrendLab /></MemoryRouter>)
    const list = await screen.findByRole('tablist', { name: '分类' })
    await waitFor(() => expect(screen.getByRole('tab', { name: /全部/ }).getAttribute('aria-selected')).toBe('true'))

    expect(screen.getByRole('tab', { name: /全部/ }).getAttribute('tabindex')).toBe('0')
    expect(screen.getByRole('tab', { name: /T\+0/ }).getAttribute('tabindex')).toBe('-1')

    fireEvent.keyDown(list, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: /T\+0/ }).getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: /T\+0/ }))

    fireEvent.keyDown(list, { key: 'End' })
    expect(screen.getByRole('tab', { name: /宽基指数/ }).getAttribute('aria-selected')).toBe('true')

    fireEvent.keyDown(list, { key: 'Home' })
    expect(screen.getByRole('tab', { name: /全部/ }).getAttribute('aria-selected')).toBe('true')
  })
})
