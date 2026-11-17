// 开盘啦 · 竞价尾盘页数据模型：读 public/data/kpl-auction.json（scripts/kpl-auction.mjs 每个交易日收盘后生成）。
// 功能对照开盘啦 App「早盘竞价 / 板块竞价 / 尾盘抢筹」；只用盘后公开分时，口径见 METHOD 与 scripts/kpl-auction-lib.mjs。

export type Tag = 'top' | 'zt' | 'yzt'
export type StockRow = {
  code: string; name: string; industry: string; tags: Tag[]; yBoards: number | null
  auctionPrice: number | null; auctionPct: number | null; auctionAmount: number | null; auctionRatio: number | null; auctionShare: number | null
  closePct: number | null; afterAuctionPct: number | null; dayAmount: number | null
  closeAuctionPct: number | null; closeAuctionAmount: number | null; closeAuctionShare: number | null
}
export type IndexRow = {
  code: string; name: string; kind: 'index' | 'industry' | 'concept'
  auctionPct: number | null; auctionAmount: number | null; prevAuctionAmount: number | null; auctionRatio: number | null; auctionShare: number | null
  closePct: number | null; afterAuctionPct: number | null; dayAmount: number | null
  closeAuctionPct: number | null; closeAuctionAmount: number | null; closeAuctionShare: number | null
}
export type Buckets = Record<'le5' | 'm5' | 'm2' | 'flat' | 'p2' | 'p5' | 'ge5', number>
export type Group = {
  n: number; highOpen: number; lowOpen: number; flat: number; highOpenRate: number | null; avgAuctionPct: number | null
  avgAfterAuction: number | null; avgClosePct: number | null; auctionAmount: number; buckets: Buckets
}
export type Market = {
  date: string; prevDate: string | null; auctionAmount: number | null; closeAuctionAmount: number | null; dayAmount: number | null
  auctionShare: number | null; closeAuctionShare: number | null; prevAuctionAmount: number | null; prevCloseAuctionAmount: number | null; prevDayAmount: number | null
  shAuction: number | null; szAuction: number | null; shCloseAuction: number | null; szCloseAuction: number | null
}
export type HistoryDay = {
  date: string; backfilled?: boolean; auctionAmount: number | null; closeAuctionAmount: number | null; dayAmount: number | null
  auctionShare: number | null; closeAuctionShare: number | null; n: number | null; highOpenRate: number | null; avgAuctionPct: number | null
  avgAfterAuction: number | null; yztN: number | null; yztAvgAuction: number | null
}
export type Universe = { topN: number; candidates: number; used: number; failed: number; stale: number; pools: boolean; zt: number; yzt: number }

export type KplAuction = {
  version: 1
  generatedAt: string
  asOf: string
  prevDate: string
  note: string
  market: Market
  universe: Universe
  groups: { all: Group; top: Group; yzt: Group; zt: Group }
  indexes: IndexRow[]
  boards: IndexRow[]
  stocks: StockRow[]
  history: HistoryDay[]
  sources: Array<{ id: string; label: string; url: string }>
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isDate = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)
const rowsOk = (x: unknown): boolean => Array.isArray(x) && x.every(r => isObj(r) && typeof r.code === 'string' && typeof r.name === 'string')
const groupOk = (g: unknown): g is Group => isObj(g) && typeof g.n === 'number' && isObj(g.buckets)
const EMPTY_GROUP: Group = { n: 0, highOpen: 0, lowOpen: 0, flat: 0, highOpenRate: null, avgAuctionPct: null, avgAfterAuction: null, avgClosePct: null, auctionAmount: 0, buckets: { le5: 0, m5: 0, m2: 0, flat: 0, p2: 0, p5: 0, ge5: 0 } }

/** 结构校验：关键字段缺失返回 null（页面显示「数据文件格式不对」）；次要列表缺失按空列表显示 */
export function asKplAuction(body: unknown): KplAuction | null {
  if (!isObj(body) || body.version !== 1 || !isDate(body.asOf)) return null
  const m = body.market
  if (!isObj(m) || !isDate(m.date) || m.date !== body.asOf) return null
  if (!rowsOk(body.stocks) || !isObj(body.groups)) return null
  const g = body.groups
  const u = isObj(body.universe) ? body.universe : {}
  return {
    ...(body as unknown as KplAuction),
    stocks: (body.stocks as StockRow[]).map(r => ({ ...r, tags: Array.isArray(r.tags) ? r.tags : [], industry: r.industry ?? '' })),
    groups: { all: groupOk(g.all) ? g.all : EMPTY_GROUP, top: groupOk(g.top) ? g.top : EMPTY_GROUP, yzt: groupOk(g.yzt) ? g.yzt : EMPTY_GROUP, zt: groupOk(g.zt) ? g.zt : EMPTY_GROUP },
    universe: { topN: 0, candidates: 0, used: 0, failed: 0, stale: 0, pools: false, zt: 0, yzt: 0, ...(u as Partial<Universe>) },
    indexes: rowsOk(body.indexes) ? (body.indexes as IndexRow[]) : [],
    boards: rowsOk(body.boards) ? (body.boards as IndexRow[]) : [],
    history: Array.isArray(body.history) && body.history.every(d => isObj(d) && isDate(d.date)) ? (body.history as HistoryDay[]) : [],
    sources: Array.isArray(body.sources) ? (body.sources as KplAuction['sources']) : [],
    note: typeof body.note === 'string' ? body.note : '',
    prevDate: isDate(body.prevDate) ? body.prevDate : '',
  }
}

export const BUCKETS: Array<{ key: keyof Buckets; label: string; up: boolean | null }> = [
  { key: 'le5', label: '≤−5%', up: false }, { key: 'm5', label: '−5~−2%', up: false }, { key: 'm2', label: '−2~0%', up: false },
  { key: 'flat', label: '平开', up: null }, { key: 'p2', label: '0~2%', up: true }, { key: 'p5', label: '2~5%', up: true }, { key: 'ge5', label: '≥5%', up: true },
]

/** 页面上写明的口径（与 scripts/kpl-auction-lib.mjs 一致） */
export const METHOD = {
  source: '数据来自东方财富分钟线（每根带日期，收盘后可取近 5 个交易日）。实测：每天 09:30 那根只含 9:25 开盘集合竞价的撮合成交，价格即开盘价；15:00 那根只含 14:57–15:00 收盘集合竞价的撮合成交，价格即收盘价；14:58、14:59 两根基本没有成交。',
  auction: '竞价涨幅 = 开盘集合竞价成交价 ÷ 昨收 − 1；竞价金额 = 开盘集合竞价撮合成交额；竞价占比 = 竞价金额 ÷ 全天成交额（不含科创板 / 创业板盘后固定价格交易）；收盘较竞价 = 收盘价 ÷ 竞价成交价 − 1。竞价没有撮合成交的股票，竞价涨幅记为空。',
  ratio: '竞价量比 = 今日竞价金额 ÷ 上一交易日竞价金额（本站口径；开盘啦的竞价量比用的是历史同期均量，本站拿不到）。上一交易日缺数据时为空。',
  universe: '个股范围：收盘成交额前 400 的沪深 A 股 + 当日涨停股 + 昨日涨停股（东财涨停池），不含北交所。成交额排名取自东财行情列表，并用分时全天成交额逐只核对确属当日；全市场逐只拉分时太慢，所以不覆盖全部 A 股。',
  market: '两市竞价金额 = 上证综指 + 深证综指分时首根成交额（东财指数成交额即沪 / 深全市场合计，不含北交所）；尾盘竞价金额同理取 15:00 那根。',
  boards: '板块竞价用东财板块指数自己的分时：行业为东财行业（申万二级口径，全部约 130 个），概念为当日成交额前 50 的概念板块（剔除昨日涨停、融资融券等统计类板块）。板块竞价金额 = 成分股竞价成交额合计。',
  close: '尾盘竞价：参考价 = 14:59 那根的收盘价（收盘集合竞价开始前最后的连续竞价价格），尾盘竞价涨幅 = 收盘价 ÷ 参考价 − 1，尾盘竞价金额 = 15:00 那根成交额，尾盘占比 = 尾盘竞价金额 ÷ 全天成交额。沪深两市都有收盘集合竞价，这里一并统计（开盘啦「尾盘抢筹」只统计深市）。',
  history: '历史：每个交易日收盘后累积。分钟线可回取近 5 个交易日，首次运行据此回补（图中浅色虚线）；回补日的高开率、平均竞价涨幅按首次运行那天成交额前 400 的股票计算，不是回补日当天的前 400，只作参考；昨日涨停竞价均值不回补。',
  skipped: '没有做的：涨停委买额、20 分后涨停委买、竞价未匹配量、竞价净额、竞价大单买 / 卖、大单净额与大单买占比（需要 L2 逐笔或盘中竞价快照）；竞价换手、实际流通（需要自由流通股本，本页未接入）；风口概念（开盘啦自有题材库）；盘中实时的竞价异动与「预测总成交」。',
} as const
