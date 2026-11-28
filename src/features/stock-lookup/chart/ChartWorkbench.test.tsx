import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __test as apiParse } from '../api'
import type { BarsPage, Timeframe } from '../types'
import { makeFakeBars, makeFakeNews } from './fakeBars'
import { CHART_SETTINGS_KEY } from './settings'

const calls = vi.hoisted(() => ({
  charts: [] as {
    options: Record<string, unknown>
    series: { type: string; options: Record<string, unknown>; data: unknown[]; pane?: number }[]
    removed: boolean
    crosshair?: (p: unknown) => void
    click?: (p: unknown) => void
    range?: (p: unknown) => void
    logicalRange: { from: number; to: number } | null
    panes: { stretch: number }[]
  }[],
  markers: [] as unknown[][],
}))

vi.mock('lightweight-charts', () => {
  const mk = (type: string) => ({ type })
  return {
    CandlestickSeries: mk('Candlestick'),
    HistogramSeries: mk('Histogram'),
    LineSeries: mk('Line'),
    ColorType: { Solid: 'solid' },
    CrosshairMode: { Normal: 0 },
    LineStyle: { Solid: 0, Dotted: 1, Dashed: 2 },
    createSeriesMarkers: (_series: unknown, initial?: unknown[]) => {
      const bag = { list: initial ? [...initial] : [] as unknown[] }
      calls.markers.push(bag.list)
      return {
        setMarkers: (m: unknown[]) => { bag.list.length = 0; bag.list.push(...m) },
        markers: () => bag.list,
        detach: () => undefined,
      }
    },
    createChart: (_el: HTMLElement, options: Record<string, unknown>) => {
      const chart: (typeof calls.charts)[number] = {
        options,
        series: [],
        removed: false,
        logicalRange: null,
        panes: [{ stretch: 1 }],
      }
      calls.charts.push(chart)
      const api = {
        addSeries(def: { type: string }, opts: Record<string, unknown>, paneIndex = 0) {
          const s = { type: def.type, options: opts, data: [] as unknown[], pane: paneIndex }
          chart.series.push(s)
          return {
            setData: (d: unknown[]) => { s.data = d },
            priceScale: () => ({ applyOptions: () => undefined }),
            createPriceLine: () => ({}),
            removePriceLine: () => undefined,
            priceToCoordinate: (price: number) => 200 - price, // 测试用线性映射
          }
        },
        addPane: () => {
          chart.panes.push({ stretch: 1 })
          return {
            setStretchFactor: (n: number) => { chart.panes[chart.panes.length - 1].stretch = n },
            setHeight: () => undefined,
            getStretchFactor: () => 1,
          }
        },
        panes: () => chart.panes.map((p, i) => ({
          setStretchFactor: (n: number) => { p.stretch = n },
          setHeight: () => undefined,
          getStretchFactor: () => p.stretch,
          paneIndex: () => i,
          getHTMLElement: () => {
            const el = document.createElement('div')
            Object.defineProperty(el, 'getBoundingClientRect', {
              value: () => ({ top: 0, left: 0, width: 600, height: 280, bottom: 280, right: 600, x: 0, y: 0, toJSON: () => ({}) }),
            })
            return el
          },
        })),
        paneSize: () => ({ height: 280, width: 600 }),
        timeScale: () => ({
          setVisibleLogicalRange: (r: { from: number; to: number }) => { chart.logicalRange = r },
          getVisibleLogicalRange: () => chart.logicalRange ?? { from: 0, to: 80 },
          fitContent: () => { chart.logicalRange = { from: 0, to: 10 } },
          scrollToRealTime: () => undefined,
          subscribeVisibleLogicalRangeChange: (h: (p: unknown) => void) => { chart.range = h },
          unsubscribeVisibleLogicalRangeChange: () => undefined,
          subscribeSizeChange: () => undefined,
          unsubscribeSizeChange: () => undefined,
        }),
        subscribeCrosshairMove: (h: (p: unknown) => void) => { chart.crosshair = h },
        unsubscribeCrosshairMove: () => undefined,
        subscribeClick: (h: (p: unknown) => void) => { chart.click = h },
        unsubscribeClick: () => undefined,
        remove: () => { chart.removed = true },
      }
      return api
    },
  }
})

import ChartWorkbench from './ChartWorkbench'

function renderChart(api: { bars: (symbol: string, tf: Timeframe, before?: number) => Promise<BarsPage> }, initial = '/') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <ChartWorkbench symbol="MRVL" api={api} timezone="America/New_York" news={makeFakeNews(makeFakeBars({ count: 80 }).bars)} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  calls.charts = []
  calls.markers = []
  localStorage.removeItem(CHART_SETTINGS_KEY)
  document.documentElement.style.setProperty('--up', 'rgb(63, 154, 98)')
  document.documentElement.style.setProperty('--down', 'rgb(196, 80, 63)')
  document.documentElement.style.setProperty('--bg-card', '#fff')
  document.documentElement.style.setProperty('--text-secondary', '#666')
  document.documentElement.style.setProperty('--border-subtle', '#ddd')
  document.documentElement.style.setProperty('--accent', '#06c')
  document.documentElement.style.setProperty('--system-yellow', '#c90')
  document.documentElement.style.setProperty('--system-teal', '#0a8')
  document.documentElement.style.setProperty('--system-purple', '#80c')
  document.documentElement.style.setProperty('--warm-ink', '#a60')
})
afterEach(() => {
  localStorage.removeItem(CHART_SETTINGS_KEY)
})

describe('ChartWorkbench', () => {
  it('加载假 api 后画出 K 线与成交量/MACD，底部显示已加载根数', async () => {
    const page = makeFakeBars({ count: 80 })
    const bars = vi.fn(async () => page)
    renderChart({ bars })
    expect(screen.getByRole('status', { name: '正在加载' })).toBeTruthy()
    await waitFor(() => expect(calls.charts.length).toBe(1))
    const chart = calls.charts[0]
    expect(chart.series.some(s => s.type === 'Candlestick')).toBe(true)
    expect(chart.series.filter(s => s.type === 'Histogram').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/已加载 80 根/)).toBeTruthy()
    expect(screen.getByRole('img', { name: /MRVL 日线/ })).toBeTruthy()
  })

  it('周期按钮只改 tf 查询参数', async () => {
    const bars = vi.fn(async (_s: string, tf: Timeframe) => makeFakeBars({ tf, count: 40 }))
    renderChart({ bars })
    await waitFor(() => expect(calls.charts.length).toBe(1))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '5分钟' }))
    })
    await waitFor(() => expect(bars.mock.calls.some(c => c[1] === '5m')).toBe(true))
    expect(screen.getByRole('button', { name: '5分钟' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('出错显示中文与重试', async () => {
    const bars = vi.fn()
      .mockRejectedValueOnce(new Error('上游超时'))
      .mockResolvedValueOnce(makeFakeBars({ count: 30 }))
    renderChart({ bars })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/上游超时/))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '重试' })) })
    await waitFor(() => expect(screen.getByText(/已加载 30 根/)).toBeTruthy())
  })

  it('向左翻页拼接且防并发', async () => {
    let page = 0
    const bars = vi.fn(async (_s: string, tf: Timeframe, before?: number) => {
      page += 1
      await new Promise(r => setTimeout(r, 20))
      return makeFakeBars({
        tf,
        before,
        count: 50,
        hasMore: page < 3,
        endT: before ? before - 86400 : undefined,
      })
    })
    renderChart({ bars })
    await waitFor(() => expect(calls.charts.length).toBe(1))
    const chart = calls.charts[0]
    await act(async () => {
      chart.range?.({ from: 2, to: 40 })
      chart.range?.({ from: 1, to: 40 })
      chart.range?.({ from: 0, to: 40 })
    })
    await waitFor(() => expect(screen.getByText(/已加载 100 根|已加载 150 根/).textContent).toMatch(/已加载/))
    // 并发拖动不应打出远超页数的请求
    expect(bars.mock.calls.filter(c => c[2] != null).length).toBeLessThanOrEqual(3)
  })

  it('设置弹层可开，价位成交量写入 localStorage', async () => {
    const bars = vi.fn(async () => makeFakeBars({ count: 40 }))
    renderChart({ bars })
    await waitFor(() => expect(calls.charts.length).toBe(1))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '图表设置' })) })
    expect(screen.getByRole('dialog', { name: '图表设置' })).toBeTruthy()
    const vp = screen.getByLabelText('价位成交量') as HTMLInputElement
    await act(async () => { fireEvent.click(vp) })
    const saved = JSON.parse(localStorage.getItem(CHART_SETTINGS_KEY)!)
    expect(saved.volumeProfile).toBe(true)
  })

  it('无数据周期给出说明', async () => {
    const bars = vi.fn(async () => ({
      ...makeFakeBars({ tf: '1m', count: 0 }),
      bars: [],
      hasMore: false,
    }))
    render(
      <MemoryRouter initialEntries={['/?tf=1m']}>
        <ChartWorkbench symbol="MRVL" api={{ bars }} timezone="America/New_York" />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByRole('note').textContent).toMatch(/1 分钟线|暂无数据/))
  })

  it('使用 fixtures/bars-MRVL-1d + news-MRVL 真实样本', async () => {
    const page = (await import('../fixtures/bars-MRVL-1d.json')).default as BarsPage
    const newsRaw = (await import('../fixtures/news-MRVL.json')).default
    const newsPage = apiParse.parseNewsPage(newsRaw)
    expect(page.bars.length).toBeGreaterThan(10)
    expect(newsPage.items.length).toBeGreaterThan(0)
    const bars = vi.fn(async () => page)
    render(
      <MemoryRouter initialEntries={['/']}>
        <ChartWorkbench
          symbol="MRVL"
          api={{ bars }}
          timezone={page.timezone}
          news={newsPage.items}
        />
      </MemoryRouter>,
    )
    await waitFor(() => expect(calls.charts.length).toBe(1))
    const candle = calls.charts[0].series.find(s => s.type === 'Candlestick')
    expect(candle?.data.length).toBe(page.bars.length)
    expect(screen.getByText(new RegExp(`已加载 ${page.bars.length} 根`))).toBeTruthy()
    // 新闻打点应写入 markers（id 以 news: 开头）
    await waitFor(() => {
      const flat = calls.markers.flat()
      expect(flat.some((m: unknown) => {
        const id = (m as { id?: string }).id
        return typeof id === 'string' && id.startsWith('news:')
      })).toBe(true)
    })
  })
})
