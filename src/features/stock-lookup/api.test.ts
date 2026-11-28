import { describe, expect, it, vi, afterEach } from 'vitest'
import { stockLookupApi, __test } from './api'

afterEach(() => {
  vi.unstubAllGlobals()
})

const quoteOk = {
  symbol: 'MRVL',
  name: 'Marvell Technology, Inc.',
  market: 'us',
  currency: 'USD',
  price: 140.54,
  change: 9.61,
  changePct: 7.34,
  prevClose: 130.93,
  session: 'closed',
  time: '2026-11-27T16:00:01-05:00',
  timezone: 'America/New_York',
  extended: { session: 'post', price: 139.92, change: -0.62, changePct: -0.44, time: '2026-11-27T19:59:00-05:00' },
}

describe('stockLookupApi 校验', () => {
  it('quote：逐字段通过', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(quoteOk), { status: 200 })))
    const q = await stockLookupApi.quote('MRVL')
    expect(q.price).toBe(140.54)
    expect(q.extended?.session).toBe('post')
  })

  it('quote：坏体抛中文错误', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ symbol: 'MRVL' }), { status: 200 })))
    await expect(stockLookupApi.quote('MRVL')).rejects.toThrow(/行情数据格式错误/)
  })

  it('LookupError 透传中文 error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: '未找到该代码', reason: 'not-found' }), { status: 404 })))
    await expect(stockLookupApi.quote('ZZZZ')).rejects.toThrow('未找到该代码')
  })

  it('bars：坏行丢弃', () => {
    const page = __test.parseBarsPage({
      symbol: 'MRVL', tf: '1d', hasMore: false, timezone: 'America/New_York', adjustment: 'split', source: 'yahoo',
      bars: [
        { t: 1, o: 1, h: 2, l: 0.5, c: 1.5, v: 10 },
        { t: 2, o: null, h: 2, l: 1, c: 1.5 },
        { bad: true },
      ],
    })
    expect(page.bars).toHaveLength(1)
    expect(page.bars[0].c).toBe(1.5)
  })

  it('search：坏行丢弃', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([
      { symbol: 'MRVL', name: 'Marvell', market: 'us' },
      { symbol: 'X' },
      null,
    ]), { status: 200 })))
    const hits = await stockLookupApi.search('MRVL')
    expect(hits).toEqual([{ symbol: 'MRVL', name: 'Marvell', market: 'us' }])
  })

  it('news：坏 item 丢弃；整体坏抛错', () => {
    const page = __test.parseNewsPage({
      symbol: 'MRVL', start: 'a', end: 'b', source: 'yahoo',
      items: [
        { id: '1', time: 't', title: 'Beat earnings', url: 'u', publisher: 'p', topic: '业绩财报', sentiment: '利好', lang: 'en' },
        { id: '2', time: 't', title: 'x', url: 'u', publisher: 'p', topic: '否', sentiment: '利好', lang: 'en' },
      ],
    })
    expect(page.items).toHaveLength(1)
    expect(() => __test.parseNewsPage({ symbol: 'MRVL' })).toThrow(/新闻数据格式错误/)
  })

  it('analysts / offExchange 校验', () => {
    const a = __test.parseAnalysts({
      symbol: 'MRVL', source: 'yahoo',
      actions: [{ date: '2026-01-01', firm: 'X', action: 'main', target: 100 }, { date: 'x' }],
      trend: [{ period: '0m', strongBuy: 1, buy: 2, hold: 3, sell: 0, strongSell: 0 }],
      target: { mean: 200, junk: true },
    })
    expect(a.actions).toHaveLength(1)
    expect(a.target?.mean).toBe(200)

    const o = __test.parseOffExchange({
      symbol: 'MRVL', source: 'finra', note: '说明',
      daily: [{ date: '2026-01-01', shortVolume: 1, shortExemptVolume: 0, totalVolume: 2 }, { date: 'bad' }],
      ats: [{ weekStart: '2026-01-01', shares: 1, trades: 2 }],
    })
    expect(o.daily).toHaveLength(1)
    expect(o.ats).toHaveLength(1)
  })
})
