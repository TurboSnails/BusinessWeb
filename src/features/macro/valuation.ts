import { percentileOf } from './indicators'
import { hasHistory, monthlySeries, validDate } from '../index-catalog/catalog'
import type { Tone } from './stages'

export interface Member { code: string; name: string; /** 市值，十亿美元 */ mcap: number; fwd: number | null; ttm: number | null; /** GICS 一级行业（仅美股指数） */ sector?: string }
export interface IndexAgg { date: string; fwd: number; fwdCovered: number; fwdCount: number; ttm: number | null; medianFwd: number | null; total: number; got: number }

export interface IndexData {
  symbol: string
  name: string
  group: string
  note: string
  priceSource?: string
  /** 外部查看入口（站内没有的数据，比如彭博的 PE 历史） */
  links?: { label: string; url: string }[]
  latest: { date: string; value: number }
  /** 月收盘，升序 */
  monthly: [string, number][]
  /** 手动录入的 Forward PE，每月一个点，升序 */
  fpe: [string, number][]
  /** 有成分股名单的指数：成分股 PE 与汇总 */
  members?: Member[]
  /** 外部参考的 Forward PE 序列（口径与 fpe 不同，不能拼接） */
  /** 近 5 年日收盘（仅有外部参考序列的指数才有），用于估算每日 Forward PE */
  daily?: [string, number][]
  ref?: { source: string; points: [string, number][]; /** true：参考的是口径不同的近似指数，不做估算 */ proxy?: boolean; /** 手动导入，更新时不被覆盖 */ manual?: boolean; /** 'trailing'：滚动 PE，缺省为 Forward PE */ kind?: 'trailing' }
  agg?: IndexAgg
}
/** 估值热力图的非指数图（全球在美上市外国公司、ETF）：sector 存分组名（国家 / 资产类别），ETF 的 mcap 为基金规模 */
export interface HeatMapData { date: string; source: string; total: number; /** 市值币种，缺省美元 */ currency?: 'HKD'; members: Member[] }
export interface IndexSnapshot { generatedAt: string; checkedAt?: string; source: string; indexes: Record<string, IndexData>; maps?: { hsi?: HeatMapData; adr?: HeatMapData; etf?: HeatMapData } }

export interface IndexStats {
  /** 距历史最高月收盘的回撤（%，≤0） */
  drawdown: number | undefined
  /** 近 12 个月涨幅（%） */
  ret1y: number | undefined
  /** 当前价在近 10 年月收盘中的分位 */
  pricePct: number | undefined
  peak: { date: string; value: number } | undefined
  fpe: { value: number; date: string; pct: number | undefined; min: number; max: number; median: number; count: number; kind: 'forward' | 'trailing' } | undefined
}

/** est：估算的长序列（外部参考太稀时用）。PE 位置优先用外部长序列，其次估算序列，最后才是本站自己记录的点 */
export function statsOf(ix: IndexData, est?: [string, number][]): IndexStats {
  const cur = ix.latest.value
  const history = [...monthlySeries(ix.monthly).values()].filter(p => !validDate(ix.latest.date) || p[0] <= ix.latest.date)
  const peak = history.length ? history.reduce((m, p) => (p[1] > m[1] ? p : m)) : undefined
  const latestMonth = ix.latest.date.slice(0, 7)
  const [year, month] = latestMonth.split('-').map(Number)
  const ago = history.find(p => p[0].slice(0, 7) === `${year - 1}-${String(month).padStart(2, '0')}`)
  // 只统计最新观测之前十个完整日历年的月线；未完成当月不凑第120个样本。
  const ten = history.filter(p => p[0].slice(0, 7) >= `${year - 10}-${String(month).padStart(2, '0')}` && p[0].slice(0, 7) < latestMonth)
  // 统计只认真实观测；估算序列仍可画图，不以插值点数认证长期覆盖。
  void est
  const f = [...monthlySeries(ix.ref?.points.length ? ix.ref.points : ix.fpe).values()].filter(p => p[0] <= new Date().toISOString().slice(0, 10))
  const fv = f.map(p => p[1]).sort((a, b) => a - b)
  const last = f[f.length - 1]
  return {
    drawdown: peak ? (Math.min(cur, peak[1]) / peak[1] - 1) * 100 : undefined,
    ret1y: ago ? (cur / ago[1] - 1) * 100 : undefined,
    pricePct: hasHistory(ten, 120) ? percentileOf(ten, cur) : undefined,
    peak: peak ? { date: peak[0], value: peak[1] } : undefined,
    fpe: last && {
      value: last[1], date: last[0], pct: hasHistory(f) ? percentileOf(f, last[1]) : undefined, min: fv[0], max: fv[fv.length - 1],
      median: fv.length % 2 ? fv[(fv.length - 1) / 2] : (fv[fv.length / 2 - 1] + fv[fv.length / 2]) / 2, count: f.length, kind: ix.ref?.points.length && ix.ref.kind === 'trailing' ? 'trailing' : 'forward',
    },
  }
}

/** 分位越高越贵：≥80% 黄、≥95% 红；样本不足时灰 */
export const pctTone = (p: number | undefined): Tone => (p === undefined ? 'gray' : p >= 95 ? 'red' : p >= 80 ? 'yellow' : 'green')

/** 把 Forward PE 序列按月对齐成"月份 → 值"，供图表使用 */
export const monthLabel = (d: string): string => d.slice(0, 7)

export interface FpeCol { key: string; label: string; min: number; max: number; median: number; pct: number | undefined; count: number }
/** Forward PE 表：只包含有 PE 记录的指数；行按月份倒序，缺的月份留空 */
export function fpeTable(indexes: Record<string, IndexData>): { cols: FpeCol[]; rows: { month: string; values: Record<string, number | undefined> }[] } {
  const cols: FpeCol[] = []
  const byMonth = new Map<string, Record<string, number | undefined>>()
  for (const [key, ix] of Object.entries(indexes)) {
    if (!ix.fpe.length) continue
    const v = ix.fpe.map(p => p[1]).sort((a, b) => a - b)
    const last = ix.fpe[ix.fpe.length - 1][1]
    cols.push({ key, label: ix.name, min: v[0], max: v[v.length - 1], median: v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2, pct: percentileOf(ix.fpe, last), count: v.length })
    for (const [d, x] of ix.fpe) byMonth.set(monthLabel(d), { ...byMonth.get(monthLabel(d)), [key]: x })
  }
  return { cols, rows: [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([month, values]) => ({ month, values })) }
}

/** 估算的 Forward PE 序列：用外部参考序列的真实读数反推各锚点的预期 EPS（收盘价 ÷ PE），
 * 锚点之间按时间对 EPS 取对数线性插值，再用每个交易日的真实收盘价 ÷ 插值 EPS。预期盈利变动平滑、价格是真实的，
 * 所以密度从半年一个点提高到每个交易日一个点；但它是估算，不是实际公布的历史值，且只覆盖第一个到最后一个锚点之间。 */
export function estimateFpe(prices: [string, number][], anchors: [string, number][]): [string, number][] {
  const day = (d: string) => Math.floor(new Date(d.slice(0, 10)).getTime() / 86_400_000)
  const px = prices.map(([d, v]) => ({ t: day(d), d: d.slice(0, 10), v })).sort((a, b) => a.t - b.t)
  const priceOn = (t: number) => { let r: number | undefined; for (const p of px) { if (p.t > t) break; r = p.v } return r }
  const pts = anchors.map(([d, pe]) => ({ t: day(d), ln: Math.log((priceOn(day(d)) ?? NaN) / pe) })).filter(p => Number.isFinite(p.ln)).sort((a, b) => a.t - b.t)
  if (pts.length < 2) return []
  const out: [string, number][] = []
  let i = 1
  for (const p of px) {
    if (p.t < pts[0].t || p.t > pts[pts.length - 1].t) continue
    while (pts[i].t < p.t) i++
    const a = pts[i - 1], b = pts[i]
    const ln = a.ln + ((b.ln - a.ln) * (p.t - a.t)) / (b.t - a.t)
    out.push([p.d, Math.round((p.v / Math.exp(ln)) * 100) / 100])
  }
  return out
}

/** 实时结果覆盖快照：价格与成分股用新的；本站记录的月度 PE 保留旧的并并入当月新点；某项没拉到时沿用旧值 */
export function mergeLive(old: IndexSnapshot, fresh: IndexSnapshot): IndexSnapshot {
  const indexes: Record<string, IndexData> = { ...old.indexes }
  for (const [k, f] of Object.entries(fresh.indexes)) {
    const o = old.indexes[k]
    const month = new Set(f.fpe.map(p => p[0].slice(0, 7)))
    indexes[k] = { ...f, fpe: [...(o?.fpe ?? []).filter(p => !month.has(p[0].slice(0, 7))), ...f.fpe].sort((a, b) => a[0].localeCompare(b[0])), ref: f.ref ?? o?.ref, members: f.members ?? o?.members, daily: f.daily ?? o?.daily, agg: f.agg ?? o?.agg }
  }
  return { ...fresh, indexes, maps: fresh.maps ?? old.maps }
}
