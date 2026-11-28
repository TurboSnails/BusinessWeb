// 思路整理自 2026-10-25 的一段 AI 对话；2026-11-28 按最新数据刷新：
// Ramp 数字由脚本解析自 Ramp AI Index；API 价格核对了 OpenAI、Anthropic 官方价格页；
// Anthropic 财务来自其招股书（S-1，2026-10-26 公开递交），经雅虎财经等媒体报道交叉核对，SEC 原文未能直接下载。
// 仍标「对话所述」的条目没有找到原始来源。推导值在下面用函数复算。

import raw from './snapshots.json'

export type Verification = '已核对 Ramp' | '官方价格页' | '招股书（媒体报道）' | '页面查看' | '对话所述' | '可复算' | '假设'

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

/**
 * Anthropic 招股书财务，单位：十亿美元（4.6 即 46 亿）。
 * 来源：S-1 及修订稿（2026-10-26 起），经雅虎财经、LeverageShares、FinanceFeeds 等报道交叉核对；未直接读到 SEC 原文。
 * 2026 一季度营业亏损报道为「约 17 亿」，与二季度营业利润 9.74 亿合计即上半年营业亏损 6.93 亿。
 */
export const ANTHROPIC_FINANCIALS = {
  revenue2025: 4.6,
  operatingLoss2025: 8.06,
  computeAndInfra2025: 7.3,
  revenueH1_2025: 1.2,
  revenueQ1_2026: 4.7,
  revenueQ2_2026: 11.6,
  revenueH1_2026: 16.3,
  operatingIncomeQ2_2026: 0.974,
  operatingLossH1_2026: 0.693,
  computeAndInfraH1_2026: 8.9,
  netLossH1_2026: 80.7,
  /** 上半年净亏损中，可转债、衍生工具等公允价值变动的非现金部分 */
  nonCashFairValueH1_2026: 72.4,
  /** 「约五分之一收入来自两名客户」（雅虎财经报道的招股书表述） */
  topTwoCustomersShare: 0.2,
} as const

export const ANTHROPIC_IPO = { pricedAt: 83, listedOn: '2026-11-19', exchange: '纳斯达克', ticker: 'ANT', raised: 81.3 } as const

/** 2026 上半年收入同比倍数 */
export const revenueGrowthH1 = (): number => ANTHROPIC_FINANCIALS.revenueH1_2026 / ANTHROPIC_FINANCIALS.revenueH1_2025

export interface Claim {
  claim: string
  verdict: string
  basis: string
  status: Verification
}

const fmtPct = (v: number, digits = 1) => `${v >= 0 ? '+' : '−'}${(Math.abs(v) * 100).toFixed(digits)}%`

/** 结论核对表：Ramp 相关的数字随最新一期快照变化 */
export function buildClaims(s: Snapshot): Claim[] {
  const implied = impliedPriceChange(s.tokenSpend, s.tokenUsage)
  return [
    { claim: '头部 1% 企业客户贡献约 80% 的 OpenAI / Anthropic 相关支出', verdict: '有出处，但范围是 Ramp 企业样本', basis: '媒体转述的 Ramp 首席经济学家说法，Ramp 指数页面未直接写出；页面可核对的是：AI 支出最高的 1% 企业，每名员工每月 AI 支出中位数约 1.02 万美元', status: '对话所述' },
    { claim: 'Anthropic 约五分之一收入来自两名客户', verdict: '有依据', basis: '招股书披露，经雅虎财经报道；原对话说的「两家各约 12%、合计 24%」（2025 年）未找到原文，已替换', status: '招股书（媒体报道）' },
    { claim: `Token 用量 ${fmtPct(s.tokenUsage)}、支出 ${fmtPct(s.tokenSpend)}`, verdict: '同一范围（Ramp 样本内全部模型）', basis: `Ramp AI Index Tokenomics 表：${s.weekEnding} 当周对比 ${s.comparedWeekEnding} 当周`, status: '已核对 Ramp' },
    { claim: `OpenAI + Anthropic 综合单价 ${fmtPct(s.price.combined.change)}`, verdict: '范围更窄，不能与上两项直接相乘', basis: '只覆盖两家供应商；含客户转向便宜模型的组合效应（Ramp 表中 Blended price 行）', status: '已核对 Ramp' },
    { claim: `同口径平均单价约 ${fmtPct(implied)}`, verdict: '复算得出', basis: '（1 + 支出变化）÷（1 + 用量变化）− 1', status: '可复算' },
    { claim: '模型公司利润正在恶化', verdict: 'Ramp 数据证明不了；Anthropic 招股书显示相反', basis: 'Anthropic 2026 年二季度营业利润约 9.7 亿美元，上半年营业亏损收窄到约 6.9 亿；只有一个季度，OpenAI 未上市、没有可比数据', status: '招股书（媒体报道）' },
  ]
}

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

export interface PriceEvent { item: string; change: string; status: Verification }

/** 每百万 Token 输入 / 输出标价（美元），2026-11-28 查看官方价格页；同档新旧型号比较 */
export const PRICE_EVENTS: PriceEvent[] = [
  { item: 'Anthropic Claude Opus 5.5', change: '4 / 20 美元；Opus 5 为 5 / 25，标价低 20%', status: '官方价格页' },
  { item: 'Anthropic Claude Fable 5.2', change: '8 / 40 美元；Fable 5.1 为 10 / 50，低 20%；缓存读取 0.25 → 0.20 美元', status: '官方价格页' },
  { item: 'Anthropic Claude Haiku 5.5', change: '提示不超过 10 万 Token 时 0.10 / 0.50 美元；Haiku 4.5 为 1 / 5，低 90%', status: '官方价格页' },
  { item: 'Anthropic Claude Sonnet 5', change: '2 / 10 美元的推广价转为正式价，原定涨到 3 / 15 取消', status: '官方价格页' },
  { item: 'OpenAI GPT-6.2 Astra', change: '8 / 40 美元；GPT-6 Astra 为 10 / 50，低 20%；缓存输入 1.00 → 0.40 美元', status: '官方价格页' },
  { item: 'OpenAI GPT-6 Sol / Luna', change: 'Sol 2 / 10、Luna 0.10 / 0.50 美元；GPT-5.6 同档为 4 / 20、0.20 / 1.20，约低一半', status: '官方价格页' },
  { item: 'OpenAI 后台请求', change: '允许 2 小时内完成便宜 30%，允许 8 小时内完成便宜 40%', status: '官方价格页' },
  { item: 'OpenRouter 周榜', change: '用量第一的 DeepSeek V4.1 Flash 约 83 万亿 Token / 周，是第二名的两倍多，低价模型占走大部分调用量（榜单未注明日期）', status: '页面查看' },
]
