// 同花顺 · 技术选股：数据模型、运行时校验与口径文字。缺值为 null（不是 0）。
export type Num = number | null
export type Hit = [code: string, x: Num]
export type Preset = {
  id: string; group: string; label: string; formula: string; xLabel: string; xUnit: string; asc: boolean
  count: number; eligible: number; hits: Hit[]; history: Array<{ date: string; count: Num }>
}
/** [名称, 行业, 收盘, 涨跌幅 %, 收盘较 MA20 %, RSI(14)] */
export type StockInfo = [name: string, industry: string, close: Num, pct: Num, dev20: Num, rsi: Num]
export type BreadthDay = {
  date: string; seeded: boolean; above20: Num; above60: Num; high20: Num; low20: Num
  up: Num; down: Num; flat: Num; ratio: Num; n: number
}
/** [名称, 行业, 收盘, 涨跌幅 %, 量比, 换手率 %, 成交额（亿元）, 振幅 %] */
export type SnapStock = [name: string, industry: string, close: Num, pct: Num, volRatio: Num, turnover: Num, amount: Num, amp: Num]
export type Snapshot = { date: string; eligible: number; presets: Preset[]; stocks: Record<string, SnapStock> }
export type ThsScreenerData = {
  version: 1; asOf: string; generatedAt: string
  store: { from: string; to: string; days: number; stocks: number; source: 'kline' | 'sina'; backfillEnd: string | null }
  presets: Preset[]
  stocks: Record<string, StockInfo>
  breadth: BreadthDay[]
  /** 当日量能快照区块；不在采集时段或采集失败时为 null，原因见 snapshotNote */
  snapshot: Snapshot | null
  snapshotNote: string | null
  sources: Array<{ label: string; url: string }>
}

export const METHOD = {
  nature: '本页是收盘后按固定公式对全市场做的机械筛选与历史统计，只描述「哪些股票的价格走势满足某个条件」，不是买卖信号，也不预测后续涨跌。同一只股票可能同时出现在多个条件里。',
  data: '数据：只读复用开盘啦「复盘」页维护的全市场日线快照仓（沪深京 A 股约 5,900 只、最近约 120 个交易日的开高低收）。快照仓首次用东方财富日 K（前复权）带日期回补，之后每个交易日收盘后用新浪全市场行情追加；除权除息日按「当日昨收 ÷ 上一条收盘价」把之前的价格缩放到最新价格基准，所以均线、新高等都在复权价上计算。停牌日没有记录，均线按股票实际有行情的交易日计算。',
  eligible: '「参与判定」= 当日有行情且记录条数满足该条件所需窗口的股票数（如 60 日新高要求至少 60 条记录，MACD / RSI 要求至少 60 条记录让指数平滑充分预热；穿越类条件还要求上一条记录正好在上一交易日）。上市不满窗口的次新股不参与。',
  breadth: '市场宽度（回算）：站上 20 / 60 日线占比 = 当日收盘价高于各自 MA20 / MA60 的股票数 ÷ 有 20 / 60 条以上记录的股票数；20 日新高 / 新低家数与上面的预设同口径；涨跌家数比 = 上涨家数 ÷ 下跌家数（收盘价较上一交易日，复权后比较，平盘单列）。历史各日都是用同一份快照仓回推计算，参与统计不足 1000 只的日子不显示占比；快照仓只保留最近约 130 个交易日，所以 MA60 占比约从第 60 个交易日开始。',
  seeded: '图中虚线 / 浅色为「回算」：该日行情来自东方财富日 K 一次性回补的快照，而不是当日收盘后实时采集；两者价格口径相同（日 K 前复权 vs 新浪当日行情 + 除权缩放）。',
  snapshot: '量能条件只看当日：快照仓只有开高低收、没有成交量，所以量比、换手率、振幅取收盘后一次东方财富全市场行情快照（约 60 次分页请求）。快照本身不带日期，只在交易日北京时间 15:10 之后采集，并逐只核对行情时间是当日 15:00 以后、收盘价与快照仓当日收盘一致（≥ 95%），分页去重后的家数必须等于快照总数，任一项不过就整块不写。参与判定 = 当日有成交的股票（停牌股不计）。近 20 日走势只记真实采集过的交易日，从开始采集那天起逐日积累，不回算；没采到的日子留空。',
  skipped: '未做：均量线、成交量突破 N 日均量等需要历史成交量的条件（快照仓没有成交量，当日快照只有一天，逐只补抓历史成交量会让运行时间不可控，宁缺不估）；同花顺「形态选股」「AI 选股」「i 问财」等专有模型与自然语言选股；盘中实时预警与分时形态（需要盘中行情）。',
}

const obj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isDate = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const nul = (x: unknown): boolean => x === null || num(x)
const cnt = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0
const str = (x: unknown): x is string => typeof x === 'string' && x.trim() !== ''
const code = (x: unknown): x is string => typeof x === 'string' && /^\d{6}$/.test(x)
const https = (x: unknown): boolean => typeof x === 'string' && /^https:\/\//.test(x)
const ascDates = (xs: unknown[], max: string): boolean => xs.every((h, i) => obj(h) && isDate(h.date) && h.date <= max && (!i || h.date > String((xs[i - 1] as Record<string, unknown>).date)))

function preset(p: unknown, stocks: Record<string, unknown>, asOf: string): boolean {
  if (!obj(p) || ![p.id, p.group, p.label, p.formula, p.xLabel].every(str) || typeof p.xUnit !== 'string' || typeof p.asc !== 'boolean') return false
  if (!cnt(p.count) || !cnt(p.eligible) || p.count > p.eligible || !Array.isArray(p.hits) || p.hits.length !== p.count) return false
  if (!p.hits.every(h => Array.isArray(h) && h.length === 2 && code(h[0]) && nul(h[1]) && Array.isArray(stocks[h[0]]))) return false
  const hs = p.history
  return Array.isArray(hs) && hs.length > 0 && hs.length <= 20 && ascDates(hs, asOf) && hs.every(h => obj(h) && (h.count === null || cnt(h.count)))
    && (hs[hs.length - 1] as Record<string, unknown>).date === asOf && (hs[hs.length - 1] as Record<string, unknown>).count === p.count
}

function snapshotOk(x: unknown, asOf: string): boolean {
  if (!obj(x) || x.date !== asOf || !cnt(x.eligible) || !obj(x.stocks)) return false
  const stocks = x.stocks
  if (!Object.entries(stocks).every(([k, v]) => code(k) && Array.isArray(v) && v.length === 8 && typeof v[0] === 'string' && typeof v[1] === 'string' && v.slice(2).every(nul))) return false
  return Array.isArray(x.presets) && x.presets.length > 0 && x.presets.every(p => preset(p, stocks, asOf) && (p as Record<string, unknown>).eligible as number <= (x.eligible as number))
    && new Set(x.presets.map(p => (p as Record<string, unknown>).id)).size === x.presets.length
}

/** 拒绝 HTML 回退、半份数据、字符串数字与非有限数。 */
export function asThsScreener(x: unknown): ThsScreenerData | null {
  if (!obj(x) || x.version !== 1 || !isDate(x.asOf) || typeof x.generatedAt !== 'string' || !Number.isFinite(Date.parse(x.generatedAt))) return null
  const s = x.store
  if (!obj(s) || !isDate(s.from) || s.to !== x.asOf || !cnt(s.days) || !cnt(s.stocks) || !(s.source === 'kline' || s.source === 'sina') || !(s.backfillEnd === null || isDate(s.backfillEnd))) return null
  if (!obj(x.stocks) || !Object.entries(x.stocks).every(([k, v]) => code(k) && Array.isArray(v) && v.length === 6 && typeof v[0] === 'string' && typeof v[1] === 'string' && v.slice(2).every(nul))) return null
  if (!Array.isArray(x.presets) || !x.presets.length || !x.presets.every(p => preset(p, x.stocks as Record<string, unknown>, x.asOf as string))) return null
  if (new Set(x.presets.map(p => (p as Record<string, unknown>).id)).size !== x.presets.length) return null
  const b = x.breadth
  if (!Array.isArray(b) || !ascDates(b, x.asOf) || !b.every(d => obj(d) && typeof d.seeded === 'boolean' && cnt(d.n)
    && ['above20', 'above60', 'ratio'].every(k => nul(d[k])) && ['high20', 'low20', 'up', 'down', 'flat'].every(k => d[k] === null || cnt(d[k])))) return null
  if (!Array.isArray(x.sources) || !x.sources.length || !x.sources.every(r => obj(r) && str(r.label) && https(r.url))) return null
  // 旧文件没有量能区块：按缺失处理
  const snapshot = x.snapshot ?? null, snapshotNote = x.snapshotNote ?? null
  if (snapshot !== null && !snapshotOk(snapshot, x.asOf)) return null
  if (!(snapshotNote === null || typeof snapshotNote === 'string')) return null
  return { ...(x as unknown as ThsScreenerData), snapshot: snapshot as Snapshot | null, snapshotNote: snapshotNote as string | null }
}

export type Row = { code: string; name: string; industry: string; close: Num; pct: Num; dev20: Num; rsi: Num; x: Num }
export function rowsOf(p: Preset, stocks: Record<string, StockInfo>): Row[] {
  return p.hits.map(([c, x]) => {
    const [name, industry, close, pct, dev20, rsi] = stocks[c]
    return { code: c, name: name || c, industry, close, pct, dev20, rsi, x }
  })
}
/** 按行业汇总命中家数（行业缺失归入「未分类」），家数降序 */
export function byIndustry(rows: Array<{ industry: string; name: string }>): Array<{ industry: string; count: number; names: string[] }> {
  const m = new Map<string, string[]>()
  for (const r of rows) { const k = r.industry || '未分类'; m.set(k, [...(m.get(k) ?? []), r.name]) }
  return [...m].map(([industry, names]) => ({ industry, count: names.length, names })).sort((a, b) => b.count - a.count || a.industry.localeCompare(b.industry, 'zh'))
}

export type SnapRow = { code: string; name: string; industry: string; close: Num; pct: Num; volRatio: Num; turnover: Num; amount: Num; amp: Num; x: Num }
export function snapRowsOf(p: Preset, stocks: Record<string, SnapStock>): SnapRow[] {
  return p.hits.map(([c, x]) => {
    const [name, industry, close, pct, volRatio, turnover, amount, amp] = stocks[c]
    return { code: c, name: name || c, industry, close, pct, volRatio, turnover, amount, amp, x }
  })
}
