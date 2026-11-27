/** 至少 3 个接入页：失败 → 点重试 → 成功；以及观察盘 L13 超时 */
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetCombinedStrategyCache } from '../features/combined-strategy/load'
import { combinedStrategyFixture } from '../features/combined-strategy/fixture'
import { resetCompositeCache } from '../features/macro-posture/composite/load'
import { compositeFixture } from '../features/macro-posture/composite/fixture'
import { radarFixture } from '../features/market-radar/fixture'
import { marketReferenceFixture } from '../features/market-radar/market/market.fixture'
import { resetMacroSnapshotCache } from '../features/macro/useMacroSnapshot'
import { calendar } from '../features/earnings/fixtures'
import CombinedStrategy from './CombinedStrategy'
import Earnings from './Earnings'
import EtfUptrendLab from './EtfUptrendLab'
import WatchBoard from './WatchBoard'
import IndexValuation, { resetIndexValuationCaches } from './IndexValuation'

vi.mock('../features/macro-posture/composite/load', async importOriginal => {
  const actual = await importOriginal<typeof import('../features/macro-posture/composite/load')>()
  return {
    ...actual,
    useCompositePosture: () => ({ status: 'ready' as const, data: compositeFixture() }),
  }
})

vi.mock('../features/market-radar/market/market', () => ({
  useMarket: () => ({ status: 'ready', data: marketReferenceFixture() }),
}))

vi.mock('../features/market-radar/load', () => ({
  useMarketRadar: () => ({ status: 'ready', data: radarFixture() }),
  resetRadarCache: vi.fn(),
  RADAR_URL: '/data/market-radar.json',
}))

vi.mock('../features/macro/ValuationView', () => ({
  ValuationView: () => <div data-testid="valuation-view">估值视图</div>,
}))

const dailyMocks = vi.hoisted(() => ({ loadDailyAnalysis: vi.fn(), loadDailySnapshots: vi.fn(() => []) }))
vi.mock('../features/daily-analysis/data', () => ({
  loadDailySnapshots: () => dailyMocks.loadDailySnapshots(),
  loadDailyAnalysis: (...args: unknown[]) => dailyMocks.loadDailyAnalysis(...args),
}))
vi.mock('../services/indexQuotes', () => ({
  fetchIndexQuotes: vi.fn(async () => []),
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  resetCombinedStrategyCache()
  resetCompositeCache()
  resetMacroSnapshotCache()
  resetIndexValuationCaches()
  dailyMocks.loadDailyAnalysis.mockReset()
  dailyMocks.loadDailySnapshots.mockReset()
  dailyMocks.loadDailySnapshots.mockReturnValue([])
})

describe('LoadError 接入：失败 → 重试 → 成功', () => {
  it('综合策略', async () => {
    let calls = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (!url.includes('combined-strategy.json')) return Response.json({})
      calls += 1
      if (calls === 1) return new Response('err', { status: 500 })
      return Response.json(combinedStrategyFixture())
    }))
    render(<MemoryRouter initialEntries={['/invest/strategy']}><CombinedStrategy /></MemoryRouter>)
    expect(await screen.findByTestId('cs-error')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(screen.queryByTestId('cs-error')).toBeNull())
    expect(calls).toBe(2)
    expect(screen.getByTestId('cs-head-lead')).toBeTruthy()
  })

  it('财报前瞻', async () => {
    let calls = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (!url.includes('earnings-calendar.json')) return Response.json({})
      calls += 1
      if (calls === 1) return new Response('err', { status: 500 })
      return Response.json(calendar())
    }))
    render(<MemoryRouter><Earnings now={new Date('2026-11-14T02:00:00Z')} /></MemoryRouter>)
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('数据暂时取不到')
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(calls).toBe(2)
  })

  it('ETF 主升浪', async () => {
    const INDEX = {
      days: [{ d: '2026-11-26', asof: '2026-11-26', at: '2026-11-26T15:00:00', st: 'ok', n: { all: 1 }, notes: [] }],
      status: {},
      schedule: { times: [], tz: 'Asia/Shanghai' },
      source_page: '',
    }
    const DAY = {
      d: '2026-11-26',
      cats: ['t0'],
      rows: [['20:510300', '沪深300ETF', 0]],
    }
    let indexCalls = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('index.json')) {
        indexCalls += 1
        if (indexCalls === 1) return { ok: false, status: 500, json: async () => ({}) }
        return { ok: true, status: 200, json: async () => INDEX }
      }
      if (url.includes('detail.json')) return { ok: true, status: 200, json: async () => ({}) }
      if (url.includes('/days/')) return { ok: true, status: 200, json: async () => DAY }
      return { ok: false, status: 404, json: async () => ({}) }
    }))
    render(<MemoryRouter><EtfUptrendLab /></MemoryRouter>)
    expect(await screen.findByRole('alert')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(await screen.findByRole('tablist', { name: '分类' })).toBeTruthy()
    expect(indexCalls).toBe(2)
  })

  it('指数估值', async () => {
    let calls = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (!url.includes('index-history.json')) return new Response(null, { status: 404 })
      calls += 1
      if (calls === 1) return new Response(null, { status: 500 })
      return Response.json({ generatedAt: '2026-11-20T00:00:00.000Z', checkedAt: '2026-11-20', indexes: {} })
    }))
    render(
      <MemoryRouter initialEntries={['/invest/index-valuation']}>
        <Routes>
          <Route path="/invest/index-valuation" element={<IndexValuation />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('alert')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(screen.getByTestId('valuation-view')).toBeTruthy()
    expect(calls).toBe(2)
  })
})

describe('观察盘 L13：复盘 10 秒超时', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        generatedAt: '2026-10-08', source: 'test',
        series: {
          sahm: { unit: '', latest: { date: '2026-10-08', value: 0.1 }, history: [] },
          claims: { unit: '', latest: { date: '2026-10-08', value: 220 }, history: [] },
          hy: { unit: '', latest: { date: '2026-10-08', value: 300 }, history: [] },
          vix: { unit: '', latest: { date: '2026-10-08', value: 15 }, history: [] },
          dd: { unit: '', latest: { date: '2026-10-08', value: -3 }, history: [] },
          kre: { unit: '', latest: { date: '2026-10-08', value: -5 }, history: [] },
        },
      }),
    }) as unknown as Response))
  })

  it('超时后显示「复盘暂时取不到」并可重试', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    dailyMocks.loadDailyAnalysis.mockImplementation((signal: AbortSignal) => new Promise((_resolve, reject) => {
      const timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' })), 10_000)
      signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
    }))
    render(<MemoryRouter><WatchBoard /></MemoryRouter>)
    expect(screen.getByRole('button', { name: '正在更新…' })).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    const ashare = await screen.findByRole('region', { name: 'A股情绪' })
    expect(within(ashare).getByRole('alert').textContent).toMatch(/复盘暂时取不到|数据暂时取不到/)
    expect(within(ashare).getByRole('button', { name: '重试' })).toBeTruthy()

    const snap = {
      schemaVersion: 1 as const, dataDate: '2026-10-12', fetchedAt: '2026-10-12T08:00:00Z', session: 'closed' as const,
      metrics: { ztCount: 46, ztOpen: 25, ztSealRate: 64.8, dtCount: 19, dtOpen: null, dtSealRate: null, volume: 15378.31, upCount: 3100, downCount: 2000, lbCount: 18, maxBoard: 10, lbRate: null },
      indices: [], upStocks: [], ladder: [], rankings: { amount: [], turnover: [] },
      flows: { inflow: [], outflow: [] }, sources: [],
    }
    dailyMocks.loadDailyAnalysis.mockResolvedValue({ snapshots: [snap], liveError: null })
    fireEvent.click(within(ashare).getByRole('button', { name: '重试' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    await waitFor(() => {
      expect(within(screen.getByRole('region', { name: 'A股情绪' })).getByText(/交易日 2026-10-12/)).toBeTruthy()
    })
  }, 15_000)
})
