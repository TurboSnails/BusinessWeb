/** 美股股债息差：100 / 标普500 Forward PE − 10 年期美债收益率，周度。
 * A 股那套「滚动均值 ±k 倍标准差」通道在美股上回测无效，这里改看全样本分位与长期收益，
 * 通道只作为对照放在页面上，计算复用 spread.ts。 */
import { average, baselineReturn, buildChannel, forwardReturn, touchEvents, type Band } from './spread'

/** [日期, 息差（百分点）, 标普500 收盘, Forward PE, 10 年期美债收益率] */
export type UsSpreadRow = [string, number, number, number, number]
export interface UsSpreadSnapshot {
  generatedAt: string
  source: string
  /** FRED 上 10 年期美债的最新观测，可能比 PE 序列新 */
  latestYield?: { date: string; value: number }
  /** 对照用通道：窗口（周）与标准差倍数 */
  window: number
  k: number
  rows: UsSpreadRow[]
}

/** 前瞻期（周）：约 3 个月、半年、1 年、3 年 */
export const US_HORIZONS = [13, 26, 52, 156] as const
export const horizonLabel = (h: number): string => (h >= 52 ? `${h / 52} 年` : `${Math.round(h / 4.33)} 个月`)

/** 全样本里不高于 v 的占比（%） */
export function percentileRank(values: number[], v: number): number {
  if (!values.length) return 0
  return (values.filter(x => x <= v).length / values.length) * 100
}

/** 已排序数组的分位数（线性插值） */
export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

/** 年化：h 周涨跌 pct（%）折成每年（%） */
export const annualize = (pct: number, h: number): number => ((1 + pct / 100) ** (52 / h) - 1) * 100

export interface Bucket {
  /** 第几组，0 = 息差最低（股票相对最贵） */
  index: number
  lo: number
  hi: number
  weeks: number
  /** 每个前瞻期：年化平均收益（%）、上涨占比（%）、样本数 */
  stats: { mean?: number; win?: number; n: number }[]
}

/** 按全样本息差分成 groups 组（默认五等分），统计每组之后的年化收益 */
export function spreadBuckets(rows: UsSpreadRow[], horizons: readonly number[] = US_HORIZONS, groups = 5): Bucket[] {
  const sorted = rows.map(r => r[1]).sort((a, b) => a - b)
  const edges = Array.from({ length: groups + 1 }, (_, g) => quantile(sorted, g / groups))
  const of = (v: number): number => Math.min(groups - 1, Math.max(0, edges.findIndex((e, g) => g > 0 && v <= e) - 1))
  return Array.from({ length: groups }, (_, g) => {
    const idx = rows.map((r, i) => (of(r[1]) === g ? i : -1)).filter(i => i >= 0)
    const stats = horizons.map(h => {
      const rets = idx.map(i => forwardReturn(rows, i, h)).filter((v): v is number => v !== undefined)
      if (!rets.length) return { n: 0 }
      return { mean: annualize(average(rets)!, h), win: (rets.filter(v => v > 0).length / rets.length) * 100, n: rets.length }
    })
    return { index: g, lo: edges[g], hi: edges[g + 1], weeks: idx.length, stats }
  })
}

/** 当前值落在第几组 */
export const bucketOf = (buckets: Bucket[], v: number): number => {
  const hit = buckets.findIndex(b => v <= b.hi)
  return hit < 0 ? buckets.length - 1 : hit
}

/** 皮尔逊相关系数 */
export function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (n < 3) return NaN
  const ma = average(a.slice(0, n))!, mb = average(b.slice(0, n))!
  let sab = 0, saa = 0, sbb = 0
  for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[i] - mb; sab += da * db; saa += da * da; sbb += db * db }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : NaN
}

/** 某一指标与 h 周后（年化）收益的散点及相关系数 */
export function forwardPairs(rows: UsSpreadRow[], h: number, pick: (r: UsSpreadRow) => number = r => r[1]): { points: [number, number, number][]; r: number } {
  const points: [number, number, number][] = []
  rows.forEach((row, i) => { const f = forwardReturn(rows, i, h); if (f !== undefined) points.push([pick(row), annualize(f, h), i]) })
  return { points, r: correlation(points.map(p => p[0]), points.map(p => p[1])) }
}

export interface ChannelCheck {
  bands: (Band | null)[]
  ups: number[]
  downs: number[]
  /** 每个前瞻期：上轨后平均、下轨后平均、平时平均（%，未年化），以及上轨/下轨后上涨次数 */
  rows: { h: number; up?: number; down?: number; base?: number; upWin: number; upN: number; downWin: number; downN: number }[]
}

/** 把 A 股的通道规则原样套到美股：窗口 window 周，±k 倍标准差，相隔不到 gap 周的触轨算一次 */
export function channelCheck(rows: UsSpreadRow[], window: number, k: number, gap = 4, horizons: readonly number[] = US_HORIZONS): ChannelCheck {
  const bands = buildChannel(rows, window, k)
  const ups = touchEvents(rows, bands, 'upper', gap)
  const downs = touchEvents(rows, bands, 'lower', gap)
  const from = Math.max(0, bands.findIndex(b => b !== null))
  const tally = (events: number[], h: number) => {
    const rets = events.map(i => forwardReturn(rows, i, h)).filter((v): v is number => v !== undefined)
    return { mean: average(rets), win: rets.filter(v => v > 0).length, n: rets.length }
  }
  return {
    bands, ups, downs,
    rows: horizons.map(h => {
      const u = tally(ups, h), d = tally(downs, h)
      return { h, up: u.mean, down: d.mean, base: baselineReturn(rows, from, h), upWin: u.win, upN: u.n, downWin: d.win, downN: d.n }
    }),
  }
}
