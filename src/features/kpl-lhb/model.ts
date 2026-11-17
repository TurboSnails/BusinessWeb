// 开盘啦 · 龙虎榜页签数据模型：读 public/data/kpl-lhb.json（scripts/kpl-lhb.mjs 每个交易日盘后生成）。
// 金额单位为元；null 表示数据源缺失（不是 0）。口径见 scripts/kpl-lhb-lib.mjs 与页面说明。

/** inst 机构专用；hk 沪深股通专用；dept 营业部；type 投资者类别（严重异常波动类上榜不披露席位，按自然人、机构投资者等类别披露） */
export type SeatKind = 'inst' | 'hk' | 'dept' | 'type'
export type Seat = { dept: string; name: string; kind: SeatKind; buy: number | null; sell: number | null; net: number | null }

export type Reason = {
  id: string
  reason: string
  /** 统计窗口（交易日）：1 为当日，3 为连续三日累计 */
  window: number
  byType?: boolean
  amount: number | null
  buy: number | null
  sell: number | null
  net: number | null
  dealRatio: number | null
  buySeats: Seat[]
  sellSeats: Seat[]
}

export type LhbStock = {
  code: string
  name: string
  market: 'sh' | 'sz' | 'bj' | null
  board: string
  close: number | null
  pct: number | null
  turnover: number | null
  window: number
  /** 主记录按投资者类别披露：金额是整段时间全部成交，买入/卖出/净额留空 */
  byType?: boolean
  amount: number | null
  buy: number | null
  sell: number | null
  net: number | null
  dealRatio: number | null
  netRatio: number | null
  instNet: number | null
  instBuyCount: number
  instSellCount: number
  hasHk: boolean
  reasons: Reason[]
}

export type Totals = { buy: number | null; sell: number | null; net: number | null }
export type SeatTotals = Totals & { stocks: number }
export type InstRow = { code: string; name: string; pct: number | null; window: number; buy: number | null; sell: number | null; net: number | null; buyCount: number; sellCount: number }
export type DeptRow = { dept: string; name: string; count: number; days: number; buy: number | null; sell: number | null; net: number | null; last: string; stocks: string[] }
export type DeptTrade = { date: string; code: string; name: string; pct: number | null; window: number; buy: number | null; sell: number | null; net: number | null }

export type LhbLatest = {
  date: string
  stockCount: number
  entryCount: number
  up: number
  down: number
  netBuyCount: number
  netSellCount: number
  /** 只按投资者类别披露、不计入金额汇总的个股数 */
  byTypeCount?: number
  totals: Totals
  inst: SeatTotals
  hk: SeatTotals
  stocks: LhbStock[]
  reasons: Array<{ reason: string; window: number; codes: string[] }>
  instRank: InstRow[]
  deptRank: DeptRow[]
}

export type LhbWindow = {
  days: number
  from: string | null
  to: string | null
  deptRank: DeptRow[]
  deptTrades: Record<string, DeptTrade[]>
  stockRank: Array<{ code: string; name: string; count: number; last: string; net: number | null }>
}

export type LhbDay = { date: string; stockCount: number; entryCount: number; net: number | null; instNet: number | null; instStocks: number; hkNet: number | null }

export type KplLhb = {
  version: 1
  generatedAt: string
  asOf: string
  note: string
  latest: LhbLatest
  window: LhbWindow
  history: LhbDay[]
  sources: Array<{ id: string; label: string; url: string }>
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isDate = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)
const arr = <T,>(x: unknown, ok: (v: unknown) => boolean = () => true): T[] => (Array.isArray(x) ? (x.filter(ok) as T[]) : [])
const isSeat = (s: unknown): boolean => isObj(s) && typeof s.name === 'string'
const isStock = (s: unknown): boolean => isObj(s) && typeof s.code === 'string' && typeof s.name === 'string' && Array.isArray(s.reasons)

/** 结构校验：关键字段缺失时返回 null，页面显示「数据文件格式不对」；可选列表缺失时补成空数组 */
export function asKplLhb(body: unknown): KplLhb | null {
  if (!isObj(body) || body.version !== 1 || !isDate(body.asOf)) return null
  const l = body.latest
  if (!isObj(l) || !isDate(l.date) || l.date !== body.asOf || typeof l.stockCount !== 'number' || !Array.isArray(l.stocks) || !isObj(l.totals) || !isObj(l.inst) || !isObj(l.hk)) return null
  const w = isObj(body.window) ? body.window : {}
  const stocks = arr<LhbStock>(l.stocks, isStock).map(s => ({
    ...s,
    reasons: arr<Reason>(s.reasons, isObj).map(r => ({ ...r, buySeats: arr<Seat>(r.buySeats, isSeat), sellSeats: arr<Seat>(r.sellSeats, isSeat) })),
  }))
  return {
    ...(body as unknown as KplLhb),
    latest: {
      ...(l as unknown as LhbLatest),
      stocks,
      reasons: arr(l.reasons, r => isObj(r) && typeof r.reason === 'string' && Array.isArray(r.codes)),
      instRank: arr(l.instRank, r => isObj(r) && typeof r.code === 'string'),
      deptRank: arr(l.deptRank, r => isObj(r) && typeof r.name === 'string'),
    },
    window: {
      days: typeof w.days === 'number' ? w.days : 0,
      from: isDate(w.from) ? w.from : null,
      to: isDate(w.to) ? w.to : null,
      deptRank: arr(w.deptRank, r => isObj(r) && typeof r.name === 'string'),
      deptTrades: isObj(w.deptTrades) ? (w.deptTrades as LhbWindow['deptTrades']) : {},
      stockRank: arr(w.stockRank, r => isObj(r) && typeof r.code === 'string'),
    },
    history: arr<LhbDay>(body.history, d => isObj(d) && isDate(d.date)),
    sources: arr(body.sources, isObj),
  }
}

export const SEAT_TAG: Record<SeatKind, string> = { inst: '机构', hk: '北向', dept: '', type: '类别' }

/** 页面上写明的口径（与 scripts/kpl-lhb-lib.mjs 一致） */
export const METHOD = {
  list: '同一股票当天可能因多条原因上榜：表中金额取当日口径的那条（只有「连续三个交易日」口径时为三日累计，标注「3日」）；展开可查看每条上榜原因各自的买入、卖出前五席位。成交占比 = 龙虎榜席位成交额 ÷ 该股统计期内总成交额。',
  inst: '机构专用：交易所披露为「机构专用」的席位（基金、保险、社保、QFII 等的专用交易单元）。只统计出现在买入或卖出前五的席位；同一席位同时出现在两侧时只算一次。',
  hk: '北向：「沪股通专用」「深股通专用」席位。',
  dept: '营业部：机构专用、沪深股通以外的席位，按当日买入额排序；每只股票只计一次（取当日口径那条上榜记录）。',
  window: '近 20 个交易日：上榜次数 = 出现在某只股票前五席位的次数（每只股票每天最多一次）；买入、卖出为这些席位记录的合计。三日口径的记录在相邻几天可能重复计入。',
  byType: '「严重异常波动」类上榜（如连续 10 个交易日涨跌幅偏离值累计达标）交易所不披露前五席位，而是按投资者类别（自然人、中小投资者、机构投资者等，互相包含）披露整段时间的全部买卖，标「类别披露」，金额不计入龙虎榜净买与席位统计。',
  skip: '开盘啦的「一线游资」席位昵称没有公开出处，「会不会上龙虎榜」是盘中预测，本页都不做。',
} as const
