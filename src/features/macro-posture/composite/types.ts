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
  /** 风险预算：该档的组合结构倾向（2–4 条），不是个股建议 */
  actions?: string[]
}

export type Threshold = { threshold: number; score: ComponentScore; text: string }

export type ComponentState = {
  id: string               // sahm / claims / payrolls / indpro / hours（v2.2）/ baaLevel / baaChange / nfciCredit / fedPath / curve / nfci / realRate / corePce
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
  /** 读数离最近阈值很近（不到相邻阈值间距的 10%），对修订和四舍五入敏感 */
  nearThreshold?: boolean
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
  /** 对综合分的贡献 = 归一化权重 × 支柱分；四根贡献之和 = 综合分 */
  contribution: number | null
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
    mtd?: {
      month: string
      days: number             // 本月已过交易日
      remaining: number        // 本月剩余交易日（按美股交易日历）
      average: number          // 本月至今收盘均价
      prior9: number           // 前 9 个完整月的月均价平均值：本月均价低于它，10 个月均线条件即触发
      sma10: number            // 按本月至今均价估算的 10 个月均线
      threshold: number | null // 剩余交易日均价低于此值，月底即触发
      below: boolean
      lastClose: { date: string; value: number }
      source: string           // 日线来源说明，如「标普 500 日收盘（Yahoo Finance，FRED 校验）」
      display: string
    }
  }
  /** v2.1 修复确认：趋势回到均线上方且信用不再恶化时，把偏防守/防守上调一档 */
  repair: { active: boolean; rule: string; display: string }
  final: { tier: TierId | null; equityShare: number | null }
  driver: 'macro' | 'breaker' | 'tactical' | 'repair' | 'insufficient'
  headline: string         // 一句话结论
  reasons: string[]        // 2–4 条主要原因
  confidence: {
    level: 'high' | 'medium' | 'low'; agree: number; total: number; notes: string[]
    /** 支柱方向计数：分 > 0 / = 0 附近（|分| < 0.25）/ < 0 */
    counts: { positive: number; neutral: number; negative: number }
  }
  /** 各类数据各自的最新日期，如 宏观月度 2026 年 9 月、周度 11 月 14 日当周、标普收盘 11 月 20 日 */
  dates: { label: string; date: string }[]
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
  id: 'full' | 'realtime' | 'noNfci' | 'v21' | 'v20' | 'macro' | 'trend' | 'static70' | 'buyhold'
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
  /** 交易成本敏感度（完整模型）：单边成本 × 每月仓位变化 */
  costs: { turnoverPerYear: number; rows: { cost: number; cagr: number; drag: number }[] }
  /** 规则冻结后的前推记录：每次刷新若进入新月份就追加一行，之后补上实现收益 */
  live: { since: string; ruleVersion: string; rows: { d: string; final: TierId | null; equityShare: number | null; spxReturn: number | null; portfolioReturn: number | null }[] }
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

// ---- 候选指标检验（public/data/macro-posture-candidates.json，由 scripts/macro-posture-research.mjs 生成） ----
export type CandidateMetrics = { cagr: number; vol: number; maxDd: number; sharpe: number; avgEquity: number; recessionsCaught: number; falseAlarmMonths: number }
export type CandidateResult = {
  id: string
  /** 检验轮次：1 = 2026-11-23 首轮（基准 v2.1），2 = 第二轮（基准 v2.2，含最小改善门槛） */
  round?: 1 | 2
  name: string
  pillar: PillarId | 'cap'
  masters: string[]
  data: string              // 数据来源与可用起点，如「2 年期美债减联邦基金利率，1976 年起」
  rule: string              // 预注册的先验规则全文
  historyYears: number
  split: string             // 子样本切分，如「1976–1999 / 2000–2026」
  baseline: { full: CandidateMetrics; early: CandidateMetrics; late: CandidateMetrics }
  withCandidate: { full: CandidateMetrics; early: CandidateMetrics; late: CandidateMetrics }
  checks: { id: 'sharpeBoth' | 'drawdown' | 'cagr' | 'recessions' | 'history' | 'minImprovement'; label: string; pass: boolean; detail: string }[]
  verdict: 'adopt' | 'watch' | 'reject'
  reason: string            // 大白话结论
  /** 当前读数与「若计入」时的打分；只展示，不参与档位与置信度 */
  current?: { display: string; score: ComponentScore | null; observedOn: string | null }
}
export type CandidatesFile = {
  generatedAt: string
  baselineLabel: string     // 如「v2.1（实时数据口径）」
  preregistered: string     // 预注册日期与采用标准摘要
  criteria: string[]
  candidates: CandidateResult[]
  combined?: { ids: string[]; withCandidate: { full: CandidateMetrics; early: CandidateMetrics; late: CandidateMetrics }; pass: boolean; detail: string }
  /** 第二轮采用项合测（基准 v2.2）；combined 为第一轮 */
  combinedRound2?: { ids: string[]; withCandidate: { full: CandidateMetrics; early: CandidateMetrics; late: CandidateMetrics }; pass: boolean; detail: string }
}

