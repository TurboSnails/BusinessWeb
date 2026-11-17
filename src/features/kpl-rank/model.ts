// 开盘啦 · 人气排行页签数据模型：读 public/data/kpl-rank.json（scripts/kpl-rank.mjs 每个交易日盘后生成）。
// 四个部分各自带日期、各自更新（某部分缺失为 null）。金额单位为元；null 表示数据源缺失（不是 0）。口径见 scripts/kpl-rank-lib.mjs。

export type PopRow = {
  code: string
  name: string | null
  price: number | null
  pct: number | null
  rank: number
  prevRank: number | null
  /** 上一交易日排名 − 当日排名（正数为上升） */
  change: number | null
}
export type PopTopRow = PopRow & { streak10: number | null; streak100: number | null; tags: string[] }
export type Popularity = { date: string; prevDate: string; takenAt: string; top: PopTopRow[]; surge: PopRow[] }

export type RangeRow = { code: string; name: string; price: number | null; pct: number | null; amount: number | null; value: number | null; inflowDays?: number | null }
export type StockRange = {
  date: string
  windows: Array<{ days: number; gain: RangeRow[]; loss: RangeRow[] }>
  nets: Array<{ days: number; inflow: RangeRow[]; outflow: RangeRow[] }>
}

export type BoardRow = {
  code: string
  name: string
  pct: number | null
  close: number | null
  net1: number | null
  r5: number | null; r10: number | null; r20: number | null
  net5: number | null; net10: number | null; net20: number | null
  in5: number | null; in10: number | null; in20: number | null
  lead5: number; lead10: number; lead20: number
}
export type Leader = { date: string; code: string | null; name: string | null; pct: number | null }
export type BoardKind = { rows: BoardRow[]; missing: number; leaders?: Leader[] }
export type Boards = { date: string; industry: BoardKind; concept: BoardKind; region: BoardKind }

export type InstRow = { code: string; name: string; buy: number | null; sell: number | null; net: number | null; times: number; seats: number; last: string; lastPct: number | null }
export type InstWindow = { days: number; from: string; to: string; missing: string[]; totals: { net: number | null; stocks: number }; buy: InstRow[]; sell: InstRow[] }
export type Inst = { date: string; windows: InstWindow[] }

export type KplRank = {
  version: 1
  generatedAt: string
  asOf: string
  note: string
  popularity: Popularity | null
  stockRange: StockRange | null
  boards: Boards | null
  inst: Inst | null
  sources: Array<{ id: string; label: string; url: string }>
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isDate = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)
const arr = <T,>(x: unknown, ok: (v: unknown) => boolean): T[] => (Array.isArray(x) ? (x.filter(ok) as T[]) : [])
const isCode = (r: unknown): boolean => isObj(r) && typeof r.code === 'string'

function asPopularity(x: unknown): Popularity | null {
  if (!isObj(x) || !isDate(x.date)) return null
  const top = arr<PopTopRow>(x.top, r => isCode(r) && typeof (r as { rank: unknown }).rank === 'number').map(r => ({ ...r, tags: Array.isArray(r.tags) ? r.tags : [] }))
  if (!top.length) return null
  return { date: x.date, prevDate: isDate(x.prevDate) ? x.prevDate : '', takenAt: typeof x.takenAt === 'string' ? x.takenAt : '', top, surge: arr<PopRow>(x.surge, isCode) }
}
function asStockRange(x: unknown): StockRange | null {
  if (!isObj(x) || !isDate(x.date)) return null
  const windows = arr<Record<string, unknown>>(x.windows, w => isObj(w) && typeof w.days === 'number')
    .map(w => ({ days: w.days as number, gain: arr<RangeRow>(w.gain, isCode), loss: arr<RangeRow>(w.loss, isCode) }))
  const nets = arr<Record<string, unknown>>(x.nets, w => isObj(w) && typeof w.days === 'number')
    .map(w => ({ days: w.days as number, inflow: arr<RangeRow>(w.inflow, isCode), outflow: arr<RangeRow>(w.outflow, isCode) }))
  return windows.length || nets.length ? { date: x.date, windows, nets } : null
}
function asKind(x: unknown): BoardKind {
  if (!isObj(x)) return { rows: [], missing: 0 }
  return {
    rows: arr<BoardRow>(x.rows, r => isCode(r) && typeof (r as { name: unknown }).name === 'string'),
    missing: typeof x.missing === 'number' ? x.missing : 0,
    ...(Array.isArray(x.leaders) ? { leaders: arr<Leader>(x.leaders, l => isObj(l) && isDate(l.date)) } : {}),
  }
}
function asBoards(x: unknown): Boards | null {
  if (!isObj(x) || !isDate(x.date)) return null
  const b = { date: x.date, industry: asKind(x.industry), concept: asKind(x.concept), region: asKind(x.region) }
  return b.industry.rows.length || b.concept.rows.length || b.region.rows.length ? b : null
}
function asInst(x: unknown): Inst | null {
  if (!isObj(x) || !isDate(x.date)) return null
  const windows = arr<Record<string, unknown>>(x.windows, w => isObj(w) && typeof w.days === 'number' && isDate(w.from) && isDate(w.to)).map(w => ({
    days: w.days as number, from: w.from as string, to: w.to as string,
    missing: arr<string>(w.missing, isDate),
    totals: isObj(w.totals) ? (w.totals as InstWindow['totals']) : { net: null, stocks: 0 },
    buy: arr<InstRow>(w.buy, isCode), sell: arr<InstRow>(w.sell, isCode),
  }))
  return windows.length ? { date: x.date, windows } : null
}

/** 结构校验：外壳不对返回 null（页面显示「数据文件格式不对」）；单个部分不对时该部分为 null */
export function asKplRank(body: unknown): KplRank | null {
  if (!isObj(body) || body.version !== 1 || !isDate(body.asOf)) return null
  const out: KplRank = {
    version: 1,
    generatedAt: typeof body.generatedAt === 'string' ? body.generatedAt : '',
    asOf: body.asOf,
    note: typeof body.note === 'string' ? body.note : '',
    popularity: asPopularity(body.popularity),
    stockRange: asStockRange(body.stockRange),
    boards: asBoards(body.boards),
    inst: asInst(body.inst),
    sources: arr(body.sources, s => isObj(s) && typeof s.label === 'string'),
  }
  return out.popularity || out.stockRange || out.boards || out.inst ? out : null
}

/** 页面上写明的口径（与 scripts/kpl-rank-lib.mjs 一致） */
export const METHOD = {
  popularity: '人气口径是东方财富股吧人气排名（东财按股吧访问、讨论等热度计算，算法未公开），不是开盘啦人气值，两者名次不可直接比较。前 100 为交易日盘后（约 15:40）抓取的快照；上一交易日排名取东财个股人气历史中该日的排名（东财按自然日记录，每日取值时点未公开）。',
  change: '排名变化 = 上一交易日排名 − 当日排名，正数为上升。连续上榜天数：从当日起按交易日往前数，每天都在前 10（或前 100）名的天数；任何一天历史缺失就停止计数。',
  tags: '标签：「连续上榜」= 连续 7 个交易日人气排名前 10（与开盘啦同名标签的口径一致）；「人气激增」= 当日进入前 100、上一交易日排名在 1000 名之后（本站自定）。',
  surge: '飙升榜名单取东财接口（较上一自然日排名上升最多的 100 只，多数排名仍在几百名以后）；表中排名变化按上一交易日重算后排序，所以周一、节后与东财页面可能不同。',
  stockRange: '区间涨幅为东财行情中心字段（前复权，最近一个交易日收盘相对 N 个交易日前收盘；已用日 K 逐项核对 3/5/10/20/60 日）。剔除停牌、当日无成交、行情时间不是当天收盘后的股票，以及上市不足 N+1 个交易日的新股。各榜取前 50。',
  stockNet: '区间主力净额为东财字段（超大单 + 大单净流入之和，按日累加；已用资金流日线核对 3/5/10 日）。净流入天数 = 区间内主力净额为正的天数，用东财个股资金流日线逐日数，只算各榜前 20，其余显示「—」。东财没有公开的 20 日主力净额字段，本页不做。',
  boards: '板块数据来自东财板块资金流日线（每根带日期，含主力净额、收盘、涨跌幅）：区间涨幅 = 最近一个交易日收盘相对 N 个交易日前收盘；区间主力净额 = 最近 N 日主力净额之和；净流入天数 = 其中为正的天数。行业为东财行业板块，概念已剔除「昨日涨停」等统计类板块，地区为东财地区板块。',
  lead: '领涨次数：最近 5 / 10 / 20 个交易日里，该板块当日涨幅在同类板块（行业、概念、地区分别比）中排第一的天数。由日线直接计算，不依赖本站存档。',
  inst: '机构多日榜由本站已落盘的龙虎榜明细（东财数据中心，买入 / 卖出前五席位）汇总：只算「机构专用」席位，同一席位同时出现在买入、卖出前五只算一次。为避免重复计入，只用当日口径的上榜记录，「连续三个交易日」累计口径与按投资者类别披露的记录不计入。出榜次数 = 区间内有机构席位出现的上榜天数；机构席位数 = 各天机构专用席位个数之和。只覆盖上榜个股、前五席位，不代表机构全部买卖。',
  skip: '没有做的：开盘啦盘中人气榜（9:00–15:00 实时）与人气值、「热度飙升」数值（App 自有数据）；区间实际换手 / 实际流通（东财无公开字段）；可转债区间榜。',
} as const

export const STOCK_WINDOW_DAYS = [3, 5, 10, 20, 60] as const
export const NET_WINDOW_DAYS = [3, 5, 10] as const
export const BOARD_WINDOW_DAYS = [5, 10, 20] as const
export const INST_WINDOW_DAYS = [3, 5, 10, 20] as const
