// 财报日历共享读取：成功后模块级缓存只请求一次；失败不缓存；所有调用方中止时中止请求。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadEarningsCalendar, resetEarningsCalendarCache } from './loadCalendar'

const CAL = { schemaVersion: 1, generatedAt: '2026-11-14T12:22:01Z', today: '2026-11-14', window: { start: '2026-10-31', end: '2026-12-26' }, sources: {}, seasons: {}, items: [{ market: 'us', code: 'NVDA', date: '2026-11-19' }], cnNotices: [] }

afterEach(() => { resetEarningsCalendarCache(); vi.unstubAllGlobals() })

describe('loadEarningsCalendar', () => {
  it('成功后缓存：两次调用只请求一次', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => CAL }))
    vi.stubGlobal('fetch', fetchMock)
    const [a, b] = await Promise.all([loadEarningsCalendar(), loadEarningsCalendar()])
    expect(a?.items).toHaveLength(1)
    expect(b).toBe(a)
    expect(await loadEarningsCalendar()).toBe(a)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toMatch(/data\/earnings-calendar\.json$/)
  })
  it('失败或形状不对返回 null，且不缓存（下次再请求）', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await loadEarningsCalendar()).toBeNull()
    expect(await loadEarningsCalendar()).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it('唯一的调用方中止时中止请求', async () => {
    let signal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_: string, init: RequestInit) => { signal = init.signal ?? undefined; return new Promise((_r, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted')))) }))
    const c = new AbortController()
    const p = loadEarningsCalendar(c.signal)
    c.abort()
    expect(signal?.aborted).toBe(true)
    expect(await p).toBeNull()
  })
})
