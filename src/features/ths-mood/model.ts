// 「同花顺」页数据模型：读 public/data/ths-mood.json（scripts/ths-mood.mjs 每个交易日收盘后生成）。
// 功能参照同花顺 App V11.65.03 与市场情绪、涨停相关的模块；情绪指数、情绪状态、盘面评分、强弱指数的公式为本站自定（见 scripts/ths-mood-lib.mjs 与页面说明）。

export type EmotionParts = { breadth: number | null; limit: number | null; seal: number | null; premium: number | null; volume: number | null }

export type ThsDay = {
  date: string
  /** 由每日复盘归档补算（部分日期缺全市场涨跌），不是当天实时采集 */
  seeded?: boolean
  up: number | null
  down: number | null
  flat: number | null
  zt: number
  dt: number
  ztReal: number
  dtReal: number | null
  broken: number | null
  sealRate: number | null
  /** 昨日涨停股今日平均涨幅 */
  premium: number | null
  /** 昨日涨停股今日平均开盘涨幅 */
  openPremium: number | null
  /** 昨日最热涨停股今日平均开盘涨幅 */
  hotOpen: number | null
  /** 沪深成交额（亿元） */
  amount: number | null
  volRatio: number | null
  emotion: number | null
  parts: EmotionParts
  maxBoard: number
}

export type Trend = { date: string; close: number; pct: number | null; ma5: number; ma10: number; ma20: number; chg5: number | null; score: number; level: string; rsi: number | null; checks?: boolean[] }
export type EmotionInfo = { value: number | null; zone: string; parts: EmotionParts; state: '较高' | '正常' | '较低' | null; p33: number | null; p67: number | null; n: number }
export type VaneStock = { code: string; name: string; boards: number; openPct: number | null; pct: number | null; sector: string }
export type Vane = { stocks: VaneStock[]; avgOpen: number | null; avgClose: number | null; highOpen: number; lowOpen: number; verdict: string; allOpen: number | null; allClose: number | null; all: number }
export type FcbGroup = { n: number; fcbMin: number; fcbMax: number; avgPct: number | null; red: number | null }
export type Fcb = { median: number | null; top: Array<{ code: string; name: string; fcb: number; boards: number; fund: number }>; groups: { high: FcbGroup; mid: FcbGroup; low: FcbGroup } | null }
export type ZtRow = { code: string; name: string; price: number | null; pct: number | null; boards: number; days: number | null; times: number | null; firstSeal: string | null; opens: number; fund: number; fcb: number | null; sector: string; ten: number | null }
export type Sector = { sector: string; count: number; lead: { code: string; name: string; boards: number } }
export type Ten = { covered: number; window: number; multi: number; top: Array<{ code: string; name: string; count: number; todayZt: boolean }> }
export type Buckets = Record<'limitUp' | 'above7' | 'from5To7' | 'from3To5' | 'from0To3' | 'flat' | 'from0ToMinus3' | 'fromMinus3ToMinus5' | 'fromMinus5ToMinus7' | 'belowMinus7' | 'limitDown', number>

export type ThsLatest = ThsDay & {
  buckets: Buckets
  medianPct: number | null
  suspended: number
  amountPrev: number | null
  emotionInfo: EmotionInfo
  trend: Trend | null
  vane: Vane
  fcb: Fcb
  ztList: ZtRow[]
  sectors: Sector[]
  ten: Ten
  review: string
}

export type ThsMood = {
  version: 1
  generatedAt: string
  asOf: string
  note: string
  latest: ThsLatest
  history: ThsDay[]
  trendHistory: Trend[]
  amountHistory: Array<{ date: string; total: number }>
  sources: Array<{ id: string; label: string; url: string }>
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isDate = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)
const arr = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : [])

/** 结构校验：关键字段缺失时返回 null，页面显示「数据文件格式不对」，不渲染半截数据 */
export function asThsMood(body: unknown): ThsMood | null {
  if (!isObj(body) || body.version !== 1 || !isDate(body.asOf)) return null
  const l = body.latest
  if (!isObj(l) || !isDate(l.date) || typeof l.zt !== 'number' || !isObj(l.emotionInfo) || !isObj(l.vane) || !isObj(l.fcb) || !isObj(l.buckets) || !isObj(l.ten)) return null
  if (!Array.isArray(body.history) || !body.history.every(d => isObj(d) && isDate(d.date) && isObj(d.parts))) return null
  const vane = l.vane as unknown as Vane, fcb = l.fcb as unknown as Fcb, ten = l.ten as unknown as Ten
  return {
    ...(body as unknown as ThsMood),
    trendHistory: arr<Trend>(body.trendHistory),
    amountHistory: arr<ThsMood['amountHistory'][number]>(body.amountHistory),
    sources: arr<ThsMood['sources'][number]>(body.sources),
    latest: {
      ...(l as unknown as ThsLatest),
      trend: isObj(l.trend) ? (l.trend as unknown as Trend) : null,
      vane: { ...vane, stocks: arr<VaneStock>(vane.stocks) },
      fcb: { ...fcb, top: arr<Fcb['top'][number]>(fcb.top), groups: isObj(fcb.groups) ? fcb.groups : null },
      ten: { ...ten, top: arr<Ten['top'][number]>(ten.top) },
      ztList: arr<ZtRow>(l.ztList),
      sectors: arr<Sector>(l.sectors),
      review: typeof l.review === 'string' ? l.review : '',
    },
  }
}

/** 上一交易日记录（历史里早于 latest 的最后一条） */
export const previousDay = (m: ThsMood): ThsDay | null => [...m.history].reverse().find(d => d.date < m.latest.date) ?? null

/** 情绪指数区间的样式名：贪婪风险区偏热（红）、恐慌机会区偏冷（绿） */
export const zoneTone = (zone: string): 'hot' | 'cold' | 'mid' => (zone === '贪婪风险区' ? 'hot' : zone === '恐慌机会区' ? 'cold' : 'mid')

export const PART_LABELS: Array<{ key: keyof EmotionParts; label: string }> = [
  { key: 'breadth', label: '上涨家数占比' }, { key: 'limit', label: '涨停占涨跌停比' }, { key: 'seal', label: '封板率' },
  { key: 'premium', label: '昨日涨停溢价' }, { key: 'volume', label: '量能' },
]

/** 页面上写明的口径（与 scripts/ths-mood-lib.mjs 一致） */
export const METHOD = {
  emotion: '情绪指数（0–100）：五项各折算成 0–100 后取平均——上涨家数 ÷（上涨＋下跌）；涨停 ÷（涨停＋跌停）（不含 ST）；封板率 涨停 ÷（涨停＋炸板）；昨日涨停股今日平均涨幅（−4%→0，+4%→100）；沪深成交额 ÷ 前 20 个交易日均值（0.7→0，1.3→100）。必须有全市场涨跌且至少 3 项有数据才计算。≥ 70 为贪婪风险区，≤ 30 为恐慌机会区，其余为情绪中立区（区间名称沿用同花顺 App，只描述情绪所处位置）。',
  state: '情绪状态：参照同花顺「卖空状态」的三分位口径，把今日情绪指数与过去 90 个交易日（不含今天）比较——高于 66.66% 分位为较高，低于 33.33% 分位为较低，其余为正常；过去记录不足 20 天时不判断。',
  trend: '盘面评分（上证指数）：收盘 > MA5、收盘 > MA10、收盘 > MA20、MA5 > MA20、近 5 日涨幅 > 0，五项满足几项得几分；0–1 分趋势弱、2 分偏弱、3 分偏强、4–5 分强。强弱指数为上证指数 14 日 RSI（Wilder 平滑），70 以上偏强、30 以下偏弱。',
  vane: '短线市场风向标：同花顺用「昨日最热涨停股竞价表现」观察短线情绪。「最热」在同花顺里按自家人气热度排序，这里改为昨日连板数最高、同板数封板最早的 10 只；竞价表现取今日开盘价较昨收的涨幅（开盘价即 9:25 集合竞价成交价）。平均开盘 ≥ +2% 记为竞价高开，≤ −2% 记为竞价大幅低开。',
  fcb: '涨停封成比：同花顺口径为昨日涨停封单占成交量的比值，比值越大表示封单力度越大。这里用收盘封板资金 ÷ 当日成交额近似（封单按涨停价计）。分组表把昨日涨停股按昨日封成比三等分，看各组今天的平均涨幅与红盘率。',
  ten: '近 10 日涨停数：最近 10 个交易日里每只股票涨停的天数（按每日涨停池统计，含今天）。',
  zt: '涨停分析：今日全部涨停股，按连板数、首次封板时间排序。同花顺的「涨停原因」是编辑撰写的题材文字，没有公开来源，这里只列所属行业。',
  seeded: '2026-11-17 之前的历史由每日复盘归档补算：没有全市场涨跌的日期不计算情绪指数；昨日最热涨停股竞价表现从本页开始采集之日起累计。',
} as const

/** 同花顺里有、本页没做的模块与原因 */
export const SKIPPED: Array<{ name: string; reason: string }> = [
  { name: '竞价涨停潜力 / 竞价异动 / 大盘竞价走势', reason: '依赖 9:15–9:25 盘中竞价逐笔数据与同花顺 AI 竞价模型（机构买入量、人气热度等因子），没有公开的盘后来源。' },
  { name: '涨停原因（题材文字）、人气热度、股性、龙虎榜机构买入', reason: '同花顺编辑或自有数据，没有公开来源；涨停原因以所属行业代替。' },
  { name: '基金仓位、抄底指数、指数估值百分位', reason: '属同花顺基金频道「观市场」，基金仓位与抄底指数为机构测算值，没有统一的公开日频来源。' },
  { name: '卖空状态', reason: '同花顺只对港股、美股提供；A 股融券卖出已大幅收紧，数据不可比。本页借用它的「90 日三分位」口径判断情绪状态。' },
  { name: '大盘晴雨表、大盘资金净流入', reason: '基于同花顺自有的机构 / 主力资金口径，没有公开来源。' },
]
