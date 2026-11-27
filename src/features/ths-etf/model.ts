// 同花顺 · ETF资金：数据模型、运行时校验与口径文字。金额统一为元，缺值为 null（不是 0），展示时才换算亿元。
export type Num = number | null
export type EtfRow = { code: string; name: string; flow1: Num; flow5: Num; flow20: Num; scale: Num; streak: Num }
export type BroadRow = EtfRow & { index: string; shares: Num; sharesChg: Num; close: Num }
export type IndexAgg = { index: string; n: number; scale: Num; flow1: Num; flow5: Num; flow20: Num }
export type Window = 'd1' | 'd5' | 'd20'
export type Ranking = { inflow: EtfRow[]; outflow: EtfRow[] }
export type CategoryAgg = { cat: string; n: number; flow1: Num; flow5: Num; flow20: Num; covered: Record<Window, number>; rank: Record<Window, Ranking> }
export type Stock = { code: string; name: string }
export type Rebalance = { id: string; title: string; publishDate: string; effectiveDate: string | null; url: string; attachmentUrl: string | null; status: 'parsed' | 'pending'; indexes: Array<{ index: string; out: Stock[]; in: Stock[] }> }
/** 各交易所份额在数据日的状态。深交所站点不可达（境外采集）时 szse.status = 'unavailable'，数据日只有沪市；
 * inferredDates 为近 20 个交易日里深交所份额取自腾讯行情总份额字段（按规则推断日期并与存档交叉校验）的日期。 */
export type ExchangeStatus = { status: 'ok' | 'unavailable'; source: string | null; date: string | null; n: number; inferredDates?: string[]; reason?: string | null }
export type Totals = { flow1: Num; flow5: Num; flow20: Num; scale: Num }
export type ThsEtfData = {
  version: 1; asOf: string; generatedAt: string; historyStart: string; backfill: { from: string; to: string } | null
  broad: { list: BroadRow[]; byIndex: IndexAgg[]; total: Totals; partial?: Totals & { scope: 'sse'; n: number }; history: Array<{ date: string; flow: Num; missing?: number | null }> }
  market: { n: number; categories: CategoryAgg[] }
  rebalance: Rebalance[]
  exchanges?: { sse: ExchangeStatus; szse: ExchangeStatus }
  sources: Array<{ label: string; url: string }>
}

export const WINDOWS: Array<{ id: Window; label: string; key: 'flow1' | 'flow5' | 'flow20' }> = [
  { id: 'd1', label: '当日', key: 'flow1' }, { id: 'd5', label: '近 5 日', key: 'flow5' }, { id: 'd20', label: '近 20 日', key: 'flow20' },
]
export const CATEGORIES = ['宽基', '行业主题', '跨境', '商品', '债券'] as const

export const METHOD = {
  flow: '申购净流入（估算）=（T 日场内份额 − 上一交易日份额）× T 日场内收盘价。份额取交易所每日公布值（上交所「ETF 规模」、深交所「基金规模」），收盘价取腾讯行情（带时间戳校验）或东方财富日 K（不复权）。用收盘价而不是基金净值，与净值口径会有小幅差异；份额变化包含申购赎回，也包含拆分、合并等份额变动。',
  window: '近 5 日 / 近 20 日 = 最近 5 / 20 个交易日每日估算值之和；任一天缺份额或价格则整段记为缺失，不补零。连续流入天数 = 从数据日往前数，每日估算值都大于 0 的天数。上一交易日没有记录（如新上市）时当天记为缺失。',
  broad: '宽基名单由本站固定维护：国家队持仓页里披露有汇金等持有的宽基 ETF（2025-12-31 报告期），加上中证 A500、科创 50、中证 2000 等指数规模靠前的产品，共 33 只。按指数汇总对应同花顺「国家队 ETF」一栏的口径，但这里只是按份额变化推算的资金，不代表一定是国家队或某类机构的资金。',
  category: '分类：东方财富 ETF 分组里的货币、跨境、商品优先；其余按名称规则分为宽基（沪深300、中证500/1000/2000、A500、上证50、科创50、创业板等综合指数及其增强）、债券、商品，剩下的都归入「行业主题」（含红利、低波、ESG 等策略类）。货币 ETF 不参与排行。分类是名称规则，个别产品可能分错。',
  rebalance: '调仓名单来自中证指数官网「定期调整结果」公告的 PDF 附件，解析后与公告正文写明的「更换 N 只样本」逐一核对，数量不一致就不展示名单（标为待解析）。临时调整（如吸收合并）只附公告链接。',
  noEstimate: '没有给出「预计被动资金净买入」：这需要每个指数的全部被动跟踪规模（场内 ETF、场外联接、指数增强）和调入股在生效日的自由流通市值权重，公开数据在公告时拿不到可靠值，所以只列名单与生效日。',
  skipped: '未做：ETF 盘中主力资金、北向/融资对 ETF 的增仓（需盘中或 L2 数据）；同花顺「机会值」「趋势值」等专有打分；按申赎清单推算 ETF 持仓与调仓（每日 PCF 文件逐只解析，暂未接入）；ETF 分时 AI 信号。',
}

const obj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isDate = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const nul = (x: unknown): boolean => x === null || num(x)
const str = (x: unknown): x is string => typeof x === 'string' && x.trim() !== ''
const code = (x: unknown): boolean => typeof x === 'string' && /^\d{6}$/.test(x)
const https = (x: unknown): boolean => typeof x === 'string' && /^https:\/\//.test(x)
const row = (r: unknown): boolean => obj(r) && code(r.code) && str(r.name) && ['flow1', 'flow5', 'flow20', 'scale', 'streak'].every(k => nul(r[k]))
function ranking(x: unknown, key: 'flow1' | 'flow5' | 'flow20'): boolean {
  if (!obj(x) || !Array.isArray(x.inflow) || !Array.isArray(x.outflow)) return false
  const ok = (rows: unknown[], dir: 1 | -1): boolean => rows.length <= 20 && rows.every((r, i) => {
    if (!row(r)) return false
    const v = (r as Record<string, unknown>)[key]
    const prev = i ? (rows[i - 1] as Record<string, unknown>)[key] : null
    return num(v) && v * dir > 0 && (!i || (num(prev) && (dir > 0 ? v <= prev : v >= prev)))
  })
  return ok(x.inflow, 1) && ok(x.outflow, -1)
}

const totals = (x: unknown): boolean => obj(x) && ['flow1', 'flow5', 'flow20', 'scale'].every(k => nul(x[k]))
const exchange = (x: unknown): boolean => obj(x) && (x.status === 'ok' || x.status === 'unavailable') && (x.source === null || str(x.source)) && (x.date === null || isDate(x.date)) && num(x.n)
  && (x.inferredDates === undefined || (Array.isArray(x.inferredDates) && x.inferredDates.every(isDate))) && (x.reason === undefined || x.reason === null || typeof x.reason === 'string')

/** 拒绝 HTML 回退、半份数据、字符串数字与非有限数。 */
export function asThsEtf(x: unknown): ThsEtfData | null {
  if (!obj(x) || x.version !== 1 || !isDate(x.asOf) || !isDate(x.historyStart) || typeof x.generatedAt !== 'string' || !Number.isFinite(Date.parse(x.generatedAt))) return null
  if (x.backfill !== null && !(obj(x.backfill) && isDate(x.backfill.from) && isDate(x.backfill.to))) return null
  const b = x.broad
  if (!obj(b) || !Array.isArray(b.list) || !b.list.length || !b.list.every(r => row(r) && obj(r) && str(r.index) && ['shares', 'sharesChg', 'close'].every(k => nul(r[k])))) return null
  if (!Array.isArray(b.byIndex) || !b.byIndex.length || !b.byIndex.every(r => obj(r) && str(r.index) && num(r.n) && ['scale', 'flow1', 'flow5', 'flow20'].every(k => nul(r[k])))) return null
  if (!totals(b.total)) return null
  if (b.partial !== undefined && !(totals(b.partial) && obj(b.partial) && b.partial.scope === 'sse' && num(b.partial.n))) return null
  if (!Array.isArray(b.history) || !b.history.every((h, i, hs) => obj(h) && isDate(h.date) && h.date <= String(x.asOf) && nul(h.flow) && (!i || String(h.date) > String((hs[i - 1] as Record<string, unknown>).date)))) return null
  const m = x.market
  if (!obj(m) || !num(m.n) || !Array.isArray(m.categories) || m.categories.length !== CATEGORIES.length) return null
  if (!m.categories.every((c, i) => obj(c) && c.cat === CATEGORIES[i] && num(c.n) && ['flow1', 'flow5', 'flow20'].every(k => nul(c[k])) && obj(c.covered) && obj(c.rank)
    && WINDOWS.every(w => num((c.covered as Record<string, unknown>)[w.id]) && ranking((c.rank as Record<string, unknown>)[w.id], w.key)))) return null
  if (!Array.isArray(x.rebalance) || !x.rebalance.every(r => obj(r) && str(r.id) && str(r.title) && isDate(r.publishDate) && (r.effectiveDate === null || isDate(r.effectiveDate)) && https(r.url) && (r.attachmentUrl === null || https(r.attachmentUrl))
    && (r.status === 'parsed' || r.status === 'pending') && Array.isArray(r.indexes) && r.indexes.every(i => obj(i) && str(i.index) && Array.isArray(i.in) && Array.isArray(i.out) && [...i.in, ...i.out].every(s => obj(s) && code(s.code) && str(s.name))))) return null
  // exchanges 是后加的字段：旧文件没有时视为两市都正常；有则必须完整，深交所缺席时必须给出仅沪市合计
  if (x.exchanges !== undefined && !(obj(x.exchanges) && exchange(x.exchanges.sse) && exchange(x.exchanges.szse))) return null
  if (obj(x.exchanges) && obj(x.exchanges.szse) && x.exchanges.szse.status === 'unavailable' && b.partial === undefined) return null
  if (!Array.isArray(x.sources) || !x.sources.length || !x.sources.every(s => obj(s) && str(s.label) && https(s.url))) return null
  return x as unknown as ThsEtfData
}

/** 深交所份额推断来源的说明文字。 */
export const SZSE_FALLBACK = '深交所站点（szse.cn）在境外采集环境连不上时，深交所份额改用腾讯行情的「总份额」字段：行情里是交易所上一交易日公布的份额（T 日快照里是 T−1 的份额），所以只能补上一交易日，并与已有存档交叉校验（同日交易所数据须一致、与前一日须有足够变化），校验不过就不用；之后能连上深交所时会用交易所原始数据覆盖。'

export const yi = (x: Num, sign = true): string => x === null ? '—' : `${sign && x > 0 ? '+' : ''}${(x / 1e8).toFixed(2).replace('-', '−')} 亿`
export const yiShares = (x: Num, sign = false): string => x === null ? '—' : `${sign && x > 0 ? '+' : ''}${(x / 1e8).toFixed(2).replace('-', '−')} 亿份`
export const tone = (x: Num): string => x === null || x === 0 ? '' : x > 0 ? 'mm-up' : 'mm-down'
