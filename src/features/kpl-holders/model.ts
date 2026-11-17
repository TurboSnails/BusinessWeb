// 开盘啦 · 持仓两融页签数据模型：读 public/data/kpl-holders.json（scripts/kpl-holders.mjs 每个交易日盘后生成）。
// 金额单位为元，比例为 %；null 表示数据源缺失（不是 0）。口径见 scripts/kpl-holders-lib.mjs 与页面说明。

export type MarginRow = {
  code: string
  name: string
  close: number | null
  pct: number | null
  balance: number | null
  buy: number | null
  repay: number | null
  net: number | null
  net3: number | null
  net5: number | null
  net10: number | null
  growth: number | null
  ratio: number | null
  floatCap: number | null
}
export type MarginIndustry = { code: string; name: string; balance: number | null; buy: number | null; repay: number | null; net: number | null; ratio: number | null; floatCap: number | null }
export type Margin = {
  date: string
  count: number
  totals: { balance: number | null; net: number | null; net5: number | null; up: number; down: number }
  buy: MarginRow[]
  sell: MarginRow[]
  buy5: MarginRow[]
  sell5: MarginRow[]
  growth: MarginRow[]
  ratio: MarginRow[]
  minBalance: number
  industries: { count: number; inflow: MarginIndustry[]; outflow: MarginIndustry[] }
}

export type FundRow = {
  code: string
  name: string
  funds: number | null
  shares: number | null
  value: number | null
  freeRatio: number | null
  change: number | null
  changeRatio: number | null
  changeValue: number | null
  industry: string | null
  isNew: boolean
}
export type FundIndustry = { name: string; stocks: number; value: number; changeValue: number; newCount: number; addCount: number; cutCount: number }
export type Funds = {
  fetched: string
  industryDate: string | null
  period: string
  label: string
  full: boolean
  prevPeriod: string | null
  prevLabel: string | null
  prevFull: boolean | null
  count: number
  totalValue: number | null
  newCount: number | null
  addCount: number
  cutCount: number
  top: FundRow[]
  add: FundRow[]
  cut: FundRow[]
  fresh: FundRow[] | null
  industries: FundIndustry[]
}

export type HoldState = 'new' | 'add' | 'cut' | 'same'
export type Holding = { code: string; name: string; end: string; notice: string | null; rank: number | null; shares: number | null; value: number | null; ratio: number | null; state: HoldState | null; change: number | null }
export type Investor = { name: string; count: number; value: number | null; newCount: number; addCount: number; cutCount: number; latestEnd: string; items: Holding[] }
export type Investors = { fetched: string; minEnd: string | null; candidates: number; eligible: number; rows: number; minStocks: number; endFrom: string | null; endTo: string | null; list: Investor[] }

export type KplHolders = {
  version: 1
  generatedAt: string
  asOf: string
  note: string
  margin: Margin | null
  funds: Funds | null
  investors: Investors | null
  sources: Array<{ id: string; label: string; url: string }>
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isDate = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)
const arr = <T,>(x: unknown, ok: (v: unknown) => boolean = isObj): T[] => (Array.isArray(x) ? (x.filter(ok) as T[]) : [])
const isStock = (s: unknown): boolean => isObj(s) && typeof s.code === 'string' && typeof s.name === 'string'
const n = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0)
const nn = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null)

function asMargin(x: unknown): Margin | null {
  if (!isObj(x) || !isDate(x.date) || !isObj(x.totals) || !Array.isArray(x.buy)) return null
  const t = x.totals, ind = isObj(x.industries) ? x.industries : {}
  return {
    date: x.date, count: n(x.count),
    totals: { balance: nn(t.balance), net: nn(t.net), net5: nn(t.net5), up: n(t.up), down: n(t.down) },
    buy: arr(x.buy, isStock), sell: arr(x.sell, isStock), buy5: arr(x.buy5, isStock), sell5: arr(x.sell5, isStock), growth: arr(x.growth, isStock), ratio: arr(x.ratio, isStock),
    minBalance: n(x.minBalance),
    industries: { count: n(ind.count), inflow: arr(ind.inflow, isStock), outflow: arr(ind.outflow, isStock) },
  }
}
function asFunds(x: unknown): Funds | null {
  if (!isObj(x) || !isDate(x.period) || !Array.isArray(x.top)) return null
  return {
    ...(x as unknown as Funds),
    industryDate: isDate(x.industryDate) ? x.industryDate : null,
    prevPeriod: isDate(x.prevPeriod) ? x.prevPeriod : null,
    newCount: nn(x.newCount), count: n(x.count), addCount: n(x.addCount), cutCount: n(x.cutCount), totalValue: nn(x.totalValue),
    top: arr(x.top, isStock), add: arr(x.add, isStock), cut: arr(x.cut, isStock), fresh: Array.isArray(x.fresh) ? arr(x.fresh, isStock) : null,
    industries: arr(x.industries, i => isObj(i) && typeof i.name === 'string'),
  }
}
function asInvestors(x: unknown): Investors | null {
  if (!isObj(x) || !Array.isArray(x.list)) return null
  return {
    fetched: String(x.fetched ?? ''), minEnd: isDate(x.minEnd) ? x.minEnd : null,
    candidates: n(x.candidates), eligible: n(x.eligible), rows: n(x.rows), minStocks: n(x.minStocks),
    endFrom: isDate(x.endFrom) ? x.endFrom : null, endTo: isDate(x.endTo) ? x.endTo : null,
    list: arr<Investor>(x.list, p => isObj(p) && typeof p.name === 'string' && Array.isArray(p.items)).map(p => ({ ...p, items: arr<Holding>(p.items, s => isStock(s) && isObj(s) && isDate(s.end)) })),
  }
}

/** 结构校验：顶层缺失返回 null（页面显示「数据文件格式不对」）；单节格式不对时该节为 null，页面单独显示暂缺 */
export function asKplHolders(body: unknown): KplHolders | null {
  if (!isObj(body) || body.version !== 1 || !isDate(body.asOf) || typeof body.generatedAt !== 'string') return null
  return {
    version: 1, generatedAt: body.generatedAt, asOf: body.asOf, note: typeof body.note === 'string' ? body.note : '',
    margin: asMargin(body.margin), funds: asFunds(body.funds), investors: asInvestors(body.investors),
    sources: arr(body.sources, s => isObj(s) && typeof s.url === 'string'),
  }
}

export const STATE_LABEL: Record<HoldState, string> = { new: '新进', add: '加仓', cut: '减仓', same: '不变' }

/** 页面上写明的口径（与 scripts/kpl-holders-lib.mjs 一致） */
export const METHOD = {
  margin: '融资融券个股明细（沪深京 A 股，剔除 ETF / LOF 等基金）。融资净买入 = 当日融资买入额 − 融资偿还额；近 5 日累计 = 最近 5 个交易日（含当日）融资净买入之和；融资余额增幅 = 当日融资余额 ÷ 上一交易日融资余额 − 1；融资余额占流通市值 = 融资余额 ÷ 当日流通市值。交易所在次一交易日早上公布前一日两融数据，所以本页两融日期通常比行情晚一个交易日。',
  growth: '融资余额增幅榜只看融资余额不低于 1 亿元的个股（本页自定阈值：余额太小时增幅容易很大但没有意义）。',
  industry: '行业汇总用东方财富行业分类（与个股所属行业同一套），数据为东方财富按行业合计的两融数据。',
  funds: '基金持仓来自公募基金定期报告的汇总：持有基金数 = 在该期报告中持有这只股票的基金家数；持股市值按报告期末股价；持股变化 = 本期持股数 − 上期持股数（数据源给出）。变动市值估算 = 持股数变化 × 本期末股价（本期持股市值 ÷ 持股数），剔除了股价涨跌的影响。新进 = 上一期没有任何基金持有、本期出现。行业按东方财富行业汇总。',
  fundsBias: '注意口径差异：基金季报（一季报、三季报）只披露前十大重仓股，中报、年报披露全部持仓。本期与上期口径不同时增减有偏差——本期是季报、上期是中报 / 年报时，大量股票会因为「跌出前十大」而显示减持（减持被高估，增持与新进是保守的下限）；反过来时增持被高估。',
  fundsLag: '披露滞后：基金季报在季度结束后 15 个工作日内披露，中报、年报分别在 8 月底、次年 3 月底前披露。本页在季末 25 天之后、且数据覆盖足够多股票时才切换到新一期。',
  investors: '「牛散」名单完全由数据自动选出，不是手写名单：取每只 A 股最新一期十大流通股东里的自然人（截止日在最近约一年内），排除实际控制人和董监高（公司内部人），按「出现在几只股票的十大流通股东里」从多到少排序（相同时按合计持股市值），列出出现在至少 3 只股票里的前 100 位。持股市值、持股变化（新进 / 加仓 / 减仓 / 不变，与该股票上一期比较）均为数据源给出。',
  investorsCaveat: '个人股东在公开数据里只有姓名、没有身份编号，同名的不同自然人会被合在一起（常见姓名尤其如此），请以上市公司定期报告原文为准。十大流通股东只在定期报告（以及少数公司的临时公告）里披露，最新一期多为三季报（9 月 30 日），滞后一到数月；没有进入前十大的持股看不到。',
  skip: '不做：个股 ETF 穿透（被哪些 ETF 持有、ETF 持仓日度变化）——ETF 持仓也只在基金季报披露，逐只 ETF 拉取持仓需要上千次请求，日度变化只能按份额 × 指数权重估算，误差大，本轮跳过；融券余量榜（融券规模很小且多为 ETF）；开盘啦 App 的「本季推荐股东」「今日热搜股东」（App 自有数据）。国家队（汇金、证金、社保）持仓见「国家队持仓」页，不在这里重复；全市场融资余额走势见「市场情绪」页。',
} as const
