import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadSyncConfig, saveSyncConfig, syncGridRecords } from './cloudSync'
import type { SavedRecord } from './types'
import { readRecords, writeRecords } from './repository'

const record: SavedRecord = {
  id: 'local', savedAt: '2026-09-29T00:00:00.000Z',
  row: { name: 'ETF', code: '510300', date: '2026-09-29', initialPrice: 3.5, initialAmount: 1_000, step: 0.1, rebound: 0.01, pullback: 0.01, gridAmount: 100 },
  result: { range: '', current: 3.5, lastTradeDate: '', lastTrade: 3.5, nextBuy: 3.4, nextSell: 3.6, buyTrigger: 3.4, sellTrigger: 3.6, pnl: 0, value: 1_000, realized: 0, maxCapital: 1_000, buys: 0, sells: 0, trades: [], series: [] },
}

describe('optional grid cloud sync', () => {
  it('refuses stale page records rather than overwriting another tab update', async () => {
    writeRecords([{ ...record, updatedAt: '2026-10-02T00:00:00Z', row: { ...record.row, step: 0.3 } }])
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ records: [] })))
      .mockResolvedValueOnce(new Response('{}'))
    const result = await syncGridRecords([record], { endpoint: 'https://private.example/sync', token: 'special-project-token-12345' }, fetchImpl, () => true)
    expect(result.status).toBe('error')
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(readRecords()[0].row.step).toBe(0.3)
  })
  it('sends the cloud revision and preserves local records on a concurrent write', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ schemaVersion: 1, records: [] }), { headers: { etag: '"7"' } }))
      .mockResolvedValueOnce(new Response('{}', { status: 409 }))
    const before = localStorage.getItem('businessweb.grid-trading.v1')
    const result = await syncGridRecords([record], { endpoint: 'https://private.example/sync', token: 'special-project-token-12345' }, fetchImpl, () => true)
    expect(new Headers(fetchImpl.mock.calls[1][1].headers).get('if-match')).toBe('"7"')
    expect(result.status).toBe('error')
    expect(result.error).toMatch(/其他设备|冲突/)
    expect(localStorage.getItem('businessweb.grid-trading.v1')).toBe(before)
  })
  it('reports equal-timestamp content conflicts without uploading either version', async () => {
    const remote = { ...record, row: { ...record.row, step: 0.2 } }
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ records: [remote] })))
    const result = await syncGridRecords([record], { endpoint: 'https://private.example/sync', token: 'special-project-token-12345' }, fetchImpl, () => true)
    expect(result.status).toBe('error')
    expect(result.error).toMatch(/冲突/)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
  it('rejects malformed remote records before sending any PUT', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ records: [null] })))
    await expect(syncGridRecords([record], { endpoint: 'https://private.example/sync', token: 'special-project-token-12345' }, fetchImpl, () => true)).resolves.toMatchObject({ status: 'error' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
  beforeEach(() => { localStorage.clear(); writeRecords([record]) })

  it('has no default endpoint or token and performs no request when unconfigured', async () => {
    const fetchImpl = vi.fn()

    expect(loadSyncConfig()).toBeNull()
    await expect(syncGridRecords([record], null, fetchImpl, vi.fn())).resolves.toMatchObject({ status: 'not-configured' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('does not save a sync target when target confirmation is cancelled', async () => {
    const confirmed = await saveSyncConfig({ endpoint: 'https://private.example/sync', token: 'special-project-token-12345' }, vi.fn(() => false))

    expect(confirmed).toBe(false)
    expect(loadSyncConfig()).toBeNull()
  })

  it('refuses non-HTTPS endpoints without making a request', async () => {
    const fetchImpl = vi.fn()

    await expect(syncGridRecords([record], { endpoint: 'http://private.example/sync', token: 'special-project-token-12345' }, fetchImpl, vi.fn(() => true)))
      .resolves.toMatchObject({ status: 'invalid-config' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('confirms and uses only the configured HTTPS origin for GET and PUT', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ records: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    const confirmTarget = vi.fn(() => true)

    await expect(syncGridRecords([record], { endpoint: 'https://private.example/sync', token: 'special-project-token-12345' }, fetchImpl, confirmTarget))
      .resolves.toMatchObject({ status: 'synced' })

    expect(confirmTarget).toHaveBeenCalledWith('https://private.example', 1)
    expect(fetchImpl.mock.calls.map(call => call[0])).toEqual(['https://private.example/sync', 'https://private.example/sync'])
  })
})
