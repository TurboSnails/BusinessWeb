export interface DailySource {
  id: 'indices' | 'limitUp' | 'brokenUp' | 'limitDown' | 'amountRank' | 'turnoverRank' | 'flows'
  label: string
  url: string
  date: string | null
  status: 'ready' | 'partial' | 'unavailable' | 'undated'
  note: string
  fetchedAt?: string
}

export interface BoardStock { code: string; name: string; boards: number }
export interface DailyIndex { symbol: string; code: string; name: string; date: string; price: number; change: number }
export interface RankedStock extends DailyIndex { amount: number | null; turnover: number | null }
export interface DailySnapshot {
  schemaVersion: 1
  sentiment?: MarketSentiment
  dataDate: string
  fetchedAt: string
  session: 'intraday' | 'closed' | 'previous'
  metrics: {
    ztCount: number | null; ztOpen: number | null; ztSealRate: number | null
    dtCount: number | null; dtOpen: number | null; dtSealRate: number | null
    volume: number | null; upCount: number | null; downCount: number | null
    lbCount: number | null; maxBoard: number | null; lbRate: number | null
  }
  indices: DailyIndex[]
  upStocks: BoardStock[]
  ladder: Array<{ boards: number; stocks: BoardStock[] }>
  rankings: { amount: RankedStock[]; turnover: RankedStock[] }
  flows: { inflow: Array<{ name: string; amount: number }>; outflow: Array<{ name: string; amount: number }> }
  sources: DailySource[]
}

export interface DailyArchive { schemaVersion: 1; snapshots: DailySnapshot[] }

export interface SentimentSource extends Omit<DailySource, 'id'> {
  id: string
  fetchedAt: string
}
export interface SentimentError { status: 'error'; reason: string }
export interface SentimentIncomplete { status: 'incomplete'; reason: string; expected: number; received: number | null }
export interface SentimentStock { code: string; name: string; pct: number }
export interface MarketBreadth {
  status: 'ready'
  total: number
  up: number
  down: number
  flat: number
  suspended: number
  medianPct: number | null
  buckets: {
    limitUp: number; above7: number; from5To7: number; from3To5: number; from0To3: number; flat: number
    from0ToMinus3: number; fromMinus3ToMinus5: number; fromMinus5ToMinus7: number; belowMinus7: number; limitDown: number
  }
}
export interface MarketSentiment {
  asOf: string
  // Separate provenance preserves compatibility with clients validating seven legacy sources.
  sources: SentimentSource[]
  breadth: MarketBreadth | SentimentError | SentimentIncomplete
  turnover: { status: 'ready'; amount: number; vsPreviousPct: number | null; vsFiveDayAveragePct: number | null } | SentimentError
  limitUp: {
    status: 'ready'; yesterdayCount: number; averagePct: number | null; redRate: number | null
    reLimitUpCount: number; brokenCount: number; sealRate: number | null
  } | SentimentError
  drawdown: { status: 'ready'; threshold: number; count: number; consecutiveCount: number | null; stocks: SentimentStock[] } | SentimentError
  weight: {
    status: 'ready'; indices: Array<Pick<DailyIndex, 'symbol' | 'code' | 'name' | 'change'>>; blueChips: SentimentStock[]
    averagePct: number | null; marketMedianPct: number | null; strength: 'strong' | 'weak' | 'equal' | null
  } | SentimentError
}
