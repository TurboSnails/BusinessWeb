import { describe, expect, it, vi } from 'vitest'
// @ts-ignore 服务端纯函数由 JavaScript 实现
import { calculatePeriodReturns, handleUsDataCenter, mergeQuotePayloads, parseCboeDaily, parseNasdaqIpo, parseYahooDailyHistory, parseYahooMovers } from '../../../server/usDataCenter.mjs'

const quote = (symbol: string, values: Record<string, unknown> = {}) => ({
  symbol,
  shortName: `${symbol} 公司`,
  regularMarketPrice: 12,
  regularMarketChangePercent: 3.21,
  regularMarketVolume: 6_000_000,
  averageDailyVolume3Month: 2_000_000,
  marketCap: 800_000_000,
  regularMarketTime: 1_794_800_000,
  exchangeDataDelayedBy: 15,
  ...values,
})

describe('美股异动榜解析', () => {
  it('剔除低价、小市值与无效代码，并计算量比', () => {
    const payload = { finance: { result: [{ quotes: [
      quote('GOOD'),
      quote('SMALL', { marketCap: 299_999_999 }),
      quote('CHEAP', { regularMarketPrice: 1.99 }),
      quote('NO-AVG', { averageDailyVolume3Month: 0 }),
      quote('BAD/CODE'),
      quote('OTCY', { exchange: 'PNK', fullExchangeName: 'OTC Markets OTCID', regularMarketTime: 1_794_900_000 }),
    ] }] } }
    const result = parseYahooMovers(payload, 'gainers')
    expect(result.rows.map((row: { symbol: string }) => row.symbol)).toEqual(['GOOD', 'NO-AVG'])
    expect(result.rows[0].volumeRatio).toBe(3)
    expect(result.rows[1].volumeRatio).toBeNull()
    expect(result.delayedBy).toBe(15)
    expect(result.asOf).toBe(new Date(1_794_800_000 * 1000).toISOString())
    expect(parseYahooMovers(payload, 'surge').rows.map((row: { symbol: string }) => row.symbol)).toEqual(['GOOD'])
  })

  it('成交量激增按量比降序，跌幅榜按跌幅排序', () => {
    const payload = { finance: { result: [{ quotes: [
      quote('THREE', { regularMarketVolume: 6_000_000 }),
      quote('FIVE', { regularMarketVolume: 10_000_000 }),
      quote('TWO', { regularMarketVolume: 4_000_000 }),
    ] }] } }
    expect(parseYahooMovers(payload, 'surge').rows.map((row: { symbol: string }) => row.symbol)).toEqual(['FIVE', 'THREE'])
    const losers = { finance: { result: [{ quotes: [quote('DOWN', { regularMarketChangePercent: -8 }), quote('LESS', { regularMarketChangePercent: -2 })] }] } }
    expect(parseYahooMovers(losers, 'losers').rows.map((row: { symbol: string }) => row.symbol)).toEqual(['DOWN', 'LESS'])
  })
})

describe('成交量激增候选池合并', () => {
  it('多个筛选结果按代码去重，保留先出现的报价', () => {
    const merged = mergeQuotePayloads([
      { finance: { result: [{ quotes: [quote('AAA', { regularMarketVolume: 9_000_000 }), quote('BBB')] }] } },
      { finance: { result: [{ quotes: [quote('aaa', { regularMarketVolume: 1 }), quote('CCC', { regularMarketVolume: 8_000_000 })] }] } },
      null,
    ])
    expect(merged.finance.result[0].quotes.map((item: { symbol: string }) => item.symbol)).toEqual(['AAA', 'BBB', 'CCC'])
    expect(parseYahooMovers(merged, 'surge').rows.map((row: { symbol: string }) => row.symbol)).toEqual(['AAA', 'CCC', 'BBB'])
  })
})

describe('Nasdaq IPO 日历解析', () => {
  it('保留四种状态并转换日期、股数和金额', () => {
    const result = parseNasdaqIpo({ data: {
      upcoming: { upcomingTable: { rows: [{ companyName: '即将上市公司', proposedTickerSymbol: 'soon', expectedPriceDate: '12/02/2026', proposedSharePrice: '$10 - $12', sharesOffered: '1,000,000', dollarValueOfSharesOffered: '$12,000,000' }] }, lastUpdatedTime: 'LAST UPDATED: 11/27/2026*' },
      priced: { rows: [{ companyName: '已定价公司', proposedTickerSymbol: 'DONE', pricedDate: '11/25/2026', proposedSharePrice: '10.00' }] },
      filed: { rows: [{ companyName: '已递交公司', filedDate: '11/20/2026', dollarValueOfSharesOffered: '$5,000,000' }] },
      withdrawn: { rows: [{ companyName: '已撤回公司', withdrawDate: '11/18/2026', filedDate: '10/01/2026' }] },
    } }, '2026-11')
    expect(result.groups.upcoming[0]).toMatchObject({ symbol: 'SOON', date: '2026-12-02', shares: 1_000_000, amount: 12_000_000, price: '$10 - $12' })
    expect(result.groups.priced[0].date).toBe('2026-11-25')
    expect(result.groups.filed[0].amount).toBe(5_000_000)
    expect(result.groups.withdrawn[0]).toMatchObject({ date: '2026-11-18', filedDate: '2026-10-01' })
  })
})

describe('ETF 区间涨跌', () => {
  it('按交易日和日历区间取基准收盘价，年初至今用上年最后收盘', () => {
    const points = [
      { date: '2025-12-24', close: 100 },
      { date: '2025-12-31', close: 100 },
      { date: '2026-02-27', close: 110 },
      { date: '2026-03-20', close: 120 },
      { date: '2026-03-26', close: 125 },
      { date: '2026-03-27', close: 130 },
    ]
    expect(calculatePeriodReturns(points)).toEqual({ day: 4, week: 8.33, month: 18.18, quarter: 30, ytd: 30 })
  })

  it('Yahoo 日线忽略无效收盘，保留行情时间和延迟分钟', () => {
    const result = parseYahooDailyHistory({ chart: { result: [{
      meta: { regularMarketTime: 1_794_800_000, exchangeDataDelayedBy: 15, exchangeTimezoneName: 'America/New_York' },
      timestamp: [1_774_800_000, 1_774_886_400],
      indicators: { quote: [{ close: [100, null] }] },
    }] } })
    expect(result.points).toHaveLength(1)
    expect(result.time).toBe(1_794_800_000)
    expect(result.delayedBy).toBe(15)
  })
})

describe('Cboe 每日统计解析', () => {
  const html = JSON.stringify({
    selectedDate: '2026-11-25',
    ratios: [
      { name: 'TOTAL PUT/CALL RATIO', value: '0.98' },
      { name: 'EQUITY PUT/CALL RATIO', value: '0.64' },
      { name: 'INDEX PUT/CALL RATIO', value: '1.04' },
    ],
    'SUM OF ALL PRODUCTS': [{ name: 'VOLUME', call: 1000, put: 980 }],
    'EQUITY OPTIONS': [{ name: 'VOLUME', call: 500, put: 320 }],
    'INDEX OPTIONS': [{ name: 'VOLUME', call: 250, put: 260 }],
  })

  it('同时解析三类比值并核对成交量', () => {
    expect(parseCboeDaily(html)).toEqual({
      date: '2026-11-25',
      total: { ratio: 0.98, callVolume: 1000, putVolume: 980 },
      equity: { ratio: 0.64, callVolume: 500, putVolume: 320 },
      index: { ratio: 1.04, callVolume: 250, putVolume: 260 },
    })
  })

  it('比值与成交量不一致时拒绝该日数据', () => {
    expect(() => parseCboeDaily(html.replace('"value":"0.98"', '"value":"1.50"'))).toThrow(/invalid/)
    expect(parseCboeDaily('<html>没有数据</html>')).toBeNull()
  })
})

describe('接口参数', () => {
  it('拒绝未知类型和非法月份，不发起网络请求', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect((await handleUsDataCenter('usdc-other', {})).status).toBe(400)
    expect((await handleUsDataCenter('usdc-ipo', { month: '2026-13' })).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
