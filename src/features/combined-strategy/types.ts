// 综合策略页的数据契约：public/data/combined-strategy.json。
// 设计见 docs/superpowers/specs/2026-11-24-combined-strategy-design.md。
import type { TierId } from '../macro-posture/composite/types'

/** 宏观档位分组：进攻、偏进攻归进攻侧；偏防守、防守归防守侧。 */
export type MacroSide = 'offense' | 'neutral' | 'defense'
/** 雷达热度：估值与拥挤度两个维度分的均值，≤ −0.5 偏热，≥ +0.5 偏冷。 */
export type Heat = 'cold' | 'mid' | 'hot'

export type StrategyMetrics = {
  cagr: number
  maxDd: number
  sharpe: number
  avgEquity: number
  switchesPerYear: number
}

/** 某一格（或某一格在 2000 年以后）的历史统计；months 为 0 时其余为 null。 */
export type CellStats = {
  months: number
  fwd12: number | null       // 之后 12 个月标普总回报均值
  neg12: number | null       // 之后 12 个月为负的比例
  maxDd12: number | null     // 之后 12 个月内的平均最大回撤（负数）
}

export type MatrixCell = {
  macroSide: MacroSide
  heat: Heat
  all: CellStats             // 1973 年起
  since2000: CellStats       // 信号月在 2000-01 及以后
  /** 这一格的做法（不含数字），如「按档位持有，不因为贵提前减仓。…」 */
  action: string
  /** 由统计生成的一句话，如「这一格历史上有 122 个月，之后 12 个月标普平均 13.5%，…」 */
  evidence: string
  /** all.months < 30 */
  thin: boolean
}

export type FusionRow = {
  id: 'macro' | 'radar' | 'm1' | 'm2' | 'm3' | 'm4' | 'm5' | 'm6'
  label: string
  /** 规则的一句话说明；基线与雷达行也要有 */
  rule: string
  train: StrategyMetrics
  test: StrategyMetrics
  full: StrategyMetrics
  /** 训练期是否过线（基线与雷达行为 null） */
  passTrain: boolean | null
}

export type CombinedStrategyFile = {
  generatedAt: string
  ruleVersion: 'fusion-v1'
  current: {
    /** 宏观攻守当前最终档位与仓位比例（取自 macro-posture.json 的 current.final） */
    macroTier: TierId | null
    equityShare: number | null
    macroSide: MacroSide | null
    /** 雷达当前综合档位与热度（取自雷达当前读数） */
    radarTier: TierId | null
    heatScore: number | null
    heat: Heat | null
    /** 一句话结论，如「宏观偏进攻、市场偏热：股票仓位按自设上限的 85%，…」 */
    headline: string
    /** 当前所在格的做法与统计；任一侧缺失时为 null */
    cell: MatrixCell | null
    /** 数据日期说明，如 [{ label: '宏观攻守', date: '2026 年 11 月 23 日' }, …] */
    dates: { label: string; date: string }[]
  }
  /** 九格，顺序：进攻侧 → 中性 → 防守侧；每组内 偏冷 → 居中 → 偏热 */
  matrix: MatrixCell[]
  fusion: {
    start: string; end: string
    trainRange: string; testRange: string
    /** 顺序：macro（基线）、radar、m1 … m6 */
    rows: FusionRow[]
    /** 是否有候选被采用；目前为 null（都未采用） */
    adopted: FusionRow['id'] | null
    verdict: string
    disclosures: string[]
  }
  /** 月度：宏观档位（即仓位）、雷达档位、热度、标普月末收盘 */
  timeline: { d: string; macro: TierId | null; radar: TierId | null; heat: Heat | null; spx: number }[]
}
