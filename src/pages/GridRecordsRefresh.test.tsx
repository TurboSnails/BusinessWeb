import React from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import GridRecords from './GridRecords'
import { getCandles, fetchQuotes } from '../features/grid-trading/marketData'
import { readRecords, saveRecord } from '../features/grid-trading/repository'
import { calculateGrid } from '../features/grid-trading/simulation'
vi.mock('../features/grid-trading/marketData', () => ({ getCandles: vi.fn(), fetchQuotes: vi.fn().mockResolvedValue(new Map()), mergeQuote: (c: unknown) => c }))
const row = { name: '刷新ETF', code: '510300', date: '2026-01-05', initialPrice: 10, initialAmount: 1000, step: 1, rebound: 0.1, pullback: 0.1, gridAmount: 100 }
const candles = [{ date: row.date, close: 10, high: 10, low: 10 }]
beforeEach(() => { localStorage.clear(); saveRecord({ id: 'race', savedAt: row.date, row, result: calculateGrid(row, candles) }) })
it('does not resurrect a record deleted during an outstanding refresh', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof getCandles>>) => void
  vi.mocked(getCandles).mockReturnValueOnce(new Promise(done => { resolve = done }))
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  render(<MemoryRouter><GridRecords /></MemoryRouter>)
  await userEvent.click(screen.getByRole('button', { name: '刷新全部记录行情' }))
  await waitFor(() => expect(getCandles).toHaveBeenCalled())
  await userEvent.click(screen.getByRole('button', { name: '删除' }))
  await act(async () => resolve({ candles, fetchedOn: row.date, from: row.date, source: '腾讯' }))
  await waitFor(() => expect(screen.getByText('还没有保存的网格记录。')).toBeTruthy())
  expect(readRecords()).toEqual([])
})
it('reports unavailable quotes when it can only refresh historical candles', async () => {
  vi.mocked(fetchQuotes).mockRejectedValueOnce(new Error('报价缺少有效数据'))
  vi.mocked(getCandles).mockResolvedValueOnce({ candles, fetchedOn: row.date, from: row.date, source: '腾讯' })
  render(<MemoryRouter><GridRecords /></MemoryRouter>)
  await userEvent.click(screen.getByRole('button', { name: '刷新全部记录行情' }))
  expect(await screen.findByText(/日线已刷新；实时报价不可用/)).toBeTruthy()
})
