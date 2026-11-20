import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import CnMarketView from './CnMarketView'

afterEach(() => vi.unstubAllGlobals())

const DATES = ['2026-11-12', '2026-11-13', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19']
const hist = (values: number[]) => values.map((v, i) => [DATES[i], v])

it('首屏显示 A 股周度变化，综合判断折叠，未知 ETF 申赎不按 0 计', async () => {
  const flows = Array.from({ length: 25 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, flow_broad: i === 22 ? null : 10 }))
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('cn-market-slices.json')) return Response.json({ slices: [
      { id: '000300', name: '沪深300', group: 'broad', symbol: '000300', scope: '沪深300', source: 'https://www.csindex.com.cn/', history: hist([100, 101, 100, 99, 98, 95]) },
      { id: '000922', name: '中证红利', group: 'style', symbol: '000922', scope: '中证红利', source: 'https://www.csindex.com.cn/', history: hist([50, 50, 51, 51, 52, 52]) },
    ] })
    if (url.endsWith('etf-flow.json')) return Response.json({ series: flows })
    if (url.endsWith('national-team/series.json')) return Response.json({ periods: ['2026-06-30', '2026-09-30'], total: { mv: [null, 5e8] } })
    return new Response(null, { status: 503 })
  }))
  render(<MemoryRouter initialEntries={['/monitor?tab=cn-market&view=participants']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><CnMarketView /></MemoryRouter>)
  const brief = await screen.findByRole('region', { name: '本周 A 股变化' })
  expect(await within(brief).findByText(/11-12 → 11-19/)).toBeTruthy()
  expect(within(brief).getAllByText(/中证红利/).length).toBeGreaterThan(0)
  expect(screen.getByText('市场各维度依据').closest('details')?.open).toBe(false)
  // Windows covering the null day are dropped: 20-day sums exist only for 10-20..10-22 (3 points), last = 10-22 → 200.
  const etf = screen.getByRole('region', { name: '国家队与 ETF' })
  expect(within(etf).getAllByText(/200亿元/).length).toBeGreaterThan(0)
  expect(within(etf).queryByText(/190亿元/)).toBeNull()
  expect(within(etf).getAllByText(/2026-09-30/).length).toBeGreaterThan(0)
})
