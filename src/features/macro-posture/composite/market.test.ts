import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadMarket, MARKET_URL, resetMarketCache } from './market'
import { marketFixture } from './market.fixture'

afterEach(() => {
  resetMarketCache()
  vi.restoreAllMocks()
})

describe('loadMarket', () => {
  it('成功解析合法 JSON', async () => {
    const data = marketFixture()
    const fetcher = vi.fn(async () => new Response(JSON.stringify(data), { status: 200 }))
    await expect(loadMarket(fetcher as unknown as typeof fetch)).resolves.toMatchObject({
      generatedAt: data.generatedAt,
      stage2: { verdict: 'adopt' },
    })
    expect(fetcher).toHaveBeenCalledWith(MARKET_URL, expect.objectContaining({ cache: 'no-cache' }))
  })

  it('HTTP 失败抛错', async () => {
    const fetcher = vi.fn(async () => new Response('nope', { status: 500 }))
    await expect(loadMarket(fetcher as unknown as typeof fetch)).rejects.toThrow(/HTTP 500/)
  })

  it('结构异常抛错', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ foo: 1 }), { status: 200 }))
    await expect(loadMarket(fetcher as unknown as typeof fetch)).rejects.toThrow(/数据结构异常/)
  })
})
