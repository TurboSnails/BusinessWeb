import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import GridRecordDetail from './GridRecordDetail'
import { saveRecord } from '../features/grid-trading/repository'
import { calculateGrid } from '../features/grid-trading/simulation'
import { readRecords } from '../features/grid-trading/repository'
import { exportGridRecords, parseGridImport } from '../features/grid-trading/importExport'
import { addManualTrade, appendBackup, createBackup, updateTradeOverride } from '../features/grid-trading/recordMutations'
import { adjustmentsOf } from '../features/grid-trading/simulation'
import userEvent from '@testing-library/user-event'
import { getCandles } from '../features/grid-trading/marketData'
vi.mock('../features/grid-trading/marketData', () => ({ getCandles: vi.fn().mockResolvedValue({ candles: [{ date: '2026-01-05', close: 10, high: 10, low: 10 }], source: '腾讯', fetchedOn: '2026-01-05' }), fetchQuotes: vi.fn().mockResolvedValue(new Map()), mergeQuote: (c: unknown) => c }))
beforeEach(() => localStorage.clear())
it('renders ledger, parameter and backup controls for a saved record', async () => {
  const row = { name: 'ETF', code: '510300', date: '2026-01-05', initialPrice: 10, initialAmount: 1000, step: 1, rebound: 0.1, pullback: 0.1, gridAmount: 100 }
  saveRecord({ id: 'one', savedAt: '2026-01-05', row, result: calculateGrid(row, [{ date: row.date, close: 10, high: 10, low: 10 }]) })
  render(<MemoryRouter initialEntries={['/records/one']}><Routes><Route path="/records/:recordId" element={<GridRecordDetail />} /></Routes></MemoryRouter>)
  expect(await screen.findByRole('button', { name: '保存参数' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '添加手动成交' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '创建快照' })).toBeTruthy()
  expect(screen.getByRole('img', { name: '网格资金和价格走势图' })).toBeTruthy()
  expect(screen.getByText(/佣金.*0.015%/)).toBeTruthy()
})
it('preserves adjusted totals and frozen inputs through save, export, import and detail edits', async () => {
  const row = { name: '完整往返ETF', code: '510300', date: '2026-01-05', initialPrice: 10, initialAmount: 1000, step: 1, rebound: 0.1, pullback: 0.1, gridAmount: 100 }
  const history = [{ date: row.date, close: 10, high: 10, low: 10 }]
  let saved = addManualTrade(updateTradeOverride({ id: 'roundtrip', savedAt: '2026-01-05', row, result: calculateGrid(row, history) }, row.date, { shares: 120 }), { id: 'manual', date: row.date, side: '买入', price: 10, shares: 5 })
  saved.result = calculateGrid(row, history, adjustmentsOf(saved))
  saved = appendBackup(saved, createBackup(saved))
  saveRecord(saved)
  const imported = parseGridImport(exportGridRecords(readRecords()))
  expect(imported.errors).toEqual([])
  expect(imported.records[0].result.pnl).toBe(saved.result.pnl)
  expect(imported.records[0].backups).toEqual(saved.backups)
  saveRecord(imported.records[0])
  render(<MemoryRouter initialEntries={['/records/roundtrip']}><Routes><Route path="/records/:recordId" element={<GridRecordDetail />} /></Routes></MemoryRouter>)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: '创建快照' }))
  expect(readRecords()[0].backups).toHaveLength(2)
  expect(readRecords()[0].result.pnl).toBe(saved.result.pnl)
  expect(readRecords()[0].manualTrades).toEqual(saved.manualTrades)
})
it('allows independent adjustment of continuation fills in a snapshot', async () => {
  const row = { name: '续跑ETF', code: '510300', date: '2026-01-05', initialPrice: 10, initialAmount: 1000, step: 1, rebound: 0.1, pullback: 0.1, gridAmount: 100 }
  const history = [{ date: row.date, close: 10, high: 10, low: 10 }, { date: '2026-01-06', close: 9, high: 9.2, low: 9 }]
  vi.mocked(getCandles).mockResolvedValueOnce({ candles: history, source: '腾讯', fetchedOn: '2026-01-06', from: row.date })
  const base = { id: 'continuation', savedAt: row.date, row, result: calculateGrid(row, history) }
  const backup = createBackup({ ...base, row: { ...row, step: 0.8 }, result: calculateGrid(row, history.slice(0, 1)) })
  saveRecord(appendBackup(base, backup))
  render(<MemoryRouter initialEntries={['/records/continuation']}><Routes><Route path="/records/:recordId" element={<GridRecordDetail />} /></Routes></MemoryRouter>)
  await waitFor(() => expect((screen.getByLabelText('选择快照') as HTMLSelectElement).disabled).toBe(false))
  await userEvent.selectOptions(screen.getByLabelText('选择快照'), backup.id)
  expect((screen.getByLabelText('网格步长') as HTMLInputElement).value).toBe('0.8')
  const buttons = screen.getAllByRole('button', { name: '修正' })
  expect((buttons[0] as HTMLButtonElement).disabled).toBe(false)
  await userEvent.click(buttons[0])
  await userEvent.type(screen.getByLabelText('实际价格'), '9.2')
  await userEvent.click(screen.getByRole('button', { name: '保存修正' }))
  const saved = readRecords()[0]
  expect(saved.priceOverrides).toBeUndefined()
  expect(saved.backups?.[0].priceOverrides?.['2026-01-06']).toBe(9.2)
  expect(saved.backups?.[0].pnl).toBe(backup.pnl)
})
it('refuses to persist a manual sale larger than historical holdings', async () => {
  const row = { name: '持仓校验ETF', code: '510300', date: '2026-01-05', initialPrice: 10, initialAmount: 1000, step: 1, rebound: 0.1, pullback: 0.1, gridAmount: 100 }
  saveRecord({ id: 'guard', savedAt: row.date, row, result: calculateGrid(row, [{ date: row.date, close: 10, high: 10, low: 10 }]) })
  render(<MemoryRouter initialEntries={['/records/guard']}><Routes><Route path="/records/:recordId" element={<GridRecordDetail />} /></Routes></MemoryRouter>)
  await waitFor(() => expect((screen.getByRole('button', { name: '添加手动成交' }) as HTMLButtonElement).disabled).toBe(false))
  await userEvent.type(screen.getByLabelText('成交日期'), row.date)
  await userEvent.selectOptions(screen.getByLabelText('方向'), '卖出')
  await userEvent.type(screen.getByLabelText('价格'), '10')
  await userEvent.type(screen.getByLabelText('份额'), '200')
  await userEvent.click(screen.getByRole('button', { name: '添加手动成交' }))
  expect(await screen.findByText(/持仓将变为负数/)).toBeTruthy()
  expect(readRecords()[0].manualTrades).toBeUndefined()
})
