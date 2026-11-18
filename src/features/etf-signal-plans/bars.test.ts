import { describe, expect, it, vi } from 'vitest'
import { fetchPlanBars, PLAN_ADJUST } from './bars'

describe('fetchPlanBars', () => {
  it('请求腾讯后复权，并解析 hfqday', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(String(url)).toMatch(/adjust=hfq|hfq/)
      expect(PLAN_ADJUST).toBe('hfq')
      return new Response(JSON.stringify({
        data: {
          sh510880: {
            hfqday: [
              ['2024-05-20', '2.961', '2.988', '2.993', '2.961'],
              ['2024-05-21', '2.983', '2.999', '3.003', '2.982'],
            ],
          },
        },
      }))
    })
    const { bars, source } = await fetchPlanBars('510880', fetchImpl)
    expect(source).toContain('后复权')
    expect(bars).toEqual([
      { date: '2024-05-20', open: 2.961, high: 2.993, low: 2.961, close: 2.988 },
      { date: '2024-05-21', open: 2.983, high: 3.003, low: 2.982, close: 2.999 },
    ])
  })

  it('只有前复权时拒绝静默混用', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      data: { sz159915: { qfqday: [['2024-05-20', '1', '1', '1', '1']] } },
    })))
    await expect(fetchPlanBars('159915', fetchImpl)).rejects.toThrow(/后复权/)
  })
})
