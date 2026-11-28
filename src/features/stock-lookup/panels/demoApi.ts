import type {
  AnalystData,
  BarsPage,
  EarningsData,
  InsiderData,
  InsiderTransaction,
  OptionContract,
  OptionsData,
  ShortInterestData,
  NewsItem,
  NewsPage,
  OffExchangeData,
  Quote,
  StockLookupApi,
  SymbolHit,
  Timeframe,
} from '../types'
import { parseLookupSymbol } from './symbolParse'

/** 明显虚构：不得用真实机构 / 媒体名 */
const DEMO_FIRMS = ['示例证券 A', '示例证券 B', '示例证券 C', '示例证券 D', '示例证券 E', '示例证券 F'] as const
const DEMO_PUBLISHERS = ['示例媒体甲', '示例媒体乙', '示例媒体丙', '示例媒体丁', '示例通讯社'] as const
const DEMO_INSIDERS = [
  ['示例人物甲', 'Chief Executive Officer'],
  ['示例人物乙', 'Chief Financial Officer'],
  ['示例人物丙', 'Director'],
  ['示例人物丁', 'General Counsel'],
  ['示例人物戊', 'Officer and Director'],
] as const

function usOnlyDemo(symbol: string, label: string): string {
  const parsed = parseLookupSymbol(symbol)
  if (parsed && parsed.market !== 'us') throw { error: `暂不支持该市场：${label}目前只覆盖美股`, reason: 'unsupported' as const }
  return parsed?.symbol ?? symbol
}

const HITS: SymbolHit[] = [
  { symbol: 'MRVL', name: '示例科技（MRVL 演示）', market: 'us', exchange: 'NASDAQ', type: 'EQUITY' },
  { symbol: 'NVDA', name: '示例芯片（NVDA 演示）', market: 'us', exchange: 'NASDAQ', type: 'EQUITY' },
  { symbol: 'AAPL', name: '示例消费电子（AAPL 演示）', market: 'us', exchange: 'NASDAQ', type: 'EQUITY' },
  { symbol: 'sh600519', name: '示例白酒（茅台代码演示）', market: 'cn', exchange: 'SSE', type: 'EQUITY' },
  { symbol: 'sz000858', name: '示例白酒（五粮液代码演示）', market: 'cn', exchange: 'SZSE', type: 'EQUITY' },
  { symbol: 'hk00700', name: '示例互联（腾讯代码演示）', market: 'hk', exchange: 'HKEX', type: 'EQUITY' },
]

function quoteFor(symbol: string): Quote {
  const parsed = parseLookupSymbol(symbol)
  const sym = parsed?.symbol ?? symbol.toUpperCase()
  const market = parsed?.market ?? 'us'
  const hit = HITS.find(h => h.symbol.toUpperCase() === sym.toUpperCase())
  const base: Quote = {
    symbol: sym,
    name: hit?.name ?? `${sym}（演示）`,
    market,
    currency: market === 'us' ? 'USD' : market === 'hk' ? 'HKD' : 'CNY',
    price: market === 'us' ? 86.42 : market === 'hk' ? 412.6 : 1688.0,
    change: market === 'us' ? 1.28 : market === 'hk' ? -3.4 : 12.0,
    changePct: market === 'us' ? 1.5 : market === 'hk' ? -0.82 : 0.72,
    prevClose: market === 'us' ? 85.14 : market === 'hk' ? 416.0 : 1676.0,
    session: 'regular',
    time: '2026-11-27T16:00:00-05:00',
    timezone: market === 'us' ? 'America/New_York' : market === 'hk' ? 'Asia/Hong_Kong' : 'Asia/Shanghai',
  }
  if (market === 'us') {
    base.time = '2026-11-27T16:00:00-05:00'
    base.extended = { session: 'post', price: 86.55, change: 0.13, changePct: 0.15, time: '2026-11-27T18:30:00-05:00' }
  } else if (market === 'cn') {
    base.time = '2026-11-28T15:00:00+08:00'
  } else {
    base.time = '2026-11-28T16:08:00+08:00'
  }
  return base
}

function newsFor(symbol: string): NewsItem[] {
  const sym = parseLookupSymbol(symbol)?.symbol ?? symbol
  const base = Date.parse('2026-11-27T20:00:00Z')
  return [
    {
      id: `${sym}-1`,
      time: new Date(base).toISOString(),
      title: `【演示】${sym} 发布示例季报，收入超预期`,
      url: 'https://example.com/demo-n1',
      publisher: DEMO_PUBLISHERS[0],
      summary: '此为演示摘要，不是真实新闻。',
      topic: '业绩财报',
      sentiment: '利好',
      lang: 'zh',
    },
    {
      id: `${sym}-2`,
      time: new Date(base - 86400000).toISOString(),
      title: `【演示】示例证券上调 ${sym} 目标价`,
      url: 'https://example.com/demo-n2',
      publisher: DEMO_PUBLISHERS[1],
      summary: '演示用评级变化说明。',
      topic: '机构评级',
      sentiment: '利好',
      lang: 'zh',
    },
    {
      id: `${sym}-3`,
      time: new Date(base - 2 * 86400000).toISOString(),
      title: `【演示】${sym} 面临示例监管审查`,
      url: 'https://example.com/demo-n3',
      publisher: DEMO_PUBLISHERS[2],
      topic: '监管法律',
      sentiment: '利空',
      lang: 'zh',
    },
    {
      id: `${sym}-4`,
      time: new Date(base - 5 * 86400000).toISOString(),
      title: `【演示】市场情绪降温：同业含 ${sym}`,
      url: 'https://example.com/demo-n4',
      publisher: DEMO_PUBLISHERS[3],
      topic: '市场情绪',
      sentiment: '中性',
      lang: 'zh',
    },
    {
      id: `${sym}-5`,
      time: new Date(base - 40 * 86400000).toISOString(),
      title: `【演示】${sym} 公布示例股东回报计划`,
      url: 'https://example.com/demo-n5',
      publisher: DEMO_PUBLISHERS[4],
      topic: '资本回报',
      sentiment: '利好',
      lang: 'zh',
    },
  ]
}

function analystsFor(symbol: string): AnalystData {
  const sym = parseLookupSymbol(symbol)?.symbol ?? symbol
  const market = parseLookupSymbol(symbol)?.market ?? 'us'
  if (market !== 'us') {
    throw { error: '分析师评级目前仅支持美股', reason: 'unsupported' as const }
  }
  const actions = Array.from({ length: 45 }, (_, i) => {
    const day = 27 - (i % 20)
    return {
      date: `2026-11-${String(Math.max(1, day)).padStart(2, '0')}`,
      firm: DEMO_FIRMS[i % DEMO_FIRMS.length],
      action: (['up', 'down', 'main', 'init', 'reit'] as const)[i % 5],
      fromGrade: i % 5 === 0 ? undefined : ['Hold', 'Buy', 'Overweight'][i % 3],
      toGrade: ['Buy', 'Overweight', 'Hold', 'Sell'][i % 4],
      priorTarget: 80 + (i % 10),
      target: 85 + (i % 12),
    }
  })
  return {
    symbol: sym,
    actions,
    trend: [
      { period: '0m', strongBuy: 8, buy: 15, hold: 6, sell: 1, strongSell: 0 },
      { period: '-1m', strongBuy: 7, buy: 14, hold: 7, sell: 2, strongSell: 0 },
      { period: '-2m', strongBuy: 6, buy: 13, hold: 8, sell: 2, strongSell: 1 },
      { period: '-3m', strongBuy: 5, buy: 12, hold: 9, sell: 3, strongSell: 1 },
    ],
    target: { mean: 95.2, median: 94, high: 120, low: 70, count: 28, current: 86.42 },
    source: '演示数据（非真实）',
  }
}

function offExchangeFor(symbol: string): OffExchangeData {
  const sym = parseLookupSymbol(symbol)?.symbol ?? symbol
  const market = parseLookupSymbol(symbol)?.market ?? 'us'
  if (market !== 'us') {
    throw { error: '场外成交（FINRA）仅覆盖美股', reason: 'unsupported' as const }
  }
  const daily = Array.from({ length: 20 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 10, 27 - i))
    const total = 8_000_000 + i * 120_000
    const shortVolume = Math.round(total * (0.35 + (i % 5) * 0.03))
    return {
      date: d.toISOString().slice(0, 10),
      shortVolume,
      shortExemptVolume: Math.round(shortVolume * 0.02),
      totalVolume: total,
    }
  }).reverse()
  const ats = Array.from({ length: 6 }, (_, i) => ({
    weekStart: new Date(Date.UTC(2026, 9, 6 + i * 7)).toISOString().slice(0, 10),
    shares: 12_000_000 + i * 500_000,
    trades: 40_000 + i * 1200,
  }))
  return {
    symbol: sym,
    daily,
    ats,
    source: '演示数据（非真实 FINRA）',
    note: 'FINRA 公布的场外（含暗池）成交中的做空量，不是全市场成交、不是空头持仓；ATS 周度数据有 2–4 周延迟',
  }
}

function barsFor(symbol: string, tf: Timeframe): BarsPage {
  const sym = parseLookupSymbol(symbol)?.symbol ?? symbol
  const market = parseLookupSymbol(symbol)?.market ?? 'us'
  const now = Math.floor(Date.now() / 1000)
  const bars = Array.from({ length: 30 }, (_, i) => {
    const t = now - (29 - i) * 86400
    const c = 80 + i * 0.2
    return { t, o: c - 0.5, h: c + 1, l: c - 1, c, v: 1_000_000 + i * 1000 }
  })
  return {
    symbol: sym,
    tf,
    bars,
    hasMore: true,
    timezone: market === 'us' ? 'America/New_York' : market === 'hk' ? 'Asia/Hong_Kong' : 'Asia/Shanghai',
    adjustment: market === 'us' ? 'split' : 'qfq',
    source: market === 'us' ? 'yahoo' : 'tencent',
  }
}

function insiderFor(symbol: string): InsiderData {
  const sym = usOnlyDemo(symbol, '内部人交易')
  const types: InsiderTransaction['type'][] = ['sell', 'sell', 'award', 'buy', 'gift', 'exercise', 'sell', 'other']
  const transactions: InsiderTransaction[] = Array.from({ length: 24 }, (_, i) => {
    const [name, role] = DEMO_INSIDERS[i % DEMO_INSIDERS.length]
    const type = types[i % types.length]
    const shares = 5_000 + i * 1_700
    const price = 80 + (i % 7)
    const traded = type === 'buy' || type === 'sell'
    return {
      date: new Date(Date.UTC(2026, 10, 25) - i * 13 * 86_400_000).toISOString().slice(0, 10),
      name,
      role,
      type,
      shares,
      ...(traded ? { priceLow: price, priceHigh: price + (i % 2), value: shares * price } : {}),
      ownership: i % 3 === 0 ? 'indirect' as const : 'direct' as const,
    }
  })
  const since = new Date(Date.UTC(2026, 10, 28) - 182 * 86_400_000).toISOString().slice(0, 10)
  const recent = transactions.filter(t => t.date >= since)
  const sum = (type: InsiderTransaction['type'], key: 'shares' | 'value'): number =>
    recent.filter(t => t.type === type).reduce((s, t) => s + (t[key] ?? 0), 0)
  const buyShares = sum('buy', 'shares'), sellShares = sum('sell', 'shares')
  return {
    symbol: sym,
    transactions,
    holders: DEMO_INSIDERS.map(([name, role], i) => ({ name, role, latestDate: '2026-11-20', latestType: 'sell' as const, sharesDirect: 100_000 * (i + 1) })),
    summary: {
      months: 6,
      since,
      buyCount: recent.filter(t => t.type === 'buy').length,
      buyShares,
      buyValue: sum('buy', 'value'),
      sellCount: recent.filter(t => t.type === 'sell').length,
      sellShares,
      sellValue: sum('sell', 'value'),
      netShares: buyShares - sellShares,
    },
    reported: { netShares: buyShares - sellShares + 40_000, netCount: recent.length },
    source: '演示数据（非真实申报）',
  }
}

function shortFor(symbol: string): ShortInterestData {
  const sym = usOnlyDemo(symbol, '做空数据')
  return {
    symbol: sym,
    sharesShort: 18_400_000,
    sharesShortPrior: 16_900_000,
    settleDate: '2026-11-13',
    priorSettleDate: '2026-10-31',
    pctFloat: 0.062,
    pctOutstanding: 0.058,
    daysToCover: 2.4,
    floatShares: 296_000_000,
    source: '演示数据（非真实）',
  }
}

function earningsFor(symbol: string): EarningsData {
  const sym = usOnlyDemo(symbol, '财报预期')
  const est = (period: EarningsData['estimates'][number]['period'], endDate: string, eps: number, rev: number, n: number) => ({
    period,
    endDate,
    eps: { avg: eps, low: eps * 0.93, high: eps * 1.08, analysts: n },
    revenue: { avg: rev, low: rev * 0.96, high: rev * 1.05, analysts: n - 1 },
    epsTrend: { current: eps, d7: eps * 0.995, d30: eps * 0.98, d60: eps * 0.97, d90: eps * 1.01 },
    revisions: { up7: 1, up30: 4, down7: 0, down30: 1 },
  })
  return {
    symbol: sym,
    nextEarnings: { dates: ['2026-12-03'], estimated: false },
    estimates: [
      est('0q', '2026-12-31', 0.92, 2_150_000_000, 28),
      est('+1q', '2027-03-31', 0.98, 2_260_000_000, 26),
      est('0y', '2026-12-31', 3.41, 8_300_000_000, 32),
      est('+1y', '2027-12-31', 4.12, 9_700_000_000, 31),
    ],
    history: [
      { periodEnd: '2025-12-31', reported: '2026-02-05', fiscalQuarter: '4Q2025', epsEstimate: 0.71, epsActual: 0.74, surprisePct: 4.23, revenueActual: 1_820_000_000 },
      { periodEnd: '2026-03-31', reported: '2026-05-07', fiscalQuarter: '1Q2026', epsEstimate: 0.76, epsActual: 0.73, surprisePct: -3.95, revenueActual: 1_880_000_000 },
      { periodEnd: '2026-06-30', reported: '2026-08-06', fiscalQuarter: '2Q2026', epsEstimate: 0.8, epsActual: 0.86, surprisePct: 7.5, revenueActual: 1_990_000_000 },
      { periodEnd: '2026-09-30', reported: '2026-11-05', fiscalQuarter: '3Q2026', epsEstimate: 0.85, epsActual: 0.89, surprisePct: 4.71, revenueActual: 2_070_000_000 },
    ],
    currency: 'USD',
    source: '演示数据（非真实）',
  }
}

const DEMO_EXPIRATIONS = ['2026-12-04', '2026-12-11', '2026-12-18', '2027-01-15', '2027-03-19']

function optionsFor(symbol: string, expiration?: string): OptionsData {
  const sym = usOnlyDemo(symbol, '期权数据')
  const exp = expiration && DEMO_EXPIRATIONS.includes(expiration) ? expiration : DEMO_EXPIRATIONS[0]
  const shift = DEMO_EXPIRATIONS.indexOf(exp)
  const top: OptionContract[] = Array.from({ length: 10 }, (_, i) => {
    const call = i % 3 !== 2
    const strike = 80 + (i - 4) * 2.5 + shift * 5
    return {
      contract: `${sym}-DEMO-${exp}-${call ? 'C' : 'P'}-${strike}`,
      type: call ? 'call' as const : 'put' as const,
      strike,
      volume: 12_000 - i * 1_000,
      openInterest: i % 4 === 0 ? 3_000 + i * 100 : 20_000 - i * 900,
      lastPrice: Math.max(0.05, 4.2 - i * 0.35),
      iv: 0.42 + i * 0.01,
      lastTrade: i === 9 ? '2026-11-25T20:00:00Z' : '2026-11-27T18:00:00Z',
      inTheMoney: call ? strike < 86.42 : strike > 86.42,
    }
  })
  return {
    symbol: sym,
    expirations: DEMO_EXPIRATIONS,
    expiration: exp,
    calls: { count: 60, volume: 88_000, openInterest: 410_000 },
    puts: { count: 58, volume: 51_000, openInterest: 365_000 },
    top,
    underlyingPrice: 86.42,
    quoteTime: '2026-11-27T21:00:00Z',
    source: '演示数据（非真实期权链）',
    note: '演示用；真实数据约延迟 15 分钟，不是逐笔大单流，看不出主动买卖方向。',
  }
}

/** 仅开发 / 测试注入；勿在生产静态 import 此模块 */
export function createDemoApi(overrides?: Partial<StockLookupApi>): StockLookupApi {
  const base: StockLookupApi = {
    async search(q: string): Promise<SymbolHit[]> {
      const needle = q.trim().toLowerCase()
      if (!needle) return []
      return HITS.filter(h =>
        h.symbol.toLowerCase().includes(needle)
        || h.name.toLowerCase().includes(needle),
      )
    },
    async quote(symbol: string): Promise<Quote> {
      if (!parseLookupSymbol(symbol)) throw { error: '代码格式不正确', reason: 'bad-request' as const }
      return quoteFor(symbol)
    },
    async bars(symbol, tf): Promise<BarsPage> {
      return barsFor(symbol, tf)
    },
    async news(symbol): Promise<NewsPage> {
      const items = newsFor(symbol)
      return {
        symbol: parseLookupSymbol(symbol)?.symbol ?? symbol,
        items,
        start: items[items.length - 1]?.time ?? '',
        end: items[0]?.time ?? '',
        source: '演示数据（非真实）',
      }
    },
    async analysts(symbol): Promise<AnalystData> {
      return analystsFor(symbol)
    },
    async offExchange(symbol): Promise<OffExchangeData> {
      return offExchangeFor(symbol)
    },
    async insider(symbol): Promise<InsiderData> {
      return insiderFor(symbol)
    },
    async shortInterest(symbol): Promise<ShortInterestData> {
      return shortFor(symbol)
    },
    async earnings(symbol): Promise<EarningsData> {
      return earningsFor(symbol)
    },
    async options(symbol, expiration): Promise<OptionsData> {
      return optionsFor(symbol, expiration)
    },
  }
  return { ...base, ...overrides }
}
