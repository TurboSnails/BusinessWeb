import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchQuotes, getCandles, getObservationCandles, mergeQuote } from './marketData'

const response = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 })

describe('marketData', () => {
  it('splits large quote lists into bounded same-origin requests', async () => {
    const codes = Array.from({ length: 101 }, (_, i) => String(510000 + i))
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'https://businessweb.example')
      const symbols = (url.searchParams.get('symbols') ?? '').split(',')
      if (url.pathname !== '/api/grid-market' || symbols.length > 100) return new Response('', { status: 400 })
      const fields = Array(35).fill('0')
      fields[1] = 'ETF'; fields[3] = '3.5'; fields[30] = '20261002'; fields[33] = '3.6'; fields[34] = '3.4'
      return new Response(new TextEncoder().encode(symbols.map(symbol => `v_${symbol}="${fields.join('~')}"`).join(';')))
    })
    expect((await fetchQuotes(codes, fetchImpl)).size).toBe(101)
  })
  it('rejects partial malformed candle responses and missing requested quotes', async () => {
    const history = vi.fn(async () => response({ data: { sh510300: { qfqday: [['2026-09-29', '3.4', '3.5', '3.6', '3.3'], ['2026-09-30', '3.4', 'bad', '3.6', '3.3']] } } }))
    await expect(getCandles('510300', '2026-09-29', { force: true }, history)).rejects.toThrow(/无效|不完整/)
    await expect(fetchQuotes(['510300'], vi.fn(async () => new Response('v_sh510300=""')))).rejects.toThrow(/缺少|无效/)
  })
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('decodes GBK Tencent quotes and maps requested codes to quote records', async () => {
    const fieldsAfterName = Array(33).fill('0')
    fieldsAfterName[0] = '510300'
    fieldsAfterName[1] = '3.500'
    fieldsAfterName[28] = '20260930'
    fieldsAfterName[31] = '3.600'
    fieldsAfterName[32] = '3.400'
    const prefix = new TextEncoder().encode('v_sh510300="1~')
    const gbkName = new Uint8Array([
      0xbb, 0xa6, 0xc9, 0xee,
      ...new TextEncoder().encode('300ETF'),
    ])
    const suffix = new TextEncoder().encode(`~${fieldsAfterName.join('~')}"`)
    const encoded = new Uint8Array(prefix.length + gbkName.length + suffix.length)
    encoded.set(prefix)
    encoded.set(gbkName, prefix.length)
    encoded.set(suffix, prefix.length + gbkName.length)
    const fetchImpl = vi.fn(async () => new Response(encoded, { status: 200 }))

    const quotes = await fetchQuotes(['510300'], fetchImpl)

    expect(quotes.get('510300')).toMatchObject({ code: '510300', name: '沪深300ETF', price: 3.5, high: 3.6, low: 3.4 })
  })

  it('reads adjusted daily candles and returns their source freshness metadata', async () => {
    const fetchImpl = vi.fn(async () => response({
      data: { sh510300: { qfqday: [['2026-09-29', '3.4', '3.5', '3.6', '3.3']] } },
    }))

    const result = await getCandles('510300', '2026-09-29', { force: true }, fetchImpl)

    expect(result.candles).toEqual([{ date: '2026-09-29', open: 3.4, close: 3.5, high: 3.6, low: 3.3 }])
    expect(result.source).toContain('腾讯')
    expect(result.fetchedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('fails clearly instead of returning candles for an empty response', async () => {
    const fetchImpl = vi.fn(async () => response({ data: { sh510300: { qfqday: [] } } }))

    await expect(getCandles('510300', '2026-09-29', { force: true }, fetchImpl)).rejects.toThrow(/没有|无有效/)
  })

  it('requests another page when Tencent returns the maximum 640 daily candles', async () => {
    const tradingDates: string[] = []
    const cursor = new Date('2024-04-01T00:00:00Z')
    while (tradingDates.length < 640) {
      const weekday = cursor.getUTCDay()
      if (weekday !== 0 && weekday !== 6) tradingDates.push(cursor.toISOString().slice(0, 10))
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    let call = 0
    const fetchImpl = vi.fn(async () => {
      const rows = call++ === 0
        ? tradingDates.map(date => [date, '3.4', '3.5', '3.6', '3.3'])
        : [['2024-03-29', '3.3', '3.4', '3.5', '3.2']]
      return response({ data: { sh510300: { qfqday: rows } } })
    })

    const result = await getCandles('510300', '2020-01-01', { force: true }, fetchImpl)

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(result.candles[0].date).toBe('2024-03-29')
  })

  it('reports HTTP failures instead of returning cached empty data', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 503 }))

    await expect(getCandles('510300', '2026-09-29', { force: true }, fetchImpl)).rejects.toThrow('HTTP 503')
  })

  it('reports requests that abort at the timeout', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
    }))
    const pending = getCandles('510300', '2026-09-29', { force: true }, fetchImpl)
    const rejected = expect(pending).rejects.toThrow('超时')
    await vi.advanceTimersByTimeAsync(10_001)

    await rejected
    vi.useRealTimers()
  })

  it('merges a live quote into the matching daily candle and updates close/high/low', () => {
    const candles = [{ date: '2026-09-30', close: 3.5, high: 3.55, low: 3.45 }]

    expect(mergeQuote(candles, { code: '510300', name: 'ETF', price: 3.52, high: 3.6, low: 3.4, date: '2026-09-30' }))
      .toEqual([{ date: '2026-09-30', close: 3.52, high: 3.6, low: 3.4 }])
  })

  it('refreshes quote cache after 60 seconds and ignores invalid quote fields', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-30T04:00:00.000Z'))
    const responseForQuote = () => {
      const fields = Array(35).fill('0')
      fields[1] = 'ETF'
      fields[3] = '3.500'
      fields[30] = '20260930'
      fields[33] = '3.600'
      fields[34] = '3.400'
      const text = `v_sh510300="${fields.join('~')}"`
      return new Response(new TextEncoder().encode(text), { status: 200 })
    }
    const fetchImpl = vi.fn(async () => responseForQuote())

    await fetchQuotes(['510300'], fetchImpl)
    await fetchQuotes(['510300'], fetchImpl)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60_001)
    await fetchQuotes(['510300'], fetchImpl)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})


it('keeps real open/volume fields and reports unadjusted fallback honestly', async () => {
  localStorage.clear()
  const fetchImpl = vi.fn(async () => response({ data: { sh510300: { day: [['2026-09-29', '3.4', '3.5', '3.6', '3.3', '4200']] } } }))
  const result = await getCandles('510300', '2026-09-29', { force: true }, fetchImpl)
  expect(result.candles[0]).toMatchObject({ open: 3.4, volume: 4200 })
  expect(result.source).toContain('未复权')
  expect(mergeQuote(result.candles, { code: '510300', name: 'ETF', price: 3.52, high: 3.6, low: 3.3, date: '2026-09-29' })[0]).toMatchObject({ open: 3.4, volume: 4200 })
})

it('does not turn missing or invalid optional candle fields into zero', async () => {
  localStorage.clear()
  const fetchImpl = vi.fn(async () => response({ data: { sh510300: { qfqday: [['2026-09-29', '', '3.5', '3.6', '3.3', ''], ['2026-09-30', '8', '3.5', '3.6', '3.3', '-1']] } } }))
  const result = await getCandles('510300', '2026-09-29', { force: true }, fetchImpl)
  expect(result.candles.every(c => c.open === undefined && c.volume === undefined)).toBe(true)
})

it('rejects mixed adjusted/unadjusted history pages and preserves the prior valid cache', async () => {
  localStorage.clear()
  await getCandles('510300', '2020-01-01', { force: true }, vi.fn(async () => response({ data: { sh510300: { qfqday: [['2026-01-01', '3.4', '3.5', '3.6', '3.3', '10']] } } })))
  const key = 'businessweb.grid-trading.candles.v1:510300:qfq'
  const previous = localStorage.getItem(key)
  const dates = Array.from({ length: 640 }, (_, i) => new Date(Date.UTC(2024, 0, i + 2)).toISOString().slice(0, 10))
  let call = 0
  const mixed = vi.fn(async () => response({ data: { sh510300: call++ === 0
    ? { qfqday: dates.map(d => [d, '3.4', '3.5', '3.6', '3.3', '10']) }
    : { day: [['2024-01-01', '3.4', '3.5', '3.6', '3.3', '10']] } } }))
  await expect(getCandles('510300', '2020-01-01', { force: true }, mixed)).rejects.toThrow('复权口径不一致')
  expect(localStorage.getItem(key)).toBe(previous)
})


it('observation candles use session-only cache and never expand account localStorage', async () => {
  localStorage.clear()
  const write = vi.spyOn(Storage.prototype, 'setItem')
  const fetchImpl = vi.fn(async () => response({ data: { sh519999: { qfqday: [['2026-09-29', '3.4', '3.5', '3.6', '3.3', '10']] } } }))
  await getObservationCandles('519999', { force: true }, fetchImpl)
  await getObservationCandles('519999', {}, fetchImpl)
  expect(fetchImpl).toHaveBeenCalledTimes(1)
  expect(write).not.toHaveBeenCalled()
  expect(localStorage.getItem('businessweb.grid-trading.candles.v1:519999:qfq')).toBeNull()
  write.mockRestore()
})
