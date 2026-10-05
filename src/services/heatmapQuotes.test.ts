import { describe, expect, it, vi } from 'vitest'
import { fetchHeatmapQuotes } from './heatmapQuotes'

function quote(symbol: string, stamp: string, price = '430', change = '2.09') {
  const fields = Array(35).fill('')
  fields[3] = price; fields[30] = stamp; fields[32] = change
  return `v_${symbol}="${fields.join('~')}";`
}

describe('热力图最新报价', () => {
  it('用带真实行情时间的报价覆盖昨日 scanner 数据', async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL) => new Response(quote('r_hk00700', '2026/10/02 15:59:00')))
    const stocks = await fetchHeatmapQuotes([{ ticker: 'HKEX:700', code: '00700', name: '腾讯', sector: 'Technology', close: 420, change: -2, marketCap: 1e12 }], fetcher)
    expect(stocks[0]).toMatchObject({ close: 430, change: 2.09, quoteTime: '2026-10-02 15:59:00' })
    expect(String(fetcher.mock.calls[0][0])).toContain('r_hk00700')
  })

  it('A股分批请求，保留休市时真实的最后交易日', async () => {
    const stocks = Array.from({ length: 101 }, (_, i) => ({ ticker: `SZSE:${String(i + 1).padStart(6, '0')}`, code: String(i + 1).padStart(6, '0'), name: '股票', sector: '', close: 1, change: 0, marketCap: 1 }))
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      const symbols = new URL(String(url), 'https://local.test').searchParams.get('symbols')!
      return new Response(symbols.split(',').map(s => quote(s, '20260930150000')).join('\n'))
    })
    const result = await fetchHeatmapQuotes(stocks, fetcher)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(result).toHaveLength(101)
    expect(result[100].quoteTime).toBe('2026-09-30 15:00:00')
  })

  it('缺少报价时拒绝把昨日数据冒充刷新成功', async () => {
    const stocks = [{ ticker: 'HKEX:700', code: '00700', name: '腾讯', sector: '', close: 420, change: -2, marketCap: 1 }]
    await expect(fetchHeatmapQuotes(stocks, vi.fn(async () => new Response('')))).rejects.toThrow('缺少有效报价')
  })
  it('缺失个股显示未知，不回退至旧价格', async () => {
    const stocks = ['00700', '00005'].map(code => ({ ticker: `HKEX:${Number(code)}`, code, name: code, sector: '', close: 420, change: -2, marketCap: 1 }))
    const result = await fetchHeatmapQuotes(stocks, vi.fn(async () => new Response(quote('r_hk00700', '20261002155900'))))
    expect(result[1]).toMatchObject({ close: null, change: null })
    expect(result[1].quoteTime).toBeUndefined()
  })
  it('美股用腾讯 us 代码请求，保留美东行情时间', async () => {
    const stocks = [{ ticker: 'NASDAQ:AAPL', code: 'AAPL', name: 'AAPL', sector: '', close: 1, change: 1.02, marketCap: 1 }, { ticker: 'NYSE:BRK.B', code: 'BRK.B', name: 'BRK.B', sector: '', close: 1, change: 0, marketCap: 1 }]
    const fetcher = vi.fn(async (_url: RequestInfo | URL) => new Response([quote('usAAPL', '2026-10-05 10:20:59', '333.57', '-0.04'), quote('usBRK.B', '2026-10-05 10:21:20', '504.66', '0.40')].join('\n')))
    const result = await fetchHeatmapQuotes(stocks, fetcher)
    expect(String(fetcher.mock.calls[0][0])).toContain(encodeURIComponent('usAAPL,usBRK.B'))
    expect(result[0]).toMatchObject({ close: 333.57, change: -0.04, quoteTime: '2026-10-05 10:20:59' })
    expect(result[1]).toMatchObject({ change: 0.4 })
  })
})
