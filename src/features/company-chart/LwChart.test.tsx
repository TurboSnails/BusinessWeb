import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// jsdom 画不了 canvas：整库替身，只记录调用
const calls = vi.hoisted(() => ({
  charts: [] as { options: Record<string, unknown>; series: { type: string; options: Record<string, unknown>; data: unknown[]; priceLines: Record<string, unknown>[] }[]; removed: boolean; crosshair?: (p: unknown) => void }[],
}))
vi.mock('lightweight-charts', () => {
  const mk = (type: string) => ({ type })
  return {
    CandlestickSeries: mk('Candlestick'), HistogramSeries: mk('Histogram'), LineSeries: mk('Line'),
    ColorType: { Solid: 'solid' }, CrosshairMode: { Normal: 0 }, LineStyle: { Solid: 0, Dotted: 1, Dashed: 2 },
    createChart: (_el: HTMLElement, options: Record<string, unknown>) => {
      const chart: (typeof calls.charts)[number] = { options, series: [], removed: false }
      calls.charts.push(chart)
      return {
        addSeries(def: { type: string }, opts: Record<string, unknown>) {
          const s = { type: def.type, options: opts, data: [] as unknown[], priceLines: [] as Record<string, unknown>[] }
          chart.series.push(s)
          return {
            setData: (d: unknown[]) => { s.data = d },
            createPriceLine: (o: Record<string, unknown>) => { s.priceLines.push(o); return {} },
            priceScale: () => ({ applyOptions: () => undefined }),
          }
        },
        timeScale: () => ({ setVisibleLogicalRange: () => undefined, fitContent: () => undefined }),
        subscribeCrosshairMove: (h: (p: unknown) => void) => { chart.crosshair = h },
        unsubscribeCrosshairMove: () => undefined,
        remove: () => { chart.removed = true },
      }
    },
  }
})

import { MemoryRouter } from 'react-router-dom'
import LwChart from './LwChart'
import CompanyChartSection from './CompanyChartSection'
import type { PriceLevelsInput } from './levelsModel'

const day = (date: string, close: number): string[] => [date, String(close - 0.2), String(close), String(close + 0.5), String(close - 0.5), '1000']
const days = (n: number, start = 100): string[][] => Array.from({ length: n }, (_, i) => day(new Date(Date.UTC(2026, 0, 5 + i)).toISOString().slice(0, 10), start + i))
const ok = (symbol: string, rows: unknown[][], extra: Record<string, unknown> = {}) =>
  vi.fn(async () => new Response(JSON.stringify({ ...extra, data: { [symbol]: { [symbol.startsWith('sh') ? 'qfqday' : 'day']: rows } } }), { status: 200 }))
const levels: PriceLevelsInput = {
  market: 'cn',
  anchor: { price: 160, currency: 'CNY', date: '2026-03-01' },
  scenarios: [{ name: '悲观', price: '120 元' }, { name: '基准', price: '180 元' }, { name: '乐观', price: '9000 元' }],
  dcf: { status: 'ok', source: 'auto', currency: 'USD', price: 30, buyBelow: 20, mos: null },
}

beforeEach(() => {
  calls.charts = []
  vi.stubGlobal('IntersectionObserver', undefined)
  // jsdom 不加载 index.css：在 :root 上放同名 token，验证颜色确实取自 CSS 变量
  document.documentElement.style.setProperty('--up', 'rgb(196, 80, 63)')
  document.documentElement.style.setProperty('--down', 'rgb(63, 154, 98)')
})
afterEach(() => vi.unstubAllGlobals())

async function load(): Promise<void> {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '加载走势图' })) })
}

describe('LwChart', () => {
  it('进入视口前不加载图表库也不请求数据', () => {
    const fetchImpl = ok('sh600519', days(5))
    const loadLib = vi.fn(() => import('lightweight-charts'))
    render(<LwChart candleSymbol="sh600519" market="cn" currency="CNY" name="贵州茅台" levels={levels} fetchImpl={fetchImpl as unknown as typeof fetch} loadLib={loadLib} />)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(loadLib).not.toHaveBeenCalled()
  })

  it('沪深：红涨绿跌、K 线/成交量/MA20/MA60，只画可比较的价位线，图例写明未画原因', async () => {
    const fetchImpl = ok('sh600519', days(80, 100))
    render(<LwChart candleSymbol="sh600519" market="cn" currency="CNY" name="贵州茅台" levels={levels} fetchImpl={fetchImpl as unknown as typeof fetch} />)
    await load()
    await waitFor(() => expect(calls.charts.length).toBe(1))
    const chart = calls.charts[0]
    expect((chart.options.layout as Record<string, unknown>).attributionLogo).toBe(true)
    expect(chart.series.map(s => s.type)).toEqual(['Candlestick', 'Histogram', 'Line', 'Line'])
    const [candles, volume, ma20, ma60] = chart.series
    expect(candles.options.upColor).toBe('rgb(196, 80, 63)') // --up：红涨
    expect(candles.options.downColor).toBe('rgb(63, 154, 98)')
    expect(candles.data.length).toBe(80)
    expect(volume.data.length).toBe(80)
    expect(ma20.data.length).toBe(61)
    expect(ma60.data.length).toBe(21)
    expect(candles.priceLines.map(p => [p.title, p.price, p.lineStyle])).toEqual([['悲观', 120, 2], ['基准', 180, 2]])
    expect(screen.getByText(/未画出：/).textContent).toMatch(/乐观情景 9,000.00.*10 倍/)
    expect(screen.getByText(/未画出：/).textContent).toMatch(/自动 DCF合理价.*币种不同/)
    const img = screen.getByRole('img')
    expect(img.getAttribute('aria-label')).toContain('红涨绿跌')
    expect(img.getAttribute('aria-label')).toContain('2 条研究价位线')
    const summary = document.getElementById(img.getAttribute('aria-describedby')!)!
    expect(summary.textContent).toMatch(/最新收盘 179.00 元（2026-03-25）/)
    expect(screen.getByRole('note', { name: '数据更新时间' }).textContent).toMatch(/行情日期 2026-03-25.*腾讯行情日线（前复权）/)
  })

  it('美股：绿涨红跌，Yahoo 来源标注拆股调整；十字线移动更新读数', async () => {
    const rows = [['2026-11-12', 350, 355, 356, 349, 100], ['2026-11-13', 357.96, 356.27, 360.83, 355.75, 200]]
    const fetchImpl = ok('usAAPL', rows, { source: 'yahoo' })
    render(<LwChart candleSymbol="usAAPL" market="us" currency="USD" name="苹果" levels={{ market: 'us', anchor: { price: 356, currency: 'USD' }, scenarios: [{ name: '基准', price: '$400' }] }} fetchImpl={fetchImpl as unknown as typeof fetch} />)
    await load()
    await waitFor(() => expect(calls.charts.length).toBe(1))
    const candles = calls.charts[0].series[0]
    expect(candles.options.upColor).toBe('rgb(63, 154, 98)') // 美股：--down 作上涨色
    expect(candles.priceLines.map(p => p.title)).toEqual(['基准'])
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('绿涨红跌')
    expect(document.body.textContent).toContain('Yahoo Finance 日线（按拆股调整，未按分红调整）')
    expect(document.querySelector('.cc-lw__readout')!.textContent).toContain('2026-11-13')
    await act(async () => { calls.charts[0].crosshair!({ point: { x: 1, y: 1 }, logical: 0 }) })
    expect(document.querySelector('.cc-lw__readout')!.textContent).toContain('2026-11-12')
    await act(async () => { calls.charts[0].crosshair!({ logical: undefined }) })
    expect(document.querySelector('.cc-lw__readout')!.textContent).toContain('2026-11-13')
  })

  it('日/周切换是带 aria-pressed 的按钮，切换后按周重建图表并销毁旧图', async () => {
    render(<LwChart candleSymbol="hk00700" market="hk" currency="HKD" name="腾讯控股" levels={{ market: 'hk', anchor: {} }} fetchImpl={ok('hk00700', days(30, 300)) as unknown as typeof fetch} />)
    await load()
    await waitFor(() => expect(calls.charts.length).toBe(1))
    expect(document.body.textContent).toContain('腾讯行情港股日线（未复权）')
    const week = screen.getByRole('button', { name: '周线' })
    week.focus()
    fireEvent.click(week)
    expect(week.getAttribute('aria-pressed')).toBe('true')
    await waitFor(() => expect(calls.charts.length).toBe(2))
    expect(calls.charts[0].removed).toBe(true)
    expect(calls.charts[1].series[0].data.length).toBeLessThan(30)
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('周线')
  })

  it('父组件重渲染（levels 新对象、内容相同）不重建图表', async () => {
    const fetchImpl = ok('sh600519', days(10)) as unknown as typeof fetch
    const { rerender } = render(<LwChart candleSymbol="sh600519" market="cn" currency="CNY" name="茅台" levels={{ ...levels }} fetchImpl={fetchImpl} />)
    await load()
    await waitFor(() => expect(calls.charts.length).toBe(1))
    rerender(<LwChart candleSymbol="sh600519" market="cn" currency="CNY" name="茅台" levels={{ ...levels }} fetchImpl={fetchImpl} />)
    expect(calls.charts.length).toBe(1)
  })

  it('空数据显示空状态', async () => {
    render(<LwChart candleSymbol="sh600519" market="cn" currency="CNY" name="茅台" levels={levels} fetchImpl={ok('sh600519', []) as unknown as typeof fetch} />)
    await load()
    await waitFor(() => expect(screen.getByText(/行情源没有返回这只股票的日线数据/)).toBeTruthy())
    expect(calls.charts.length).toBe(0)
  })

  it('接口失败提示并可重试；图表库加载失败也走错误态', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 502 }))
    render(<LwChart candleSymbol="sh600519" market="cn" currency="CNY" name="茅台" levels={levels} externalUrl="https://x.test/" externalLabel="在 TradingView 查看" fetchImpl={fetchImpl as unknown as typeof fetch} />)
    await load()
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('行情服务暂时不可用'))
    expect(screen.getByRole('alert').querySelector('a')!.getAttribute('href')).toBe('https://x.test/')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '重试' })) })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('图表库加载失败', async () => {
    render(<LwChart candleSymbol="sh600519" market="cn" currency="CNY" name="茅台" levels={levels} fetchImpl={ok('sh600519', days(3)) as unknown as typeof fetch} loadLib={() => Promise.reject(new Error('chunk'))} />)
    await load()
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('图表组件加载失败'))
  })
})

describe('CompanyChartSection', () => {
  it('港股出图（不再是空状态）', () => {
    render(<CompanyChartSection market="hk" code="00700" name="腾讯控股" levels={{ market: 'hk', anchor: {} }} />, { wrapper: MemoryRouter })
    expect(screen.getByRole('figure', { name: '腾讯控股 走势图' })).toBeTruthy()
    expect(screen.getByText(/腾讯行情 · 港股日线/)).toBeTruthy()
  })
  it('美股出图；北交所不出图', () => {
    const { unmount } = render(<CompanyChartSection market="us" code="AAPL" name="苹果" levels={{ market: 'us', anchor: {} }} />, { wrapper: MemoryRouter })
    expect(screen.getByText(/Yahoo Finance/)).toBeTruthy()
    expect(screen.getByRole('figure', { name: '苹果 走势图' })).toBeTruthy()
    unmount()
    render(<CompanyChartSection market="cn" code="830799" name="北交所样例" levels={{ market: 'cn', anchor: {} }} />, { wrapper: MemoryRouter })
    expect(screen.getByText(/北交所个股暂无走势图数据源/)).toBeTruthy()
  })
})
