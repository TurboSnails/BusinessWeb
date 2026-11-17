// 开盘啦 · 财报避雷页签数据模型：读 public/data/kpl-disclosure.json（scripts/kpl-disclosure.mjs 每个交易日盘后生成）。
// 金额单位为元，涨跌和同比为 %；null 表示数据源缺失（不是 0）。口径见 scripts/kpl-disclosure-lib.mjs 与页面说明。

export type Board = 'main' | 'gem' | 'star' | 'bj'
export type Consensus = { eps: number; actual: number; orgs: number; diff: number; label: 'beat' | 'miss' | 'inline' }
export type Perf = { start: string; base: string | null; d1: number | null; d3: number | null; d5: number | null }
export type DisclosureItem = {
  code: string
  name: string
  kind: 'forecast' | 'express' | 'report'
  period: string
  notice: string
  metric: string
  type: string | null
  profit: number | null
  profitLow: number | null
  profitHigh: number | null
  yoy: number | null
  yoyLow: number | null
  yoyHigh: number | null
  revenue: number | null
  revenueYoy: number | null
  eps: number | null
  consensus: Consensus | null
  perf: Perf | null
}
export type CalendarDay = { date: string; count: number; stocks: Array<{ code: string; name: string; period: string | null; label: string; change: string | null }> }
export type Disclosure = {
  from: string
  to: string
  windowDays: number
  counts: { forecast: number; express: number; report: number }
  truncated: boolean
  items: DisclosureItem[]
  calendar: { from: string; to: string; total: number; days: CalendarDay[]; next: { date: string; label: string } | null }
  progress: { period: string; label: string; total: number; published: number } | null
}

export type StreakRow = { code: string; name: string; board: Board; close: number | null; cap: number | null; days: number; capped: boolean; st: boolean; delisting: boolean; limit?: number | null }
export type FinRow = { code: string; name: string; board: Board; st: boolean; profit: number | null; deductEps: number | null; revenue: number | null; bps: number | null; limit?: number }
export type FinBlock = { period: string; label: string; lossLowRev: FinRow[]; negEquity: FinRow[] }
export type StChange = { code: string; name: string | null; prevName: string | null }
export type Risk = {
  date: string
  st: { count: number; star: number; list: Array<{ code: string; name: string; star: boolean }>; prevDate: string | null; added: StChange[] | null; removed: StChange[] | null }
  span: number
  face: StreakRow[]
  cap: StreakRow[]
  annual: FinBlock
  observe: FinBlock
  history: Array<{ date: string; st: number; face: number }>
}

export type HolderRow = { code: string; name: string; end: string; prevEnd: string | null; notice: string | null; holders: number | null; prevHolders?: number | null; change: number | null; streak: number; capped: boolean; cum: number | null; avgCap: number | null; close: number | null }
export type Holders = { date: string; total: number; falling: HolderRow[]; drop: HolderRow[]; rise: HolderRow[]; recent: HolderRow[]; fallingCount: number; since: string | null }

export type BlockTrade = { date: string; code: string; name: string; price: number | null; close: number | null; premium: number | null; volume: number | null; amount: number | null; pct: number | null; buyer: string; seller: string; freeRatio: number | null }
export type BlockStock = { code: string; name: string; count: number; days: number; amount: number | null; premium: number | null; instBuy: number | null; instBuyCount: number; last: string }
export type Block = {
  date: string
  count: number
  stocks: number
  amount: number | null
  premiumCount: number
  discountCount: number
  instBuy: { count: number; amount: number | null }
  items: BlockTrade[]
  window: { from: string | null; to: string | null; days: number; count: number; amount: number | null; top: BlockStock[]; inst: BlockStock[] }
}

export type SurveyRank = { code: string; name: string; events: number; orgs: number | null; last: string }
export type SurveyEvent = { code: string; name: string; notice: string; start: string | null; orgs: number | null; ways: string }
export type Survey = {
  short: { days: number; from: string; to: string; rank: SurveyRank[] }
  long: { days: number; from: string; to: string; rank: SurveyRank[]; events: number; stocks: number }
  latest: SurveyEvent[]
}

export type KplDisclosure = {
  version: 1
  generatedAt: string
  asOf: string
  note: string
  disclosure: Disclosure | null
  risk: Risk | null
  holders: Holders | null
  block: Block | null
  survey: Survey | null
  sources: Array<{ id: string; label: string; url: string }>
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isDate = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)
const arr = <T,>(x: unknown, ok: (v: unknown) => boolean = isObj): T[] => (Array.isArray(x) ? (x.filter(ok) as T[]) : [])
const isStock = (s: unknown): boolean => isObj(s) && typeof s.code === 'string' && typeof s.name === 'string'

function asDisclosure(x: unknown): Disclosure | null {
  if (!isObj(x) || !isDate(x.from) || !isDate(x.to) || !Array.isArray(x.items) || !isObj(x.calendar)) return null
  const c = x.calendar
  return {
    ...(x as unknown as Disclosure),
    counts: isObj(x.counts) ? (x.counts as Disclosure['counts']) : { forecast: 0, express: 0, report: 0 },
    items: arr<DisclosureItem>(x.items, s => isStock(s) && isObj(s) && isDate(s.notice) && isDate(s.period) && ['forecast', 'express', 'report'].includes(String(s.kind))),
    calendar: {
      from: String(c.from ?? ''), to: String(c.to ?? ''), total: typeof c.total === 'number' ? c.total : 0,
      days: arr<CalendarDay>(c.days, d => isObj(d) && isDate(d.date) && Array.isArray(d.stocks)),
      next: isObj(c.next) && isDate(c.next.date) ? (c.next as { date: string; label: string }) : null,
    },
    progress: isObj(x.progress) && typeof x.progress.total === 'number' ? (x.progress as Disclosure['progress']) : null,
  }
}
const asFin = (x: unknown): FinBlock => (isObj(x) ? { period: String(x.period ?? ''), label: String(x.label ?? ''), lossLowRev: arr(x.lossLowRev, isStock), negEquity: arr(x.negEquity, isStock) } : { period: '', label: '', lossLowRev: [], negEquity: [] })
function asRisk(x: unknown): Risk | null {
  if (!isObj(x) || !isDate(x.date) || !isObj(x.st)) return null
  const st = x.st
  return {
    date: x.date,
    st: {
      count: typeof st.count === 'number' ? st.count : 0, star: typeof st.star === 'number' ? st.star : 0, list: arr(st.list, isStock),
      prevDate: isDate(st.prevDate) ? st.prevDate : null,
      added: Array.isArray(st.added) ? arr(st.added, s => isObj(s) && typeof s.code === 'string') : null,
      removed: Array.isArray(st.removed) ? arr(st.removed, s => isObj(s) && typeof s.code === 'string') : null,
    },
    span: typeof x.span === 'number' ? x.span : 0,
    face: arr(x.face, isStock), cap: arr(x.cap, isStock),
    annual: asFin(x.annual), observe: asFin(x.observe),
    history: arr(x.history, h => isObj(h) && isDate(h.date)),
  }
}
function asHolders(x: unknown): Holders | null {
  if (!isObj(x) || !isDate(x.date)) return null
  return { date: x.date, total: Number(x.total) || 0, falling: arr(x.falling, isStock), drop: arr(x.drop, isStock), rise: arr(x.rise, isStock), recent: arr(x.recent, isStock), fallingCount: Number(x.fallingCount) || 0, since: isDate(x.since) ? x.since : null }
}
function asBlock(x: unknown): Block | null {
  if (!isObj(x) || !isDate(x.date) || !Array.isArray(x.items) || !isObj(x.window)) return null
  const w = x.window
  return {
    ...(x as unknown as Block),
    instBuy: isObj(x.instBuy) ? (x.instBuy as Block['instBuy']) : { count: 0, amount: null },
    items: arr(x.items, isStock),
    window: { from: isDate(w.from) ? w.from : null, to: isDate(w.to) ? w.to : null, days: Number(w.days) || 0, count: Number(w.count) || 0, amount: typeof w.amount === 'number' ? w.amount : null, top: arr(w.top, isStock), inst: arr(w.inst, isStock) },
  }
}
function asSurvey(x: unknown): Survey | null {
  if (!isObj(x) || !isObj(x.short) || !isObj(x.long)) return null
  const s = x.short, l = x.long
  return {
    short: { days: Number(s.days) || 5, from: String(s.from ?? ''), to: String(s.to ?? ''), rank: arr(s.rank, isStock) },
    long: { days: Number(l.days) || 20, from: String(l.from ?? ''), to: String(l.to ?? ''), rank: arr(l.rank, isStock), events: Number(l.events) || 0, stocks: Number(l.stocks) || 0 },
    latest: arr(x.latest, isStock),
  }
}

/** 结构校验：顶层缺失返回 null（页面显示「数据文件格式不对」）；单节格式不对时该节为 null，页面单独显示暂缺 */
export function asKplDisclosure(body: unknown): KplDisclosure | null {
  if (!isObj(body) || body.version !== 1 || !isDate(body.asOf) || typeof body.generatedAt !== 'string') return null
  return {
    version: 1, generatedAt: body.generatedAt, asOf: body.asOf, note: typeof body.note === 'string' ? body.note : '',
    disclosure: asDisclosure(body.disclosure), risk: asRisk(body.risk), holders: asHolders(body.holders), block: asBlock(body.block), survey: asSurvey(body.survey),
    sources: arr(body.sources, s => isObj(s) && typeof s.url === 'string'),
  }
}

export const KIND_LABEL: Record<DisclosureItem['kind'], string> = { forecast: '预告', express: '快报', report: '定期报告' }
export const BOARD_LABEL: Record<Board, string> = { main: '主板', gem: '创业板', star: '科创板', bj: '北交所' }
export const CONS_LABEL: Record<Consensus['label'], string> = { beat: '高于一致预期', miss: '低于一致预期', inline: '接近一致预期' }

/** 退市规则原文出处（页面逐条写明） */
export const RULE_SOURCE = {
  label: '上交所《股票上市规则（2024年4月修订）》（上证发〔2024〕51号）及深交所同期修订的《股票上市规则》《创业板股票上市规则》、上交所《科创板股票上市规则》',
  url: 'https://www.sse.com.cn/lawandrules/sselawsrules/repeal/rules/c/c_20240430_10777828.shtml',
  note: '2024 年 4 月 30 日发布；主板市值 5 亿元指标自 2024 年 10 月 30 日起施行，财务类新指标自 2024 年年报起适用。交易所之后的修订版延续了这些阈值；以交易所现行规则原文为准。',
}

/** 页面上写明的口径（与 scripts/kpl-disclosure-lib.mjs 一致） */
export const METHOD = {
  disclosure: '近 30 个自然日公告的业绩预告、业绩快报、定期报告（沪深京 A 股）。预告取归母净利润口径（没有时依次取扣非净利润、营业收入），净利润与同比为预告区间中值。',
  perf: '公告后表现：公告日是交易日就以当天为第 1 个反应日，否则顺延到下一交易日；基准为第 1 个反应日前一交易日收盘。第 1 / 3 / 5 日涨跌 = 第 k 个反应日收盘 ÷ 基准 − 1。用每日收盘价（未复权，除权除息日附近会有偏差），尚未走到的日子显示 —。这是历史统计，不预示后续走势。',
  consensus: '与一致预期比较：只比较年度（12 月 31 日）归母净利润口径，且至少 3 家机构有预测。快报 / 年报用基本每股收益；预告用净利润区间中值 ÷ 总股本。一致预期为东方财富汇总的机构预测 EPS 均值。偏差 = (实际 − 预期) ÷ |预期|，超过 +10% 记「高于一致预期」，低于 −10% 记「低于一致预期」，其余「接近」——这是本页自定的标签阈值。',
  calendar: '预约披露日期取东方财富「预约披露时间」（含变更后的日期），只列尚未披露的 A 股。11 月至 12 月中旬通常是定期报告空窗期，年报预约多在 12 月下旬以后陆续公布。',
  st: 'ST 名单：当日证券简称含「ST」的 A 股（*ST 为退市风险警示，ST 为其他风险警示）。新增 / 移除 = 与上一交易日的简称对比；简称变更在交易所公告的生效日体现。',
  face: '面值退市：沪深 A 股连续 20 个交易日每日收盘价均低于 1 元即触发。本表列出最近一个交易日收盘价低于 1 元的个股及已连续的交易日数（存档只回看 30 个交易日，满 30 日标「≥」）。数据源无法识别停牌日，停牌期间照常计数，以交易所公告为准。',
  cap: '市值退市：主板连续 20 个交易日每日收盘总市值均低于 5 亿元；创业板、科创板为 3 亿元。表中为最近一个交易日低于本板块阈值的个股及已连续天数。',
  annual: '财务类（年报口径）：主板「利润总额、净利润、扣非净利润孰低者为负」且「营业收入低于 3 亿元」，创业板 / 科创板营业收入阈值为 1 亿元；或「期末净资产为负」。公开报表没有利润总额和「营业收入扣除」金额，本页用「归母净利润 < 0 或扣非每股收益 < 0」近似利润条件、用营业总收入近似营业收入，结果可能与交易所认定不同。',
  observe: '季报观察（不是规则判断）：最近一期季报 / 中报的累计数据满足同样条件的个股——累计营收仍会在后续季度增加，是否触发以年报为准。',
  holders: '股东户数：最新一期户数较上一期的变化（上市公司在定期报告或互动平台披露，截止日不统一）。连降期数 = 从最新一期往前连续减少的期数（只回看约 11 个月，到头标「≥」）；累计降幅 = 最新户数 ÷ 连降开始前一期户数 − 1。上一期不足 200 户的（多为上市前的股东数，与上市后不可比）不进增减幅榜。连降超过 20 期按 20 期计并标「≥」。户数减少常被称为「筹码集中」，但不代表股价方向。',
  block: '大宗交易：沪深京 A 股当日成交明细，溢价率 = 成交价 ÷ 当日收盘价 − 1。近 20 日汇总按个股合计成交额，溢价率为按成交额加权；「机构专用买入」= 买方营业部为「机构专用」的成交。',
  survey: '机构调研：按上市公司披露调研记录的公告日统计。一次调研 = 一份调研记录（同一公告日、同一调研开始日），接待机构数取记录里的机构家数合计；同一机构多次参加会重复计数。',
  skip: '不做：开盘啦 App 的「潜在风险」自定义标签、信息披露违规与审计意见类风险（需要逐份读公告）、北交所退市指标（阈值与沪深不同，未纳入）、牛散追踪。',
} as const
