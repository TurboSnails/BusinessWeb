import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CnChart, { candlesUrl } from './CnChart'

const day = (date: string, close: number): string[] => [date, String(close - 0.2), String(close), String(close + 0.5), String(close - 0.5), '1000']
const ok = (rows: string[][]) => vi.fn(async () => new Response(JSON.stringify({ data: { sh600519: { qfqday: rows } } }), { status: 200 }))

afterEach(() => vi.unstubAllGlobals())

describe('CnChart', () => {
  it('请求现有腾讯 candles 代理，近三年区间', () => {
    const url = candlesUrl('sh600519', new Date('2026-11-14T08:00:00Z'))
    expect(url).toBe('/api/grid-market?kind=candles&symbol=sh600519&begin=2023-11-14&end=2026-11-14')
  })

  it('不支持 IntersectionObserver 时等待点击；加载后画 K 线并标出行情日期与来源', async () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const fetchImpl = ok([day('2026-11-12', 1500), day('2026-11-13', 1510)])
    const { container } = render(<CnChart tencentSymbol="sh600519" name="贵州茅台" fetchImpl={fetchImpl as unknown as typeof fetch} />)
    expect(fetchImpl).not.toHaveBeenCalled()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '加载走势图' })) })
    await waitFor(() => expect(container.querySelector('svg[role="img"]')).not.toBeNull())
    expect(container.querySelector('svg')!.getAttribute('aria-label')).toContain('红涨绿跌')
    expect(container.querySelectorAll('.china-chart__up').length).toBeGreaterThan(0)
    expect(screen.getByText(/最新收盘 1,510.00 元（2026-11-13）/)).toBeTruthy()
    const fresh = container.querySelector('.page-data-freshness')!
    expect(fresh.textContent).toContain('行情日期 2026-11-13')
    expect(fresh.textContent).toContain('收盘后数据，EOD')
    fireEvent.click(screen.getByRole('button', { name: '周线' }))
    expect(screen.getByRole('button', { name: '周线' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('数据为空时显示空状态', async () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    render(<CnChart tencentSymbol="sh600519" name="贵州茅台" fetchImpl={ok([]) as unknown as typeof fetch} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '加载走势图' })) })
    await waitFor(() => expect(screen.getByText(/行情源没有返回这只股票的日线数据/)).toBeTruthy())
  })

  it('接口失败时提示并可重试，不抛错', async () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 502 }))
    render(<CnChart tencentSymbol="sh600519" name="贵州茅台" fetchImpl={fetchImpl as unknown as typeof fetch} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '加载走势图' })) })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('行情服务暂时不可用'))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '重试' })) })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
