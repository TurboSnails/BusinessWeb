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
  const dashboard = screen.getByRole('region', { name: '美股市场仪表盘' })
  const summary = screen.getByRole('heading', { name: '本站宏观攻守结论' }).closest('section')
  expect(dashboard.firstElementChild).toBe(summary)
  expect(screen.getByText('市场层面怎么看（短线参考）')).toBeTruthy()
  expect(screen.getByText(/综合攻守结论以上方卡片为准。/)).toBeTruthy()
  expect(screen.getAllByText('未来12个月 EPS 预期较季末变化').length).toBeGreaterThan(0)
  expect(screen.queryByText(/EPS 预期变化$/)).toBeNull()
})

it.each([
  { marketRatio: null, ownVolume: true, expected: '1.50 倍 标的自身' },
  { marketRatio: 1.2, ownVolume: true, expected: '1.20 倍 全美市场' },
  { marketRatio: null, ownVolume: false, expected: '—' },
])('比较表按数据覆盖显示量比与口径 $expected', async ({ marketRatio, ownVolume, expected }) => {
  const dates = Array.from({ length: 30 }, (_, day) => new Date(Date.UTC(2026, 9, day + 1)))
    .filter(date => date.getUTCDay() > 0 && date.getUTCDay() < 6)
    .map(date => date.toISOString().slice(0, 10))
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('us-market-slices.json')) return Response.json({ slices: [{
      id: 'spx', name: '标普 500', group: 'broad', symbol: '^GSPC', scope: '指数', source: '',
      history: dates.map(date => [date, 100]), volume: ownVolume ? dates.map(date => [date, date === dates.at(-1) ? 15 : 10]) : [],
    }] })
    if (url.endsWith('us-market-data.json')) return Response.json({ series: { volumeRatio: {
      name: '全美量比', unit: '倍', source: '', scope: '全美', frequency: '日频', history: [[dates.at(-1), marketRatio]],
    } } })
    return new Response(null, { status: 503 })
  }))
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><UsMarketView /></MemoryRouter>)
  const matrix = await screen.findByRole('table', { name: '同类市场比较' })
  const row = within(matrix).getByRole('row', { name: /标普 500/ })
  const volumeCell = within(row).getAllByRole('cell').at(-2)!
  expect(within(row).getAllByRole('cell', { name: expected })).toContain(volumeCell)
})

it('流动性深链按四周比较准备金，利差仅按同日配对，切回大盘后能选综合指数', async () => {
  const rate = (history: [string, number][], unit = '%') => ({ name: '读数', frequency: '日频', scope: '', source: '', history, unit })
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('us-market-data.json')) return Response.json({ series: {
      bankReserves: rate([['2026-10-21', 2962.607], ['2026-11-18', 2979.656]], '十亿美元'),
      sofr: rate([['2026-11-19', 3.91]]), iorb: rate([['2026-11-19', 3.90], ['2026-11-20', 3.8]]),
    } })
    if (url.endsWith('us-market-slices.json')) return Response.json({ slices: ['spx', 'ixic', 'ndx'].map((id, n) => ({
      id, symbol: ['^GSPC', '^IXIC', '^NDX'][n], name: ['标普 500', '纳斯达克综合指数', '纳斯达克 100'][n], group: 'broad',
      scope: '指数', source: '', history: [['2026-11-19', 20000 + n]],
    })) })
    return new Response(null, { status: 503 })
  }))
  render(<MemoryRouter initialEntries={['/monitor?tab=us-market&view=liquidity']}><UsMarketView /></MemoryRouter>)
  expect(await screen.findByText('+17.05 十亿美元')).toBeTruthy()
  expect(screen.getByRole('heading', { name: '隔夜融资相对准备金利率' }).nextElementSibling?.textContent).toBe('1 bp')
  fireEvent.click(screen.getByRole('button', { name: '大盘' }))
  fireEvent.click(screen.getByRole('button', { name: '纳斯达克综合指数' }))
  expect(screen.getByRole('heading', { name: '纳斯达克综合指数' })).toBeTruthy()
  expect(screen.getByText('20,001 点')).toBeTruthy()
})

it('不同日期的隔夜利率不拼接，缺少四周前准备金时不估算变化', async () => {
  const row = (day: string, value: number) => ({ name: '利率', frequency: '日频', scope: '', source: '', unit: '%', history: [[day, value]] })
  vi.stubGlobal('fetch', async (url: string) => url.endsWith('us-market-data.json')
    ? Response.json({ series: { sofr: row('2026-11-19', 3.91), iorb: row('2026-11-20', 3.9) } })
    : new Response(null, { status: 503 }))
  render(<MemoryRouter initialEntries={['/monitor?tab=us-market&view=liquidity']}><UsMarketView /></MemoryRouter>)
  expect(await screen.findByText('3.91%')).toBeTruthy()
  expect(screen.getByText('等待同日利率')).toBeTruthy()
  expect(screen.getByText('等待相隔四周的观测')).toBeTruthy()
})
