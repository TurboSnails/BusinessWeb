import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readRecords, removeRecords, saveRecord, saveRecordIfUnchanged, writeRecords } from './repository'
import type { SavedRecord } from './types'

const record = (id: string): SavedRecord => ({
  id,
  savedAt: '2026-09-30T00:00:00.000Z',
  row: { name: 'ETF', code: '510300', date: '2026-09-29', initialPrice: 3.5, initialAmount: 1_000, step: 0.1, rebound: 0.01, pullback: 0.01, gridAmount: 100 },
  result: { range: '', current: 3.5, lastTradeDate: '', lastTrade: 3.5, nextBuy: 3.4, nextSell: 3.6, buyTrigger: 3.4, sellTrigger: 3.6, pnl: 0, value: 1_000, realized: 0, maxCapital: 1_000, buys: 0, sells: 0, trades: [], series: [] },
})

describe('grid record repository', () => {
  it('does not resurrect deletions or overwrite edits when a refresh finishes late', () => {
    saveRecord(record('a'))
    const original = readRecords()[0]
    removeRecords(['a'])
    expect(saveRecordIfUnchanged({ ...original, updatedAt: '2026-10-01' }, original)).toBe(false)
    expect(readRecords()).toEqual([])
    saveRecord(original)
    saveRecord({ ...original, row: { ...original.row, step: 0.2 } })
    expect(saveRecordIfUnchanged({ ...original, updatedAt: '2026-10-01' }, original)).toBe(false)
    expect(readRecords()[0].row.step).toBe(0.2)
  })
  it('rolls back deletion markers when deleting records fails', () => {
    writeRecords([record('kept')])
    const original = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function(this: Storage, key, value) {
      if (key === 'businessweb.grid-trading.v1') throw new Error('full')
      return original.call(this, key, value)
    })
    expect(() => removeRecords(['kept'], true)).toThrow()
    expect(localStorage.getItem('businessweb.grid-trading.deleted.v1')).toBeNull()
    expect(readRecords()[0].id).toBe('kept')
  })
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('stores versioned records under a BusinessWeb-only key', () => {
    writeRecords([record('a')])

    expect(readRecords()).toHaveLength(1)
    expect(Object.keys(localStorage)).toContain('businessweb.grid-trading.v1')
    expect(Object.keys(localStorage)).not.toContain('grid-trading-saved-v1')
  })

  it('updates a record by stable ID without dropping other saved records', () => {
    writeRecords([record('a'), record('b')])
    saveRecord({ ...record('a'), updatedAt: '2026-09-30T01:00:00.000Z' })

    expect(readRecords().map(item => item.id)).toEqual(['a', 'b'])
    expect(readRecords()[0].updatedAt).toBe('2026-09-30T01:00:00.000Z')
  })

  it('returns an empty list for corrupt JSON without deleting the stored bytes', () => {
    localStorage.setItem('businessweb.grid-trading.v1', '{bad json')

    expect(readRecords()).toEqual([])
    expect(localStorage.getItem('businessweb.grid-trading.v1')).toBe('{bad json')
  })

  it('does not clear the last valid records when storage reports quota exceeded', () => {
    writeRecords([record('kept')])
    const original = localStorage.getItem('businessweb.grid-trading.v1')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new DOMException('full', 'QuotaExceededError') })

    expect(() => writeRecords([record('lost')])).toThrow(/空间|保存/)
    expect(localStorage.getItem('businessweb.grid-trading.v1')).toBe(original)
    expect(readRecords().map(item => item.id)).toEqual(['kept'])
  })

  it('deletes selected records and preserves the rest', () => {
    writeRecords([record('a'), record('b')])

    removeRecords(['a'])

    expect(readRecords().map(item => item.id)).toEqual(['b'])
  })

  it('does not create cloud tombstones for local-only deletes', () => {
    writeRecords([record('a')])

    removeRecords(['a'])

    expect(localStorage.getItem('businessweb.grid-trading.deleted.v1')).toBeNull()
  })

  it('creates tombstones for deletes only when the user enables sync', () => {
    writeRecords([record('a')])

    removeRecords(['a'], true)

    expect(JSON.parse(localStorage.getItem('businessweb.grid-trading.deleted.v1') ?? '[]')).toMatchObject([{ id: 'a', deleted: true }])
  })
})
