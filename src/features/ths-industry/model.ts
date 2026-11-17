// 同花顺 · 行业景气：运行时校验与口径说明（与 scripts/ths-industry-lib.mjs 保持一致）。百分比单位 %，缺值为 null。
export type IndustryRow = {
  code: string; name: string; l1Code: string; l1Name: string; cons: number | null; loss: number | null
  pe: number | null; pb: number | null; dy: number | null; peP5: number | null; peP10: number | null; pbP5: number | null
  npYoy: number | null; revYoy: number | null; roe: number | null; finCount: number; yoyCount: number; roeCount: number
  ret20: number | null; ret60: number | null
  ranks: { npYoy: number | null; revYoy: number | null; roe: number | null; ret60: number | null }
  score: number | null
}
export type ContribStock = { code: string; name: string; weight: number | null; pct: number | null; points: number | null; industry: string | null; est: boolean }
export type ContribIndex = {
  code: string; name: string; date: string; prevClose: number; close: number; change: number; changePct: number
  weightSource: 'csi' | 'cni'; weightDate: string; weightNote: string; constituents: number
  up: ContribStock[]; down: ContribStock[]
  industries: Array<{ name: string; points: number; count: number; weight: number }>
  estSum: number; residual: number; missing: number; upCount: number; downCount: number
  check: { listed: number; matched: number; maxDiff: number | null } | null
}
export type ThsIndustryData = {
  version: 1; asOf: string; generatedAt: string
  method: { scoreItems: string[]; scoreMin: number; roeMinAbs: number; coverage: number }
  industry: { period: string; periodLabel: string; priorPeriod: string; historyFrom: string; historySamples: number; rows: IndustryRow[] }
  contribution: ContribIndex[]
  sources: Array<{ label: string; url: string }>
}

const obj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const date = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const nullable = (x: unknown): boolean => x === null || num(x)
const pctile = (x: unknown): boolean => x === null || (num(x) && x >= 0 && x <= 100)
const int = (x: unknown): boolean => Number.isInteger(x) && (x as number) >= 0
const str = (x: unknown): x is string => typeof x === 'string' && x.length > 0
const arr = (x: unknown, min = 1): x is unknown[] => Array.isArray(x) && x.length >= min

function industryRow(r: unknown): boolean {
  if (!obj(r) || !str(r.code) || !str(r.name) || !str(r.l1Code) || !str(r.l1Name)) return false
  if (!['cons', 'loss'].every(k => r[k] === null || int(r[k])) || !['finCount', 'yoyCount', 'roeCount'].every(k => int(r[k]))) return false
  if (!['pe', 'pb', 'dy', 'npYoy', 'revYoy', 'roe', 'ret20', 'ret60'].every(k => nullable(r[k]))) return false
  if (!['peP5', 'peP10', 'pbP5', 'score'].every(k => pctile(r[k]))) return false
  return obj(r.ranks) && ['npYoy', 'revYoy', 'roe', 'ret60'].every(k => pctile((r.ranks as Record<string, unknown>)[k]))
}
function stock(r: unknown): boolean {
  return obj(r) && /^\d{6}$/.test(String(r.code)) && str(r.name) && nullable(r.weight) && nullable(r.pct) && nullable(r.points) && (r.industry === null || str(r.industry)) && typeof r.est === 'boolean'
}
function contrib(c: unknown, asOf: string): boolean {
  if (!obj(c) || !str(c.code) || !str(c.name) || c.date !== asOf || !['csi', 'cni'].includes(String(c.weightSource)) || !date(c.weightDate) || c.weightDate > asOf || !str(c.weightNote)) return false
  if (!['prevClose', 'close', 'change', 'changePct', 'estSum', 'residual'].every(k => num(c[k])) || !['constituents', 'missing', 'upCount', 'downCount'].every(k => int(c[k]))) return false
  if (!Array.isArray(c.up) || !Array.isArray(c.down) || !c.up.every(stock) || !c.down.every(stock)) return false
  if (!c.up.every(s => ((s as ContribStock).points ?? 0) > 0) || !c.down.every(s => ((s as ContribStock).points ?? 0) < 0)) return false
  if (!arr(c.industries) || !c.industries.every(i => obj(i) && str(i.name) && num(i.points) && int(i.count) && num(i.weight))) return false
  return c.check === null || (obj(c.check) && int(c.check.listed) && int(c.check.matched) && nullable(c.check.maxDiff))
}

/** 拒绝半份数据、字符串数字、非有限数和 HTML 回退页。 */
export function asThsIndustry(x: unknown): ThsIndustryData | null {
  if (!obj(x) || x.version !== 1 || !date(x.asOf) || typeof x.generatedAt !== 'string' || !Number.isFinite(Date.parse(x.generatedAt))) return null
  const m = x.method
  if (!obj(m) || !arr(m.scoreItems) || !m.scoreItems.every(str) || !int(m.scoreMin) || !num(m.roeMinAbs) || !num(m.coverage)) return null
  const ind = x.industry
  if (!obj(ind) || !date(ind.period) || !str(ind.periodLabel) || !date(ind.priorPeriod) || !date(ind.historyFrom) || !int(ind.historySamples)) return null
  if (!arr(ind.rows) || !ind.rows.every(industryRow) || new Set(ind.rows.map(r => (r as IndustryRow).code)).size !== ind.rows.length) return null
  if (!arr(x.contribution) || !x.contribution.every(c => contrib(c, x.asOf as string))) return null
  if (!arr(x.sources) || !x.sources.every(r => obj(r) && str(r.label) && typeof r.url === 'string' && /^https:\/\/(www\.csindex\.com\.cn|oss-ch\.csindex\.com\.cn|www\.cnindex\.com\.cn|datacenter-web\.eastmoney\.com|push2his\.eastmoney\.com)\//.test(r.url))) return null
  return x as unknown as ThsIndustryData
}

const sign = (s: string): string => s.replace('-', '−')
export const fix = (x: number | null, d = 2): string => (x === null ? '—' : sign(x.toFixed(d)))
export const pct = (x: number | null, d = 1): string => (x === null ? '—' : `${sign(x.toFixed(d))}%`)
export const signedPct = (x: number | null, d = 2): string => (x === null ? '—' : `${x > 0 ? '+' : ''}${sign(x.toFixed(d))}%`)
export const signedPts = (x: number | null, d = 2): string => (x === null ? '—' : `${x > 0 ? '+' : ''}${sign(x.toFixed(d))}`)
export const tone = (x: number | null): string => (x === null || x === 0 ? '' : x > 0 ? 'mm-up' : 'mm-down')

/** 页面口径文字。 */
export const METHOD = {
  score: (m: ThsIndustryData['method']): string => `景气得分为本站自定，不是同花顺「景气度」：对 ${m.scoreItems.join('、')} 这 ${m.scoreItems.length} 项，分别计算每个行业在全部行业中的百分位排名（0 = 最低，100 = 最高，并列取平均），再取平均；至少 ${m.scoreMin} 项有值才计分。估值（PE 分位）不计入得分，只作参照。得分只描述行业间的相对位置，不预示涨跌。`,
  valuation: '行业口径为中证行业分类（CICS）二级行业。PE 为中证指数官网「行业市盈率」的滚动市盈率（TTM），PB、股息率同出官网，均为当日官网值；官网同时公布每个行业的亏损家数，其行业市盈率是否剔除亏损公司以官网说明为准。',
  percentile: (from: string, samples: number): string => `PE / PB 分位 = 近 5 年窗口内估值 ≤ 当前值的周数占比，历史按每周最后一个交易日采样（本站从 ${from} 起回填，现有 ${samples} 个采样，之后逐日累积）。中证行业分类在 2021 年 12 月修订，新口径估值自 2021-12-17 起，旧版十大行业口径不可比，因此 10 年分位暂不计算，显示「—」。`,
  finance: (label: string, prior: string, roeMin: number, coverage: number): string => `财务取东方财富业绩报表 ${label}（披露家数达到中证行业样本数 ${Math.round(coverage * 100)}% 的最近报告期），按中证官网的个股 CICS 二级行业归类后用整体法汇总：净利润同比 = Σ本期归母净利润 ÷ Σ上年同期（${prior}）归母净利润 − 1，营收同比同理（营业总收入），只计两期都有数据的公司，上年合计 ≤ 0 时不计算；上年同期取当时披露值，未按追溯调整。ROE = Σ归母净利润 ÷ Σ(归母净利润 ÷ 加权ROE)，分母即按各公司加权 ROE 倒推的加权平均归母净资产，|加权ROE| < ${roeMin}% 的公司倒推误差大，不计入；为报告期累计值，未年化。`,
  returns: '近 20 / 60 日涨跌幅按当前 CICS 二级成分汇总：Σ总市值(当日) ÷ Σ总市值(20 / 60 个交易日前) − 1，只计两日都有市值的公司，总市值取东方财富个股估值表（带交易日）。用总市值可避开送转除权的假跌，但期间增发、分红会带来少量偏差；成分按当前分类，不回溯历史调整。',
  contribution: '贡献点数 ≈ 前一交易日权重 × 当日个股涨跌幅 × 前一交易日指数点位。个股涨跌幅、收盘价与流通市值取东方财富个股估值表（带交易日），指数点位取东方财富指数日 K（带日期）。',
  weights: '权重为近似：中证官网只公开每月末的收盘权重文件，本站按成分股价格从文件日期漂移到前一交易日（未处理期间除权和股本变动）；国证官网只公开创业板指前十大权重，其余成分按流通市值分配剩余权重（国证实际按自由流通市值并分级靠档，这里未剔除限售和大股东持股），所以创业板指的误差更大。「估算合计」与指数实际涨跌点数之差即近似误差。',
  skipped: [
    '同花顺「AI 景气度分」与「景气度百分位」：同花顺专有模型，不使用同花顺接口，本页以自定景气得分替代并写明公式。',
    '申万一级行业：没有公开带日期的申万一级行业股息率与长期估值历史接口，本页改用中证行业（官网同时提供 PE、PB、股息率与逐日历史）。',
    'ROE 环比、归母净利润增长值、场内 / 场外基金：前两项需要逐季单季拆分，基金映射需另行维护，暂不展示；行业 ETF 见站内 ETF 清单。',
    '盘中实时贡献度：本页只做收盘后统计，不做盘中刷新。',
    '板块轮动与行业相对强弱曲线：站内板块轮动页已有，本页不重复。',
  ],
}
