// 同花顺 · 可转债页数据模型：读 public/data/ths-tab-cbond.json（scripts/ths-cbond.mjs 每个交易日收盘后生成）。
// 功能对照同花顺 App 可转债专区（convertibleBond / bondOpportunity / 选债）；列名沿用 App 选债字段。自算口径见 METHOD。

export type Bin = { label: string; n: number }
export type Summary = {
  count: number; priced: number; avgPrice: number | null; medianPrice: number | null; avgPremium: number | null; medianPremium: number | null
  up: number; down: number; flat: number; priceBins: Bin[]; premiumBins: Bin[]; pctBins: Bin[]
}
export type BondRow = {
  code: string; name: string; price: number | null; pct: number | null; stockCode: string; stockName: string; stockPrice: number | null; stockPct: number | null
  convPrice: number | null; convValue: number | null; premium: number | null; bondValue: number | null; ytm: number | null; remain: number | null
  years: number | null; rating: string | null; dualLow: number | null; redeemTrigger: number | null; expireRedeem: number | null
  expireDate: string | null; putStart: string | null; convStart: string | null; inConvert: boolean | null
}
export type DiscountRow = { code: string; name: string; price: number; convValue: number; premium: number; stockPct: number | null; gapPerLot: number | null; remain: number | null }
export type CallRow = {
  code: string; name: string; price: number | null; stockPrice: number | null; trigger: number | null; ratio: number | null; hit: number | null; need: number | null
  calc: number | null; window: number | null; status: 'announced' | 'counting' | 'promised'; note: string; partial: boolean; emText: string | null; emHit: number | null; remain: number | null
}
export type DownRow = {
  code: string; name: string; price: number | null; stockPrice: number | null; convPrice: number | null; trigger: number | null; ratio: number | null; hit: number | null
  need: number | null; calc: number | null; window: number | null; status: 'proposed' | 'counting' | 'paused'; note: string; emText: string | null; emHit: number | null; premium: number | null; remain: number | null
}
export type MaturityRow = {
  code: string; name: string; price: number | null; expireDate: string | null; years: number | null; expireRedeem: number | null; redeemGap: number | null; ytm: number | null
  inPut: boolean; putTrigger: number | null; putHit: number | null; putNeed: number | null; remain: number | null
}
export type IssueRow = {
  code: string; name: string; applyCode: string | null; stockCode: string; stockName: string; applyDate: string | null; recordDate: string | null; lotDate: string | null
  listDate: string | null; scale: number | null; rating: string | null; convPrice: number | null; perShare: number | null; winRate: number | null
  refPrice: number | null; refDate: string | null; rightsPer100: number | null; minShares: number | null
  firstOpen: number | null; firstClose: number | null; firstPct: number | null; profitPerLot: number | null
}
export type HistoryDay = {
  date: string; count: number; avgPrice: number | null; medianPrice: number | null; avgPremium: number | null; medianPremium: number | null
  up: number; down: number; priceBins: number[]; source: 'report' | 'snapshot'; backfilled?: boolean
}

export type ThsCbond = {
  version: 1
  generatedAt: string
  asOf: string
  source: 'report' | 'snapshot'
  note: string
  index: { close: number | null; pct: number | null; prevClose: number | null }
  summary: Summary
  rows: BondRow[]
  discount: DiscountRow[]
  call: CallRow[]
  clauseCheck: { agree: number; total: number; asOf: string | null }
  down: DownRow[]
  maturity: MaturityRow[]
  issues: IssueRow[]
  rights: IssueRow[]
  history: HistoryDay[]
  indexHistory: Array<{ date: string; close: number | null }>
  sources: Array<{ id: string; label: string; url: string }>
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isDate = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)
const rowsOk = (x: unknown): boolean => Array.isArray(x) && x.every(r => isObj(r) && typeof r.code === 'string' && typeof r.name === 'string')
const list = <T,>(x: unknown, ok = rowsOk): T[] => (ok(x) ? (x as T[]) : [])
const binsOk = (x: unknown): boolean => Array.isArray(x) && x.every(b => isObj(b) && typeof b.label === 'string' && typeof b.n === 'number')

/** 结构校验：关键字段缺失返回 null（页面显示「数据文件格式不对」）；次要列表缺失按空列表显示 */
export function asThsCbond(body: unknown): ThsCbond | null {
  if (!isObj(body) || body.version !== 1 || !isDate(body.asOf)) return null
  const s = body.summary
  if (!isObj(s) || typeof s.count !== 'number' || !binsOk(s.priceBins) || !binsOk(s.premiumBins) || !binsOk(s.pctBins)) return null
  if (!rowsOk(body.rows)) return null
  const idx = isObj(body.index) ? body.index : {}
  return {
    ...(body as unknown as ThsCbond),
    source: body.source === 'snapshot' ? 'snapshot' : 'report',
    index: { close: typeof idx.close === 'number' ? idx.close : null, pct: typeof idx.pct === 'number' ? idx.pct : null, prevClose: typeof idx.prevClose === 'number' ? idx.prevClose : null },
    discount: list<DiscountRow>(body.discount),
    call: list<CallRow>(body.call),
    clauseCheck: isObj(body.clauseCheck) && typeof body.clauseCheck.agree === 'number' ? (body.clauseCheck as ThsCbond['clauseCheck']) : { agree: 0, total: 0, asOf: null },
    down: list<DownRow>(body.down),
    maturity: list<MaturityRow>(body.maturity),
    issues: list<IssueRow>(body.issues),
    rights: list<IssueRow>(body.rights),
    history: list<HistoryDay>(body.history, x => Array.isArray(x) && x.every(d => isObj(d) && isDate(d.date))),
    indexHistory: list(body.indexHistory, x => Array.isArray(x) && x.every(d => isObj(d) && isDate(d.date))),
    sources: Array.isArray(body.sources) ? (body.sources as ThsCbond['sources']) : [],
    note: typeof body.note === 'string' ? body.note : '',
  }
}

/** 页面上写明的口径（与 scripts/ths-cbond-lib.mjs 一致） */
export const METHOD = {
  universe: '统计范围：东财转债列表中当日已上市、未退市、未到期的公开发行可转债（不含定向转债、可交换债）。',
  overview: '价格、转股价值、纯债价值、转股溢价率取东财可转债逐日估值表的当日收盘数据；价格中位数、平均 / 中位转股溢价率按上述范围内所有有收盘价的转债计算（等权，不按规模加权）。涨跌按当日收盘较上一交易日收盘计算。分布区间左闭右开。',
  history: '走势：每日运行时记录一天；首次运行按东财逐日估值表回补最近约一年（同一口径，标注为「回补」）。中证转债指数（000832）走势取东财日 K。',
  dualLow: '双低 = 价格 + 转股溢价率（以百分数计，即溢价率 × 100）。数值越小表示价格和溢价率同时较低，是常见的筛选口径，不代表收益。',
  ytm: '到期税前收益率：按收盘价（转债为全价交易）买入并持有到期，收取剩余各年票息（条款表票面利率）和到期赎回价（一般已含最后一年利息），求年化复利收益率。不计利息税（个人 20%）与交易费用，不考虑提前赎回、回售或违约。',
  remain: '剩余规模取东财条款表的未转股余额（按最近一次披露更新，不是当日实时数）；评级取条款表最新评级，缺失时用发行评级。剩余年限 = 距到期日天数 ÷ 365。',
  discount: '折价转股：转股溢价率 < 0 且已进入转股期。每手（10 张）理论价差 = （转股价值 − 价格）× 10 元。这是收盘后的统计，不是套利建议：转股当日申报、次一交易日才能卖出正股（T+1），期间正股可能下跌吞掉价差；另有佣金、过户费、印花税（卖出股票）等成本，转股不足 1 股部分以现金兑付，部分转债停止转股或临近强赎最后交易日时无法操作。',
  call: '强赎进度：只列已公告强赎、承诺不强赎期内，或已有满足天数的转股期内转债。在正股最近 N 个交易日（条款中的计算期，多为 30 日）里，收盘价 ≥ 当期转股价 × 触发比例（多为 130%）的天数，与条款要求的天数（多为 15 日）对照。只从转股期开始日、最近一次转股价调整日、上次「不强赎」承诺期结束日之后计数；转股价近期调整过的标「调整后计」，不使用调整前的转股价，可能少计。状态「已公告强赎」「承诺不强赎」来自东财条款表对公司公告的整理。',
  down: '下修进度：正股最近 N 个交易日（多为 30 日）里收盘价 < 当期转股价 × 下修触发比例（多为 85%）的天数。公司公告「暂不下修」后要从约定日期重新计数，这个日期只在东财条款表里，过期后不再显示，所以「天数」列以东财条款表为准，「本站机械计数」按日 K 和当前转股价在整个窗口里数，未扣除已过期的重算期，可能偏多，只作对照。达到天数后董事会「有权」提出下修，是否下修、下修到多少由公司决定，不是必然事件。「董事会已提议」「暂不下修」「已触发」来自东财条款表对公司公告的整理。只列已提议、暂不下修期内、已触发，或天数达到要求一半以上的转债。',
  clause: '东财条款表不带更新日期。本站每天用自算的强赎天数和条款表里的强赎天数比对，绝大多数一致时才标为「已核对到当日」；否则提示条款表可能滞后一天。',
  maturity: '即将到期：剩余年限 ≤ 1 年；到期价差 = 到期赎回价 − 当前价格（每张，元，未计税）。回售：已进入回售期（条款表回售起始日之后）的转债，回售计数为截至当日正股收盘价连续低于当期转股价 × 回售触发比例（多为 70%）的天数，条款多要求连续 30 个交易日；回售价多为面值加当期应计利息，以公司公告为准。',
  issues: '打新债：东财转债列表中最近 45 天内申购的公开发行转债。中签率为网上发行中签率（%）；首日开盘 / 收盘取转债日 K 第一根（上市日）；每签收益为东财口径，按上市首日成交均价计算：（均价 − 100）× 10 元。',
  rights: '抢权配债：股权登记日在今天或之后、仍可买入正股参与原股东优先配售的发行。百元股票含权 = 每股配售额 ÷ 正股收盘价 × 100，即每 100 元正股市值可配售的转债面值（元）；股权登记日已过时按登记日收盘价，未到时按最新收盘价。最低配售所需股数 = 1000 ÷ 每股配售额，向上取整到 100 股，即配到 1 手（10 张、面值 1000 元）大约需要的股数；沪市按精确算法、深市按张配售，实际可配数量以发行公告为准。登记日后正股常见除权式回落，配售与否不构成建议。',
  skipped: '未做：转债盘中实时行情与分时（本页只做收盘后统计）；同花顺自有的期权价值、正股波动率、持仓基金数、方案进展（预案 / 股东大会 / 注册等未公告发行的阶段）——没有可靠的公开结构化来源；集思录数据需要登录，不使用。',
} as const

/** 选债表的预设筛选 */
export const FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'dual', label: '双低前 30' },
  { id: 'lowPremium', label: '低溢价 <10%' },
  { id: 'lowPrice', label: '低价 <110' },
  { id: 'ytm', label: '到期收益率 >0' },
] as const
export type FilterId = (typeof FILTERS)[number]['id']

export function applyFilter(rows: BondRow[], id: FilterId): BondRow[] {
  switch (id) {
    case 'dual': return rows.filter(r => r.dualLow !== null).sort((a, b) => (a.dualLow as number) - (b.dualLow as number)).slice(0, 30)
    case 'lowPremium': return rows.filter(r => r.premium !== null && r.premium < 10)
    case 'lowPrice': return rows.filter(r => r.price !== null && r.price < 110)
    case 'ytm': return rows.filter(r => r.ytm !== null && r.ytm > 0)
    default: return rows
  }
}
