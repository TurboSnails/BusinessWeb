import { describe, expect, it, vi } from 'vitest'
import { fetchIndexQuotes, parseTencentQuotes } from './indexQuotes'

const sample = [
  'v_usINX="200~标普500~.INX~6910.39~7175.83~7150.39~4727416323~0~0~6893.98~0~0~0~0~0~0~0~0~0~7026.48~0~0~0~0~0~0~0~0~0~~2026-11-20 16:35:54~-265.44~-3.70~7198.67";',
  'v_r_hkHSI="100~恒生指数~HSI~22410.800~22841.620~22482.390~27029964.6695~0~0~22410.800~0~0~0~0~0~0~0~0~0~22410.800~0~0~0~0~0~0~0~0~0~0.0~2026/11/20 18:31:27~-430.820~-1.89~22593.510";',
  'v_sh000001="1~上证指数~000001~3533.79~3577.80~3570.10~1~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~~20261120150000~-44.01~-1.23~3580";',
  'v_usBAD="200~坏数据~BAD~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~~2026-11-20 16:00:00~0~~0";',
].join('\n')

describe('parseTencentQuotes', () => {
  it('解析美股、港股指数（r_hk 字母代码）与 A 股，统一行情时间格式', () => {
    const q = parseTencentQuotes(sample)
    expect(q.get('usINX')).toEqual({ price: 6910.39, changePercent: -3.7, quoteTime: '2026-11-20 16:35' })
    expect(q.get('r_hkHSI')).toEqual({ price: 22410.8, changePercent: -1.89, quoteTime: '2026-11-20 18:31' })
    expect(q.get('sh000001')?.quoteTime).toBe('2026-11-20 15:00')
  })
  it('现价非正或涨跌幅缺失的报价丢弃，不当作 0', () => {
    expect(parseTencentQuotes(sample).has('usBAD')).toBe(false)
  })
})

describe('fetchIndexQuotes', () => {
  const items = [{ symbol: 'usINX', name: '标普500' }]
  const hangingFetch = vi.fn<typeof fetch>((_url, options) => new Promise((_resolve, reject) => {
    const signal = options!.signal!
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  }))

  it('走同源 grid-market 接口，只返回取到报价的代码并保留站内名称', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(new TextEncoder().encode(sample)))
    const caller = new AbortController()
    const rows = await fetchIndexQuotes([...items, { symbol: 'usNDX', name: '纳斯达克100' }], fetchImpl, caller.signal)
    expect(String(fetchImpl.mock.calls[0][0])).toContain('/api/grid-market?kind=quotes&symbols=usINX%2CusNDX')
    expect(rows).toEqual([{ symbol: 'usINX', name: '标普500', price: 6910.39, changePercent: -3.7, quoteTime: '2026-11-20 16:35' }])
  })
  it('接口失败时抛错，由页面退回缓存', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('', { status: 502 }))
    await expect(fetchIndexQuotes(items, fetchImpl)).rejects.toThrow('HTTP 502')
  })

  it('传入调用方信号后，挂起的请求仍在 10 秒超时', async () => {
    vi.useFakeTimers()
    const caller = new AbortController()
    const pending = fetchIndexQuotes(items, hangingFetch, caller.signal)
    const settled = vi.fn()
    void pending.then(settled, settled)
    try {
      await vi.advanceTimersByTimeAsync(9999)
      expect(settled).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      expect(settled).toHaveBeenCalledWith(expect.objectContaining({ name: 'TimeoutError' }))
      expect(caller.signal.aborted).toBe(false)
    } finally {
      caller.abort()
      await pending.catch(() => {})
      vi.useRealTimers()
    }
  })

  it('调用方取消时立即中止请求并清理定时器', async () => {
    vi.useFakeTimers()
    try {
      const caller = new AbortController()
      const pending = fetchIndexQuotes(items, hangingFetch, caller.signal)
      caller.abort()
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('调用方已取消时跳过网络请求', async () => {
    const caller = new AbortController()
    caller.abort()
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new DOMException('Cancelled', 'AbortError'))
    await expect(fetchIndexQuotes(items, fetchImpl, caller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
