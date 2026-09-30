import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { calculateGrid } from './simulation'
import {
  addManualTrade,
  appendBackup,
  appendParamStage,
  createBackup,
  refreshBackupSnapshot,
  removeManualTrade,
  replayBackup,
  setGridTradeDeleted,
  updateBackupOverride,
  updateTradeOverride,
  assertPosition,
  positionOf,
} from './recordMutations'
import type { Candle, GridParams, SavedRecord } from './types'

const row: GridParams = {
  name: 'ETF', code: '510300', date: '2026-01-05', initialPrice: 10, initialAmount: 1_000,
  step: 1, rebound: 0.1, pullback: 0.1, gridAmount: 100,
}
const candles: Candle[] = [
  { date: '2026-01-05', close: 10, high: 10, low: 10 },
  { date: '2026-01-06', close: 9, high: 9.2, low: 9 },
  { date: '2026-01-07', close: 11, high: 11, low: 10 },
]
const record: SavedRecord = {
  id: 'record-1', savedAt: '2026-01-05T00:00:00.000Z', row,
  result: calculateGrid(row, candles),
}

describe('record mutations', () => {
  afterEach(() => vi.useRealTimers())
  it('rejects negative historical positions even if final holdings recover', () => {
    const oversold = calculateGrid(row, candles, { manual: [{ id: 'sell', date: '2026-01-06', side: '卖出', price: 9, shares: 200 }, { id: 'buy', date: '2026-01-07', side: '买入', price: 10, shares: 300 }] })
    expect(oversold.position).toBeGreaterThan(0)
    expect(() => assertPosition(oversold)).toThrow(/持仓/)
  })
  it('derives legacy holdings from the final equity point for display and snapshots', () => {
    const legacy = { ...record, result: { ...record.result, position: undefined } }
    expect(positionOf(legacy.result)).toBeCloseTo(record.result.position!, 8)
    expect(createBackup(legacy).position).toBeCloseTo(record.result.position!, 8)
  })
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-30T12:00:00.000Z'))
  })

  it('keeps opening-only parameter changes as current settings without history', () => {
    const openingOnly = { ...record, result: calculateGrid(row, candles.slice(0, 1)) }
    const updated = appendParamStage(openingOnly, { step: 0.5 }, new Date('2026-09-30T12:00:00.000Z'))

    expect(updated.row.step).toBe(0.5)
    expect(updated.paramHistory).toBeUndefined()
  })

  it('stores the old settings through the latest completed trading day', () => {
    const updated = appendParamStage(record, { step: 0.5 }, new Date('2026-09-30T12:00:00.000Z'))

    expect(updated.row.step).toBe(0.5)
    expect(updated.paramHistory).toEqual([{ until: '2026-09-29', step: 1, rebound: 0.1, pullback: 0.1 }])
    expect(updated.result.trades).toEqual(record.result.trades)
  })

  it('does not overwrite the original stage when parameters change again on the same date', () => {
    const once = appendParamStage(record, { step: 0.5 }, new Date('2026-09-30T12:00:00.000Z'))
    const twice = appendParamStage(once, { rebound: 0.2 }, new Date('2026-09-30T13:00:00.000Z'))

    expect(twice.paramHistory).toEqual(once.paramHistory)
    expect(twice.row).toMatchObject({ step: 0.5, rebound: 0.2 })
  })

  it('makes amount and share overrides mutually exclusive by trade date', () => {
    const withAmount = updateTradeOverride(record, '2026-01-06', { amount: 250 })
    const withShares = updateTradeOverride(withAmount, '2026-01-06', { shares: 50 })

    expect(withAmount.amountOverrides?.['2026-01-06']).toBe(250)
    expect(withShares.amountOverrides?.['2026-01-06']).toBeUndefined()
    expect(withShares.sharesOverrides?.['2026-01-06']).toBe(50)
  })

  it('rejects simultaneous amount and share overrides for the same edit', () => {
    expect(() => updateTradeOverride(record, '2026-01-06', { amount: 250, shares: 50 })).toThrow(/不能同时/)
  })

  it('adds and removes manual ledger items immutably', () => {
    const manual = { id: 'manual-1', date: '2026-01-07', side: '买入' as const, price: 10, shares: 20 }
    const added = addManualTrade(record, manual)
    const removed = removeManualTrade(added, manual.id)

    expect(record.manualTrades).toBeUndefined()
    expect(added.manualTrades).toEqual([manual])
    expect(removed.manualTrades).toEqual([])
  })

  it('cannot remove the opening trade and can restore a removed grid trade', () => {
    const blocked = setGridTradeDeleted(record, row.date, true)
    const removed = setGridTradeDeleted(record, '2026-01-06', true)
    const restored = setGridTradeDeleted(removed, '2026-01-06', false)

    expect(blocked.removedTrades).toBeUndefined()
    expect(removed.removedTrades).toEqual(['2026-01-06'])
    expect(restored.removedTrades).toEqual([])
  })

  it('refuses a twenty-first snapshot and keeps backup edits isolated from the parent', () => {
    const first = createBackup(record, new Date('2026-09-30T12:00:00.000Z'))
    const many = Array.from({ length: 20 }, (_, index) => ({ ...first, id: `b${index}` }))
    const withBackups = { ...record, backups: many }
    const changedBackup = updateBackupOverride(first, '2026-01-06', { price: 9.25 })

    expect(() => appendBackup(withBackups, { ...first, id: 'newest' })).toThrow(/20/)
    expect(withBackups.backups).toEqual(many)
    expect(record.priceOverrides).toBeUndefined()
    expect(changedBackup.priceOverrides?.['2026-01-06']).toBe(9.25)
  })

  it('replays grid-only trades after a frozen backup anchor and refreshes its snapshot', () => {
    const openingOnly: SavedRecord = { ...record, result: calculateGrid(row, candles.slice(0, 1)) }
    const backup = createBackup(openingOnly, new Date('2026-01-05T12:00:00.000Z'))
    const replay = replayBackup(backup, candles)
    const refreshed = refreshBackupSnapshot(backup, candles)

    expect(replay.trades.some(trade => trade.date === '2026-01-06' && trade.side === '买入')).toBe(true)
    expect(refreshed.date).toBe('2026-01-05')
    expect(refreshed.position).toBe(100)
  })
})
