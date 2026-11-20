import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import UsMarketView from './UsMarketView'

afterEach(() => vi.unstubAllGlobals())

it('恢复行业深链，在一个数据源失败时仍显示其他可用数据', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('us-market-slices.json')) return Response.json({ slices: [
      { id: 'spx', name: '标普 500', group: 'broad', symbol: '^GSPC', scope: '指数', source: '', history: [['2026-11-18', 100]] },
      { id: 'sector-xlk', name: '信息技术', group: 'sector', symbol: 'XLK', scope: 'ETF 代理', source: '', history: [['2026-11-18', 10]] },
    ] })
    if (url.endsWith('us-market-data.json')) return Response.json({ series: { retailCash: {
      name: '散户现金', unit: '%', source: 'https://www.aaii.com/assetallocationsurvey', scope: 'AAII 美国会员调查', frequency: '月度', history: [['2026-10-31', 13.31]],
    } } })
    return new Response(null, { status: 503 })
  }))
  render(<MemoryRouter initialEntries={['/monitor?tab=us-market&view=sector&index=sector-xlk']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><UsMarketView /></MemoryRouter>)
  expect(await screen.findByRole('heading', { name: '信息技术' })).toBeTruthy()
  expect(screen.getByRole('status').textContent).toContain('部分数据暂时不可用')
  const cash = screen.getByRole('region', { name: '现金与流向' })
  expect(within(cash).getByText('13.31%')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '参与者' }))
  expect(screen.getByRole('heading', { name: '投资者仓位与资金' })).toBeTruthy()
  expect(screen.getAllByText(/AAII 美国会员调查/).length).toBeGreaterThan(0)
})

it('EPS 预期变化按较季末口径标注，周度简报位于首屏', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('us-market-slices.json')) return Response.json({ slices: [
      { id: 'spx', name: '标普 500', group: 'broad', symbol: '^GSPC', scope: '指数', source: '', history: [['2026-11-12', 100], ['2026-11-13', 101], ['2026-11-16', 102], ['2026-11-17', 103], ['2026-11-18', 104], ['2026-11-19', 105]] },
    ] })
    if (url.endsWith('us-market-data.json')) return Response.json({ series: { spxForwardEpsChange: {
      name: 'EPS', unit: '%', source: 'https://advantage.factset.com/', scope: 'FactSet 标普 500', frequency: '每周', history: [['2026-11-13', 1.2]],
    } } })
    return new Response(null, { status: 503 })
  }))
  render(<MemoryRouter initialEntries={['/monitor?tab=us-market']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><UsMarketView /></MemoryRouter>)
  const brief = await screen.findByRole('region', { name: '本周美股变化' })
  expect(await within(brief).findByText(/11-12 → 11-19/)).toBeTruthy()
  expect(screen.getAllByText('未来12个月 EPS 预期较季末变化').length).toBeGreaterThan(0)
  expect(screen.queryByText(/EPS 预期变化$/)).toBeNull()
})
