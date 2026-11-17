// 同花顺 · 数据中心页签数据模型：读 public/data/ths-tab-datacenter.json（scripts/ths-datacenter.mjs 每个交易日盘后生成）。
// 金额单位为元，股数单位为万股，比例单位为 %；null 表示数据源缺失（不是 0）。口径见 scripts/ths-datacenter-lib.mjs 与页面说明。

export type IpoCal = {
  code: string; name: string; board: string; applyCode: string | null
  applyDate: string; ballotDate: string | null; listDate: string | null
  issuePrice: number | null; issuePe: number | null; industryPe: number | null
  /** 网上中签率（%） */
  lotRate: number | null
  /** 发行市盈率相对行业市盈率（%）：发行 PE ÷ 行业 PE − 1 */
  peDiff: number | null
  status: '待申购' | '待上市' | '已上市'
}
export type SubNew = {
  code: string; name: string; board: string; listDate: string
  issuePrice: number | null; issuePe: number | null
  firstPct: number | null; cumPct: number | null; sinceFirstPct: number | null
  days: number | null; broke: boolean | null
}
export type SubNewBlock = { from: string; to: string; count: number; valid: number; brokeCount: number; brokeRate: number | null; medianCum: number | null; medianFirst: number | null; rows: SubNew[] }

export type LiftRow = {
  code: string; name: string; date: string; type: string
  shares: number | null; able: number | null; ratio: number | null; totalRatio: number | null
  close: number | null; cap: number | null
  tDate?: string | null; d1?: number | null; d5?: number | null
}
export type PerfStat = { n: number; mean: number | null; median: number | null; up: number }
export type LiftBlock = {
  upcoming: { from: string; to: string; count: number; cap: number | null; capMissing: number; byDate: Array<{ date: string; count: number; cap: number; capMissing: number }>; rows: LiftRow[] }
  past: { from: string; to: string; count: number; d1: PerfStat; d5: PerfStat; rows: LiftRow[] }
}

export type HolderRow = {
  code: string; name: string; holder: string; dir: '增持' | '减持'; notice: string
  shares: number | null; ratio: number | null; start: string | null; end: string | null
  avgPrice: number | null; amount: number | null; way: string | null
}
export type HolderRank = { code: string; name: string; inc: number; dec: number; net: number; netRatio: number; count: number; known: number; holders: number; missing: number }
export type HolderBlock = { from: string; to: string; count: number; incCount: number; decCount: number; incAmount: number; decAmount: number; missing: number; rows: HolderRow[]; rank: { inc: HolderRank[]; dec: HolderRank[] } }

export type PledgeRow = { code: string; name: string; industry: string | null; ratio: number; deals: number | null; shares: number | null; cap: number | null; y1: number | null }
export type PledgeBlock = { date: string; total: number; counts: Record<string, number>; rows: PledgeRow[] }
export type GoodwillRow = { code: string; name: string; industry: string | null; goodwill: number | null; equity: number | null; ratio: number; notice: string | null }
export type GoodwillBlock = { period: string; total: number; negative: number; counts: Record<string, number>; rows: GoodwillRow[] }

export type BuybackRow = {
  code: string; name: string; status: string; statusLabel: string
  notice: string; planDate: string | null; start: string | null
  low: number | null; high: number | null; priceCap: number | null
  amount: number | null; shares: number | null; avgPrice: number | null
  progressLow: number | null; progressHigh: number | null
}
export type BuybackBlock = { from: string; to: string; count: number; counts: Record<string, number>; newPlans: number; newPlanLow: number; newPlanHigh: number; rows: BuybackRow[] }

export type DcDay = { date: string; subNew: number; brokeRate: number | null; medianCum: number | null; liftCount: number; liftCap: number | null; holderInc: number; holderDec: number; buybackCount: number; pledge50: number }

export type ThsDatacenter = {
  version: 1
  generatedAt: string
  asOf: string
  note: string
  ipo: { calendar: IpoCal[]; recent: SubNew[]; subNew: SubNewBlock }
  lift: LiftBlock
  holders: HolderBlock
  pledge: PledgeBlock
  goodwill: GoodwillBlock
  buyback: BuybackBlock
  history: DcDay[]
  sources: Array<{ id: string; label: string; url: string }>
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isDate = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && new Date(`${x}T00:00:00Z`).toISOString().slice(0, 10) === x
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const isNullNum = (x: unknown): boolean => x === null || isNum(x)
const isNullDate = (x: unknown): boolean => x === null || isDate(x)
const isCode = (x: unknown): boolean => typeof x === 'string' && /^\d{6}$/.test(x)
const stock = (r: unknown): r is Record<string, unknown> => isObj(r) && isCode(r.code) && typeof r.name === 'string'
const allOk = (x: unknown, ok: (r: unknown) => boolean): boolean => Array.isArray(x) && x.every(ok)
const nums = (r: Record<string, unknown>, keys: string[]): boolean => keys.every(k => isNullNum(r[k]))

const okCal = (r: unknown): boolean => stock(r) && isDate(r.applyDate) && isNullDate(r.listDate) && isNullDate(r.ballotDate) && nums(r, ['issuePrice', 'issuePe', 'industryPe', 'lotRate', 'peDiff']) && ['待申购', '待上市', '已上市'].includes(r.status as string)
const okSub = (r: unknown): boolean => stock(r) && isDate(r.listDate) && nums(r, ['issuePrice', 'issuePe', 'firstPct', 'cumPct', 'sinceFirstPct', 'days']) && (r.broke === null || typeof r.broke === 'boolean')
const okLift = (r: unknown): boolean => stock(r) && isDate(r.date) && typeof r.type === 'string' && nums(r, ['shares', 'able', 'ratio', 'totalRatio', 'close', 'cap']) && (r.d1 === undefined || isNullNum(r.d1)) && (r.d5 === undefined || isNullNum(r.d5))
const okHolder = (r: unknown): boolean => stock(r) && (r.dir === '增持' || r.dir === '减持') && isDate(r.notice) && typeof r.holder === 'string' && nums(r, ['shares', 'ratio', 'avgPrice', 'amount'])
const okRank = (r: unknown): boolean => stock(r) && isNum(r.net) && isNum(r.count)
const okPledge = (r: unknown): boolean => stock(r) && isNum(r.ratio) && nums(r, ['deals', 'shares', 'cap', 'y1'])
const okGoodwill = (r: unknown): boolean => stock(r) && isNum(r.ratio) && nums(r, ['goodwill', 'equity'])
const okBuyback = (r: unknown): boolean => stock(r) && isDate(r.notice) && typeof r.statusLabel === 'string' && nums(r, ['low', 'high', 'priceCap', 'amount', 'shares', 'avgPrice', 'progressLow', 'progressHigh'])
const okStat = (s: unknown): boolean => isObj(s) && isNum(s.n) && isNullNum(s.mean) && isNullNum(s.median)
const okCounts = (x: unknown): boolean => isObj(x) && Object.values(x).every(isNum)
const okSource = (s: unknown): boolean => isObj(s) && typeof s.label === 'string' && typeof s.url === 'string' && /^https:\/\//.test(s.url)

/** 结构校验：任何一块缺失或字段类型不对都返回 null（页面显示 EmptyState），不展示半份数据 */
export function asThsDatacenter(body: unknown): ThsDatacenter | null {
  if (!isObj(body) || body.version !== 1 || !isDate(body.asOf) || typeof body.generatedAt !== 'string') return null
  const { ipo, lift, holders, pledge, goodwill, buyback } = body
  if (!isObj(ipo) || !allOk(ipo.calendar, okCal) || !allOk(ipo.recent, okSub) || !isObj(ipo.subNew) || !allOk(ipo.subNew.rows, okSub) || !isNum(ipo.subNew.valid) || !isNullNum(ipo.subNew.brokeRate)) return null
  if (!isObj(lift) || !isObj(lift.upcoming) || !isObj(lift.past) || !allOk(lift.upcoming.rows, okLift) || !allOk(lift.past.rows, okLift) || !Array.isArray(lift.upcoming.byDate) || !okStat(lift.past.d1) || !okStat(lift.past.d5) || !isNullNum(lift.upcoming.cap)) return null
  if (!isObj(holders) || !allOk(holders.rows, okHolder) || !isObj(holders.rank) || !allOk(holders.rank.inc, okRank) || !allOk(holders.rank.dec, okRank) || !isNum(holders.incAmount) || !isNum(holders.decAmount)) return null
  if (!isObj(pledge) || !isDate(pledge.date) || !allOk(pledge.rows, okPledge) || !okCounts(pledge.counts) || !isNum(pledge.total)) return null
  if (!isObj(goodwill) || !isDate(goodwill.period) || !allOk(goodwill.rows, okGoodwill) || !okCounts(goodwill.counts) || !isNum(goodwill.total)) return null
  if (!isObj(buyback) || !allOk(buyback.rows, okBuyback) || !okCounts(buyback.counts) || !isNum(buyback.count)) return null
  // 数据日期之后的公告不该出现
  const asOf = body.asOf
  if ((holders.rows as HolderRow[]).some(r => r.notice > asOf) || (buyback.rows as BuybackRow[]).some(r => r.notice > asOf) || pledge.date > asOf) return null
  return {
    ...(body as unknown as ThsDatacenter),
    history: Array.isArray(body.history) ? (body.history as DcDay[]).filter(d => isObj(d) && isDate(d.date)) : [],
    sources: Array.isArray(body.sources) ? (body.sources as ThsDatacenter['sources']).filter(okSource) : [],
  }
}

/* ---------- 格式 ---------- */
const fin = (x: number | null | undefined): x is number => x != null && Number.isFinite(x)
const minus = (s: string): string => s.replace('-', '−')
/** 金额（元）→ 亿 / 万；缺失「—」 */
export const money = (x: number | null | undefined, signed = false): string => {
  if (!fin(x)) return '—'
  const a = Math.abs(x)
  const body = a >= 1e8 ? `${(a / 1e8).toFixed(2)} 亿` : `${Math.round(a / 1e4)} 万`
  return `${x < 0 ? '−' : signed && x > 0 ? '+' : ''}${body}`
}
export const pct = (x: number | null | undefined, signed = true, d = 2): string => (fin(x) ? `${signed && x > 0 ? '+' : ''}${minus(x.toFixed(d))}%` : '—')
export const fixed = (x: number | null | undefined, d = 2): string => (fin(x) ? minus(x.toFixed(d)) : '—')
/** 万股 → 万股 / 亿股 */
export const shares = (x: number | null | undefined): string => (!fin(x) ? '—' : Math.abs(x) >= 1e4 ? `${(x / 1e4).toFixed(2)} 亿股` : `${x >= 100 ? Math.round(x) : x.toFixed(2)} 万股`)
export const tone = (x: number | null | undefined): string => (!fin(x) || x === 0 ? '' : x > 0 ? 'mm-up' : 'mm-down')
export const md = (d: string | null | undefined): string => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : '—')

/** 页面上写明的口径（与 scripts/ths-datacenter-lib.mjs 一致） */
export const METHOD = {
  calendar: '申购日在数据日期前 30 天以来的新股（含已公布、尚未申购的）。发行市盈率为发行价对应的摊薄后市盈率；行业市盈率为东方财富报表给出的所属行业市盈率；「相对行业」= 发行市盈率 ÷ 行业市盈率 − 1。中签率为网上发行中签率。尚未定价的新股发行价、市盈率留空。',
  subNew: '次新股：上市不满一年（上市日在数据日期前 365 天以内）。累计涨幅 = 数据日期后复权收盘价 ÷ 发行价 − 1（后复权以上市首日为基准，分红送转已折算进去）；首日涨幅 = 上市首日收盘 ÷ 发行价 − 1；首日以来 = 后复权收盘 ÷ 首日收盘 − 1。破发 = 累计涨幅为负。数据日期当天停牌的个股表现留空，不计入破发率和中位数。',
  liftUp: '解禁日在数据日期之后 30 个自然日内。解禁股数为本次解禁数量；占流通股比为东方财富口径（解禁股数 ÷ 东方财富记录的流通股数，解禁前流通股很少的首发解禁可能超过 100%），另列占总股本比。解禁市值 = 解禁股数 × 数据日期收盘价（不用报表里不带日期的「最新价」）；数据日期停牌的留空。',
  liftPast: '解禁日在数据日期前 30 个自然日内（含当天）。T 为解禁日当天或之后第一个交易日，基准为 T 前一个交易日的前复权收盘价：「T 日」= T 收盘相对基准，「5 日」= 从 T 起第 5 个交易日收盘相对基准，尚不足 5 个交易日的留空。这是历史统计，不预示后续走势。',
  holders: '公告日在数据日期前 30 个自然日内、东方财富「股东增减持」报表收录的重要股东增减持记录（方式为二级市场竞价或大宗交易）。变动占比 = 变动股数 ÷ 总股本。金额 = 变动股数 × 公告披露的成交均价；公告没有披露均价的（如指数基金被动调仓、按月汇总披露）金额留空、不用收盘价估算。同一公告可能分多条披露不同期间的变动。',
  holderRank: '按个股汇总近 30 日的增减持金额（增持为正、减持为负），只加有成交均价的记录；一条都没有均价的个股不进排行。「股本占比合计」= 各条变动占总股本比的代数和，不受均价缺失影响。',
  pledge: '中国结算每周公布的股权质押统计（统计日为周五），质押比例 = 质押股数 ÷ 总股本。表中为质押比例最高的 50 只；阈值家数为质押比例 ≥ 50%、≥ 30% 的 A 股数量。只列数值，不做风险评级。',
  goodwill: '取最近一个法定披露截止日已过的报告期（一季报 4/30、半年报 8/31、三季报 10/31）。商誉占净资产 = 期末商誉 ÷ 期末净资产；净资产为负的公司比例没有意义，单列家数、不进排行。阈值家数为比例 ≥ 100%、≥ 50%、≥ 30% 的公司数。只列数值，不做风险评级。',
  buyback: '最新公告日在数据日期前 30 个自然日内的 A 股回购方案。进度 = 已回购金额 ÷ 计划金额下限（括号内为 ÷ 上限）；预案阶段尚未回购的留空。进度状态取东方财富回购页的代码表（董事会预案、股东大会通过、实施中、完成实施、停止实施等），东方财富未标注文字的记为「未标注」。',
  skip: '同花顺的「潜伏日历」「国家队」「图解财报」「研报」等需要其自有数据或编辑内容，本页不做；业绩预告/快报、ST 与退市风险、股东人数、大宗交易、机构调研见开盘啦「财报避雷」，停复牌见开盘啦「异动监管」。',
} as const
