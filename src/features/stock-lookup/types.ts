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

// ─── 美股专项：内部人交易 / 做空 / 财报预期 / 期权（2026-11-28 新增，均来自 Yahoo Finance） ───

/** 公开市场买入 / 卖出 / 行权 / 授予 / 赠与 / 来源未注明 */
export type InsiderTxType = 'buy' | 'sell' | 'exercise' | 'award' | 'gift' | 'other'

export interface InsiderTransaction {
  /** 交易日 YYYY-MM-DD */
  date: string
  name: string
  /** 原文职务，如 Director、Chief Executive Officer；页面负责翻译 */
  role: string
  type: InsiderTxType
  shares: number
  /** 成交金额（美元），授予 / 赠与通常没有 */
  value?: number
  priceLow?: number
  priceHigh?: number
  ownership?: 'direct' | 'indirect' | 'both'
}

export interface InsiderHolder {
  name: string
  role: string
  latestDate?: string
  latestType?: InsiderTxType
  sharesDirect?: number
  sharesIndirect?: number
}

/** 服务端按逐笔记录自算：只数公开市场买入与卖出 */
export interface InsiderSummary {
  months: number
  /** 统计起点 YYYY-MM-DD */
  since: string
  buyCount: number
  buyShares: number
  buyValue: number
  sellCount: number
  sellShares: number
  sellValue: number
  netShares: number
}

export interface InsiderData {
  symbol: string
  /** 近 12 个月逐笔，按日期倒序 */
  transactions: InsiderTransaction[]
  holders: InsiderHolder[]
  summary: InsiderSummary
  /** Yahoo 自带的近 6 个月汇总（把授予、行权也算作买入） */
  reported?: { buyCount?: number; buyShares?: number; sellCount?: number; sellShares?: number; netCount?: number; netShares?: number; totalInsiderShares?: number }
  source: string
}

/** 交易所每月两次公布的未平仓空头（与 FINRA 每日卖空成交量不是一回事） */
export interface ShortInterestData {
  symbol: string
  sharesShort?: number
  sharesShortPrior?: number
  settleDate?: string
  priorSettleDate?: string
  /** 占流通股比例，0–1 */
  pctFloat?: number
  /** 占总股本比例，0–1 */
  pctOutstanding?: number
  /** 回补天数（空头股数 ÷ 日均成交量） */
  daysToCover?: number
  floatShares?: number
  source: string
}

export type EstimatePeriod = '0q' | '+1q' | '0y' | '+1y'

export interface EstimateRange {
  avg?: number
  low?: number
  high?: number
  analysts?: number
}

export interface EarningsEstimate {
  period: EstimatePeriod
  /** 该期截止日 YYYY-MM-DD */
  endDate?: string
  eps: EstimateRange
  revenue: EstimateRange
  yearAgoEps?: number
  yearAgoRevenue?: number
  /** 每股收益一致预期：现在与 7 / 30 / 60 / 90 天前 */
  epsTrend: { current?: number; d7?: number; d30?: number; d60?: number; d90?: number }
  /** 近 7 / 30 天上调、下调预期的分析师人数 */
  revisions: { up7?: number; up30?: number; down7?: number; down30?: number }
}

export interface EarningsQuarter {
  /** 季末 YYYY-MM-DD */
  periodEnd: string
  /** 公布日 */
  reported?: string
  /** 财季，如 3Q2027 */
  fiscalQuarter?: string
  epsActual?: number
  epsEstimate?: number
  /** 惊喜幅度 %，(实际 − 预期) ÷ |预期| × 100 */
  surprisePct?: number
  revenueActual?: number
}

export interface EarningsData {
  symbol: string
  /** 财报日（美东）；可能是已过去的最近一次，页面自行判断 */
  nextEarnings?: { dates: string[]; estimated: boolean }
  estimates: EarningsEstimate[]
  /** 最近 4 个季度，按时间正序 */
  history: EarningsQuarter[]
  currency?: string
  source: string
}

export interface OptionContract {
  contract: string
  type: 'call' | 'put'
  strike: number
  volume: number
  openInterest: number
  lastPrice?: number
  /** 隐含波动率，0–1+ */
  iv?: number
  /** 最近一次成交时间 ISO */
  lastTrade?: string
  inTheMoney?: boolean
}

export interface OptionSideTotal {
  count: number
  volume: number
  openInterest: number
}

export interface OptionsData {
  symbol: string
  /** 全部到期日 YYYY-MM-DD，升序 */
  expirations: string[]
  /** 本次返回的到期日 */
  expiration?: string
  calls: OptionSideTotal
  puts: OptionSideTotal
  /** 该到期日按成交量前 10 的合约 */
  top: OptionContract[]
  underlyingPrice?: number
  quoteTime?: string
  source: string
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
  insider(symbol: string, signal?: AbortSignal): Promise<InsiderData>
  shortInterest(symbol: string, signal?: AbortSignal): Promise<ShortInterestData>
  earnings(symbol: string, signal?: AbortSignal): Promise<EarningsData>
  /** expiration：YYYY-MM-DD，省略则取最近到期日 */
  options(symbol: string, expiration?: string, signal?: AbortSignal): Promise<OptionsData>
}
