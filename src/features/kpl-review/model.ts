// 开盘啦 · 复盘页数据模型：读 public/data/kpl-review.json（scripts/kpl-review.mjs 每个交易日收盘后生成）。
// 功能对照开盘啦 App「复盘」「赚钱效应」「亏钱效应」「百日新高」「盘面亮点」；全部口径为本站自定（见 scripts/kpl-review-lib.mjs 与页面说明）。

export type Summary = {
  zt: number; zb: number; dt: number; sealRate: number | null; brokenRate: number | null
  yzt: number; yztProfit: number | null; yztAvg: number | null; first: number; firstOk: number; firstToSecond: number | null
  openAvg: number | null; openHighRate: number | null; bigLoss: number; drop7: number; maxBoard: number | null
  newHigh: number | null; newHighFresh: number | null
}
export type OpenDist = {
  n: number; oneWord: number; avg: number | null; high: number; flat: number; low: number
  buckets: Array<{ id: string; label: string; count: number }>
}
export type IntradayPoint = { t: string; zt: number; touched: number; dt: number }
export type TagStock = { code: string; name: string; pct: number | null; sector: string; boards: number | null; why?: string }
export type Tag = { id: string; label: string; polarity: 'up' | 'down'; def: string; stocks: TagStock[] }
export type TagStat = { id: string; label: string; polarity: 'up' | 'down'; n: number; days: number; avg: number | null; red: number | null }
export type NewHighStock = { code: string; name: string; pct: number | null; fresh: boolean | null }
export type NewHigh = { count: number; fresh: number | null; eligible: number; groups: Array<{ industry: string; count: number; stocks: NewHighStock[] }> }
export type Closes = { days: number; from: string | null; to: string | null; complete: boolean; done: number; universe: number; failed: number; end: string | null }
export type HistoryDay = {
  date: string; seeded?: boolean
  zt: number | null; zb: number | null; dt: number | null; sealRate: number | null; brokenRate: number | null
  yztProfit: number | null; yztAvg: number | null; firstToSecond: number | null; openAvg: number | null; openHighRate: number | null
  bigLoss: number | null; drop7: number | null; maxBoard: number | null; newHigh: number | null; newHighFresh: number | null
}

export type KplReview = {
  version: 1
  generatedAt: string
  asOf: string
  note: string
  summary: Summary
  openDist: OpenDist | null
  intraday: { points: IntradayPoint[]; missing: { zt: number; touched: number; dt: number } } | null
  tags: Tag[]
  tagStats: { rows: TagStat[]; from: string | null; to: string | null; days: number }
  newHigh: NewHigh | null
  closes: Closes | null
  history: HistoryDay[]
  sources: Array<{ id: string; label: string; url: string }>
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isDate = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)
const stocksOk = (x: unknown): boolean => Array.isArray(x) && x.every(r => isObj(r) && typeof r.code === 'string' && typeof r.name === 'string')

/** 结构校验：关键字段缺失时返回 null（页面显示「数据文件格式不对」）；次要部分缺失时按空处理 */
export function asKplReview(body: unknown): KplReview | null {
  if (!isObj(body) || body.version !== 1 || !isDate(body.asOf)) return null
  const s = body.summary
  if (!isObj(s) || typeof s.zt !== 'number' || typeof s.zb !== 'number' || typeof s.dt !== 'number') return null
  const tags = Array.isArray(body.tags) && body.tags.every(t => isObj(t) && typeof t.id === 'string' && typeof t.label === 'string' && stocksOk(t.stocks)) ? (body.tags as Tag[]) : null
  if (!tags) return null
  const ts = isObj(body.tagStats) && Array.isArray(body.tagStats.rows) ? (body.tagStats as KplReview['tagStats']) : { rows: [], from: null, to: null, days: 0 }
  const od = isObj(body.openDist) && Array.isArray(body.openDist.buckets) ? (body.openDist as OpenDist) : null
  const intra = isObj(body.intraday) && Array.isArray(body.intraday.points) ? (body.intraday as KplReview['intraday']) : null
  const nh = isObj(body.newHigh) && typeof body.newHigh.count === 'number' && Array.isArray(body.newHigh.groups)
    && body.newHigh.groups.every(g => isObj(g) && typeof g.industry === 'string' && stocksOk(g.stocks)) ? (body.newHigh as NewHigh) : null
  return {
    ...(body as unknown as KplReview),
    tags, tagStats: ts, openDist: od, intraday: intra, newHigh: nh,
    closes: isObj(body.closes) ? (body.closes as Closes) : null,
    history: Array.isArray(body.history) && body.history.every(d => isObj(d) && isDate(d.date)) ? (body.history as HistoryDay[]) : [],
    sources: Array.isArray(body.sources) ? (body.sources as KplReview['sources']) : [],
    note: typeof body.note === 'string' ? body.note : '',
  }
}

/** 页面上写明的口径（与 scripts/kpl-review-lib.mjs 一致） */
export const METHOD = {
  effect: '打板成功率 = 涨停 ÷（涨停 + 炸板），即当日触及涨停的股票里收盘仍封住的比例（东财涨停池、炸板池）。昨日涨停今日盈利率 = 昨日涨停股中今日收盘高于昨收的比例（东财昨日涨停池，停牌不计入分母）。首板→二板成功率 = 昨日首板涨停股中今日再涨停的比例。',
  open: '昨日非一字涨停今日开盘分布：昨日涨停股（剔除昨日全天只有一个价位的一字板）今日开盘价较昨收的涨跌幅分档；平开 = ±0.5% 以内，高开 ≥ +0.5%，低开 ≤ −0.5%。开盘价即集合竞价成交价。',
  loss: '大面 = 昨日涨停、今日跌幅 ≤ −7% 的股票家数；跌超 7% = 全市场当日跌幅 ≤ −7% 的家数（快照仓收盘价 ÷ 昨收）；炸板率 = 炸板 ÷（涨停 + 炸板）。',
  tagStats: '标签次日表现：每个交易日给个股打上标签，下一交易日用收盘价 ÷ 昨收算该股涨跌幅，按标签汇总所有样本的平均涨跌幅与红盘率（收盘上涨的比例）。这是已发生的历史统计，样本少时波动很大，不预示未来表现。',
  newHigh: '百日新高：当日最高价高于此前 99 个交易日的最高价（即 100 个交易日窗口内最高），价格按除权除息复权后比较。只统计窗口起点前已上市、窗口内至少 60 个交易日有行情的股票（剔除上市不足 100 个交易日的次新股与长期停牌股）。当日新增 = 今日新高且上一交易日不是新高。行业为东财行业分类。开盘啦 App 的「近 5 日创百日新高且未大幅回落」口径不同，这里只统计当日。',
  intraday: '盘中家数曲线是按股池时间还原的近似：涨停 = 收盘仍在涨停池的股票按首次封板时间累计；曾涨停 = 涨停池 + 炸板池按首次封板时间累计（炸板股开板的时间拿不到）；跌停 = 收盘在跌停池的股票按最后封板时间累计。盘中封住后又打开、最终不在股池里的股票不计入，所以和盘中实时家数会有出入。',
  skipped: '未提供：精选板块核心与龙虎榜动向的图解（见板块题材、龙虎榜页签）；涨停原因与题材归因（开盘啦自有数据）；按任意日期区间回看标签（本站从开始采集之日起逐日累积）；盘中实时的涨停 / 跌停家数（需要盘中逐笔数据，本页只在收盘后统计）。',
} as const
