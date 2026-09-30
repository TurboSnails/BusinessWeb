import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import GridRecords from './GridRecords'
import type { SavedRecord } from '../features/grid-trading/types'

const mocks = vi.hoisted(() => ({ readRecords: vi.fn(), removeRecords: vi.fn(), saveRecord: vi.fn() }))
vi.mock('../features/grid-trading/repository', () => ({
  readRecords: mocks.readRecords,
  removeRecords: mocks.removeRecords,
  saveRecord: mocks.saveRecord,
}))

const record: SavedRecord = {
  id: 'record-1', savedAt: '2026-09-30T00:00:00.000Z',
  row: { name: '沪深300ETF', code: '510300', date: '2026-09-01', initialPrice: 3.5, initialAmount: 10_000, step: 0.1, rebound: 0.01, pullback: 0.01, gridAmount: 1_000 },
  result: { range: '', current: 3.6, lastTradeDate: '2026-09-29', lastTrade: 3.5, nextBuy: 3.4, nextSell: 3.6, buyTrigger: 3.4, sellTrigger: 3.6, pnl: 100, value: 10_100, realized: 80, maxCapital: 11_000, buys: 1, sells: 1, trades: [], series: [] },
}

describe('saved grid records page', () => {
  beforeEach(() => {
    mocks.readRecords.mockReturnValue([record])
    mocks.removeRecords.mockReset()
  })

  it('loads saved records from the local repository and reports sync as unconfigured', () => {
    render(<MemoryRouter><GridRecords /></MemoryRouter>)

    expect(screen.getByText('510300')).toBeTruthy()
    expect(screen.getAllByText('未配置').length).toBeGreaterThan(0)
    expect((screen.getByRole('button', { name: '立即同步' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows an empty state without issuing any cloud request when there are no local records', () => {
    mocks.readRecords.mockReturnValue([])
    render(<MemoryRouter><GridRecords /></MemoryRouter>)

    expect(screen.getByText(/还没有保存的网格记录/)).toBeTruthy()
    expect(mocks.readRecords).toHaveBeenCalledTimes(1)
  })
})
