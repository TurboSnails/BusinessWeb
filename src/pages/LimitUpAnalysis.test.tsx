import React from 'react'
import { act, render, screen, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LimitUpAnalysis from './LimitUpAnalysis'
const valid = { code: 200, data: { plate_stock: [{ secu_name: '医药', change: .02, plate_stock_up_num: 1, stock_list: [{ secu_code: 'sz000710', secu_name: '贝瑞基因', time: '2026-09-30 09:33:06', last_px: 10, change: .1, cmc: 100000000, up_num: '4天2板' }] }] } }
afterEach(() => { cleanup(); sessionStorage.clear(); vi.useRealTimers(); vi.unstubAllGlobals() })
async function show(date: string, response: unknown, status = 200) {
  vi.useFakeTimers(); vi.setSystemTime(new Date(`${date}T08:00:00Z`))
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(response), { status }))
  vi.stubGlobal('fetch', fetcher)
  await act(async () => { render(<LimitUpAnalysis />) })
  return fetcher
}
describe('每日涨停状态展示', () => {
  it('休市显示最近交易日和真实股票，切换模式重新请求', async () => {
    const fetcher = await show('2026-10-02', valid)
    expect(screen.getByRole('status').textContent).toContain('休市')
    expect(screen.getByRole('status').textContent).toContain('数据日期：2026-09-30')
    expect(screen.getByText('贝瑞基因')).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('checkbox', { name: '只看涨停' })))
    expect(String(fetcher.mock.calls[fetcher.mock.calls.length - 1]?.[0])).toContain('up_limit=0')
  })
  it('接口故障显示错误而不显示无数据结论', async () => {
    await show('2026-09-30', { error: '失败' }, 502)
    expect(screen.getByRole('status').textContent).toContain('接口失败')
    expect(screen.getByText(/HTTP 502/)).toBeTruthy()
    expect(screen.queryByText('暂无涨停股票数据')).toBeNull()
  })
  it('交易日空列表明确显示数据源为空', async () => {
    await show('2026-09-30', { code: 200, data: { plate_stock: [] } })
    expect(screen.getByRole('status').textContent).toContain('为交易日，数据源返回空列表')
    expect(screen.queryByText(/HTTP 502/)).toBeNull()
  })
})

it('离开再回来保留日期、模式和缓存，不重新请求', async () => {
  const fetcher = await show('2026-10-02', valid)
  await act(async () => fireEvent.click(screen.getByRole('checkbox', { name: '只看涨停' })))
  expect(fetcher).toHaveBeenCalledTimes(2)
  cleanup()
  await act(async () => { render(<LimitUpAnalysis />) })
  expect(screen.getByText('贝瑞基因')).toBeTruthy()
  expect((screen.getByRole('checkbox', { name: '只看涨停' }) as HTMLInputElement).checked).toBe(false)
  expect((screen.getByLabelText('查询日期') as HTMLInputElement).value).toBe('2026-10-02')
  expect(fetcher).toHaveBeenCalledTimes(2)
})
it('手动刷新失败保留已有数据和原获取时间', async () => {
  const fetcher = await show('2026-09-30', valid)
  const originalTime = screen.getByText(/数据来源：财联社/).textContent
  vi.setSystemTime(new Date('2026-09-30T08:03:00Z'))
  fetcher.mockRejectedValueOnce(new Error('网络断开'))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '刷新数据' })))
  expect(screen.getByText('贝瑞基因')).toBeTruthy()
  expect(screen.getByRole('status').textContent).toContain('刷新失败')
  expect(screen.getByText(/网络断开/)).toBeTruthy()
  expect(screen.getByText(/数据来源：财联社/).textContent).toBe(originalTime)
})
it('缓存过期返回页面先保留旧数据，再刷新', async () => {
  const fetcher = await show('2026-09-30', valid)
  cleanup(); vi.setSystemTime(new Date('2026-09-30T08:06:00Z'))
  fetcher.mockRejectedValueOnce(new Error('网络断开'))
  await act(async () => { render(<LimitUpAnalysis />) })
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(screen.getByText('贝瑞基因')).toBeTruthy()
  expect(screen.getByRole('status').textContent).toContain('刷新失败')
})

it('损坏缓存不导致页面崩溃，而是重新加载', async () => {
  sessionStorage.setItem('limit-up:data:v1', JSON.stringify({ '2026-09-30:1': { status: 'ready', dataDate: '2026-09-30', fetchedAt: '2026-09-30T08:00:00Z', concepts: [{ name: '损坏板块', stocks: [] }] } }))
  const fetcher = await show('2026-09-30', valid)
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(screen.getByText('贝瑞基因')).toBeTruthy()
})
