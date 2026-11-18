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
export type HolderRank = { code: string; name: string; inc: number; dec: number; net: number; netRatio: number | null; count: number; known: number; holders: number; missing: number }
export type HolderBlock = { from: string; to: string; count: number; incCount: number; decCount: number
  /** 该方向有记录但都没有成交均价时为 null（缺失，不是 0） */
  incAmount: number | null; decAmount: number | null; missing: number; incMissing?: number; decMissing?: number; rows: HolderRow[]; rank: { inc: HolderRank[]; dec: HolderRank[] } }

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
export type BuybackBlock = { from: string; to: string; count: number; counts: Record<string, number>; newPlans: number
  /** 只加披露了计划金额的预案；一份都没披露时为 null，部分缺失的份数见 *Missing */
  newPlanLow: number | null; newPlanHigh: number | null; newPlanLowMissing?: number; newPlanHighMissing?: number; rows: BuybackRow[] }

export type RatingChange = '上调' | '下调' | '首次' | '维持' | '无'
export type StockReport = {
  id: string; date: string; code: string; name: string; org: string
  /** 东方财富统一后的评级；sRating 为机构原文评级；last 为该机构上次评级 */
  rating: string | null; sRating: string | null; change: RatingChange | null; last: string | null
  /** 研报给出的目标价下限 / 上限（接口没有给时为 null，不估算） */
  aimLow: number | null; aimHigh: number | null
  /** closeDate 当天收盘（不复权）与目标价相对收盘的空间（%），没有目标价或停牌时为 null */
  close: number | null; upLow: number | null; upHigh: number | null
  ind: string | null; title: string; url: string | null
}
export type CoveredStock = { code: string; name: string; ind: string | null; count: number; orgs: number; latest: string; first: number; up: number }
export type IndustryCount = { name: string; n7: number; n30: number }
export type ReportsBlock = {
  /** 统计日：最近一个已完整的研报发布日 */
  day: string; w7: string; w30: string; missingDays: string[]
  /** 今天已收录、未计入统计的条数（北京时间 18:00 前列表还在增加） */
  pending: { date: string; stock: number; industry: number } | null
  dayStock: number; dayIndustry: number; counts: Record<string, number>
  stock7: number; stock30: number; industry7: number; industry30: number
  closeDate: string | null
  rows: StockReport[]; upgrades: StockReport[]; initiations: StockReport[]
  covered: CoveredStock[]; industries: IndustryCount[]
  daily: Array<{ date: string; stock: number; industry: number }>
  seed: { from: string; to: string } | null
}

export type DcDay = { date: string; subNew: number; brokeRate: number | null; medianCum: number | null; liftCount: number; liftCap: number | null; holderInc: number | null; holderDec: number | null; buybackCount: number; pledge50: number }

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
  /** 研报评级：这一段单独校验，缺失或格式不对时为 null（其他板块照常显示），原因见 reportsError */
  reports: ReportsBlock | null
  reportsError: string | null
  sources: Array<{ id: string; label: string; url: string }>
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
// 月份越界（如 2026-13-01）时 Date 无效，toISOString 会抛错，先判 NaN
const isDate = (x: unknown): x is string => { if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false; const t = Date.parse(`${x}T00:00:00Z`); return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === x }
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
const okRank = (r: unknown): boolean => stock(r) && isNum(r.net) && isNum(r.count) && isNullNum(r.netRatio)
const okPledge = (r: unknown): boolean => stock(r) && isNum(r.ratio) && nums(r, ['deals', 'shares', 'cap', 'y1'])
const okGoodwill = (r: unknown): boolean => stock(r) && isNum(r.ratio) && nums(r, ['goodwill', 'equity'])
const okBuyback = (r: unknown): boolean => stock(r) && isDate(r.notice) && typeof r.statusLabel === 'string' && nums(r, ['low', 'high', 'priceCap', 'amount', 'shares', 'avgPrice', 'progressLow', 'progressHigh'])
const okStat = (s: unknown): boolean => isObj(s) && isNum(s.n) && isNullNum(s.mean) && isNullNum(s.median)
const okCounts = (x: unknown): boolean => isObj(x) && Object.values(x).every(isNum)
const okSource = (s: unknown): boolean => isObj(s) && typeof s.label === 'string' && typeof s.url === 'string' && /^https:\/\//.test(s.url)

const CHANGES: ReadonlyArray<string | null> = ['上调', '下调', '首次', '维持', '无', null]
const isStr = (x: unknown): x is string => typeof x === 'string'
const isNullStr = (x: unknown): boolean => x === null || isStr(x)
const okReport = (r: unknown): boolean => stock(r) && isStr(r.id) && isDate(r.date) && isStr(r.org) && isStr(r.title) && isNullStr(r.rating) && isNullStr(r.sRating) && isNullStr(r.last) && isNullStr(r.ind)
  && CHANGES.includes(r.change as string | null) && nums(r, ['aimLow', 'aimHigh', 'close', 'upLow', 'upHigh'])
  && (r.url === null || (isStr(r.url) && /^https:\/\/data\.eastmoney\.com\/report\//.test(r.url)))
const okCovered = (r: unknown): boolean => stock(r) && isNum(r.count) && isNum(r.orgs) && isDate(r.latest)
const okIndustry = (r: unknown): boolean => isObj(r) && isStr(r.name) && isNum(r.n7) && isNum(r.n30)
/** 研报评级段校验：不通过返回 null，只隐藏这一段 */
export function asReports(x: unknown): ReportsBlock | null {
  if (!isObj(x) || !isDate(x.day) || !isDate(x.w7) || !isDate(x.w30) || !Array.isArray(x.missingDays) || !x.missingDays.every(isDate)) return null
  if (!['dayStock', 'dayIndustry', 'stock7', 'stock30', 'industry7', 'industry30'].every(k => isNum(x[k])) || !okCounts(x.counts) || !isNullDate(x.closeDate)) return null
  if (!allOk(x.rows, okReport) || !allOk(x.upgrades, okReport) || !allOk(x.initiations, okReport) || !allOk(x.covered, okCovered) || !allOk(x.industries, okIndustry)) return null
  if (!allOk(x.daily, d => isObj(d) && isDate(d.date) && isNum(d.stock) && isNum(d.industry))) return null
  if (x.pending !== null && !(isObj(x.pending) && isDate(x.pending.date) && isNum(x.pending.stock) && isNum(x.pending.industry))) return null
  // 统计日之后的研报不该出现在统计里；统计日列表必须都是统计日
  const day = x.day
  if ((x.rows as StockReport[]).some(r => r.date !== day) || [...(x.upgrades as StockReport[]), ...(x.initiations as StockReport[])].some(r => r.date > day || r.date < (x.w7 as string))) return null
  const seed = isObj(x.seed) && isDate(x.seed.from) && isDate(x.seed.to) ? { from: x.seed.from, to: x.seed.to } : null
  return { ...(x as unknown as ReportsBlock), seed }
}

/** 结构校验：任何一块缺失或字段类型不对都返回 null（页面显示 EmptyState），不展示半份数据 */
export function asThsDatacenter(body: unknown): ThsDatacenter | null {
  if (!isObj(body) || body.version !== 1 || !isDate(body.asOf) || typeof body.generatedAt !== 'string') return null
  const { ipo, lift, holders, pledge, goodwill, buyback } = body
  if (!isObj(ipo) || !allOk(ipo.calendar, okCal) || !allOk(ipo.recent, okSub) || !isObj(ipo.subNew) || !allOk(ipo.subNew.rows, okSub) || !isNum(ipo.subNew.valid) || !isNullNum(ipo.subNew.brokeRate)) return null
  if (!isObj(lift) || !isObj(lift.upcoming) || !isObj(lift.past) || !allOk(lift.upcoming.rows, okLift) || !allOk(lift.past.rows, okLift) || !Array.isArray(lift.upcoming.byDate) || !okStat(lift.past.d1) || !okStat(lift.past.d5) || !isNullNum(lift.upcoming.cap)) return null
  if (!isObj(holders) || !allOk(holders.rows, okHolder) || !isObj(holders.rank) || !allOk(holders.rank.inc, okRank) || !allOk(holders.rank.dec, okRank) || !isNullNum(holders.incAmount) || !isNullNum(holders.decAmount)) return null
  if (!isObj(pledge) || !isDate(pledge.date) || !allOk(pledge.rows, okPledge) || !okCounts(pledge.counts) || !isNum(pledge.total)) return null
  if (!isObj(goodwill) || !isDate(goodwill.period) || !allOk(goodwill.rows, okGoodwill) || !okCounts(goodwill.counts) || !isNum(goodwill.total)) return null
  if (!isObj(buyback) || !allOk(buyback.rows, okBuyback) || !okCounts(buyback.counts) || !isNum(buyback.count) || !isNullNum(buyback.newPlanLow) || !isNullNum(buyback.newPlanHigh)) return null
  // 数据日期之后的公告不该出现
  const asOf = body.asOf
  if ((holders.rows as HolderRow[]).some(r => r.notice > asOf) || (buyback.rows as BuybackRow[]).some(r => r.notice > asOf) || pledge.date > asOf) return null
  return {
    ...(body as unknown as ThsDatacenter),
    reports: asReports(body.reports),
    reportsError: body.reports != null && asReports(body.reports) === null ? '研报评级数据格式异常' : isStr(body.reportsError) ? body.reportsError : null,
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
  reportsDay: '统计日 = 最近一个已完整的研报发布日：研报在收盘后仍陆续入库，北京时间 18:00 前当天的列表不完整，先不计入（只显示已收录条数），取前一个有个股研报的自然日（周末也可能有研报）。研报发布日按东方财富研报中心的发布日期（只有日期，没有时刻）。评级为东方财富统一后的评级（括号内为机构原文评级）；评级变动是东方财富按该机构对该股的上一次评级标注的：上调、下调、维持、首次（该机构首次覆盖），空白为未标注。只列标题与原文链接，不转载正文。',
  reportsAim: '目标价只在研报给出时显示（东方财富接口的目标价上限 / 下限字段，多数研报没有）；空间 = 目标价 ÷ 收盘价 − 1，收盘价为页面注明日期的不复权日 K 收盘，当天停牌的留空，不用更早的价格。这是研报观点的数字整理，不是本站的判断。',
  reportsCovered: '以统计日结尾的近 30 个自然日内，个股研报篇数最多的 30 只（篇数相同按不同机构数）。「首次」「上调」为其中东方财富标注为首次覆盖、评级上调的篇数。篇数多只说明被关注，不代表评级方向。',
  reportsIndustry: '行业研报按东方财富标注的行业计数，窗口为以统计日结尾的近 7 / 30 个自然日；没有标注行业的记为「未标注行业」。',
  reportsUpgrade: '以统计日结尾的近 7 个自然日（每天的上调、首次通常只有几篇，所以放宽到 7 日）内东方财富标注为「上调」「首次」的个股研报。',
  skip: '同花顺的「潜伏日历」「国家队」「图解财报」等需要其自有数据或编辑内容，本页不做；研报评级用东方财富研报中心的公开列表，同花顺自有的研报库、研报正文和盈利预测一致预期不做；业绩预告/快报、ST 与退市风险、股东人数、大宗交易、机构调研见开盘啦「财报避雷」，停复牌见开盘啦「异动监管」。',
} as const
