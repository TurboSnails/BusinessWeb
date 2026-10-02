import { describe, it, expect, vi, afterEach } from 'vitest'
import { loadLimitUp, previousTradingDate } from './limitUp'
const payload = (date: string) => ({ code: 200, data: { plate_stock: [{ secu_name: '医药', change: .02, plate_stock_up_num: 1, stock_list: [{ secu_code: 'sz000710', secu_name: '贝瑞基因', change: .1, last_px: 10, cmc: 100000000, time: `${date} 09:33:06`, up_num: '4天2板' }] }] } })
const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
afterEach(() => vi.useRealTimers())
describe('涨停日期和加载状态', () => {
  it('国庆和周末回退最近交易日，中秋不遗漏', () => {
    expect(previousTradingDate('2026-10-02')).toBe('2026-09-30')
    expect(previousTradingDate('2026-09-27')).toBe('2026-09-24')
    expect(previousTradingDate('2026-09-30')).toBe('2026-09-30')
  })
  it('休市请求上一个交易日并返回真实日期', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response(payload('2026-09-30')))
    const r = await loadLimitUp('2026-10-02', true, undefined, fetcher)
    expect(r.status).toBe('closed'); expect(r.dataDate).toBe('2026-09-30')
    expect(fetcher.mock.calls[0][0]).toContain('date=20260930&up_limit=1')
    expect(r.concepts[0].stocks[0].consecutiveDays).toBe(2)
  })
  it('休市最近交易日无数据时继续找最近有效日', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({ code: 200, data: { plate_stock: [] } })).mockResolvedValueOnce(response(payload('2026-09-29')))
    const r = await loadLimitUp('2026-10-02', false, undefined, fetcher)
    expect(r.dataDate).toBe('2026-09-29'); expect(fetcher.mock.calls[1][0]).toContain('date=20260929&up_limit=0')
  })
  it('交易日确认空数据不回退，区别于失败', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response({ code: 200, data: { plate_stock: [] } }))
    const r = await loadLimitUp('2026-09-30', true, undefined, fetcher)
    expect(r.status).toBe('empty'); expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it.each([response({ code: 403, msg: '拒绝请求' }), response({ code: 200, data: {} }), new Response('失败', { status: 502 }), response(payload('2026-09-29'))])('错误、缺字段和日期不符不会被当成空数据', async res => {
    await expect(loadLimitUp('2026-09-30', true, undefined, async () => res)).rejects.toThrow()
  })
})

it('请求超时显示超时错误，不回退历史日期', async () => {
  vi.useFakeTimers()
  const fetcher = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('已取消', 'AbortError')))
  }))
  const request = loadLimitUp('2026-10-02', true, undefined, fetcher)
  const assertion = expect(request).rejects.toThrow('数据请求超时')
  await vi.advanceTimersByTimeAsync(10000)
  await assertion
  expect(fetcher).toHaveBeenCalledTimes(1)
})
it('拒绝非法日历日期', () => {
  expect(() => previousTradingDate('2026-02-31')).toThrow('有效日期')
})
