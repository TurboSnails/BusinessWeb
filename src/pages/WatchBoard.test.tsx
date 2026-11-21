import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WatchBoard from './WatchBoard'
import { metricsWithBreadth, moodOf } from '../features/watch/sentiment'
import { stageFromSnapshot, type MacroSnapshot } from '../features/macro/indicators'
import { resetMacroSnapshotCache } from '../features/macro/useMacroSnapshot'
import type { DailySnapshot } from '../features/daily-analysis/types'

const mocks = vi.hoisted(() => ({ market: vi.fn(), daily: vi.fn() }))
vi.mock('../services/indexQuotes', () => ({ fetchIndexQuotes: mocks.market }))
vi.mock('../features/daily-analysis/data', () => ({ loadDailySnapshots: () => [], loadDailyAnalysis: mocks.daily }))

const series = (value: number, date = '2026-10-08') => ({ unit: '', latest: { date, value }, history: [] })
const macro = {
  generatedAt: '2026-10-08', source: 'test',
  series: { sahm: series(0.1), claims: series(220), hy: series(300), vix: series(15), dd: series(-3), kre: series(-5), tenYear: series(4.2), dxy: series(102.4), gold: series(4143), wti: series(92.3) },
}
const snapshot: DailySnapshot = {
  schemaVersion: 1, dataDate: '2026-10-12', fetchedAt: '2026-10-12T08:00:00Z', session: 'closed',
  metrics: { ztCount: 46, ztOpen: 25, ztSealRate: 64.8, dtCount: 19, dtOpen: null, dtSealRate: null, volume: 15378.31, upCount: 3100, downCount: 2000, lbCount: 18, maxBoard: 10, lbRate: null },
  indices: [], upStocks: [], ladder: [], rankings: { amount: [], turnover: [] },
  flows: { inflow: [{ name: '金融行业', amount: 32.49 }, { name: '传媒娱乐', amount: 27.27 }], outflow: [{ name: '化工行业', amount: -53.9 }] },
  sources: [],
}

beforeEach(() => {
  resetMacroSnapshotCache()
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => macro }) as unknown as Response))
  const quotes: Record<string, unknown> = {
    usINX: { symbol: 'usINX', name: '标普500', price: 6500, changePercent: 0.5, quoteTime: '2026-10-09 16:00' },
    sh000001: { symbol: 'sh000001', name: '上证指数', price: 3800, changePercent: -0.52, quoteTime: '2026-10-12 15:00' },
    r_hkHSI: { symbol: 'r_hkHSI', name: '恒生指数', price: 22000, changePercent: 0.32, quoteTime: '2026-10-12 16:00' },
  }
  mocks.market.mockImplementation(async (items: Array<{ symbol: string }>) => items.flatMap(i => quotes[i.symbol] ? [quotes[i.symbol]] : []))
  mocks.daily.mockResolvedValue({ snapshots: [snapshot], liveError: null })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('观察盘', () => {
  it('一页显示宏观阶段、全球市场、A股情绪三块，各自链接到细节页', async () => {
    render(<MemoryRouter><WatchBoard /></MemoryRouter>)
    const macroBlock = await screen.findByRole('region', { name: '宏观阶段' })
    const expected = stageFromSnapshot(macro as unknown as MacroSnapshot).stage!.name
    await waitFor(() => expect(within(macroBlock).getByText(expected)).toBeTruthy())
    expect(within(macroBlock).getByText('10 年美债')).toBeTruthy()
    expect(within(macroBlock).getByRole('link', { name: /宏观温度/ }).getAttribute('href')).toBe('/monitor')

    const markets = screen.getByRole('region', { name: '全球市场' })
    await waitFor(() => expect(within(markets).getByText('标普500')).toBeTruthy())
    expect(within(markets).getByText('+0.50%').className).toContain('is-green') // 美股绿涨
    expect(within(markets).getByText('-0.52%').className).toContain('is-green') // A股绿跌
    expect(within(markets).getByText('+0.32%').className).toContain('is-red') // 港股红涨
    expect(within(markets).getByRole('link', { name: /热力图与走势/ }).getAttribute('href')).toBe('/pulse')
    expect(within(markets).getByText('行情 10-09 16:00')).toBeTruthy() // 标出行情时间，休市时不误当作当下价格
    expect(mocks.market.mock.calls.map(c => (c[0] as Array<{ symbol: string }>).map(i => i.symbol))).toContainEqual(['r_hkHSI', 'r_hkHSTECH', 'r_hkHSCEI'])

    const ashare = screen.getByRole('region', { name: 'A股情绪' })
    await waitFor(() => expect(within(ashare).getByText('交易日 2026-10-12')).toBeTruthy())
    expect(within(ashare).getByText('中性')).toBeTruthy()
    expect(within(ashare).getByText('金融行业')).toBeTruthy()
    expect(within(ashare).getByText('1.54 万亿')).toBeTruthy()
    for (const [name, href] of [[/每日复盘/, '/daily-analysis'], [/板块轮动/, '/sector-rotation'], [/涨停板块/, '/limit-up-analysis']] as const) {
      expect(within(ashare).getByRole('link', { name }).getAttribute('href')).toBe(href)
    }
  })

  it('刷新重新拉取行情与复盘', async () => {
    render(<MemoryRouter><WatchBoard /></MemoryRouter>)
    const button = await screen.findByRole('button', { name: '刷新' })
    const calls = mocks.market.mock.calls.length
    fireEvent.click(button)
    await waitFor(() => expect(mocks.market.mock.calls.length).toBeGreaterThan(calls))
    expect(mocks.daily).toHaveBeenCalledTimes(2)
  })

  it('行情接口失败时各块分别提示，不影响其他块', async () => {
    mocks.market.mockRejectedValue(new Error('down'))
    render(<MemoryRouter><WatchBoard /></MemoryRouter>)
    const markets = screen.getByRole('region', { name: '全球市场' })
    await waitFor(() => expect(within(markets).getAllByText(/暂未取得/).length).toBeGreaterThan(0))
    expect(await screen.findByText('金融行业')).toBeTruthy()
  })

  it('行情失败时：A股退回复盘快照的指数，其他组用上次成功的缓存并标出时间', async () => {
    localStorage.setItem('watch-quotes', JSON.stringify({ us: { at: '09:30', rows: [{ symbol: '^GSPC', name: '标普500', price: 6400, changePercent: 1.2 }] } }))
    mocks.market.mockRejectedValue(new Error('down'))
    mocks.daily.mockResolvedValue({ snapshots: [{ ...snapshot, indices: [{ symbol: 'sh000001', code: '000001', name: '上证指数', date: '2026-10-12', price: 3797.24, change: -0.43 }] }], liveError: null })
    render(<MemoryRouter><WatchBoard /></MemoryRouter>)
    const markets = screen.getByRole('region', { name: '全球市场' })
    await waitFor(() => expect(within(markets).getByText('上证指数')).toBeTruthy())
    expect(within(markets).getByText(/复盘快照 10-12/)).toBeTruthy()
    expect(within(markets).getByText('+1.20%')).toBeTruthy()
    expect(within(markets).getByText(/缓存 09:30/)).toBeTruthy()
  })

  it('一组行情挂起时，10 秒后显示该组缓存、其他组新行情并恢复刷新', async () => {
    const { fetchIndexQuotes } = await vi.importActual<typeof import('../services/indexQuotes')>('../services/indexQuotes')
    const fetchOther = fetch
    mocks.market.mockImplementation(fetchIndexQuotes)
    localStorage.setItem('watch-quotes', JSON.stringify({ hk: { at: '09:30', rows: [{ symbol: 'r_hkHSI', name: '恒生指数', price: 22000, changePercent: 1.2 }] } }))
    vi.stubGlobal('fetch', vi.fn<typeof fetch>((url, options) => {
      if (!String(url).includes('/api/grid-market')) return fetchOther(url, options)
      const symbols = new URL(String(url), 'https://example.test').searchParams.get('symbols')!
      const symbol = symbols.split(',')[0]
      if (symbol === 'r_hkHSI') return new Promise((_resolve, reject) => {
        const signal = options!.signal!
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
      const fields = Array<string>(33).fill('0')
      fields[3] = '3800'
      fields[30] = '20261012150000'
      fields[32] = '-0.52'
      return Promise.resolve(new Response(new TextEncoder().encode(`v_${symbol}="${fields.join('~')}";`)))
    }))
    vi.useFakeTimers()
    const { unmount } = render(<MemoryRouter><WatchBoard /></MemoryRouter>)
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(9999) })
      expect(screen.getByRole<HTMLButtonElement>('button', { name: '正在更新…' }).disabled).toBe(true)
      await act(async () => { await vi.advanceTimersByTimeAsync(1) })
      const markets = within(screen.getByRole('region', { name: '全球市场' }))
      expect(markets.getByText('标普500')).toBeTruthy()
      expect(markets.getByText('上证指数')).toBeTruthy()
      expect(markets.getByText('缓存 09:30')).toBeTruthy()
      expect(screen.getByRole<HTMLButtonElement>('button', { name: '刷新' }).disabled).toBe(false)
    } finally {
      unmount()
      vi.useRealTimers()
    }
  })

  it('离开页面立即取消报价和复盘，迟到的报价不写入缓存', async () => {
    let resolveMarket!: (rows: unknown[]) => void
    const pending = new Promise<unknown[]>(resolve => { resolveMarket = resolve })
    mocks.market.mockReturnValue(pending)
    const { unmount } = render(<MemoryRouter><WatchBoard /></MemoryRouter>)
    const signals = mocks.market.mock.calls.map(call => call[2] as AbortSignal)
    const dailySignal = mocks.daily.mock.calls[0][0] as AbortSignal
    expect(signals).toHaveLength(3)
    expect(signals.every(signal => !signal.aborted)).toBe(true)
    unmount()
    expect(signals.every(signal => signal.aborted)).toBe(true)
    expect(dailySignal.aborted).toBe(true)
    await act(async () => resolveMarket([{ symbol: 'usINX', name: '标普500', price: 6500, changePercent: 1.2 }]))
    expect(localStorage.getItem('watch-quotes')).toBeNull()
  })
})

describe('moodOf', () => {
  const base = snapshot.metrics
  it('按上涨家数占比分档', () => {
    expect(moodOf({ ...base, upCount: 4000, downCount: 1000, ztCount: 90 }).mood).toBe('偏热')
    expect(moodOf({ ...base, upCount: 1000, downCount: 4000 }).mood).toBe('偏冷')
    expect(moodOf(base).mood).toBe('中性')
  })
  it('缺家数时用涨停跌停对比；都缺就说数据不足', () => {
    expect(moodOf({ ...base, upCount: null, downCount: null, ztCount: 100, dtCount: 5 }).mood).toBe('偏热')
    expect(moodOf({ ...base, upCount: null, downCount: null, ztCount: 20, dtCount: 40 }).mood).toBe('偏冷')
    expect(moodOf({ ...base, upCount: null, downCount: null, ztCount: null, dtCount: null }).mood).toBe('数据不足')
  })
})

describe('metricsWithBreadth', () => {
  const nulls = { ...snapshot.metrics, upCount: null, downCount: null }
  const breadth = { status: 'ready' as const, total: 5576, up: 2252, down: 3156, flat: 165, suspended: 3, medianPct: null, buckets: {} }
  it('指标缺涨跌家数时回退到情绪面的涨跌统计', () => {
    const m = metricsWithBreadth({ ...snapshot, metrics: nulls, sentiment: { breadth } as unknown as typeof snapshot.sentiment })
    expect([m.upCount, m.downCount]).toEqual([2252, 3156])
  })
  it('指标已有家数、或情绪面未就绪时保持原样', () => {
    const own = { ...nulls, upCount: 10, downCount: 20 }
    expect(metricsWithBreadth({ ...snapshot, metrics: own, sentiment: { breadth } as unknown as typeof snapshot.sentiment })).toEqual(own)
    expect(metricsWithBreadth({ ...snapshot, metrics: nulls, sentiment: { breadth: { status: 'error' } } as unknown as typeof snapshot.sentiment })).toEqual(nulls)
    expect(metricsWithBreadth({ ...snapshot, metrics: nulls })).toEqual(nulls)
  })
})

describe('观察盘：风险信号与期权情绪', () => {
  it.each([
    { readings: {}, count: 0 },
    { readings: { sahm: series(0), claims: series(24.9), vix: series(19.99), hy: series(395), dd: series(9.98) }, count: 5 },
  ])('快照只有 $count 项有效信号时展示覆盖情况，保留已有读数', async ({ readings, count }) => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...macro, series: readings }) }) as unknown as Response))
    render(<MemoryRouter><WatchBoard /></MemoryRouter>)
    const block = within(screen.getByRole('region', { name: '宏观阶段' }))
    expect(await block.findByText('信号待补全')).toBeTruthy()
    expect(block.getByText(`已取得 ${count}/6 项`)).toBeTruthy()
    expect(block.queryByText('常态')).toBeNull()
    expect(block.queryByText('做')).toBeNull()
    expect(block.getAllByText('暂缺')).toHaveLength(6 - count)
    if (count) {
      expect(block.getByText('0 个百分点')).toBeTruthy()
      expect(block.getByText('24.9 万人/周')).toBeTruthy()
      expect(block.getByText('19.99')).toBeTruthy()
      expect(block.getAllByText('正常 · 2026-10-08')).toHaveLength(count)
    }
  })

  it('宏观块显示六项信号灯，并带上期权情绪摘要', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: string) => ({ ok: true, json: async () => (String(u).includes('/api/sentiment') ? { equityPC: 0.58, spxPC: 1.15, pcDate: '2026-10-09', vix: 15.6, vix3m: 18.1, gexBn: 7.7, goldSilver: 67.7 } : macro) }) as unknown as Response))
    render(<MemoryRouter><WatchBoard /></MemoryRouter>)
    const macroBlock = await screen.findByRole('region', { name: '宏观阶段' })
    const list = await within(macroBlock).findByRole('list', { name: '六项风险信号' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(6)
    expect(await within(macroBlock).findByText('VIX 期限')).toBeTruthy()
    expect(within(macroBlock).getByText('正常')).toBeTruthy()
  })

  it('宏观卡片带 is-green 时摘要与不做标签不跟涨跌绿/红 class', async () => {
    render(<MemoryRouter><WatchBoard /></MemoryRouter>)
    const macroBlock = await screen.findByRole('region', { name: '宏观阶段' })
    await waitFor(() => expect(macroBlock.className).toMatch(/is-green|is-yellow|is-red/))
    const summary = within(macroBlock).getByText(/信号大多正常|有几项信号|多项信号|风险资产/)
    expect(summary.className).toBe('watch-stage__summary')
    const dont = within(macroBlock).getByText('不做')
    expect(dont.closest('.watch-stage__rule')?.className).toContain('is-dont')
    expect(dont.className).not.toMatch(/is-red|is-green/)
  })
})
