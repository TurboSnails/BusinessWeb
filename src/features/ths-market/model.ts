// 同花顺 · 市场：运行时校验与口径说明。金额单位亿元，利率与分位单位 %；缺值为 null。
export type ValRow = {
  code: string; name: string; source: 'csi' | 'board'
  pe: number | null; pb: number | null; dp: number | null
  peP5: number | null; peP10: number | null; zoneBasis: 5 | 10 | null; zone: '危险' | '合理' | '机会' | null
  since: string | null; pbDays: number
  history: Array<[string, number | null]>
}
export type LiftWeek = { start: string; end: string; amount: number | null; stocks: number; unpriced: number }
export type HolderMonth = { month: string; increase: number | null; decrease: number | null; net: number | null; records: number; estimated: number; unpriced: number }
/** xxxCount = 有金额的笔数；xxxUnpriced = 金额缺失的笔数（全部缺失时金额为 null） */
export type FinancingMonth = { month: string; ipo: number | null; ipoCount: number; ipoUnpriced?: number; seo: number | null; seoCount: number; seoUnpriced?: number; cb: number | null; cbCount: number; cbUnpriced?: number }
/** complete=false：翻页未能证明覆盖该月，份额为 null；unknown = 份额缺失的基金数 */
export type FundMonth = { month: string; shares: number | null; funds: number; equityShares: number | null; unknown?: number; complete?: boolean }
export type StylePair = { id: string; label: string; num: string; den: string; rel20: number | null; rel60: number | null; series: Array<[string, number | null]> }
export type ThsMarketData = {
  version: 1; asOf: string; generatedAt: string; thresholds: { danger: number; chance: number }
  valuation: ValRow[]
  supply: { lift: { from: string; to: string; weeks: LiftWeek[]; total: number | null }; holder: HolderMonth[]; financing: FinancingMonth[]; funds: FundMonth[] }
  rates: { treasury: Array<[string, number | null, number | null]>; shibor: Array<[string, number | null, number | null]> }
  style: StylePair[]
  sources: Array<{ label: string; url: string }>
}

const obj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const date = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x
const month = (x: unknown): boolean => typeof x === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(x)
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const nullable = (x: unknown): boolean => x === null || num(x)
const int = (x: unknown): boolean => Number.isInteger(x) && (x as number) >= 0
const arr = (x: unknown, min = 1): x is unknown[] => Array.isArray(x) && x.length >= min
/** 日期序列：日期严格递增、不晚于 asOf，数值为有限数或 null。 */
const series = (x: unknown, asOf: string, width: number): boolean => arr(x) && x.every((p, i, a) => Array.isArray(p) && p.length === width && date(p[0]) && p[0] <= asOf && (!i || p[0] > (a[i - 1] as string[])[0]) && p.slice(1).every(nullable))
const months = (x: unknown, check: (r: Record<string, unknown>) => boolean): boolean => arr(x) && x.every((r, i, a) => obj(r) && month(r.month) && (!i || String(r.month) > String((a[i - 1] as Record<string, unknown>).month)) && check(r))

function valRow(r: unknown, asOf: string): boolean {
  if (!obj(r) || typeof r.code !== 'string' || typeof r.name !== 'string' || !r.name || !['csi', 'board'].includes(String(r.source))) return false
  if (!['pe', 'pb', 'dp'].every(k => nullable(r[k])) || !['peP5', 'peP10'].every(k => r[k] === null || (num(r[k]) && (r[k] as number) >= 0 && (r[k] as number) <= 100))) return false
  if (![5, 10, null].includes(r.zoneBasis as number | null) || ![null, '危险', '合理', '机会'].includes(r.zone as string | null) || !(r.since === null || date(r.since)) || !int(r.pbDays)) return false
  return series(r.history, asOf, 2)
}

/** 拒绝半份数据、字符串数字、非有限数和 HTML 回退页。 */
export function asThsMarket(x: unknown): ThsMarketData | null {
  if (!obj(x) || x.version !== 1 || !date(x.asOf) || typeof x.generatedAt !== 'string' || !Number.isFinite(Date.parse(x.generatedAt))) return null
  const asOf = x.asOf
  if (!obj(x.thresholds) || !num(x.thresholds.danger) || !num(x.thresholds.chance)) return null
  if (!arr(x.valuation) || !x.valuation.every(r => valRow(r, asOf)) || new Set(x.valuation.map(r => (r as ValRow).code)).size !== x.valuation.length) return null
  const s = x.supply
  if (!obj(s) || !obj(s.lift) || !date(s.lift.from) || !date(s.lift.to) || !nullable(s.lift.total)) return null
  if (!Array.isArray(s.lift.weeks) || !s.lift.weeks.every(w => obj(w) && date(w.start) && date(w.end) && w.start > asOf && nullable(w.amount) && int(w.stocks) && int(w.unpriced))) return null
  if (!months(s.holder, r => ['increase', 'decrease', 'net'].every(k => nullable(r[k])) && ['records', 'estimated', 'unpriced'].every(k => int(r[k])))) return null
  if (!months(s.financing, r => ['ipo', 'seo', 'cb'].every(k => nullable(r[k])) && ['ipoCount', 'seoCount', 'cbCount'].every(k => int(r[k])))) return null
  if (!months(s.funds, r => nullable(r.shares) && nullable(r.equityShares) && int(r.funds))) return null
  if (!obj(x.rates) || !series(x.rates.treasury, asOf, 3) || !series(x.rates.shibor, asOf, 3)) return null
  if (!arr(x.style) || !x.style.every(p => obj(p) && typeof p.id === 'string' && typeof p.label === 'string' && typeof p.num === 'string' && typeof p.den === 'string' && nullable(p.rel20) && nullable(p.rel60) && series(p.series, asOf, 2))) return null
  if (!arr(x.sources) || !x.sources.every(r => obj(r) && typeof r.label === 'string' && typeof r.url === 'string' && /^https:\/\/(www\.csindex\.com\.cn|datacenter-web\.eastmoney\.com|fund\.eastmoney\.com)\//.test(r.url))) return null
  return x as unknown as ThsMarketData
}

const sign = (s: string): string => s.replace('-', '−')
export const fix = (x: number | null, d = 2): string => (x === null ? '—' : sign(x.toFixed(d)))
export const yi = (x: number | null): string => (x === null ? '—' : `${sign(x.toFixed(2))} 亿`)
export const signedYi = (x: number | null): string => (x === null ? '—' : `${x > 0 ? '+' : ''}${sign(x.toFixed(2))} 亿`)
export const pct = (x: number | null, d = 1): string => (x === null ? '—' : `${sign(x.toFixed(d))}%`)
export const signedPct = (x: number | null): string => (x === null ? '—' : `${x > 0 ? '+' : ''}${sign(x.toFixed(2))}%`)
export const tone = (x: number | null): string => (x === null || x === 0 ? '' : x > 0 ? 'mm-up' : 'mm-down')
export const zoneClass = (z: ValRow['zone']): string => (z === '危险' ? 'mm-top__badge is-hot' : z === '机会' ? 'mm-top__badge is-cold' : 'mm-top__badge')

/** 页面口径文字（与 scripts/ths-market-lib.mjs 保持一致）。 */
export const METHOD = {
  valuation: (t: { danger: number; chance: number }): string => `估值分区为本站自定：PE(TTM) 近 10 年历史分位 ≥ ${t.danger}% 记为「危险区」，≤ ${t.chance}% 记为「机会区」，其余为「合理区」；不足 10 年的（科创50、深市主板、创业板）改用近 5 年分位，并在表中注明。分位 = 窗口内 PE ≤ 当前值的交易日占比，窗口起点之后 45 天内才有数据视为覆盖不足、不计算。这是历史位置的描述，不预示涨跌。`,
  valuationSource: '七个指数的滚动市盈率与市净率来自中证指数官网（行情接口的 peg 字段即官网「滚动市盈率」，自 2015 年起逐日）；深证成指、创业板指不是中证编制，官网无数据，改用东方财富「市场估值」里深市主板、创业板的板块整体 PE(TTM)（2017 年起），是板块口径而非指数成分口径。市净率官网只给当日快照，没有历史，本站从上线日起逐日累积，攒够前不计算 PB 分位。曲线为每周最后一个交易日的周采样。',
  lift: '限售解禁：东方财富限售解禁表，取数据日之后 30 个自然日的全部解禁批次，按周（周一至周日）汇总。金额为解禁股数 × 最新收盘价的估算，不是实际减持金额；个股明细见「数据中心」页签。',
  holder: '重要股东增减持：东方财富股东增减持表，按公告日所在月份汇总。金额 = 变动股数 × 成交均价；均价缺失时用该记录所列收盘价估算（表中「估算」为条数），连收盘价也没有的记录只计条数不计金额。当月为截至数据日的不完整月份。',
  financing: '市场融资：IPO 按上市日、增发按新增股份上市日、可转债按起息日归月。IPO 募资缺失时用发行价 × 发行股数；增发包含现金定增与发行股份购买资产，后者不是现金募资；可转债为实际发行规模。金额缺失的记录不计入金额与家数，某类当月全部缺金额时显示 —。',
  funds: '新发基金：天天基金「新成立基金」列表，按成立日归月，合计募集份额（亿份，近似亿元）。同一基金的 A/C 等份额类别列表中重复显示募集份额，按（基金公司、去掉份额字母的名称、成立日）去重；偏股为股票型、偏股混合与股票指数型合计。列表按认购截止日倒序翻页，未能证明翻到的月份标「不完整」、份额显示 —。',
  rates: '10 年期与 2 年期国债收益率来自东方财富「中美国债收益率」表（中债口径）；Shibor 为上海银行间同业拆放利率隔夜与 1 周品种。',
  style: '风格对比：分子收盘 ÷ 分母收盘，近一年起点归一为 100，曲线上升表示分子相对更强。20/60 日相对强弱 = 比值较 20/60 个交易日前的变化。指数收盘来自中证指数官网。',
  skipped: [
    '新增投资者开户数：中国结算月度数据在 2023 年 8 月后停止公布，东方财富对应表也止于 2023-08，暂不展示。',
    'DR007、人民币中间价：发布方为全国银行间同业拆借中心，不在本站使用的公开源范围内，暂以 Shibor 代替货币松紧观察。',
    '央行公开市场操作净投放：只有人民银行网站的文字公告，没有结构化公开数据，需逐条解析，暂缺。',
    '港股（恒指、恒生科技、国企）与美股（道指、纳指、标普）估值：站内宏观温度页已有港股 PE 与美股估值位置，本页不重复。',
    '北向资金、两融余额、国家队、全球指数：站内已有页面，见下方链接。',
  ],
}
