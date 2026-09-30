import { describe, expect, it } from 'vitest'
import { applyGridImport, exportGridRecords, parseGridImport } from './importExport'
import type { SavedRecord } from './types'

const record = (id: string, step = 0.1): SavedRecord => ({
  id,
  savedAt: '2026-09-30T00:00:00.000Z',
  priceOverrides: { '2026-09-30': 3.5 },
  paramHistory: [{ until: '2026-09-29', step: 0.1, rebound: 0.01, pullback: 0.01 }],
  manualTrades: [{ id: `manual-${id}`, date: '2026-09-30', side: '买入', price: 3.5, shares: 100 }],
  backups: [],
  row: { name: 'ETF', code: '510300', date: '2026-09-29', initialPrice: 3.5, initialAmount: 1_000, step, rebound: 0.01, pullback: 0.01, gridAmount: 100 },
  result: { range: '', current: 3.5, lastTradeDate: '', lastTrade: 3.5, nextBuy: 3.4, nextSell: 3.6, buyTrigger: 3.4, sellTrigger: 3.6, pnl: 0, value: 1_000, realized: 0, maxCapital: 1_000, buys: 0, sells: 0, trades: [], series: [] },
})

describe('grid record portability', () => {
  it('rejects broken nested trade, override and backup data', () => {
    for (const patch of [{ result: { ...record('a').result, trades: [null] } }, { priceOverrides: { bad: 'x' } }, { backups: [{ id: 'bad' }] }]) {
      expect(parseGridImport(JSON.stringify([{ ...record('a'), ...patch }])).errors.length).toBeGreaterThan(0)
    }
  })
  it('round trips all saved record substructures without sync credentials', () => {
    const serialized = exportGridRecords([record('a')])
    const parsed = parseGridImport(serialized)

    expect(parsed.errors).toEqual([])
    expect(parsed.records[0]).toEqual({ ...record('a'), schemaVersion: 1 })
    expect(serialized).not.toContain('syncToken')
  })

  it('accepts the raw SavedRecord array exported by notes', () => {
    const parsed = parseGridImport(JSON.stringify([record('notes-record')]))

    expect(parsed.errors).toEqual([])
    expect(parsed.records[0].row.step).toBe(0.1)
  })

  it('rejects unsupported versions and malformed records without returning partial data', () => {
    expect(parseGridImport(JSON.stringify({ schemaVersion: 99, records: [record('a')] })).errors).toContain('不支持的导入版本')
    expect(parseGridImport(JSON.stringify([{ id: 'bad', row: {}, result: {} }])).errors.length).toBeGreaterThan(0)
  })

  it('reports duplicate IDs inside one imported file', () => {
    const parsed = parseGridImport(JSON.stringify([record('same'), record('same')]))

    expect(parsed.records).toHaveLength(1)
    expect(parsed.errors).toEqual(['第 2 条记录重复使用 ID same'])
  })

  it('keeps local duplicates by default and applies explicit per-record skip or replace choices', () => {
    const local = [record('same', 0.1)]
    const incoming = [record('same', 0.2), record('new', 0.3)]
    const preview = applyGridImport(local, incoming)

    expect(preview.records.find(item => item.id === 'same')?.row.step).toBe(0.1)
    expect(preview.conflicts).toEqual(['same'])
    expect(applyGridImport(local, incoming, { same: 'replace' }).records.find(item => item.id === 'same')?.row.step).toBe(0.2)
    expect(applyGridImport(local, incoming, { same: 'skip' }).records.map(item => item.id)).toEqual(['same', 'new'])
    expect(local[0].row.step).toBe(0.1)
  })
})
