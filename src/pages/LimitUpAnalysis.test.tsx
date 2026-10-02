import React from 'react'
import { act, render, screen, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LimitUpAnalysis from './LimitUpAnalysis'
const valid = { code: 200, data: { plate_stock: [{ secu_name: '医药', change: .02, plate_stock_up_num: 1, stock_list: [{ secu_code: 'sz000710', secu_name: '贝瑞基因', time: '2026-09-30 09:33:06', last_px: 10, change: .1, cmc: 100000000, up_num: '4天2板' }] }] } }
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })
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
