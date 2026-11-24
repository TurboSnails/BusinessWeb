import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadRadar, RADAR_URL, resetRadarCache, STALE_DATA_MESSAGE } from './load'
import { radarFixture } from './fixture'

afterEach(() => {
  resetRadarCache()
  vi.restoreAllMocks()
})

describe('loadRadar', () => {
  it('成功解析合法 JSON', async () => {
    const data = radarFixture()
    const fetcher = vi.fn(async () => new Response(JSON.stringify(data), { status: 200 }))
    await expect(loadRadar(fetcher as unknown as typeof fetch)).resolves.toMatchObject({
      ruleVersion: 'radar-v1',
      current: { tier: 'lean-defense', counts: { total: data.indicators.length } },
    })
    expect(fetcher).toHaveBeenCalledWith(RADAR_URL, expect.objectContaining({ cache: 'no-cache' }))
  })

  it('HTTP 失败抛错', async () => {
    const fetcher = vi.fn(async () => new Response('nope', { status: 500 }))
    await expect(loadRadar(fetcher as unknown as typeof fetch)).rejects.toThrow(/HTTP 500/)
  })

  it('结构异常抛错', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ foo: 1 }), { status: 200 }))
    await expect(loadRadar(fetcher as unknown as typeof fetch)).rejects.toThrow(STALE_DATA_MESSAGE)
  })

  it('缺 current.counts 时提示数据版本过旧', async () => {
    const stale = radarFixture()
    const body = {
      ...stale,
      current: {
        score: stale.current.score,
        tier: stale.current.tier,
        heatScore: stale.current.heatScore,
        heat: stale.current.heat,
        headline: stale.current.headline,
        dimensions: stale.current.dimensions,
      },
    }
    const fetcher = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))
    await expect(loadRadar(fetcher as unknown as typeof fetch)).rejects.toThrow(STALE_DATA_MESSAGE)
  })

  it('缺 backtest.curves 时提示数据版本过旧', async () => {
    const stale = radarFixture()
    const { curves: _curves, ...rest } = stale.backtest
    const body = { ...stale, backtest: rest }
    const fetcher = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))
    await expect(loadRadar(fetcher as unknown as typeof fetch)).rejects.toThrow(STALE_DATA_MESSAGE)
  })

  it('指标缺 valueText / status 时提示数据版本过旧', async () => {
    const stale = radarFixture()
    const body = {
      ...stale,
      indicators: [{ id: 'pe', label: '市盈率', dimension: 'valuation' }],
    }
    const fetcher = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))
    await expect(loadRadar(fetcher as unknown as typeof fetch)).rejects.toThrow(STALE_DATA_MESSAGE)
  })
})
