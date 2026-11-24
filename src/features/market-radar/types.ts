// 「市场雷达」数据契约（manager 维护）。public/data/market-radar.json 由 scripts/market-radar.mjs 生成。
// 用户自建的指标体系，与大师方案（宏观攻守）完全独立：不进入宏观攻守的打分、置信度与前推记录。
// 设计：docs/superpowers/specs/2026-11-23-market-radar-design.md；2026-11-24 升级见 openspec/changes/archive/2026-11-24-upgrade-market-radar/。
import type { TierId } from '../macro-posture/composite/types'

export type RadarDimensionId = 'liquidity' | 'valuation' | 'crowding' | 'trading' | 'earnings'

/**
 * 冷热：热 = 乐观、昂贵、拥挤或景气强；冷 = 悲观、便宜、冷清或景气弱。冷热不等于加分扣分。
 * na = 不给冷热：没有方向含义（如成交量）、读数过期或停更、历史不足 3 年。
 */
export type RadarHeat = 'hot' | 'warm' | 'neutral' | 'cool' | 'cold' | 'na'

export type RadarFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'irregular'

/**
 * fresh 在该指标的正常更新周期内；stale 超过滞后上限（仍显示读数，但不给冷热）；
 * discontinued 来源已停止公开更新；sparse 只有零星读数，画不出历史。
 */
export type RadarStatus = 'fresh' | 'stale' | 'discontinued' | 'sparse'

/** 数值越高代表越热、越冷，还是没有方向含义 */
export type RadarDirection = 'hot' | 'cold' | 'none'

/** 图表叠加序列（如金银比上的金、银价格），日期与主序列 history 对齐 */
export type RadarOverlay = {
  id: string
  label: string
  unit: string
  history: [string, number][]
}

/** 与更早一次观测相比的变化 */
export type RadarChange = {
  /** 比较区间，如「较 1 个月前」「较上一季」 */
  label: string
  /** 被比较的那次观测的日期 */
  since: string
  /** 当前 − 当时，单位同指标 unit（百分比类指标为百分点差） */
  delta: number
  /** 带符号与单位的短文本，如「+0.38 个百分点」 */
  text: string
  /** 这次变化让指标变热、变冷，还是没有方向含义或没有变化 */
  toward: 'hot' | 'cold' | 'flat'
}

/** 画在历史图上的参考线，value 与指标数值同口径 */
export type RadarThreshold = {
  value: number
  /** 如「扣分线 +0.20」「当前第 80 百分位」「长期平均」 */
  label: string
  /** minus 触及后扣分；plus 触及后加分；reference 只作参考、不影响打分 */
  kind: 'minus' | 'plus' | 'reference'
}

export type RadarIndicator = {
  id: string
  dimension: RadarDimensionId
  /** 维度内的小组，如「信用与金融条件」「宽度·成分股」；同组指标在页面上排在一起 */
  group: string
  /** 是否属于默认显示的核心指标（九项计分指标都是核心） */
  core: boolean
  label: string
  /** 当前读数的完整句子 */
  display: string
  /** 最新数值；读数暂缺时为 null */
  value: number | null
  /** 短读数，如「23.55 倍」「+0.57%」「376 个基点」；读数暂缺时为「—」 */
  valueText: string
  /** 数值单位：'%' | '倍' | '个基点' | '个百分点' | '点' | '亿美元' | ''（纯比值） */
  unit: string
  observedOn: string | null
  frequency: RadarFrequency
  status: RadarStatus
  /** 最新观测距数据生成日的天数 */
  ageDays: number | null
  direction: RadarDirection
  /** 原始历史百分位（0–100）：数值在自身历史里的位置，窗口见 percentileSince；样本见 percentileBasis */
  percentile: number | null
  percentileSince: string | null
  /** 百分位的样本口径，如「月度样本」「每周最后一个观测」「季度样本」 */
  percentileBasis: string | null
  /** 方向调整后的位置（0–100，越高越热）；direction 为 none 或没有百分位时为 null */
  heatRank: number | null
  heat: RadarHeat
  score: -1 | 0 | 1 | null      // 对股票的打分（−1 不利 / +1 有利）；null = 只展示
  rule: string                  // 打分规则全文；只展示的写原因
  historyYears: number | null
  inScore: boolean              // 是否计入雷达综合分
  source: string
  note?: string
  /** 最多两项：先短期后中期；没有可比的更早观测时为空数组 */
  changes: RadarChange[]
  thresholds: RadarThreshold[]
  /** 全部历史：月度及更稀的序列原样保留；日频、周频序列跨度不超过 30 年时按周取最后一个观测，更长按月取，并始终保留最新观测 */
  history: [string, number][]
  overlays?: RadarOverlay[]     // 放大图里叠加显示的辅助序列（右侧对数坐标）
}

export type RadarMetrics = { cagr: number; vol: number; maxDd: number; sharpe: number; avgEquity: number; switchesPerYear: number }

export type RadarStrategyId = 'radar' | 'trend' | 'buyhold' | 'static70'

/** 某一类月份之后 12 个月的标普表现（信号月之后第 2 至第 13 个月） */
export type RadarForwardStats = {
  months: number
  /** 之后 12 个月标普总回报的平均值；没有样本时为 null */
  fwd12: number | null
  /** 之后 12 个月为负的比例 */
  neg12: number | null
  /** 之后 12 个月内最大回撤的平均值 */
  maxDd12: number | null
}

export type RadarDimensionScore = {
  id: RadarDimensionId
  title: string
  score: number | null
  summary: string
  /** 这个维度里的计分指标及各自打分，按指标定义顺序 */
  drivers: { id: string; label: string; score: -1 | 0 | 1 | null }[]
}

export type RadarFile = {
  generatedAt: string
  ruleVersion: string           // 'radar-v1'
  current: {
    score: number | null
    tier: TierId | null
    /** 估值与拥挤度等权平均：≤ −0.5 偏热，≥ +0.5 偏冷；与综合策略同源。 */
    heatScore: number | null
    heat: 'hot' | 'mid' | 'cold' | null
    headline: string
    dimensions: RadarDimensionScore[]
    /** 各冷热、各状态的指标个数 */
    counts: {
      total: number
      scored: number
      core: number
      heat: Record<RadarHeat, number>
      status: Record<RadarStatus, number>
    }
    /** 由数据生成的口径提示，如两项家庭配置合并算一票时的热度；没有可提示的为空数组 */
    caveats: string[]
  }
  indicators: RadarIndicator[]
  backtest: {
    start: string; end: string
    trainRange: string; testRange: string
    rows: { id: RadarStrategyId; label: string; train: RadarMetrics; test: RadarMetrics; full: RadarMetrics }[]
    verdict?: string
    disclosures: string[]
    /** 月度：雷达档位、标普月末收盘、综合分与五个维度分（顺序同 current.dimensions） */
    timeline: { d: string; radar: TierId | null; spx: number; score: number | null; dims: (number | null)[] }[]
    /** 月度净值，回测首月之前 = 1；顺序同 rows */
    curves: { d: string; radar: number; trend: number; buyhold: number; static70: number }[]
    /** 同一套信号改用月末收盘价计算收益的结果（稳健性对照） */
    monthEndRows: { id: RadarStrategyId; label: string; full: RadarMetrics; test: RadarMetrics }[]
    /** 雷达全样本夏普与对照策略之差的抽样区间（按 12 个月分块自助抽样，固定随机种子） */
    sharpeGaps: { versus: RadarStrategyId; label: string; diff: number; low: number; high: number }[]
    /** 按雷达档位分组：全样本与 2000 年以来 */
    tierStats: { tier: TierId; all: RadarForwardStats; since2000: RadarForwardStats }[]
    /** 按冷热（估值与拥挤度）分组 */
    heatStats: { heat: 'hot' | 'mid' | 'cold'; all: RadarForwardStats; since2000: RadarForwardStats }[]
  }
}
