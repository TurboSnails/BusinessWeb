import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import InvestHub from './InvestHub'
import GridCalculator, { oneYearBefore, suggestStep } from './GridCalculator'

const mocks = vi.hoisted(() => ({
  getCandles: vi.fn(),
  fetchQuotes: vi.fn(),
  mergeQuote: vi.fn((candles: unknown[]) => candles),
  marketToday: vi.fn(() => '2026-09-30'),
  saveRecord: vi.fn(),
}))

vi.mock('../features/grid-trading/marketData', () => ({
  getCandles: mocks.getCandles,
  fetchQuotes: mocks.fetchQuotes,
  mergeQuote: mocks.mergeQuote,
  marketToday: mocks.marketToday,
}))
vi.mock('../features/grid-trading/repository', () => ({
  saveRecord: mocks.saveRecord,
}))

describe('grid trading calculator entry', () => {
  it('keeps a grid trading entry reachable from the 投资 hub', () => {
    render(<MemoryRouter><InvestHub /></MemoryRouter>)

    const link = screen.getAllByRole('link', { name: /网格交易/ })[0]
    expect(link.getAttribute('href')).toBe('/grid-trading')
  })

  it('validates inputs before requesting market data', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><GridCalculator /></MemoryRouter>)
    await user.type(screen.getByLabelText('证券代码'), 'abc')
    await user.click(screen.getByRole('button', { name: '运行回测' }))

    expect(await screen.findByText(/六位数字/)).toBeTruthy()
    expect(mocks.getCandles).not.toHaveBeenCalled()
  })

  it('runs a simulation, shows its result and saves a complete record', async () => {
    const user = userEvent.setup()
    mocks.getCandles.mockResolvedValue({
      candles: [{ date: '2026-09-29', close: 3.5, high: 3.6, low: 3.4 }],
      fetchedOn: '2026-09-30', from: '2026-09-01', source: '腾讯前复权日线',
    })
    mocks.fetchQuotes.mockResolvedValue(new Map())
    mocks.saveRecord.mockClear()
    render(<MemoryRouter><GridCalculator /></MemoryRouter>)

    await user.type(screen.getByLabelText('证券代码'), '510300')
    await user.type(screen.getByLabelText('标的名称'), '沪深300ETF')
    await user.type(screen.getByLabelText('建仓日期'), '2026-09-01')
    await user.type(screen.getByLabelText('建仓价格'), '3.5')
    await user.type(screen.getByLabelText('建仓金额'), '10000')
    await user.type(screen.getByLabelText('每格金额'), '1000')
    await user.type(screen.getByLabelText('网格步长'), '0.1')
    await user.click(screen.getByRole('button', { name: '运行回测' }))

    expect(await screen.findByText('回测结果')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '保存记录' }))
    await waitFor(() => expect(mocks.saveRecord).toHaveBeenCalledTimes(1))
    expect(mocks.saveRecord.mock.calls[0][0]).toMatchObject({
      row: { code: '510300', name: '沪深300ETF', initialAmount: 10_000 },
      result: { current: 3.5 },
      endDate: '',
    })
  })

  it('shows a useful message when public market data is unavailable', async () => {
    const user = userEvent.setup()
    mocks.getCandles.mockRejectedValue(new Error('行情请求失败，请检查网络或浏览器跨域设置'))
    render(<MemoryRouter><GridCalculator /></MemoryRouter>)
    await user.type(screen.getByLabelText('证券代码'), '510300')
    await user.type(screen.getByLabelText('建仓日期'), '2026-09-01')
    await user.type(screen.getByLabelText('建仓价格'), '3.5')
    await user.type(screen.getByLabelText('建仓金额'), '10000')
    await user.type(screen.getByLabelText('每格金额'), '1000')
    await user.type(screen.getByLabelText('网格步长'), '0.1')
    await user.click(screen.getByRole('button', { name: '运行回测' }))

    expect(await screen.findByText(/行情请求失败/)).toBeTruthy()
  })

  it('从候选池带过来的 ?code=&name= 预填代码和名称，非法代码忽略', () => {
    const first = render(<MemoryRouter initialEntries={['/grid-trading?code=510300&name=沪深300ETF']}><GridCalculator /></MemoryRouter>)
    expect((screen.getByLabelText('证券代码') as HTMLInputElement).value).toBe('510300')
    expect((screen.getByLabelText('标的名称') as HTMLInputElement).value).toBe('沪深300ETF')
    first.unmount()
    render(<MemoryRouter initialEntries={['/grid-trading?code=AAPL']}><GridCalculator /></MemoryRouter>)
    expect((screen.getByLabelText('证券代码') as HTMLInputElement).value).toBe('')
  })

  it('「填入建议参数」按建仓日收盘价填建仓价与步长，建仓日留空取一年前，金额只补空值', async () => {
    const user = userEvent.setup()
    mocks.getCandles.mockReset()
    mocks.getCandles.mockResolvedValue({
      candles: [{ date: '2025-09-29', close: 3.2, high: 3.3, low: 3.1 }, { date: '2025-10-09', close: 3.4, high: 3.5, low: 3.3 }],
      fetchedOn: '2026-09-30', from: '2025-09-30', source: '腾讯前复权日线',
    })
    mocks.fetchQuotes.mockResolvedValue(new Map([['510300', { code: '510300', name: '沪深300ETF', price: 4, high: 4, low: 4, date: '2026-09-30' }]]))
    render(<MemoryRouter initialEntries={['/grid-trading?code=510300']}><GridCalculator /></MemoryRouter>)
    await user.type(screen.getByLabelText('每格金额'), '3000')
    await user.click(screen.getByRole('button', { name: /填入建议参数/ }))

    expect(await screen.findByText(/已按 2025-10-09 收盘价 3.4 填入/)).toBeTruthy()
    expect(mocks.getCandles).toHaveBeenCalledWith('510300', '2025-09-30')
    expect((screen.getByLabelText('建仓日期') as HTMLInputElement).value).toBe('2025-10-09')
    expect((screen.getByLabelText('建仓价格') as HTMLInputElement).value).toBe('3.4')
    expect((screen.getByLabelText('网格步长') as HTMLInputElement).value).toBe('0.102')
    expect((screen.getByLabelText('建仓金额') as HTMLInputElement).value).toBe('10000')
    expect((screen.getByLabelText('每格金额') as HTMLInputElement).value).toBe('3000')
    expect((screen.getByLabelText('标的名称') as HTMLInputElement).value).toBe('沪深300ETF')
  })

  it('建议步长：ETF 精确到 0.001，个股到 0.01，不小于最小价位', () => {
    expect(suggestStep(3.4, true)).toBe('0.102')
    expect(suggestStep(25.37, false)).toBe('0.76')
    expect(suggestStep(0.02, true)).toBe('0.001')
    expect(oneYearBefore('2026-09-30')).toBe('2025-09-30')
    expect(oneYearBefore('2028-02-29')).toBe('2027-03-01')
  })
})
