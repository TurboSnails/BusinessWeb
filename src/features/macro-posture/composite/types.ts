// 宏观攻守综合指标 v2 数据契约（manager 维护）。
// public/data/macro-posture.json 由 scripts/macro-posture.mjs 生成，前端只渲染不重算。
// 设计：docs/superpowers/specs/2026-11-23-macro-posture-composite-design.md

export type TierId = 'offense' | 'lean-offense' | 'neutral' | 'lean-defense' | 'defense'
export type PillarId = 'growth' | 'credit' | 'liquidity' | 'inflation'
export type ComponentScore = -2 | -1 | 0 | 1
export type Tone = 'positive' | 'neutral' | 'caution' | 'negative' | 'unknown'
/** [ISO 日期, 数值] */
export type SeriesPoint = [string, number]

export type TierDef = {
  id: TierId
  label: string            // 进攻 / 偏进攻 / 中性 / 偏防守 / 防守
  equityShare: number      // 0.3 – 1，占用户自设股票上限的比例
  range: string            // 「R ≥ 0.50」这类说明
  meaning: string          // 一句大白话
}

export type Threshold = { threshold: number; score: ComponentScore; text: string }

export type ComponentState = {
  id: string               // sahm / claims / payrolls / indpro / baaLevel / baaChange / nfciCredit / fedPath / curve / nfci / realRate / corePce
  pillar: PillarId
  label: string
  masters: string[]        // 对应大师中文名
  value: number | null     // 打分所用的派生值（如百分位、6 个月变化）
  unit: string             // '%' | '百分点' | '百分位' | '' …
  display: string          // 已格式化的大白话读数，如「0.00 个百分点（10 月）」
  observedOn: string | null   // 观测期
  availableOn: string | null  // 按发布滞后推算的可得日
  stale: boolean
  score: ComponentScore | null
  rule: string             // 阈值规则全文
  worse?: Threshold        // 下一个更差档的阈值
  better?: Threshold       // 下一个更好档的阈值
  source: string           // FRED 等来源链接
  history: SeriesPoint[]   // 该派生值最近 60 个月末
}

export type Pillar = {
  id: PillarId
  title: string            // 增长与就业 / 信用 / 货币与流动性 / 通胀
  weight: number
  score: number | null     // −2 … +1
  tone: Tone
  summary: string          // 一句大白话
  components: ComponentState[]
  history: [string, number | null][]   // 最近 60 个月末支柱分
}

export type Breaker = {
  id: 'recessionCredit' | 'creditStress' | 'sahmTrigger' | 'inflationSqueeze'
  label: string
  active: boolean
  effect: string           // 「最多偏防守」等
  rule: string
}

export type Move = { tier: TierId; scoreGap: number; text: string }

export type Current = {
  asOf: string             // 计算所用日期（最新可得数据日）
  regime: { score: number | null; tier: TierId | null }   // 熔断后、战术修正前
  tactical: {
    below: boolean | null  // 月均价是否低于 10 个月均线
    price: number | null
    sma10: number | null
    display: string
    /** 当月尚未结束时，用标普日线算的「月内至今」均价与预估 10 个月均线；仅提示，不改变档位 */
    mtd?: { month: string; days: number; average: number; sma10: number; below: boolean; display: string }
  }
  /** v2.1 修复确认：趋势回到均线上方且信用不再恶化时，把偏防守/防守上调一档 */
  repair: { active: boolean; rule: string; display: string }
  final: { tier: TierId | null; equityShare: number | null }
  driver: 'macro' | 'breaker' | 'tactical' | 'repair' | 'insufficient'
  headline: string         // 一句话结论
  reasons: string[]        // 2–4 条主要原因
  confidence: { level: 'high' | 'medium' | 'low'; agree: number; total: number; notes: string[] }
  breakers: Breaker[]
  distance: {
    up?: Move
    down?: Move
    nearest: { componentId: string; text: string }[]
    /** 战术修正离触发还有多远（结合 mtd），一句大白话 */
    tactical?: string
  }
  /** 外圈 B 级预警亮灯计数，便于结论卡直接展示 */
  warnings: { on: number; total: number; names: string[] }
  pillars: Pillar[]
}

export type UncertaintyKind = '历史太短' | '授权受限' | '修订偏差' | '择时力弱' | '与核心重复' | '尚未接入'

export type OuterItem = {
  id: string
  name: string
  grade: 'B' | 'C' | 'D'
  category: string
  status: 'warn' | 'clear' | 'info' | 'na'   // B 用 warn/clear/na；C 用 info/na；D 用 na
  /** C 级：相对历史的位置（偏高 / 偏低 / 居中），用于长期风险预算提示 */
  level?: 'high' | 'low' | 'neutral'
  value?: string           // 已格式化读数
  observedOn?: string
  signal?: string          // 现在说明了什么
  uncertainty: { kind: UncertaintyKind; text: string }
  promote: string          // 晋级条件
  masters: string[]
  source?: string
}

export type TierStats = {
  months: number
  share: number            // 0–1
  fwd3: number | null      // 均值，小数（0.012 = 1.2%）
  fwd6: number | null
  fwd12: number | null
  fwd12Median: number | null
  neg12: number | null     // 未来 12 个月为负的比例
  maxDd12: number | null   // 未来 12 个月平均最大回撤（负数）
}

export type Variant = {
  id: 'full' | 'v20' | 'macro' | 'trend' | 'static70' | 'buyhold'
  label: string
  cagr: number
  vol: number
  maxDd: number            // 负数
  sharpe: number
  calmar: number
  avgEquity: number
  switchesPerYear: number
}

export type Backtest = {
  start: string            // YYYY-MM
  end: string
  months: number
  disclosures: string[]
  tiers: Record<TierId, TierStats>
  variants: Variant[]
  /** firstDefensive：窗口（衰退前 12 个月至后 6 个月）内首个「持续 ≥2 个月偏防守及以下」段落的起始月；
   *  若该段落在窗口开始前已开始，firstDefensive 取窗口首月、leadMonths 记 12，并在 note 写明实际起点 */
  recessions: { start: string; end: string; firstDefensive: string | null; leadMonths: number | null; note?: string }[]
  falseAlarms: { start: string; end: string; months: number; spxFwd12: number | null; maxDd12: number | null }[]
  singles: { componentId: string; label: string; negMonths: number; spread12: number | null; negHit12: number | null }[]
  /** 每月一行：d=YYYY-MM，regime/final 档位，spx=月均价，rec=NBER 衰退 */
  timeline: { d: string; regime: TierId | null; final: TierId | null; spx: number; rec: 0 | 1 }[]
}

export type CompositeFile = {
  ruleVersion: string      // 'v2.0'
  generatedAt: string      // ISO 时间
  tiers: TierDef[]         // 由进攻到防守
  current: Current
  outer: OuterItem[]
  backtest: Backtest
  failedSources: string[]
}

export type CompositeState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: CompositeFile }
