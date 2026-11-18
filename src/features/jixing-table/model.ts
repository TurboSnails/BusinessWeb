export const GROUPS = [
  { id: 'all', label: '全部' },
  { id: 'broad', label: '宽基' },
  { id: 'strategy', label: '红利策略' },
  { id: 'industry', label: '行业' },
  { id: 'pension', label: '专题·养老' },
] as const

export type GroupFilter = typeof GROUPS[number]['id']
export type ValuationStatus = 'low' | 'normal' | 'high'
type History = { since: string | null; count: number }
export type ValuationRow = {
  code: string
  name: string
  group: Exclude<GroupFilter, 'all'>
  source: 'csi' | 'cni'
  basis: 'pe' | 'pb'
  date: string
  pe: number
  pb: number | null
  dp: number | null
  roe: number | null
  pePct: number
  pbPct: number | null
  status: ValuationStatus | null
  peHistory: History
  pbHistory: History
  /** 主表默认空；点击后懒加载 hist 文件填入。 */
  peSeries: [string, number][]
  peRefs: [number, number]
  pbKind: 'index' | 'industry'
  pbIndustry: { code: string; name: string } | null
}

export type JixingTableHist = {
  code: string
  asOf: string
  peSeries: [string, number][]
  pbSeries: [string, number][]
  peRefs: [number, number]
}

export type JixingTableData = {
  version: 1
  asOf: string
  generatedAt: string
  sources: { label: string; url: string }[]
  rows: ValuationRow[]
}

export const METHOD = {
  status: '估值状态（本站自定）：历史百分位低于 30% 为低估，高于 70% 为高估，30% 至 70%（含端点）为正常。中证银行、证券公司、中证全指房地产、中证有色金属和煤炭指数按行业 PB 百分位判断，其余按 PE 百分位。所用百分位缺失时，状态留空。',
  percentile: '百分位使用近 10 年内已有的交易日数据（含当日）。短历史显示实际起点和样本数。算法为（低于当前值的样本数 + 0.5 × 等于当前值的样本数）÷ 有效样本数。PE、PB 仅统计正值。PB 从可取得的日度/周采样数据开始积累，满 250 个样本后计算分位。',
  source: '中证指数官网提供 PE(TTM)，估值总览覆盖的指数同时提供指数 PB 和股息率。PB 判定的五行改用官网「行业市盈率」中证行业分类的行业 PB（并标注行业名称），不是指数本身的 PB。创业板指、深证成指、深证100、深证红利采用国证指数网的数据。缺少同日数据的字段以「—」显示。ROE（估算）= PB ÷ PE(TTM)。',
  chart: '曲线取每周最后一笔估值，参考线取同一窗口内逐日 PE 的第 30% 和第 70% 分位值（最近秩法）。历史序列按指数懒加载。',
  pbIndustry: '行业 PB（中证行业分类）：新版 CICS 代码优先，旧版行业分类在修订前接续；与对应主题指数成分不完全相同。',
}

const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const positive = (v: unknown): v is number => finite(v) && v > 0
const pct = (v: unknown): v is number => finite(v) && v >= 0 && v <= 1
const date = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(v)
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v
}

function isHistory(v: unknown, end: string): v is History {
  return record(v) && typeof v.count === 'number' && Number.isInteger(v.count) && v.count >= 0 &&
    (v.count === 0 ? v.since === null : date(v.since) && v.since <= end)
}

function isSeries(v: unknown, asOf: string, since: string | null, lastValue?: number): v is [string, number][] {
  if (!Array.isArray(v)) return false
  if (!v.length) return true
  let previous = ''
  for (const point of v) {
    if (!Array.isArray(point) || point.length !== 2 || !date(point[0]) || point[0] <= previous ||
      point[0] > asOf || (since !== null && point[0] < since) || !positive(point[1])) return false
    previous = point[0]
  }
  return previous === asOf && (lastValue === undefined || v.at(-1)?.[1] === lastValue)
}

function isRow(v: unknown, asOf: string): v is ValuationRow {
  if (!record(v) || v.date !== asOf || typeof v.code !== 'string' || !/^[A-Z\d]\d{5}$/.test(v.code) ||
    typeof v.name !== 'string' || !v.name.trim() || !GROUPS.some(g => g.id !== 'all' && g.id === v.group) ||
    (v.source !== 'csi' && v.source !== 'cni') || (v.basis !== 'pe' && v.basis !== 'pb')) return false
  if ((v.pbKind !== 'index' && v.pbKind !== 'industry') ||
    (v.pbKind === 'industry'
      ? !(record(v.pbIndustry) && typeof v.pbIndustry.code === 'string' && typeof v.pbIndustry.name === 'string')
      : v.pbIndustry !== null)) return false
  if (!positive(v.pe) || !pct(v.pePct) || (v.pb !== null && !positive(v.pb)) ||
    (v.dp !== null && (!finite(v.dp) || v.dp < 0)) || (v.roe !== null && !positive(v.roe)) ||
    !isHistory(v.peHistory, asOf) || v.peHistory.count < 1 || !isHistory(v.pbHistory, asOf)) return false
  const pbReady = v.pb !== null && v.pbHistory.count >= 250
  if ((pbReady ? !pct(v.pbPct) : v.pbPct !== null) ||
    (v.pb === null ? v.roe !== null : v.roe === null || v.pbHistory.count === 0)) return false

  const rank = v.basis === 'pb' ? v.pbPct : v.pePct
  const status = !finite(rank) ? null : rank < 0.3 ? 'low' : rank > 0.7 ? 'high' : 'normal'
  if (v.status !== status || !Array.isArray(v.peRefs) || v.peRefs.length !== 2 ||
    !v.peRefs.every(positive) || v.peRefs[0] > v.peRefs[1] || !Array.isArray(v.peSeries) ||
    v.peSeries.length > v.peHistory.count) return false
  if (!isSeries(v.peSeries, asOf, v.peHistory.since, v.peSeries.length ? v.pe : undefined)) return false
  return true
}

export function asJixingTable(v: unknown): JixingTableData | null {
  if (!record(v) || v.version !== 1 || !date(v.asOf) || typeof v.generatedAt !== 'string' ||
    !Number.isFinite(Date.parse(v.generatedAt)) || !Array.isArray(v.rows) || !v.rows.length ||
    !Array.isArray(v.sources) || !v.sources.length) return null
  const asOf = v.asOf
  const rows = v.rows.filter((row): row is ValuationRow => isRow(row, asOf))
  if (rows.length !== v.rows.length || new Set(rows.map(row => row.code)).size !== rows.length) return null
  const sources = v.sources.filter((source): source is JixingTableData['sources'][number] =>
    record(source) && typeof source.label === 'string' && !!source.label.trim() && typeof source.url === 'string' && /^https:\/\//.test(source.url))
  return sources.length === v.sources.length ? { version: 1, asOf, generatedAt: v.generatedAt, rows, sources } : null
}

export function asJixingTableHist(v: unknown, code: string, asOf: string): JixingTableHist | null {
  if (!record(v) || v.code !== code || v.asOf !== asOf || !Array.isArray(v.peRefs) || v.peRefs.length !== 2 ||
    !v.peRefs.every(positive) || v.peRefs[0] > v.peRefs[1]) return null
  if (!isSeries(v.peSeries, asOf, null) || !Array.isArray(v.pbSeries)) return null
  let previous = ''
  for (const point of v.pbSeries) {
    if (!Array.isArray(point) || point.length !== 2 || !date(point[0]) || point[0] <= previous ||
      point[0] > asOf || !positive(point[1])) return null
    previous = point[0]
  }
  return { code, asOf, peSeries: v.peSeries as [string, number][], pbSeries: v.pbSeries as [string, number][], peRefs: v.peRefs as [number, number] }
}

export const histUrl = (code: string): string =>
  `${import.meta.env.BASE_URL}data/jixing-table-hist-${code}.json`
