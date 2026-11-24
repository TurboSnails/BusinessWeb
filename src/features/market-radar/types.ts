// 「我的市场雷达」数据契约（manager 维护）。public/data/market-radar.json 由 scripts/market-radar.mjs 生成。
// 用户自建的指标体系，与大师方案（宏观攻守）完全独立：不进入宏观攻守的打分、置信度与前推记录。设计：docs/superpowers/specs/2026-11-23-market-radar-design.md
import type { TierId } from '../macro-posture/composite/types'

export type RadarDimensionId = 'liquidity' | 'valuation' | 'crowding' | 'trading' | 'earnings'
export type RadarHeat = 'hot' | 'warm' | 'neutral' | 'cool' | 'cold' | 'na'   // 偏热 → 偏冷（对股票的含义见 signal）

/** 图表叠加序列（如金银比上的金、银价格），日期与主序列 history 对齐 */
export type RadarOverlay = {
  id: string
  label: string
  unit: string
  history: [string, number][]
}

export type RadarIndicator = {
  id: string
  dimension: RadarDimensionId
  label: string
  display: string               // 当前读数大白话
  observedOn: string | null
  percentile: number | null     // 历史百分位（0–100），窗口见 percentileSince
  percentileSince: string | null
  heat: RadarHeat
  score: -1 | 0 | 1 | null      // 对股票的打分（−1 不利 / +1 有利）；null = 只展示
  rule: string                  // 打分规则全文；只展示的写原因
  historyYears: number | null
  inScore: boolean              // 是否计入雷达综合分（历史 ≥ 25 年且可按当时可得回测）
  source: string
  note?: string
  history: [string, number][]   // 默认最近 120 个观测；交易结构与金银比带全历史（长日频序列按周或按月抽样）
  overlays?: RadarOverlay[]     // 放大图里叠加显示的辅助序列（右侧对数坐标），迷你图只画主序列
}

export type RadarMetrics = { cagr: number; vol: number; maxDd: number; sharpe: number; avgEquity: number; switchesPerYear: number }

export type RadarFile = {
  generatedAt: string
  ruleVersion: string           // 'radar-v1'
  current: {
    score: number | null
    tier: TierId | null
    headline: string
    dimensions: { id: RadarDimensionId; title: string; score: number | null; summary: string }[]
  }
  indicators: RadarIndicator[]
  backtest: {
    start: string; end: string
    trainRange: string; testRange: string
    rows: { id: 'radar' | 'masters' | 'blend' | 'trend' | 'buyhold' | 'static70'; label: string; train: RadarMetrics; test: RadarMetrics; full: RadarMetrics }[]
    verdict?: string
    disclosures: string[]
    timeline: { d: string; radar: TierId | null; masters: TierId | null; spx: number }[]   // 月度
  }
  comparison: { mastersTier: TierId | null; radarTier: TierId | null; text: string }
}
