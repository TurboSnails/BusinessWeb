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
  it('走同源 grid-market 接口，只返回取到报价的代码并保留站内名称', async () => {
    const fetchImpl = vi.fn(async (_url: string) => new Response(new TextEncoder().encode(sample)))
    const rows = await fetchIndexQuotes([{ symbol: 'usINX', name: '标普500' }, { symbol: 'usNDX', name: '纳斯达克100' }], fetchImpl as unknown as typeof fetch)
    expect(String(fetchImpl.mock.calls[0][0])).toContain('/api/grid-market?kind=quotes&symbols=usINX%2CusNDX')
    expect(rows).toEqual([{ symbol: 'usINX', name: '标普500', price: 6910.39, changePercent: -3.7, quoteTime: '2026-11-20 16:35' }])
  })
  it('接口失败时抛错，由页面退回缓存', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 502 }))
    await expect(fetchIndexQuotes([{ symbol: 'usINX', name: '标普500' }], fetchImpl as unknown as typeof fetch)).rejects.toThrow('HTTP 502')
  })
})
