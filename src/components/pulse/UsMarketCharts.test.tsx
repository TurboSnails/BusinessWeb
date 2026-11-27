import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import UsMarketCharts from './UsMarketCharts'
import { resetUsHistoryCache } from './usHistory'

const weekdays = (from: string, to: string) => {
  const out: string[] = []
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() % 6) out.push(d.toISOString().slice(0, 10))
  }
  return out
}
const days = weekdays('2026-01-05', '2026-01-16')
// 服务端整理后的 Yahoo 日线：[日期, 开, 收, 高, 低, 成交股数]
const base: Record<string, number> = { 'us^GSPC': 6000, 'us^IXIC': 20000, 'us^DJI': 45000 }
const shares: Record<string, number> = { 'us^GSPC': 4e9, 'us^IXIC': 8e9, 'us^DJI': 5e8 }
const yahoo = (symbol: string) => ({ code: 0, source: 'yahoo', adjustment: 'split', currency: 'USD', data: { [symbol]: { day: days.map((date, i) => {
  const open = base[symbol] + i * 10, close = open + 5
  return [date, open, close, close + 3, open - 2, shares[symbol]]
}) } } })
const cboe = { series: { volume: { name: '美股全市场成交量（Cboe）', unit: '亿股', history: [
  ['2025-11-21', 160], ['2025-11-28', 90], ...weekdays('2025-12-03', '2026-01-16').map(d => [d, 200]),
] } } }

type Handler = (url: URL) => Response | Promise<Response>
function stubFetch({ index = (u: URL) => new Response(JSON.stringify(yahoo(u.searchParams.get('symbol')!))), market = () => new Response(JSON.stringify(cboe)) }: { index?: Handler; market?: Handler } = {}) {
  const f = vi.fn(async (input: string) => {
    const url = new URL(input, 'http://localhost')
    return url.pathname.endsWith('us-market-data.json') ? market(url) : index(url)
  })
  vi.stubGlobal('fetch', f)
  return f
}

beforeEach(() => resetUsHistoryCache())
afterEach(() => vi.unstubAllGlobals())

it('默认标普 500 日线；可切换指数、周期与成交口径', async () => {
  const f = stubFetch()
  render(<UsMarketCharts />)
  const card = screen.getByRole('region', { name: '美股指数 K 线与成交' })
  await within(card).findByRole('img', { name: '标普 500K线图，单位点；红涨绿跌' })
  const query = new URL(f.mock.calls.find(([u]) => String(u).includes('grid-market'))![0], 'http://localhost').searchParams
  expect([query.get('kind'), query.get('symbol')]).toEqual(['candles', 'us^GSPC'])
  // 最后一根：开 6090 收 6095，相对上一根 6085 涨 0.16%
  expect(within(card).getByText('涨跌幅 +0.16%')).toBeTruthy()
  expect(within(card).getByText(/K 线数据截至 2026-01-16 · 获取于 .+（本机时间）/)).toBeTruthy()
  // 指数成交量：40 亿股 / 日
  const volume = within(card).getByRole('group', { name: '成交量' })
  expect(within(volume).getByRole('img', { name: '标普 500成交量柱状图，单位亿股' })).toBeTruthy()
  expect(within(volume).getByText('40.00 亿股', { selector: 'strong' })).toBeTruthy()
  expect(within(card).getByText(/指数成交量是该指数成分股的合计成交量/)).toBeTruthy()

  fireEvent.click(within(card).getByRole('button', { name: '纳斯达克综合' }))
  await within(card).findByRole('img', { name: '纳斯达克综合K线图，单位点；红涨绿跌' })
  expect(within(card).getByRole('button', { name: '纳斯达克综合' }).getAttribute('aria-pressed')).toBe('true')
  expect(within(volume).getByText('80.00 亿股', { selector: 'strong' })).toBeTruthy()
  expect(within(card).getByText(/纳斯达克综合（\^IXIC）/)).toBeTruthy()

  // 周线：第二周开 20050 收 20095；成交量五天合计 400 亿股
  fireEvent.click(within(card).getByRole('button', { name: '周线' }))
  await waitFor(() => expect(within(card).getByText(/开 20,050.00/)).toBeTruthy())
  expect(within(card).getByText('20,095.00').tagName).toBe('B')
  expect(within(volume).getByText('400.00 亿股', { selector: 'strong' })).toBeTruthy()

  // 全美成交量（Cboe）：周累计 1000 亿股，首个不完整的周已略去
  fireEvent.click(await within(volume).findByRole('button', { name: '全美成交量' }))
  expect(within(volume).getByRole('img', { name: '全美股票成交量柱状图，单位亿股' })).toBeTruthy()
  expect(within(volume).getByText('1,000.00 亿股', { selector: 'strong' })).toBeTruthy()
  fireEvent.change(within(volume).getByRole('slider'), { target: { value: '0' } })
  expect(within(volume).getByText('2025-12-08 当周')).toBeTruthy()
  expect(within(card).getByText(/全美成交量来自 Cboe.+截至 2026-01-16/)).toBeTruthy()

  // 月线：一月 12 个交易日 × 200
  fireEvent.click(within(card).getByRole('button', { name: '月线' }))
  await waitFor(() => expect(within(volume).getByText('2,400.00 亿股', { selector: 'strong' })).toBeTruthy())
  expect(within(card).getByRole('button', { name: '月线' }).getAttribute('aria-pressed')).toBe('true')

  fireEvent.click(within(volume).getByRole('button', { name: '指数成交量' }))
  // 纳指一月 10 个交易日 × 80 亿股
  expect(within(volume).getByText('800.00 亿股', { selector: 'strong' })).toBeTruthy()
})

it('指数接口失败时显示错误与重试，重试成功后出图；Cboe 不受影响', async () => {
  let fail = true
  stubFetch({ index: u => fail ? new Response('', { status: 502 }) : new Response(JSON.stringify(yahoo(u.searchParams.get('symbol')!))) })
  render(<UsMarketCharts />)
  const card = screen.getByRole('region', { name: '美股指数 K 线与成交' })
  await waitFor(() => expect(within(card).getAllByRole('alert')).toHaveLength(2))
  expect(within(card).queryByRole('img', { name: /K线图/ })).toBeNull()
  expect(within(card).getAllByText('美股指数行情暂时无法获取，请重试')).toHaveLength(2)
  // 全美成交量来自静态文件，仍可查看
  fireEvent.click(await within(card).findByRole('button', { name: '全美成交量' }))
  expect(within(card).getByRole('img', { name: '全美股票成交量柱状图，单位亿股' })).toBeTruthy()
  fail = false
  fireEvent.click(within(card).getByRole('button', { name: '重试' }))
  await within(card).findByRole('img', { name: '标普 500K线图，单位点；红涨绿跌' })
  expect(within(card).queryByRole('alert')).toBeNull()
})

it('Cboe 文件缺失（SPA 回退成网页）时只隐藏「全美成交量」选项', async () => {
  const f = stubFetch({ market: () => new Response('<!doctype html><html></html>', { status: 200, headers: { 'Content-Type': 'text/html' } }) })
  render(<UsMarketCharts />)
  const card = screen.getByRole('region', { name: '美股指数 K 线与成交' })
  await within(card).findByRole('img', { name: '标普 500成交量柱状图，单位亿股' })
  await waitFor(() => expect(f.mock.calls.some(([u]) => String(u).includes('us-market-data.json'))).toBe(true))
  await new Promise(r => setTimeout(r, 0))
  expect(within(card).getByRole('button', { name: '指数成交量' })).toBeTruthy()
  expect(within(card).queryByRole('button', { name: '全美成交量' })).toBeNull()
  expect(within(card).queryByText(/全市场请切到/)).toBeNull()
})
