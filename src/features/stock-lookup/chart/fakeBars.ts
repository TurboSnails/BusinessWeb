import type { Bar, BarsPage, NewsItem, Timeframe } from '../types'

const TF_SEC: Record<Timeframe, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
  '1w': 604800,
  '1mo': 2592000,
}

/** 造一段可翻页的假 K 线；before 取更早一页 */
export function makeFakeBars(opts: {
  symbol?: string
  tf?: Timeframe
  count?: number
  before?: number
  endT?: number
  startPrice?: number
  hasMore?: boolean
  timezone?: string
}): BarsPage {
  const symbol = opts.symbol ?? 'MRVL'
  const tf = opts.tf ?? '1d'
  const count = opts.count ?? 120
  const step = TF_SEC[tf]
  const endT = opts.before != null ? opts.before - step : (opts.endT ?? Math.floor(Date.UTC(2026, 10, 26, 21, 0, 0) / 1000))
  const startPrice = opts.startPrice ?? 80
  const bars: Bar[] = []
  let price = startPrice
  // 从旧到新生成
  const startT = endT - (count - 1) * step
  for (let i = 0; i < count; i++) {
    const t = startT + i * step
    const drift = Math.sin(i / 7) * 1.2 + (i % 11 === 0 ? 2.5 : 0)
    const o = price
    const c = Math.max(1, o + drift + ((i % 3) - 1) * 0.4)
    const h = Math.max(o, c) + 0.6 + (i % 5) * 0.1
    const l = Math.min(o, c) - 0.5
    const v = 800_000 + (i % 20) * 120_000 + (i % 17 === 0 ? 3_000_000 : 0)
    bars.push({ t, o: round4(o), h: round4(h), l: round4(l), c: round4(c), v })
    price = c
  }
  // hasMore：再早还有；用 before 深度限制模拟分钟线耗尽
  const depth = opts.before != null ? Math.floor((1_700_000_000 - (opts.before ?? 0)) / step) : 0
  const hasMore = opts.hasMore ?? (tf === '1m' ? depth < 400 : true)
  return {
    symbol,
    tf,
    bars,
    hasMore,
    timezone: opts.timezone ?? 'America/New_York',
    adjustment: 'split',
    source: 'yahoo',
  }
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000
}

export function makeFakeNews(bars: readonly Bar[]): NewsItem[] {
  if (bars.length < 10) return []
  const picks = [bars.length - 8, bars.length - 20, bars.length - 35].filter(i => i >= 0)
  return picks.map((i, k) => ({
    id: `n${k + 1}`,
    time: new Date(bars[i].t * 1000).toISOString(),
    title: k === 0 ? '公司发布季度业绩预告' : k === 1 ? '多家机构上调目标价' : '行业政策动态速览',
    url: 'https://example.com/news/' + (k + 1),
    publisher: '示例来源',
    topic: k === 1 ? '机构评级' : '业绩财报',
    sentiment: k === 1 ? '利好' : '中性',
    lang: 'zh' as const,
  }))
}

/** 假 api.bars：按 before 翻页；1m 超过约 3 页后 hasMore=false 且可返回空 */
export function createFakeBarsApi(pages = 3) {
  const loaded = new Map<string, number>()
  return {
    async bars(symbol: string, tf: Timeframe, before?: number): Promise<BarsPage> {
      const key = `${symbol}:${tf}`
      const n = (loaded.get(key) ?? 0) + (before ? 1 : 0)
      if (!before) loaded.set(key, 0)
      else loaded.set(key, n)
      if (tf === '1m' && n >= pages) {
        return {
          symbol, tf, bars: [], hasMore: false,
          timezone: 'America/New_York', adjustment: 'split', source: 'yahoo',
        }
      }
      const page = makeFakeBars({
        symbol, tf, before, count: tf === '1m' ? 80 : 120,
        hasMore: n < pages - 1 || tf !== '1m',
      })
      if (tf === '1m' && n >= pages - 1) page.hasMore = false
      return page
    },
  }
}
