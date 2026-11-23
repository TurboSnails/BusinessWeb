import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadRadar, RADAR_URL, resetRadarCache } from './load'
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
      current: { tier: 'lean-defense' },
    })
    expect(fetcher).toHaveBeenCalledWith(RADAR_URL, expect.objectContaining({ cache: 'no-cache' }))
  })

  it('HTTP 失败抛错', async () => {
    const fetcher = vi.fn(async () => new Response('nope', { status: 500 }))
    await expect(loadRadar(fetcher as unknown as typeof fetch)).rejects.toThrow(/HTTP 500/)
  })

  it('结构异常抛错', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ foo: 1 }), { status: 200 }))
    await expect(loadRadar(fetcher as unknown as typeof fetch)).rejects.toThrow(/数据结构异常/)
  })
})
