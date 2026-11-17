// 短线情绪页数据模型：读 public/data/market-mood.json（scripts/market-mood.mjs 每个交易日收盘后生成）。
// 功能对照开盘啦「市场情绪」页；综合强度、连板强度、活跃股的公式为本站自定（见 scripts/market-mood-lib.mjs 与页面说明）。

export type Amount = { total: number; sh: number; kcb: number; sz: number; cyb: number; bj: number }
export type Boards = { b1: number; b2: number; b3: number; b4: number; high: number; max: number }
export type Rates = { r12: number | null; r23: number | null; r34: number | null; rHigh: number | null; lb: number | null; lbPromotion: number | null }
export type Perf = { zt: number | null; lb: number | null; broken: number | null; ztRed: number | null }

export type MoodDay = {
  date: string
  /** 由每日复盘归档补算（缺全市场与昨日连板表现），不是当天实时采集 */
  seeded?: boolean
  amount: Amount | null
  up: number | null
  down: number | null
  flat: number | null
  zt: number
  dt: number
  ztReal: number
  dtReal: number | null
  broken: number | null
  sealRate: number | null
  brokenRate: number | null
  boards: Boards
  rates: Rates
  perf: Perf
  mood: number | null
  lbStrength: number | null
  composite: number | null
  retreat: number | null
}

export type Buckets = Record<'limitUp' | 'above7' | 'from5To7' | 'from3To5' | 'from0To3' | 'flat' | 'from0ToMinus3' | 'fromMinus3ToMinus5' | 'fromMinus5ToMinus7' | 'belowMinus7' | 'limitDown', number>
export type RetreatStock = { code: string; name: string; pct: number; retreat: number; sector: string }
export type Vane = { sector: string; count: number; stocks: Array<{ code: string; name: string; boards: number | null }> }
export type LadderRow = { boards: number; stocks: Array<{ code: string; name: string; sector: string }> }
export type Weight = { indices: Array<{ symbol: string; name: string; price: number; pct: number }>; stocks: Array<{ code: string; name: string; pct: number; amount: number }>; avg: number | null }

export type MoodLatest = MoodDay & {
  amount: Amount
  buckets: Buckets
  medianPct: number | null
  suspended: number
  retreatStocks: RetreatStock[]
  vane: Vane[]
  ladder: LadderRow[]
  weight: Weight | null
  moodStatus: string
  zone: string
  comment: string
}

export type MarketMood = {
  version: 1
  generatedAt: string
  asOf: string
  note: string
  latest: MoodLatest
  history: MoodDay[]
  amountHistory: Array<{ date: string; total: number }>
  margin: Array<{ date: string; balance: number; ratio: number | null; hs300: number | null }>
  sources: Array<{ id: string; label: string; url: string }>
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isDate = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)

/** 结构校验：关键字段缺失时返回 null，页面显示「数据文件格式不对」，不渲染半截数据 */
export function asMarketMood(body: unknown): MarketMood | null {
  if (!isObj(body) || body.version !== 1 || !isDate(body.asOf)) return null
  const l = body.latest
  if (!isObj(l) || !isDate(l.date) || typeof l.zt !== 'number' || !isObj(l.boards) || !isObj(l.rates) || !isObj(l.perf) || !isObj(l.buckets) || !isObj(l.amount)) return null
  if (!Array.isArray(body.history) || !body.history.every(d => isObj(d) && isDate(d.date) && isObj(d.boards) && isObj(d.rates) && isObj(d.perf))) return null
  return {
    ...(body as unknown as MarketMood),
    amountHistory: Array.isArray(body.amountHistory) ? (body.amountHistory as MarketMood['amountHistory']) : [],
    margin: Array.isArray(body.margin) ? (body.margin as MarketMood['margin']) : [],
    sources: Array.isArray(body.sources) ? (body.sources as MarketMood['sources']) : [],
    latest: {
      ...(l as unknown as MoodLatest),
      retreatStocks: Array.isArray(l.retreatStocks) ? (l.retreatStocks as RetreatStock[]) : [],
      vane: Array.isArray(l.vane) ? (l.vane as Vane[]) : [],
      ladder: Array.isArray(l.ladder) ? (l.ladder as LadderRow[]) : [],
      weight: isObj(l.weight) ? (l.weight as unknown as Weight) : null,
    },
  }
}

/** 最近 n 天（含今天）的历史，升序 */
export const lastDays = <T extends { date: string }>(xs: T[], n: number): T[] => xs.slice(-n)

/** 上一交易日记录（历史里早于 latest 的最后一条） */
export const previousDay = (m: MarketMood): MoodDay | null => [...m.history].reverse().find(d => d.date < m.latest.date) ?? null

export const MARKETS: Array<{ key: keyof Amount; label: string }> = [
  { key: 'total', label: '沪深京' }, { key: 'sh', label: '上证主板' }, { key: 'sz', label: '深证主板' },
  { key: 'cyb', label: '创业板' }, { key: 'kcb', label: '科创板' }, { key: 'bj', label: '北证' },
]

/** 页面上写明的口径（与 scripts/market-mood-lib.mjs 一致） */
export const METHOD = {
  mood: '活跃股：昨日涨停股与昨日炸板股今日的平均涨幅。≥ 2% 为活跃，≤ −1% 为冰点，其余为不活跃。',
  lb: '连板强度（0–100）：昨日连板股今日平均涨幅（−5%→0，+5%→100）、连板晋级率（昨日连板股今日仍涨停的比例，0→0，50%→100）、最高板（2 板→0，7 板→100）三项取平均。> 75 偏热，< 25 偏冷。',
  composite: '综合强度（0–100）：上涨家数占比、涨停占（涨停＋跌停）比（均不含 ST）、活跃股（−3%→0，+4%→100）、连板强度四项取平均。≥ 70 偏热，≤ 30 偏冷。',
  retreat: '大幅回撤：只统计昨日涨停/大涨（≥ 7%）和今天有过涨停/大涨的股票，较当日最高价回落 ≥ 7 个百分点（以昨收为基数）；不含上市首日等新股。',
  vane: '风向标：今日涨停家数最多的两个行业，列出其中连板最高、封板最早的个股。',
  seeded: '2026-11-17 之前的历史由每日复盘归档补算，缺全市场涨跌与「昨日连板今表现」，连板强度只用其余两项，综合强度部分日期缺失。',
} as const
