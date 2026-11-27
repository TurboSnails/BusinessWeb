import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../features/macro/ValuationView', () => ({
  ValuationView: () => <div data-testid="valuation-view">估值视图</div>,
}))
vi.mock('../features/macro/SpreadView', () => ({
  SpreadView: () => <div data-testid="spread-view">A股息差</div>,
}))
vi.mock('../features/macro/UsSpreadView', () => ({
  UsSpreadView: () => <div data-testid="us-spread-view">美股息差</div>,
}))

import IndexValuation, { INDEX_VALUATION_LEAD, resetIndexValuationCaches } from './IndexValuation'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  resetIndexValuationCaches()
})

beforeEach(() => {
  resetIndexValuationCaches()
})

const indexSnap = {
  generatedAt: '2026-11-20T00:00:00.000Z',
  checkedAt: '2026-11-20',
  indexes: {},
}

const spreadSnap = { generatedAt: '2026-11-20', source: '测试', window: 20, k: 2, rows: [] }
const usSpreadSnap = { generatedAt: '2026-11-20', source: '测试', window: 156, k: 2, rows: [] }

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/invest/index-valuation" element={<IndexValuation />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('指数估值页', () => {
  it('加载失败显示错误态', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 500 })))
    renderAt('/invest/index-valuation')
    expect((await screen.findByRole('alert')).textContent).toContain('数据暂时取不到')
    expect(screen.getByRole('button', { name: '重试' })).toBeTruthy()
    cleanup()
    renderAt('/invest/index-valuation?tab=spread')
    expect((await screen.findByRole('alert')).textContent).toContain('数据暂时取不到')
    cleanup()
    renderAt('/invest/index-valuation?tab=spread&mkt=us')
    expect((await screen.findByRole('alert')).textContent).toContain('数据暂时取不到')
  })

  it('默认估值位置；切到股债息差并切换 mkt', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('index-history.json')) return Response.json(indexSnap)
      if (u.includes('us-equity-bond-spread.json')) return Response.json(usSpreadSnap)
      if (u.includes('equity-bond-spread.json')) return Response.json(spreadSnap)
      return new Response(null, { status: 404 })
    }))
    renderAt('/invest/index-valuation')
    expect(screen.getByTestId('iv-head-lead').textContent).toBe(INDEX_VALUATION_LEAD)
    expect(screen.getByRole('tab', { name: '估值位置' }).getAttribute('aria-selected')).toBe('true')
    expect(await screen.findByTestId('valuation-view')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: '股债息差' }))
    expect(screen.getByRole('tab', { name: '股债息差' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('group', { name: '股债息差市场' })).toBeTruthy()
    expect(await screen.findByTestId('spread-view')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '美股 · 标普500' }))
    expect(screen.getByRole('button', { name: '美股 · 标普500' }).getAttribute('aria-pressed')).toBe('true')
    expect(await screen.findByTestId('us-spread-view')).toBeTruthy()
  })

  it('深链 ?tab=spread&mkt=us 直接打开美股息差', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('us-equity-bond-spread.json')) return Response.json(usSpreadSnap)
      return new Response(null, { status: 404 })
    }))
    renderAt('/invest/index-valuation?tab=spread&mkt=us')
    expect(screen.getByRole('tab', { name: '股债息差' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('button', { name: '美股 · 标普500' }).getAttribute('aria-pressed')).toBe('true')
    expect(await screen.findByTestId('us-spread-view')).toBeTruthy()
  })

  it('相关链接指向指数全景与市场雷达', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 500 })))
    renderAt('/invest/index-valuation')
    const nav = screen.getByRole('navigation', { name: '相关页面' })
    expect(nav.querySelector('a[href="/index-panorama/"]')?.textContent).toBe('指数全景')
    expect(nav.querySelector('a[href="/invest/market-radar"]')?.textContent).toBe('市场雷达')
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
  })
})
