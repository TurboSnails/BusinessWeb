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
/** 板块分布：各股池家数；拿不到的池为 null（整列缺失） */
export type DistRow = { code: string; name: string; zt: number; zb: number; dt: number; natural: number | null; touched: number | null }
export type Dist = { source: 'daban' | 'pools'; counts: Record<string, number | null>; industry: DistRow[]; concept: DistRow[] }
export type IntradayBoard = { code: string; name: string; kind: Kind; strength: number | null; pct: number | null; pre: number; values: Array<number | null> }
export type Intraday = { date: string; times: string[]; boards: IntradayBoard[] }
export type MemberStock = { code: string; name: string }
export type ConceptChange = { code: string; name: string; members: number; addedCount: number; removedCount: number; added: MemberStock[]; removed: MemberStock[] }
export type MemberDiff = { base: string; concepts: ConceptChange[]; newConcepts: Array<{ code: string; name: string; members: number }>; droppedConcepts: Array<{ code: string; name: string; members: number }>; skipped: number }
export type MemberRecent = { date: string; base: string; concepts: number; added: number; removed: number; newConcepts: string[]; droppedConcepts: string[] }
/** 板块关联 ETF */
export type EtfItem = { code: string; name: string; pct: number | null; amount: number | null; indexCode: string | null; indexName: string; basis: 'em' | 'catalog' }
export type EtfRule = { id: string; label: string; keywords: string[]; scope: 'exact' | 'broad' }
export type EtfBoard = { code: string; name: string; kind: Kind; rule: EtfRule | null; count: number; avgPct: number | null; amount: number | null; indexes: string[]; etfs: EtfItem[] }
export type EtfSection = { date: string; universe: number; indexed: number; withoutIndex: number; pending: number; boards: EtfBoard[] }
/** 排行与热力图可选的板块类型（地域只在这两处出现） */
export type RankKind = Kind | 'region'
export type Members = { date: string; base: string | null; prevDay: string; stocks: number; withConcepts: number; unmatchedNames: number; today: MemberDiff | null; recent: MemberRecent[] }

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
  /** 以下为附加模块，旧数据或当日失败时为 null */
  dist: Dist | null
  intraday: Intraday | null
  members: Members | null
  /** 地域板块（东财 m:90+t:1）；旧数据没有为 null */
  region: Board[] | null
  etf: EtfSection | null
  /** 附加模块当次失败的原因（模块名 → 原因） */
  sectionErrors: Record<string, string>
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
    dist: asDist(body.dist),
    intraday: asIntraday(body.intraday),
    members: asMembers(body.members),
    region: Array.isArray(body.region) && body.region.length && body.region.every(isBoard) ? (body.region as Board[]) : null,
    etf: asEtf(body.etf),
    sectionErrors: isObj(body.sectionErrors) ? Object.fromEntries(Object.entries(body.sectionErrors).filter(([, v]) => typeof v === 'string')) as Record<string, string> : {},
  }
}

const isEtfItem = (x: unknown): boolean => isObj(x) && typeof x.code === 'string' && typeof x.name === 'string' && typeof x.indexName === 'string'
function asEtf(x: unknown): EtfSection | null {
  if (!isObj(x) || !isDate(x.date) || typeof x.universe !== 'number' || !Array.isArray(x.boards)) return null
  const boards = x.boards
    .filter(b => isObj(b) && typeof b.code === 'string' && typeof b.name === 'string' && (b.kind === 'industry' || b.kind === 'concept') && typeof b.count === 'number' && Array.isArray(b.etfs))
    .map(b => {
      const r = (b as Record<string, unknown>).rule
      const rule = isObj(r) && typeof r.id === 'string' && typeof r.label === 'string' ? { id: r.id, label: r.label, keywords: arr<string>(r.keywords, v => typeof v === 'string'), scope: r.scope === 'broad' ? 'broad' as const : 'exact' as const } : null
      const o = b as Record<string, unknown>
      return { ...(o as unknown as EtfBoard), rule, indexes: arr<string>(o.indexes, v => typeof v === 'string'), etfs: arr<EtfItem>(o.etfs, isEtfItem).map(e => ({ ...e, basis: e.basis === 'catalog' ? 'catalog' as const : 'em' as const })) }
    })
  return boards.length ? { date: x.date, universe: x.universe, indexed: typeof x.indexed === 'number' ? x.indexed : 0, withoutIndex: typeof x.withoutIndex === 'number' ? x.withoutIndex : 0, pending: typeof x.pending === 'number' ? x.pending : 0, boards } : null
}

const isDistRow = (x: unknown): boolean => isObj(x) && typeof x.code === 'string' && typeof x.name === 'string' && typeof x.zt === 'number'
function asDist(x: unknown): Dist | null {
  if (!isObj(x) || !Array.isArray(x.industry) || !Array.isArray(x.concept) || ![...x.industry, ...x.concept].every(isDistRow)) return null
  return { source: x.source === 'pools' ? 'pools' : 'daban', counts: isObj(x.counts) ? (x.counts as Dist['counts']) : {}, industry: x.industry as DistRow[], concept: x.concept as DistRow[] }
}
function asIntraday(x: unknown): Intraday | null {
  if (!isObj(x) || !isDate(x.date) || !Array.isArray(x.times) || !x.times.length || !Array.isArray(x.boards)) return null
  const n = x.times.length
  const boards = x.boards.filter(b => isObj(b) && typeof b.code === 'string' && typeof b.name === 'string' && (b.kind === 'industry' || b.kind === 'concept') && Array.isArray(b.values) && b.values.length === n) as IntradayBoard[]
  return boards.length ? { date: x.date, times: x.times as string[], boards } : null
}
function asMembers(x: unknown): Members | null {
  if (!isObj(x) || !isDate(x.date) || typeof x.stocks !== 'number') return null
  const t = x.today
  const today = isObj(t) && isDate(t.base) && Array.isArray(t.concepts) ? { ...(t as unknown as MemberDiff), newConcepts: arr<MemberDiff['newConcepts'][number]>(t.newConcepts, isObj), droppedConcepts: arr<MemberDiff['droppedConcepts'][number]>(t.droppedConcepts, isObj), skipped: typeof t.skipped === 'number' ? t.skipped : 0 } : null
  return { ...(x as unknown as Members), base: isDate(x.base) ? x.base : null, today, recent: arr<MemberRecent>(x.recent, r => isObj(r) && isDate(r.date)) }
}

/** 板块叠加最多同时选几个 */
export const OVERLAY_MAX = 3

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
/** 排行 / 热力图的板块类型：有地域数据时多一个「地域」 */
export const rankKinds = (m: Pick<KplPlates, 'region'>): Array<{ id: RankKind; label: string }> => (m.region ? [...KINDS, { id: 'region', label: '地域' }] : KINDS)
export const boardsOf = (m: Pick<KplPlates, 'industry' | 'concept' | 'region'>, k: RankKind): Board[] => (k === 'region' ? m.region ?? [] : m[k])

/* ---------- 板块资金热力图 ---------- */
/** 热力图最多画多少个板块（按 |主力净流入| 取前 N） */
export const HEAT_TOP = 40
/** 颜色分档（涨跌幅 %）：红涨绿跌，越深幅度越大；缺失单独一档 */
export const HEAT_STEPS: Array<{ id: string; label: string }> = [
  { id: 'd3', label: '≤ −3%' }, { id: 'd2', label: '−3% ~ −1%' }, { id: 'd1', label: '−1% ~ 0' }, { id: 'n', label: '0' },
  { id: 'u1', label: '0 ~ +1%' }, { id: 'u2', label: '+1% ~ +3%' }, { id: 'u3', label: '≥ +3%' },
]
export function heatStep(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return 'na'
  if (pct >= 3) return 'u3'
  if (pct >= 1) return 'u2'
  if (pct > 0) return 'u1'
  if (pct === 0) return 'n'
  if (pct > -1) return 'd1'
  if (pct > -3) return 'd2'
  return 'd3'
}
/** 热力图取数：主力净流入缺失的板块不画（不当 0）；按 |主力净流入| 降序取前 n */
export function heatItems(rows: Board[], n = HEAT_TOP): { items: Board[]; skipped: number } {
  const ok = rows.filter(b => b.mainNet !== null && Number.isFinite(b.mainNet) && b.mainNet !== 0)
  return { items: [...ok].sort((a, b) => Math.abs(b.mainNet!) - Math.abs(a.mainNet!)).slice(0, n), skipped: rows.length - ok.length }
}
/** 手机上的方块大小分档：按 |主力净流入| 相对最大值的比例（≥ 45% 特大、≥ 15% 大、其余普通） */
export function sizeBucket(v: number, max: number): 'xl' | 'l' | 'm' {
  const r = max > 0 ? Math.abs(v) / max : 0
  return r >= 0.45 ? 'xl' : r >= 0.15 ? 'l' : 'm'
}
export type Rect = { x: number; y: number; w: number; h: number }
/**
 * Squarified treemap（Bruls 等 2000）：按值的比例把 w×h 的矩形切分，尽量接近正方形。
 * values 须已按降序排好、均为正数；返回与 values 一一对应的矩形。
 */
export function squarify(values: number[], w: number, h: number): Rect[] {
  const total = values.reduce((s, v) => s + v, 0)
  if (!values.length || !(total > 0)) return []
  const scale = (w * h) / total
  const areas = values.map(v => v * scale)
  const out: Rect[] = []
  let x = 0, y = 0, cw = w, ch = h
  let i = 0
  const worst = (row: number[], side: number): number => {
    const s = row.reduce((a, b) => a + b, 0)
    const mx = Math.max(...row), mn = Math.min(...row)
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn))
  }
  while (i < areas.length) {
    const side = Math.min(cw, ch)
    const row = [areas[i]]
    i++
    while (i < areas.length && worst([...row, areas[i]], side) <= worst(row, side)) { row.push(areas[i]); i++ }
    const s = row.reduce((a, b) => a + b, 0)
    if (cw >= ch) {
      // 竖着放一列：宽 = s / ch
      const colW = s / ch
      let yy = y
      for (const a of row) { const hh = a / colW; out.push({ x, y: yy, w: colW, h: hh }); yy += hh }
      x += colW; cw -= colW
    } else {
      const rowH = s / cw
      let xx = x
      for (const a of row) { const ww = a / rowH; out.push({ x: xx, y, w: ww, h: rowH }); xx += ww }
      y += rowH; ch -= rowH
    }
  }
  return out
}

/** 页面上写明的口径（与 scripts/kpl-plates-lib.mjs 一致） */
export const METHOD = {
  strength: '板块强度（0–100）：涨幅（−3%→0，+5%→100）、上涨家数占比、涨停家数（0 家→0，5 家及以上→100）、主力净占比（主力净流入 ÷ 成交额，−10%→0，+10%→100）四项取平均，缺项用其余项；成分股不足 10 只的板块不计强度。',
  scope: '行业为东方财富申万二级行业板块；概念为东方财富概念板块，已去掉「昨日涨停」「融资融券」「沪股通」等统计 / 指数类板块。涨停家数按东方财富个股所属行业、所属概念统计，一只股票可属于多个概念。',
  groups: '当日涨停股按所属板块分组，组内按连板数、首次封板时间排列；概念分组只列涨停 ≥ 2 家的，分组之间会重叠。',
  dist: '板块分布：当日涨停、炸板、跌停、自然涨停、曾跌停个股按东方财富个股所属行业（申万二级）与所属概念计数，一只股票可属于多个概念。股池与口径同打板页：自然涨停 = 剔除一字板和上市首日等新股后的涨停；曾跌停 = 盘中触及跌停价、收盘高于跌停价。',
  distPools: '当天打板页数据未生成，炸板、跌停直接取东方财富股池，自然涨停、曾跌停拿不到，显示为「—」。',
  intraday: '板块叠加：每个交易日收盘后预存当日强度前 20 的行业与概念的分时（东方财富分时，逐分钟带日期，核对为当天），按「（分时价 ÷ 昨收 − 1）× 100%」换成涨跌幅后放在同一坐标轴上比较；不是盘中实时走势。',
  members: '概念成分变动：每个交易日收盘后存一份东方财富全 A 股「所属概念」快照（与概念板块成分列表一致），与上一交易日的快照逐股比较。上一交易日没有快照（首次采集或当天没跑成）时不比较，也不拿更早的快照代替；当天某只股票所属概念全空视为数据缺失、不计为剔除；退市等不在列表里的股票不计为剔除。',
  heat: '板块资金热力图：方块面积 ∝ 当日主力净流入的绝对值（东方财富 f62，超大单 + 大单净额），颜色按当日涨跌幅分 7 档（红涨绿跌，越深幅度越大）；方块里的金额为主力净额，负数（−）为主力净流出。只画 |主力净流入| 最大的前 40 个板块，主力净流入缺失的板块不画。宽屏为按比例切分的矩形树图；手机上改为按 |主力净流入| 排序的方块网格，方块大小只分三档（≥ 最大值 45% 特大、≥ 15% 大、其余普通），不严格成比例。',
  region: '地域板块为东方财富地域板块（按上市公司注册地划分的省市板块），涨停家数按个股所属地域统计，强度公式与行业、概念相同。',
  etf: '板块关联 ETF：只看场内股票型 ETF（东方财富 ETF 分类 MK0021，不含货币、跨境、商品 ETF）。每只 ETF 的跟踪指数取自东方财富基金资料（站内人工核验目录里有的以目录为准），再按本站人工审核的「板块 → 指数关键词」表匹配：板块名在表里，且 ETF 跟踪指数名称含对应关键词（排除港股、海外指数）才算关联；表里没有的板块显示「暂无对应 ETF」，不按名称硬凑。「宽口径」表示只能配到更宽的行业指数（如 PCB 配电子指数）。平均涨幅为关联 ETF 当日涨跌幅的简单平均，成交额为合计；每个板块列成交额最大的 5 只。只列当日强度前 20 的行业与概念。',
  seeded: '早期的每日涨停家数由每日复盘归档补算：归档只有涨停股代码，所属行业 / 概念按现在的分类回填，与当时的分类可能不同；补算日没有强度。',
} as const
