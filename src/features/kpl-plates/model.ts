// 开盘啦 · 板块题材页数据模型：读 public/data/kpl-plates.json（scripts/kpl-plates.mjs 每个交易日收盘后生成）。
// 功能对照开盘啦 App「板块」列表与题材涨停分布；板块强度公式为本站自定（见 scripts/kpl-plates-lib.mjs 与页面说明）。

export type Leader = { code: string; name: string; pct: number | null }
export type Board = {
  code: string
  name: string
  pct: number | null
  /** 成交额（亿元） */
  amount: number | null
  /** 主力净流入（亿元） */
  mainNet: number | null
  /** 主力净流入 ÷ 成交额（%） */
  mainNetPct: number | null
  up: number | null
  down: number | null
  members: number | null
  leader: Leader | null
  zt: number
  maxBoards: number | null
  /** 上涨家数 ÷ 成分股数（%） */
  upRatio: number | null
  /** 0–100；成分股不足 10 只为 null */
  strength: number | null
}
export type GroupStock = { code: string; name: string; boards: number | null; firstSeal: string | null; st: boolean }
export type ZtGroup = { name: string; code: string | null; pct: number | null; count: number; maxBoards: number; stocks: GroupStock[] }
export type TrendPoint = { date: string; close: number | null; pct: number | null; zt: number | null; strength: number | null }
export type Trend = { code: string; name: string; kind: Kind; r5: number | null; r20: number | null; points: TrendPoint[] }
export type StrongDay = { date: string; boards: Array<{ code: string; name: string; strength: number; pct: number | null; zt: number | null }> }
export type Kind = 'industry' | 'concept'

export type KplPlates = {
  version: 1
  generatedAt: string
  asOf: string
  note: string
  summary: { zt: number; ztMatched: number; industries: number; concepts: number; industryWithZt: number; conceptWithZt: number; upIndustries: number; upConcepts: number }
  industry: Board[]
  concept: Board[]
  groups: Record<Kind, ZtGroup[]>
  unmatched: Array<{ code: string; name: string; industry: string | null }>
  trend: Trend[]
  strong: Record<Kind, StrongDay[]>
  seededDays: string[]
  sources: Array<{ id: string; label: string; url: string }>
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isDate = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)
const isBoard = (x: unknown): boolean => isObj(x) && typeof x.code === 'string' && typeof x.name === 'string' && typeof x.zt === 'number'
const isGroup = (x: unknown): boolean => isObj(x) && typeof x.name === 'string' && typeof x.count === 'number' && Array.isArray(x.stocks)
const arr = <T,>(x: unknown, ok: (v: unknown) => boolean = () => true): T[] => (Array.isArray(x) ? (x.filter(ok) as T[]) : [])

/** 结构校验：关键字段缺失时返回 null，页面显示「数据文件格式不对」，不渲染半截数据 */
export function asKplPlates(body: unknown): KplPlates | null {
  if (!isObj(body) || body.version !== 1 || !isDate(body.asOf) || !isObj(body.summary) || typeof body.summary.zt !== 'number') return null
  if (!Array.isArray(body.industry) || !body.industry.length || !body.industry.every(isBoard)) return null
  if (!Array.isArray(body.concept) || !body.concept.every(isBoard)) return null
  const g = body.groups
  if (!isObj(g) || !Array.isArray(g.industry) || !Array.isArray(g.concept) || ![...g.industry, ...g.concept].every(isGroup)) return null
  const s = isObj(body.strong) ? body.strong : {}
  return {
    ...(body as unknown as KplPlates),
    unmatched: arr(body.unmatched),
    trend: arr<Trend>(body.trend, t => isObj(t) && typeof t.code === 'string' && Array.isArray(t.points) && (t.kind === 'industry' || t.kind === 'concept')),
    strong: { industry: arr<StrongDay>(s.industry, d => isObj(d) && isDate(d.date) && Array.isArray(d.boards)), concept: arr<StrongDay>(s.concept, d => isObj(d) && isDate(d.date) && Array.isArray(d.boards)) },
    seededDays: arr<string>(body.seededDays, isDate),
    sources: arr(body.sources),
  }
}

export type SortKey = 'strength' | 'pct' | 'zt' | 'upRatio' | 'mainNet'
export const SORTS: Array<{ id: SortKey; label: string }> = [
  { id: 'strength', label: '强度' }, { id: 'pct', label: '涨幅' }, { id: 'zt', label: '涨停数' }, { id: 'upRatio', label: '上涨占比' }, { id: 'mainNet', label: '主力净额' },
]

/** 按指标降序；缺失值一律排最后（不当 0 参与排序） */
export function sortBoards(rows: Board[], key: SortKey): Board[] {
  const v = (b: Board): number | null => b[key]
  return [...rows].sort((a, b) => {
    const x = v(a), y = v(b)
    if (x === null && y === null) return 0
    if (x === null) return 1
    if (y === null) return -1
    return y - x || (b.pct ?? -Infinity) - (a.pct ?? -Infinity)
  })
}

export const KINDS: Array<{ id: Kind; label: string }> = [{ id: 'industry', label: '行业' }, { id: 'concept', label: '概念' }]

/** 页面上写明的口径（与 scripts/kpl-plates-lib.mjs 一致） */
export const METHOD = {
  strength: '板块强度（0–100）：涨幅（−3%→0，+5%→100）、上涨家数占比、涨停家数（0 家→0，5 家及以上→100）、主力净占比（主力净流入 ÷ 成交额，−10%→0，+10%→100）四项取平均，缺项用其余项；成分股不足 10 只的板块不计强度。',
  scope: '行业为东方财富申万二级行业板块；概念为东方财富概念板块，已去掉「昨日涨停」「融资融券」「沪股通」等统计 / 指数类板块。涨停家数按东方财富个股所属行业、所属概念统计，一只股票可属于多个概念。',
  groups: '当日涨停股按所属板块分组，组内按连板数、首次封板时间排列；概念分组只列涨停 ≥ 2 家的，分组之间会重叠。',
  seeded: '早期的每日涨停家数由每日复盘归档补算：归档只有涨停股代码，所属行业 / 概念按现在的分类回填，与当时的分类可能不同；补算日没有强度。',
} as const
