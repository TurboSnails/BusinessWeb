import { z } from 'zod'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(d => Number.isFinite(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d)
const n = z.number().nullable()
const code = z.string().regex(/^\d{6}$/)
const point = z.object({ date, value: n })
const indexRow = z.object({ code, name: z.string().min(1), industry: z.string(), pct: n, lists: z.array(z.enum(['zt', 'zb', 'lhb', 'amount'])), date, lastSeen: date, rank: z.number().int().positive().optional() })
const indexSchema = z.object({ version: z.literal(1), asOf: date, generatedAt: z.string().datetime(), stocks: z.array(indexRow).max(600) })
const range = z.object({ low: z.number(), high: z.number(), concentration: n }).refine(r => r.low <= r.high)
const chips = z.object({ days: z.number().int().min(1).max(120), from: date, to: date, buckets: z.array(z.object({ price: z.number(), weight: z.number().min(0).max(1) })).length(50), average: z.number(), profit: z.number().min(0).max(100), range90: range, range70: range, seedWeight: z.number().min(0).max(1), clampedDays: z.number().int().min(0) })
const band = z.object({ status: z.enum(['ok', 'loss', 'missing']), current: n, date: date.nullable(), from: date.nullable(), samples: z.number().int().nonnegative(), points: z.array(point).max(1500), percentile: z.number().min(0).max(100).nullable(), levels: z.array(n).length(5) })
const interval = z.object({ days: z.number().int().positive(), from: date.nullable(), to: date.nullable(), change: n, drawdown: n, amplitude: n, avgTurnover: n, amount: n })
const detailSchema = z.object({ code, name: z.string().min(1), asOf: date, close: z.number().positive(), pct: n, industry: z.string(), concepts: z.array(z.string()).max(5), intervals: z.array(interval).length(5).refine(xs => xs.map(x => x.days).join(',') === '5,20,60,120,250'), months: z.array(point.extend({ partial: z.boolean() })).max(24), chips: chips.nullable(), valuation: z.object({ pe: band, pb: band }).nullable(), valuationReason: z.string().nullable() })
export type StockIndex = z.infer<typeof indexSchema>
export type StockRow = z.infer<typeof indexRow>
export type StockDetail = z.infer<typeof detailSchema>
export type Band = z.infer<typeof band>

export function asStockIndex(body: unknown): StockIndex | null {
  const result = indexSchema.safeParse(body)
  if (!result.success) return null
  const d = result.data
  return new Set(d.stocks.map(r => r.code)).size === d.stocks.length && d.stocks.every(r => r.date <= d.asOf && r.lastSeen <= d.asOf) ? d : null
}
export function asStockDetail(body: unknown, row: StockRow, asOf: string): StockDetail | null {
  const result = detailSchema.safeParse(body)
  if (!result.success) return null
  const d = result.data
  if (d.code !== row.code || d.asOf !== row.date || d.asOf > asOf) return null
  const dates = [...d.months.map(p => p.date), ...d.intervals.flatMap(p => [p.from, p.to]), d.chips?.to, d.chips?.from]
  if (dates.some(v => v && v > d.asOf) || (d.chips && Math.abs(d.chips.buckets.reduce((sum, b) => sum + b.weight, 0) - 1) > 0.001)) return null
  if (d.valuation && Object.values(d.valuation).some(b => (b.date && b.date > asOf) || b.points.some(p => !b.date || p.date > b.date))) return null
  return d
}

export const METHOD = {
  universe: '每日候选池 = 当日涨停池 ∪ 炸板池 ∪ 龙虎榜 ∪ 沪深京 A 股成交额前 100。保留前 10 个交易日出现过的股票；总量最多 600，当日优先，其余按最近出现日期保留。仅在收盘后全部必需来源齐备时发布；未入池的股票暂不可检索，保留股的名单标签不算作今日标签。',
  interval: 'N 日涨幅 =（最新前复权收盘 ÷ N 个交易记录前收盘 − 1）×100%。区间包含最后 N 个日 K 记录；上市不足 N+1 条则整行留空。最大回撤 = 区间内收盘较此前最高收盘的最大跌幅（含基期收盘，正数）；振幅 =（区间最高价 − 最低价）÷ 基期收盘；平均换手为 N 日算术平均，成交额为 N 日合计（元）。停牌无日 K 时不补零，N 按有日 K 的交易记录计。任一换手或成交额缺失时相应合计留空。',
  months: '月度收益 = 本月最后一条前复权收盘 ÷ 上一自然月最后一条收盘 − 1；显示最近 24 个月，当前月未结束时是截至标注日期的月内收益。缺上月基期留空，停牌月份不补零。',
  chips: 'CYQ 为模型估计，不是交易所持仓数据。取最近最多 120 条日 K，以首日三角分布初始化 100% 筹码；其后 Cₜ(p) = (1−τₜ)Cₜ₋₁(p) + τₜTₜ(p)，τ = min(换手率/100, 1)。T 是 [最低价, 最高价] 上的三角分布，峰值 ≈ 成交额/(成交量×100)（量单位为手），限定在当日前复权高低价内；前复权与原始成交均价不完全一致，限制天数另列。按约 50 个等距价格桶积分。一字日为点质量；缺换手等必需字段则不估算。',
  chipsStats: '获利比例 = 桶价严格低于收盘的权重合计；平均成本 = Σ桶价×权重。90% / 70% 区间分别取累计权重的 5%–95% / 15%–85% 分位；集中度 = (区间上限−下限)/(区间上限+下限)。桶化会有误差；首日初始化权重的剩余比例单列，比例高时有限窗口对结果影响较大。等于收盘的桶并入套牢侧。',
  valuation: '估值取东财公开历史报告 PE_TTM、PB_MRQ，最多回溯 5 年；报告日期独立标注，可能滞后于行情。五档为有效正值日频样本的最小、25%、中位、75%、最大（分位数线性插值）；当前分位 = (低于当前的样本数 + 同值样本数/2) ÷ 有效样本数。折线保留每月最后一条，分位与五档仍按全体日频计算。非正 PE 不绘制；最新 PE 为负时标「亏损，PE 不适用」，空值或零值只标缺失。参考线是历史估值倍数的分位水平，不是目标股价。',
  skipped: '仅包含个股基础资料、区间统计、月度收益、估计筹码与估值。所属概念仅复用已采集的公开板块成分（最多 5 个，按来源顺序，非相关性排名），无资料则略过。F10 全套财报、主营、股东与机构评级不在本页范围；盘中分时、L2 逐笔与平台专有信号需要实时或专有数据，未提供。',
} as const
