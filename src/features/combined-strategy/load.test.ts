import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadCombinedStrategy, COMBINED_STRATEGY_URL, resetCombinedStrategyCache } from './load'
import { combinedStrategyFixture } from './fixture'

afterEach(() => {
  resetCombinedStrategyCache()
  vi.restoreAllMocks()
})

describe('loadCombinedStrategy', () => {
  it('成功解析合法 JSON', async () => {
    const data = combinedStrategyFixture()
    const fetcher = vi.fn(async () => new Response(JSON.stringify(data), { status: 200 }))
    await expect(loadCombinedStrategy(fetcher as unknown as typeof fetch)).resolves.toMatchObject({
      ruleVersion: 'fusion-v1',
      current: { macroTier: 'lean-offense' },
    })
    expect(fetcher).toHaveBeenCalledWith(COMBINED_STRATEGY_URL, expect.objectContaining({ cache: 'no-cache' }))
  })

  it('HTTP 失败抛错', async () => {
    const fetcher = vi.fn(async () => new Response('nope', { status: 404 }))
    await expect(loadCombinedStrategy(fetcher as unknown as typeof fetch)).rejects.toThrow(/HTTP 404/)
  })

  it('结构异常抛错', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ foo: 1 }), { status: 200 }))
    await expect(loadCombinedStrategy(fetcher as unknown as typeof fetch)).rejects.toThrow(/数据结构异常/)
  })
})
