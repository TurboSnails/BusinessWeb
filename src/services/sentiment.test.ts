import { describe, expect, it, vi } from 'vitest'
import { buildSentiment, parseCboe, parseGexCsv, recentDates } from '../../server/sentiment.mjs'

const cboeJson = { ratios: [{ name: 'TOTAL PUT/CALL RATIO', value: '0.78' }, { name: 'EQUITY PUT/CALL RATIO', value: '0.58' }, { name: 'SPX + SPXW PUT/CALL RATIO', value: '1.15' }] }
const yahoo = (price: number, t = 1791214711) => ({ chart: { result: [{ meta: { regularMarketPrice: price, regularMarketTime: t } }] } })
const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) })

describe('情绪数据解析', () => {
  it('CBOE 日度统计：取个股 P/C 与 SPX+SPXW P/C', () => {
    expect(parseCboe(cboeJson)).toEqual({ equityPC: 0.58, spxPC: 1.15 })
  })
  it('SqueezeMetrics DIX.csv：取最后一行 GEX，换算为十亿美元', () => {
    expect(parseGexCsv('date,price,dix,gex\n2026-10-01,6700,0.41,5123456789.1\n2026-10-02,6710,0.40,6234567890.4\n')).toEqual({ date: '2026-10-02', gexBn: 6.23 })
  })
  it('近几日日期按美东时间倒序，用于跳过休市日', () => {
    expect(recentDates(new Date('2026-10-05T14:00:00Z'), 3)).toEqual(['2026-10-05', '2026-10-04', '2026-10-03'])
  })
})

describe('buildSentiment：并行获取，单项失败不影响其他项', () => {
  it('全部成功：返回 P/C、VIX 期限结构、GEX、金银比', async () => {
    const fetcher = vi.fn(async (url: string): Promise<unknown> => {
      const u = String(url)
      if (u.includes('cdn.cboe.com')) return u.includes('2026-10-02') ? json(cboeJson) : { ok: false, status: 403 }
      if (u.includes('DIX.csv')) return { ok: true, text: async () => 'date,price,dix,gex\n2026-10-02,6710,0.40,6234567890.4\n' }
      if (u.includes('%5EVIX3M')) return json(yahoo(18.07))
      if (u.includes('%5EVIX')) return json(yahoo(15.58))
      if (u.includes('GC%3DF')) return json(yahoo(4166))
      if (u.includes('SI%3DF')) return json(yahoo(61.52))
      return { ok: false, status: 404 }
    })
    const r = await buildSentiment(fetcher, new Date('2026-10-05T14:00:00Z'))
    expect(r).toMatchObject({ equityPC: 0.58, spxPC: 1.15, pcDate: '2026-10-02', vix: 15.58, vix3m: 18.07, gexBn: 6.23, gexDate: '2026-10-02', goldSilver: 67.72 })
    expect(r.warnings).toEqual([])
  })
  it('某个源失败：其余照常返回，并给出提示', async () => {
    const fetcher = vi.fn(async (url: string): Promise<unknown> => (String(url).includes('%5EVIX') && !String(url).includes('VIX3M') ? json(yahoo(15.58)) : { ok: false, status: 500 }))
    const r = await buildSentiment(fetcher, new Date('2026-10-05T14:00:00Z'))
    expect(r.vix).toBe(15.58)
    expect(r.equityPC).toBeNull()
    expect(r.warnings.length).toBeGreaterThan(0)
  })
})
