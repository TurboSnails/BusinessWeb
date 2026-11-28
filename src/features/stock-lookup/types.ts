// 个股查询的共享数据契约（manager 定稿，2026-11-28）。
// 后端：server/stockLookup.mjs 经 /api/grid-market?kind=lookup-*；前端取数：src/features/stock-lookup/api.ts。
// 改动这里需经 manager 同意：图表、面板、接口三个任务都依赖它。

export type LookupMarket = 'us' | 'hk' | 'cn'

/** 周期：分钟线到月线；4h 由 1h 聚合 */
export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w' | '1mo'
export const TIMEFRAMES: readonly Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1mo']

export interface SymbolHit {
  /** 本站统一代码：美股 MRVL；港股 hk00700；沪深 sh600519 / sz000858（与 company-chart/symbols.ts 一致） */
  symbol: string
  name: string
  market: LookupMarket
  exchange?: string
  /** EQUITY / ETF 等，原样转出 */
  type?: string
}

export type Session = 'pre' | 'regular' | 'post' | 'closed'

export interface Quote {
  symbol: string
  name: string
  market: LookupMarket
  currency: string
  price: number
  change: number
  changePct: number
  prevClose: number
  session: Session
  /** 行情时间，ISO 8601（带时区偏移） */
  time: string
  /** 交易所时区，如 America/New_York、Asia/Shanghai */
  timezone: string
  /** 盘前 / 盘后价（仅美股且有时） */
  extended?: { session: 'pre' | 'post'; price: number; change: number; changePct: number; time: string }
}

export interface Bar {
  /** 秒级 Unix 时间（日线及以上为当日 00:00 交易所时区对应的 UTC 秒） */
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
  /** 美股分钟线：是否盘前盘后 */
  ext?: boolean
}

export interface BarsPage {
  symbol: string
  tf: Timeframe
  bars: Bar[]
  /** 是否还能用 before=最早一根的 t 继续往前翻 */
  hasMore: boolean
  timezone: string
  /** 复权口径：美股 split（拆股调整、不含分红），沪深港 qfq（前复权） */
  adjustment: 'split' | 'qfq' | 'none'
  source: 'yahoo' | 'tencent'
}

export type NewsTopic =
  | '业绩财报' | '机构评级' | '内部交易' | '并购重组' | '资本回报' | '管理变动'
  | '产品进展' | '监管法律' | '市场情绪' | '宏观动态' | '未分类'
export const NEWS_TOPICS: readonly NewsTopic[] = ['业绩财报', '机构评级', '内部交易', '并购重组', '资本回报', '管理变动', '产品进展', '监管法律', '市场情绪', '宏观动态', '未分类']

/** 按关键词规则粗判，页面必须注明「按关键词粗判，可能有误」 */
export type NewsSentiment = '利好' | '中性' | '利空' | '未评级'

export interface NewsItem {
  id: string
  /** ISO 8601 */
  time: string
  title: string
  url: string
  publisher: string
  summary?: string
  topic: NewsTopic
  sentiment: NewsSentiment
  /** 原文语言，英文新闻不翻译 */
  lang: 'en' | 'zh'
}

export interface NewsPage {
  symbol: string
  items: NewsItem[]
  /** 本次查询覆盖的时间范围（ISO） */
  start: string
  end: string
  source: string
}

export type RatingAction = 'up' | 'down' | 'main' | 'init' | 'reit' | 'other'

export interface AnalystAction {
  /** ISO 日期 */
  date: string
  firm: string
  action: RatingAction
  fromGrade?: string
  toGrade?: string
  priorTarget?: number
  target?: number
}

export interface RecommendationMonth {
  /** 如 0m、-1m、-2m（Yahoo 口径：当月与之前各月） */
  period: string
  strongBuy: number
  buy: number
  hold: number
  sell: number
  strongSell: number
}

export interface AnalystData {
  symbol: string
  actions: AnalystAction[]
  trend: RecommendationMonth[]
  target?: { mean?: number; median?: number; high?: number; low?: number; count?: number; current?: number }
  source: string
}

/** FINRA Reg SHO 每日做空成交（场外与 TRF 报告的成交，不是全市场、不是持仓） */
export interface ShortVolumeDay {
  date: string
  shortVolume: number
  shortExemptVolume: number
  totalVolume: number
}

/** FINRA OTC Transparency：ATS（暗池）按周汇总，公布有 2–4 周延迟 */
export interface AtsWeek {
  weekStart: string
  shares: number
  trades: number
}

export interface OffExchangeData {
  symbol: string
  daily: ShortVolumeDay[]
  ats: AtsWeek[]
  source: string
  /** 读者说明：数据含义与延迟 */
  note: string
}

/** 统一的失败形状：页面按 reason 显示中文提示 */
export interface LookupError {
  error: string
  reason: 'unsupported' | 'not-found' | 'upstream' | 'bad-request'
}

export interface StockLookupApi {
  search(q: string, signal?: AbortSignal): Promise<SymbolHit[]>
  quote(symbol: string, signal?: AbortSignal): Promise<Quote>
  bars(symbol: string, tf: Timeframe, before?: number, signal?: AbortSignal): Promise<BarsPage>
  news(symbol: string, range?: { start?: string; end?: string }, signal?: AbortSignal): Promise<NewsPage>
  analysts(symbol: string, signal?: AbortSignal): Promise<AnalystData>
  offExchange(symbol: string, signal?: AbortSignal): Promise<OffExchangeData>
}
