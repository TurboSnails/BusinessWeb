// 组合再平衡回测的共享类型（manager 维护；引擎、数据加载与页面都按此约定实现）
// 规格：docs/superpowers/specs/2026-11-21-portfolio-rebalance-lab-design.md
// 计划：docs/superpowers/plans/2026-11-22-portfolio-rebalance-lab.md

/** 单个代码的复权收盘价序列，dates 升序 YYYY-MM-DD，与 adjClose 等长 */
export type Series = { dates: string[]; adjClose: number[] }
export type PriceBook = Record<string, Series>

export type Rule =
  | { kind: 'buyHold' }
  /** 每只允许区间 = 目标 ×(1 ± pct)，如 0.40 */
  | { kind: 'relative'; pct: number }
  /** 每只允许区间 = 目标 ± points，如 0.10 表示 10 个百分点 */
  | { kind: 'absolute'; points: number }
  /** 期末最后一个交易日收盘决定，次日成交 */
  | { kind: 'calendar'; every: 'month' | 'quarter' | 'year' }

/** 大跌切换：以信号指数（默认 QQQ）相对本轮最高收盘的回撤为信号 */
export type SwitchRule = {
  /** 稳定资产代码，必须在组合内 */
  stable: string
  /** 进入阈值，如 0.20 表示回撤到 −20% */
  entry: number
  /** 档距，如 0.05 */
  gap: number
  /** 每步卖出比例（以进入当日稳定资产市值为基数），如 0.25 */
  step: number
  /** 恢复阈值（回撤回到 −recover 以内），或回到新高 */
  recover: number | 'newHigh'
  /** 累计卖出上限（以进入当日稳定资产市值为基数），如 0.5；省略表示不设上限 */
  cap?: number
  /** 超时恢复的月数；省略表示不启用 */
  timeoutMonths?: number
}

export type RunInput = {
  symbols: string[]
  /** 与 symbols 一一对应，合计必须为 1（容差 1e-9） */
  weights: number[]
  rule: Rule
  switch?: SwitchRule
  /** 起点；早于某只首个交易日时自动改为共同起点 */
  start?: string
  end?: string
  /** 成本率，如 0.001 */
  cost: number
  /** 初始金额（美元） */
  initial: number
  /** 大跌切换的信号指数代码，默认 'QQQ' */
  signal?: string
}

export type TradeReason = 'band' | 'calendar' | 'switchStep' | 'switchRecover' | 'switchTimeout'

export type Trade = {
  /** 成交日 */
  date: string
  reason: TradeReason
  /** 触发判断时越界（或被选中买入）的代码及当时权重 */
  trigger?: { symbol: string; weight: number }
  /** 各代码买卖金额（美元），正为买入，负为卖出 */
  amounts: Record<string, number>
}

/** enter / recover 为信号日（判断日），成交在下一交易日；未恢复时 recover 为 null */
export type Episode = { enter: string; steps: number; recover: string | null; exit: 'recover' | 'timeout' | null }

export type Distance = {
  symbol: string
  weight: number
  lower: number
  upper: number
  /** 其余不动时，该股还需上涨多少触发卖出（0.75 表示 +75%） */
  riseToUpper: number
  /** 其余不动时，该股还需下跌多少触发补仓（-0.43 表示 −43%） */
  fallToLower: number
}

export type RunResult = {
  start: string
  end: string
  startAdjusted: boolean
  dates: string[]
  /** 净值，起点为 1 */
  equity: number[]
  final: number
  finalAmount: number
  cagr: number
  vol: number
  maxDrawdown: { value: number; peak: string; trough: string }
  cer: number
  trades: Trade[]
  tradeCount: number
  annualTurnover: number
  totalCost: number
  finalWeights: Record<string, number>
  yearly: { year: number; ret: number }[]
  /** buyHold 与 calendar 规则为空数组 */
  distance: Distance[]
  episodes: Episode[]
}

export type CompareSet = {
  custom: { hold: RunResult; active: RunResult }
  equal: { hold: RunResult; active: RunResult }
  benchmarks: Record<'QQQ' | 'QQEW', RunResult | null>
  leaveOneOut: { dropped: string; hold: RunResult; active: RunResult }[]
}

/** public/data/portfolio-prices/index.json */
export type PriceIndex = {
  schemaVersion: 1
  generatedAt: string
  items: Array<{
    symbol: string
    name: string
    group: 'growth' | 'highVol' | 'stable' | 'benchmark'
    first: string
    last: string
    asOf: string
    status: 'ok' | 'stale'
    statusNote?: string
    dividendStatus: 'ok' | 'missing' | 'none'
  }>
}

/** public/data/portfolio-prices/<SYMBOL>.json */
export type PriceFile = {
  schemaVersion: 1
  symbol: string
  name: string
  currency: 'USD'
  asOf: string
  fetchedAt: string
  source: { prices: string; crossCheck: string }
  status: 'ok' | 'stale'
  dividendStatus: 'ok' | 'missing' | 'none'
  splits: Array<[string, number]>
  dates: string[]
  adjClose: number[]
}
