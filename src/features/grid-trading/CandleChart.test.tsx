import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import CandleChart from './CandleChart'
import { getObservationCandles } from './marketData'
vi.mock('./marketData', () => ({ getObservationCandles: vi.fn() }))
const calls = vi.hoisted(() => ({ charts: [] as { removed: boolean; series: { type: string; data: unknown[] }[]; range: { from: number; to: number } }[] }))
vi.mock('lightweight-charts', () => ({
  ColorType: { Solid: 'solid' }, CandlestickSeries: { type: 'candles' }, HistogramSeries: { type: 'histogram' }, LineSeries: { type: 'line' },
  createChart: () => {
    const chart = { removed: false, series: [] as { type: string; data: unknown[] }[], range: { from: 0, to: 30 } }
    calls.charts.push(chart)
    return {
      addSeries: (def: { type: string }) => { const s = { type: def.type, data: [] as unknown[] }; chart.series.push(s); return { setData: (data: unknown[]) => { s.data = data } } },
      timeScale: () => ({ fitContent: vi.fn(), getVisibleLogicalRange: () => chart.range, setVisibleLogicalRange: (r: { from: number; to: number }) => { chart.range = r } }),
      subscribeCrosshairMove: vi.fn(), remove: () => { chart.removed = true },
    }
  },
}))
const rows = Array.from({ length: 40 }, (_, i) => ({ date: new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10), open: 10, close: 10.1, high: 10.2, low: 9.9, volume: 100 + i }))
beforeEach(() => { calls.charts = []; vi.mocked(getObservationCandles).mockReset(); vi.mocked(getObservationCandles).mockResolvedValue({ fetchedOn: '2026-02-10', from: '2000-01-01', candles: rows, source: '腾讯前复权日线' }) })
const load = async () => { fireEvent.click(screen.getByRole('button', { name: '加载日K行情' })); await waitFor(() => expect(calls.charts).toHaveLength(1)) }
it('loads lazily, shows OHLC/volume/MA, supports MACD and keyboard replacement controls, cleans up', async () => {
  const { unmount } = render(<CandleChart code="510300" name="沪深300" />)
  expect(getObservationCandles).not.toHaveBeenCalled()
  await load()
  expect(calls.charts[0].series.map(s => s.type)).toEqual(['candles', 'line', 'line', 'histogram'])
  fireEvent.click(screen.getByRole('button', { name: '放大' }))
  expect(calls.charts[0].range.to - calls.charts[0].range.from).toBeCloseTo(21)
  fireEvent.change(screen.getByRole('slider', { name: '逐日查看行情' }), { target: { value: '0' } })
  expect(screen.getByText('2026-01-01')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'MACD 副图' }))
  await waitFor(() => expect(calls.charts).toHaveLength(2))
  expect(calls.charts[0].removed).toBe(true)
  expect(calls.charts[1].series).toHaveLength(7)
  expect(screen.getByRole('img').getAttribute('aria-label')).toContain('MACD')
  unmount(); expect(calls.charts[1].removed).toBe(true)
})
it('shows honest missing-field fallback, not artificial candles or volume', async () => {
  vi.mocked(getObservationCandles).mockResolvedValue({ fetchedOn: '2026-02-10', from: '2000-01-01', candles: rows.map(({ date, close, high, low }) => ({ date, close, high, low })), source: '腾讯复权口径未记录的日线（本地缓存）' })
  render(<CandleChart code="510300" name="沪深300" />); await load()
  expect(calls.charts[0].series.every(s => s.type === 'line')).toBe(true)
  expect(screen.getByText(/部分开盘价缺失/)).toBeTruthy()
  expect(screen.getByText(/缺失日不补零/)).toBeTruthy()
})
it('discards a pending old symbol request, clears its chart, and retries failures', async () => {
  let resolveOld!: (v: Awaited<ReturnType<typeof getObservationCandles>>) => void
  vi.mocked(getObservationCandles).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
  const { rerender } = render(<CandleChart code="510300" name="旧标的" />)
  fireEvent.click(screen.getByRole('button', { name: '加载日K行情' }))
  rerender(<CandleChart code="510500" name="新标的" />)
  await act(async () => resolveOld({ fetchedOn: '2026-02-10', from: '2000-01-01', candles: rows, source: '旧标的' }))
  expect(calls.charts).toHaveLength(0)
  vi.mocked(getObservationCandles).mockRejectedValueOnce(new Error('网络失败'))
  fireEvent.click(screen.getByRole('button', { name: '加载日K行情' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('网络失败'))
  fireEvent.click(screen.getByRole('button', { name: '重试日K行情' }))
  await waitFor(() => expect(calls.charts).toHaveLength(1))
  expect(screen.getByRole('img').getAttribute('aria-label')).toContain('新标的')
})

it('limits a historical end date without using later observations in the chart', async () => {
  render(<CandleChart code="510300" name="ETF" endDate="2026-01-20" />)
  await load()
  expect(screen.getByText('2026-01-20')).toBeTruthy()
  expect(calls.charts[0].series[0].data).toHaveLength(20)
  expect(JSON.stringify(calls.charts[0].series)).not.toContain('2026-01-21')
})


it('can force-refresh missing cached fields, preserves the chart on failure and never writes account storage', async () => {
  const write = vi.spyOn(Storage.prototype, 'setItem')
  render(<CandleChart code="510300" name="ETF" />)
  await load()
  expect(vi.mocked(getObservationCandles).mock.calls[0][1]).toEqual({ force: false })
  vi.mocked(getObservationCandles).mockRejectedValueOnce(new Error('刷新失败'))
  fireEvent.click(screen.getByRole('button', { name: '刷新日K行情' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('已保留当前图表'))
  expect(vi.mocked(getObservationCandles).mock.calls[1][1]).toEqual({ force: true })
  expect(calls.charts[0].removed).toBe(false)
  expect(screen.getByRole('img')).toBeTruthy()
  expect(write).not.toHaveBeenCalled()
  write.mockRestore()
})

it('keeps the load button mounted and focused while loading and after completion', async () => {
  render(<CandleChart code="510300" name="ETF" />)
  const button = screen.getByRole('button', { name: '加载日K行情' }) as HTMLButtonElement
  button.focus()
  fireEvent.click(button)
  expect(button.getAttribute('aria-disabled')).toBe('true')
  expect(button.disabled).toBe(false)
  fireEvent.click(button)
  expect(getObservationCandles).toHaveBeenCalledTimes(1)
  expect(document.activeElement).toBe(button)
  await waitFor(() => expect(calls.charts).toHaveLength(1))
  expect(document.activeElement).toBe(button)
  expect(button.textContent).toBe('刷新日K行情')
})
