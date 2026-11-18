// 今天几星 · 港股全球：运行时校验与口径说明（与 scripts/jixing-global-lib.mjs 保持一致）。分位单位 %，缺值为 null。
export type ValState = '低估' | '正常' | '高估'
export type Freq = '日' | '周' | '月'
export type ValWindow = {
  years: number; freq: Freq; start: string | null; end: string; n: number; peN: number; dyN: number; enough: boolean
  /** 窗口内亏损（PE 为负）样本数；distorted = 亏损占比超过 10%，不判定估值状态 */
  loss?: number; distorted?: boolean
  /** spliced = 最新值来自拼接日之后的序列且窗口含拼接前序列，口径可能不同，不判定估值状态 */
  spliced?: boolean; spliceDate?: string | null
}
export type ValRow = {
  key: string; name: string; basis: 'pe' | 'dy'
  /** 该行最新数值的日期（各来源更新时间不同，逐行显示） */
  date: string | null; freq: Freq; source: string; peKind: string
  pe: number | null; dy: number | null; pb: null
  pePct: number | null; dyPct: number | null; valPct: number | null; state: ValState | null
  window: ValWindow | null
  /** 估值分位 30% / 70% 对应的指标值（basis = dy 时是股息率） */
  refs: { low: number | null; high: number | null } | null
  /** [日期, 指标值]：basis = pe 为 PE，basis = dy 为股息率 */
  history: Array<[string, number | null]>
  carried?: boolean; spliceDate?: string | null; estimated?: boolean
}
export type Gold = {
  date: string; price: number; realPrice: number | null; cpiBase: { month: string; value: number } | null
  pct: number | null; state: ValState | null
  window: { years: number; freq: Freq; start: string | null; end: string; n: number; enough: boolean }
  refs: { low: number | null; high: number | null }
  realYield: { date: string; value: number; pct: number | null; n: number } | null
  cpiCarried: string[]
  /** [月末日期, 实际金价, 名义金价] */
  history: Array<[string, number | null, number]>
  yieldHistory: Array<[string, number]>
  carried?: boolean
}
export type JixingGlobalData = {
  version: 1; generatedAt: string; asOf: string | null
  thresholds: { low: number; high: number }
  windows: { hk: number; global: number; gold: number }
  hk: { rows: ValRow[]; roundupLatest: string; roundupMissing: string[] }
  global: { rows: ValRow[] }
  gold: Gold | null; goldError: string | null
  sources: Array<{ label: string; url: string }>
}

const obj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const date = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x
const month = (x: unknown): boolean => typeof x === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(x)
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const nullable = (x: unknown): boolean => x === null || num(x)
const pctOk = (x: unknown): boolean => x === null || (num(x) && x >= 0 && x <= 100)
const str = (x: unknown): x is string => typeof x === 'string' && x.length > 0
const STATES = [null, '低估', '正常', '高估']
const FREQS = ['日', '周', '月']
const ascending = (x: unknown, width: number, check: (p: unknown[]) => boolean): boolean => Array.isArray(x) && x.every((p, i, a) => Array.isArray(p) && p.length === width && date(p[0]) && (!i || p[0] > (a[i - 1] as string[])[0]) && check(p))

function windowOk(w: unknown): boolean {
  if (w === null) return true
  return obj(w) && num(w.years) && FREQS.includes(String(w.freq)) && (w.start === null || date(w.start)) && date(w.end) && [w.n, w.peN, w.dyN].every(v => Number.isInteger(v) && (v as number) >= 0) && typeof w.enough === 'boolean'
}

function rowOk(r: unknown): r is ValRow {
  if (!obj(r) || !str(r.key) || !str(r.name) || !['pe', 'dy'].includes(String(r.basis)) || !(r.date === null || date(r.date))) return false
  if (!FREQS.includes(String(r.freq)) || !str(r.source) || !str(r.peKind) || !['pe', 'dy'].every(k => nullable(r[k])) || r.pb !== null) return false
  if (!['pePct', 'dyPct', 'valPct'].every(k => pctOk(r[k])) || !STATES.includes(r.state as string | null) || !windowOk(r.window)) return false
  if (!(r.refs === null || (obj(r.refs) && nullable(r.refs.low) && nullable(r.refs.high)))) return false
  return ascending(r.history, 2, p => nullable(p[1])) && (r.date === null || (r.history as string[][]).every(p => p[0] <= (r.date as string)))
}

function goldOk(g: unknown): g is Gold {
  if (g === null) return true
  if (!obj(g) || !date(g.date) || !num(g.price) || !nullable(g.realPrice) || !pctOk(g.pct) || !STATES.includes(g.state as string | null)) return false
  if (!(g.cpiBase === null || (obj(g.cpiBase) && month(g.cpiBase.month) && num(g.cpiBase.value)))) return false
  const w = g.window
  if (!obj(w) || !num(w.years) || !(w.start === null || date(w.start)) || !date(w.end) || !Number.isInteger(w.n) || typeof w.enough !== 'boolean') return false
  if (!obj(g.refs) || !nullable(g.refs.low) || !nullable(g.refs.high)) return false
  const ry = g.realYield
  if (!(ry === null || (obj(ry) && date(ry.date) && num(ry.value) && pctOk(ry.pct) && Number.isInteger(ry.n)))) return false
  if (!Array.isArray(g.cpiCarried) || !g.cpiCarried.every(month)) return false
  return ascending(g.history, 3, p => nullable(p[1]) && num(p[2])) && ascending(g.yieldHistory, 2, p => num(p[1]))
}

/** 运行时校验：结构不对返回 null（页面显示空状态，不展示半截数据）。 */
export function asJixingGlobal(x: unknown): JixingGlobalData | null {
  if (!obj(x) || x.version !== 1 || typeof x.generatedAt !== 'string' || !(x.asOf === null || date(x.asOf))) return null
  if (!obj(x.thresholds) || !num(x.thresholds.low) || !num(x.thresholds.high) || !obj(x.windows) || !['hk', 'global', 'gold'].every(k => num((x.windows as Record<string, unknown>)[k]))) return null
  const hk = x.hk, gl = x.global
  if (!obj(hk) || !Array.isArray(hk.rows) || !hk.rows.every(rowOk) || !month(hk.roundupLatest) || !Array.isArray(hk.roundupMissing) || !hk.roundupMissing.every(month)) return null
  if (!obj(gl) || !Array.isArray(gl.rows) || !gl.rows.every(rowOk)) return null
  if (!goldOk(x.gold ?? null) || !(x.goldError === null || x.goldError === undefined || typeof x.goldError === 'string')) return null
  if (!Array.isArray(x.sources) || !x.sources.every(s => obj(s) && str(s.label) && str(s.url))) return null
  return { ...(x as unknown as JixingGlobalData), gold: (x.gold ?? null) as Gold | null, goldError: (x.goldError ?? null) as string | null }
}

export const fix = (v: number | null | undefined, d = 2): string => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d))
export const pct = (v: number | null | undefined): string => (v === null || v === undefined ? '—' : `${v.toFixed(1)}%`)
export const stateClass = (s: ValState | null): string => (s === '低估' ? 'jg-state is-low' : s === '高估' ? 'jg-state is-high' : s === '正常' ? 'jg-state is-mid' : 'jg-state')
export const basisLabel = (r: ValRow): string => (r.basis === 'dy' ? '股息率（反向）' : 'PE')

/** 图上不画的 PE：亏损（负值）或超过 200 倍（盈利接近零），只影响图，不影响分位计算。 */
export const PE_CHART_CAP = 200
export const chartValue = (r: ValRow, v: number | null): number | null => (v === null ? null : r.basis === 'pe' && (v < 0 || v > PE_CHART_CAP) ? null : v)

/** 页面口径文字。 */
export const METHOD = {
  state: (t: { low: number; high: number }): string => `估值状态为本站自定：估值分位 < ${t.low}% 记「低估」，> ${t.high}% 记「高估」，其余「正常」。宽基与行业指数的估值分位就是 PE 百分位；高股息指数改看股息率（股息率越高越便宜），估值分位 = 100% − 股息率百分位；「依据」列写明每行用的是哪个。百分位 = (窗口内低于当前值的样本数 + 0.5 × 等于当前值的样本数) ÷ 样本数，当前值本身计入样本。样本不足（月度少于 36 个、周度少于 104 个）不给分位与状态。这只是历史位置的描述，与银行螺丝钉的星级和估值表无关，不预示涨跌。`,
  pe: 'PE 百分位按盈利收益率（1/PE）排序计算：全部盈利时与按 PE 排序完全一致；PE 为负的亏损月份视为比任何盈利月份都贵，照常计入、不删除。窗口内亏损样本超过 10% 时，PE 跨越了盈利断层、前后不可比，照常列出百分位，但不判定估值状态。',
  hk: (years: number): string => `港股：PE 与股息率均为恒生指数公司（Hang Seng Indexes）官方公布值（恒生的 PE 采用成分股最近公布的年度盈利，不是 TTM，表中写作「PE（恒生公布）」；恒生不公布指数 PB，PB 列留空）。恒生指数、国企指数、高股息率指数有官方每日指数报表，最新值为日度；恒生科技、港股通高股息率、医疗保健、互联网科技业只在 Monthly Roundup 月报中公布 PE 与股息率，最新值为上月末，按月更新。百分位窗口为近 ${years} 年月末样本（月报月末值；月报缺的月份用日报该月最后一个交易日）加上最新值。中证港股通高股息投资指数来自中证指数官网的滚动市盈率（TTM），官网行情不含股息率历史，因此它按 PE 百分位判定。`,
  global: (years: number): string => `全球：标普 500、纳斯达克 100 的 Forward PE（未来 12 个月一致预期）来自 History of Market（historyofmarket.com，数据 CC BY 4.0）：周度终端数据，其终端序列止于 2026-08-05，之后接 History of Market 按 ETF 持仓自算的 FY1/FY2 混合预期（该站说明与终端口径相差在 3% 以内），表中注明拼接日，周度采样取每周最后一天。两段序列只在拼接日重合一个点（标普 500：终端 20.12、自算 19.99；纳指 100：22.37、22.41），不足以估计口径差、也不做缩放；因此最新值来自自算序列而窗口含终端序列时，照列 PE 百分位，但估值状态记「不判定」。标普 500 的 TTM PE、席勒 PE（CAPE）与股息率来自 multpl.com 月度表（月度值为当月均价对应的比值，最新一行是最近收盘的估算值，标 † 的为盈利尚未完整公布的估算）。百分位窗口均为近 ${years} 年（周度或月度样本）。`,
  skipped: [
    '道琼斯工业、罗素 2000、标普 500 等权：没有找到可自动抓取、带历史的公开 PE 序列（只有价格），暂不纳入。',
    '费城半导体：本站现有的 Forward PE 历史（History of Market 终端周度）止于 2026-08-05，此后没有同口径更新，暂不纳入。',
    '日经 225（日经官网 PER）与印度 Nifty 50（NSE 指数官网 PE/PB/股息率）：官方数据公开，但两站均有反爬校验（Cloudflare / Akamai），脚本无法稳定读取，暂不纳入。',
    '德国 DAX、英国富时 100、越南 VN30：指数公司不免费公布估值历史，暂不纳入。',
  ],
  gold: (years: number): string => `黄金估值为本站自定（银行螺丝钉的黄金星级公式未公开，这里不复刻）：实际金价 = 月末 COMEX 黄金连续合约收盘价 × 最新 CPI ÷ 当月 CPI（美国劳工统计局 CPI-U，未季调；某月没有发布值时沿用此前最近一个月）；黄金估值分位 = 最新实际金价在近 ${years} 年「月末实际金价 + 最新值」中的百分位，< 30% 低估、> 70% 高估。10 年期美债实际收益率（TIPS，美国财政部实际收益率曲线）只作参照，单独给出近 ${years} 年月末百分位，不进入估值分位：实际利率越高，持有黄金的机会成本越高。金价取已收盘的交易日（COMEX 日盘在北京时间次日清晨收盘，傍晚运行时只取到前一交易日）。`,
}
