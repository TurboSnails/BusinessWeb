import type {
  AnalystData,
  BarsPage,
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
  }
  return { ...base, ...overrides }
}
