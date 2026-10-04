import React from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import IndexHeatmap, { fetchIndexQuotes, INDEX_CONFIG } from './IndexHeatmap'

const row = (ticker: string, code: string, close: number, change: number, cap: number, sector: string) => ({ s: ticker, d: [code, close, change, cap, sector] })
const scanner = (rows: unknown[]) => vi.fn(async (...args: unknown[]) => {
  const url = String(args[0])
  if (!url.includes('grid-market')) return new Response(JSON.stringify({ data: rows }))
  const symbols = new URL(url, 'https://local.test').searchParams.get('symbols')!
  return new Response(symbols.split(',').map(symbol => {
    const fields = Array(35).fill('')
    fields[3] = '430'; fields[30] = '20260930150000'; fields[32] = '2.09'
    return `v_${symbol}="${fields.join('~')}";`
  }).join('\n'))
})

beforeEach(() => {
  class RO { constructor(private cb: () => void) {} observe() { this.cb() } disconnect() {} }
  vi.stubGlobal('ResizeObserver', RO)
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 900 })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 460 })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('指数热力图数据', () => {
  it('恒生指数 / 恒生科技：按指数实时成分（symbolset）查询，代码补成 5 位，中文名取对照表', async () => {
    const f = scanner([row('HKEX:700', '700', 421.2, -2.27, 3.88e12, 'Technology Services'), row('HKEX:5', '5', 149.5, -5.38, 2.55e12, 'Finance')])
    const stocks = await fetchIndexQuotes('hsi', f as unknown as typeof fetch)
    const [url, init] = f.mock.calls[0] as [string, { body: string }]
    expect(url).toContain('/hongkong/scan')
    expect(JSON.parse(init.body).symbols).toEqual({ symbolset: ['SYML:HSI;HSI'] })
    expect(stocks.map(s => [s.code, s.name, s.sector])).toEqual([['00700', '腾讯控股', 'Technology Services'], ['00005', '汇丰控股', 'Finance']])
    const t = scanner([row('HKEX:2513', '2513', 100, 1, 5e10, 'Technology Services'), row('HKEX:99999', '99999', 1, 0, 1e9, 'Finance')])
    const tech = await fetchIndexQuotes('hstech', t as unknown as typeof fetch)
    expect(JSON.parse((t.mock.calls[0] as [string, { body: string }])[1].body).symbols).toEqual({ symbolset: ['SYML:HSI;HSTECH'] })
    expect(tech.map(s => s.name)).toEqual(['智谱', '99999']) // 对照表没有的显示代码
  })

  it('中证500：请求 A 股 scanner，带全部 500 只成分股代码，代码 6 位', async () => {
    const f = scanner([row('SZSE:000009', '9', 10, 1.2, 1.5e10, 'Producer Manufacturing')])
    const [s] = await fetchIndexQuotes('csi500', f as unknown as typeof fetch)
    const [url, init] = f.mock.calls[0] as [string, { body: string }]
    expect(url).toContain('/china/scan')
    const tickers = JSON.parse(init.body).symbols.tickers as string[]
    expect(tickers).toHaveLength(INDEX_CONFIG.csi500.list!.length)
    expect(tickers.length).toBeGreaterThanOrEqual(499)
    expect(new Set(tickers).size).toBe(tickers.length)
    expect(tickers.every(t => /^(SSE|SZSE):\d{6}$/.test(t))).toBe(true)
    expect(s).toMatchObject({ code: '000009', name: '中国宝安' })
  })

  it('组件：展示指数名称、涨跌家数与按行业分块的个股名称', async () => {
    vi.stubGlobal('fetch', scanner([
      row('HKEX:700', '700', 421.2, -2.27, 3.88e12, 'Technology Services'),
      row('HKEX:5', '5', 149.5, 3.38, 2.55e12, 'Finance'),
      row('HKEX:939', '939', 9.5, 0.4, 2.6e12, 'Finance'),
    ]))
    render(<IndexHeatmap market="hsi" tick={0} active />)
    await waitFor(() => expect(screen.getByText('腾讯控股')).toBeTruthy())
    expect(screen.getByText(/恒生指数 · 3 只/)).toBeTruthy()
    expect(screen.getByText('金融')).toBeTruthy()
    expect(screen.getByText('技术服务')).toBeTruthy()
  })

  it('接口失败时显示错误和重试按钮', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 500 })))
    render(<IndexHeatmap market="csi500" tick={0} active />)
    await waitFor(() => expect(screen.getByRole('button', { name: '重试' })).toBeTruthy())
  })

  it('明确显示旧行情日期，刷新失败时保留日期并提示错误', async () => {
    const f = scanner([row('HKEX:700', '700', 420, -2, 1e12, 'Technology Services')])
    vi.stubGlobal('fetch', f)
    const { rerender } = render(<IndexHeatmap market="hsi" tick={0} active />)
    await waitFor(() => expect(screen.getByText(/行情时间（北京时间）：2026-09-30 15:00:00/)).toBeTruthy())
    expect(screen.getByText(/含历史交易日行情/)).toBeTruthy()
    expect(screen.getAllByText('+2.09%').length).toBeGreaterThan(0)
    f.mockRejectedValue(new Error('离线'))
    rerender(<IndexHeatmap market="hsi" tick={1} active />)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('刷新失败，保留上次行情'))
    expect(screen.getByText(/2026-09-30 15:00:00/)).toBeTruthy()
  })
})
