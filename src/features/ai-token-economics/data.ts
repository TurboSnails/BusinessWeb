// 数据整理自 2026-10-25 的一段 AI 对话（引用 Ramp AI Index、Reuters、Axios）。
// 页面作者没有独立打开原始来源；所有数字按"对话所述"保存，推导值在下面用函数复算。

import raw from './snapshots.json'

export type Verification = '已核对 Ramp' | '对话所述' | '可复算' | '假设'

export interface PricePoint { now: number; prev: number; change: number }
export interface ShareChange { now: number; prev: number }

/** Ramp AI Index 一期快照：weekEnding 当周对比 comparedWeekEnding 当周（见 server/ramp-ai-index.mjs） */
export interface Snapshot {
  weekEnding: string
  comparedWeekEnding: string
  tokenUsage: number
  tokenSpend: number
  /** combined 仅覆盖 OpenAI + Anthropic 两家，统计范围小于 tokenUsage / tokenSpend */
  price: { combined: PricePoint; openai: PricePoint; anthropic: PricePoint }
  spendShare: Record<string, ShareChange>
  volumeShare: Record<string, ShareChange>
  source: string
}

/** 已保存的历史快照（每月自动追加），升序 */
export const SAVED_SNAPSHOTS = (raw as { snapshots: Snapshot[] }).snapshots

/** 取更晚的一期；同一周时以 candidate（刚抓取的）为准 */
export function pickLatest(saved: Snapshot[], candidate?: Snapshot | null): Snapshot {
  const last = saved[saved.length - 1]
  return candidate && (!last || candidate.weekEnding >= last.weekEnding) ? candidate : last
}

/** 样本内所有模型：由总支出与总用量反推的平均单价变化 */
export function impliedPriceChange(spend: number, usage: number): number {
  return (1 + spend) / (1 + usage) - 1
}

/** 两个增速相乘得到的支出增速，用来演示"为什么 52.4% 和 −25.4% 算不出 23%" */
export function naiveSpendChange(usage: number, price: number): number {
  return (1 + usage) * (1 + price) - 1
}

export interface VendorPrice {
  name: string
  before: number
  after: number
  /** Ramp 披露的降幅；与 before/after 复算存在四舍五入差异 */
  reportedChange: number
  spendShare?: number
}

/** 每百万 Token 综合价格（美元），按实际模型组合加权，不是官方标价 */
export function vendorPrices(s: Snapshot): VendorPrice[] {
  const row = (name: string, p: PricePoint, share?: ShareChange): VendorPrice => ({ name, before: p.prev, after: p.now, reportedChange: p.change, spendShare: share?.now })
  return [
    row('OpenAI', s.price.openai, s.spendShare.openai),
    row('Anthropic', s.price.anthropic, s.spendShare.anthropic),
    row('两家合计', s.price.combined),
  ]
}

export const changeOf = (before: number, after: number): number => after / before - 1

/** 单位毛利：售价 − 成本，美元 / 百万 Token */
export interface UnitEconomics { price: number; cost: number }
export const grossPerUnit = (u: UnitEconomics): number => u.price - u.cost

/** 单位毛利下降后，要维持毛利总额所需的销量倍数 */
export function volumeMultipleToKeepGross(before: UnitEconomics, after: UnitEconomics): number {
  return grossPerUnit(before) / grossPerUnit(after)
}

export const UNIT_EXAMPLE = {
  before: { price: 10, cost: 5 },
  after: { price: 5, cost: 3 },
} as const

export interface SensitivityInput {
  revenue: number
  cost: number
  /** 以下均为相对变化，0.52 表示 +52% */
  tokenGrowth: number
  priceChange: number
  unitCostChange: number
}

export interface SensitivityResult {
  revenue: number
  cost: number
  gross: number
  revenueChange: number
  grossChange: number
}

export function sensitivity(i: SensitivityInput): SensitivityResult {
  const revenue = i.revenue * (1 + i.tokenGrowth) * (1 + i.priceChange)
  const cost = i.cost * (1 + i.tokenGrowth) * (1 + i.unitCostChange)
  const gross = revenue - cost
  const base = i.revenue - i.cost
  return { revenue, cost, gross, revenueChange: revenue / i.revenue - 1, grossChange: base === 0 ? NaN : gross / base - 1 }
}

export const SENSITIVITY_DEFAULT: SensitivityInput = {
  revenue: 100, cost: 50, tokenGrowth: 0.52, priceChange: -0.25, unitCostChange: -0.3,
}

/** 价格弹性：价格变化 p、需求变化 d 后的收入变化 */
export const revenueAfter = (priceChange: number, demandMultiple: number): number => (1 + priceChange) * demandMultiple - 1

/** 单位：十亿美元（2.98 即 29.8 亿） */
export const ANTHROPIC_FINANCIALS = {
  operatingLoss2024: 2.98,
  operatingLoss2025: 8.06,
  revenue2025: 4.6,
  computeAndInfra2025: 7.3,
  topTwoCustomersShare: 0.24,
} as const

export const lossGrowth = (): number => ANTHROPIC_FINANCIALS.operatingLoss2025 / ANTHROPIC_FINANCIALS.operatingLoss2024 - 1

export interface Claim {
  claim: string
  verdict: string
  basis: string
  status: Verification
}

export const CLAIMS: Claim[] = [
  { claim: '头部 1% 企业客户贡献约 80% 的相关支出', verdict: '有依据，但范围是 Ramp 企业样本', basis: 'Ramp 首席经济学家披露；不是两家公司经审计的全部收入结构', status: '对话所述' },
  { claim: 'Anthropic 两家客户合计约 24% 收入', verdict: '有依据', basis: '路透社对其 IPO 文件的报道：两名客户各约 12%（2025 年）', status: '对话所述' },
  { claim: 'Token 用量 +52.4%、支出 +23.0%', verdict: '同一范围（Ramp 样本内全部模型）', basis: 'Ramp AI Index Tokenomics 表：最新完整周对比上月同一周', status: '已核对 Ramp' },
  { claim: 'OpenAI + Anthropic 综合单价 −25.4%', verdict: '范围更窄，不能与上两项直接相乘', basis: '只覆盖两家供应商；含客户转向便宜模型的组合效应（Ramp 表中 Blended price 行）', status: '已核对 Ramp' },
  { claim: '同口径平均单价约 −19.3%', verdict: '复算得出', basis: '（1 + 支出变化）÷（1 + 用量变化）− 1', status: '可复算' },
  { claim: '模型公司利润正在恶化', verdict: '无法由这些数据证明', basis: 'Ramp 不含推理成本、毛利与资本开支', status: '假设' },
]

export interface Limitation { title: string; detail: string }
export const RAMP_LIMITS: Limitation[] = [
  { title: '样本选择偏差', detail: '使用 Ramp 的企业不是美国企业的随机样本；使用其 Token 管理产品的又是子集。' },
  { title: '样本构成会变', detail: '新接入的高消耗企业会抬高总用量，而老客户未必同样增长。公开页面未给出足以排除的信息。' },
  { title: '均价下降 ≠ 降价', detail: '客户从高价推理模型转向 Flash 类模型，即便官方标价不变，平均单价也会下降。' },
  { title: '部分金额是估算', detail: '预付费 API 额度可能按超额使用费率折算，而不是实际账单金额。' },
]

export interface WatchRow { metric: string; healthy: string; risk: string }
export const WATCHLIST: WatchRow[] = [
  { metric: '企业收入集中度', healthy: '头部占比逐渐下降', risk: '越来越依赖少数客户' },
  { metric: '客户结构', healthy: '金融、医疗、工业等传统行业增长', risk: '主要依赖 AI 初创公司' },
  { metric: 'Token 单位经济性', healthy: '单位推理毛利改善', risk: '降价快于成本下降' },
  { metric: '现金流', healthy: '经营现金流改善', risk: '收入高速增长但持续大量烧钱' },
]

export const PRICE_EVENTS: Array<[string, string]> = [
  ['OpenAI GPT-6 Sol / Luna', '相比 GPT-5.6 同档模型，API 价格下降约 50%'],
  ['Anthropic Claude Opus 5.5', '相比 Opus 5，Token 标价下降约 20%'],
  ['DeepSeek V4-Flash', '9 月调整价格，综合调用成本下降'],
  ['Ramp（Axios，10 月 22 日）', 'Token 价格持续下降，企业 Token 支出已连续两个月相对平稳'],
  ['OpenRouter 估算', '过去 30 天每日 Token 支出仍增长约 69%——渠道不同，趋势可以相反'],
]
