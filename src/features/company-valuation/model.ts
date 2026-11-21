import type { Company, Market } from '../../data/companies'

export interface CompanyValuation {
  key: string; market: Market; code: string; name: string; currency: string; asOf: string
  status: 'conditional' | 'reviewed' | 'insufficient'
  price: { value: number | null; date: string | null; currency: string; source: string | null }
  value: null | { low: number; base: number; high: number; kind: 'present' | 'future' | 'undated'; date: string | null; primaryMethod: string }
  methods: { name: string; applicable: boolean; reason: string; formula: string; inputs: Record<string, unknown>; values: number[] | null; sourceIds: string[] }[]
  quality: string; pricing: string; expectations: string; risk: string
  assumptions: string[]; missing: string[]
  sources: { id: string; title: string; url: string; asOf: string }[]
  review: { mode: 'programmatic' | 'company' | 'independent'; by: string; note: string }
}
export const VALUATION_FILTERS = [
  { id: 'all', label: '估值：全部' }, { id: 'below', label: '低于情景区间' }, { id: 'within', label: '区间内' },
  { id: 'above', label: '高于情景区间' }, { id: 'future', label: '未来情景' },
  { id: 'unreliable', label: '估值待核' }, { id: 'waiting', label: '等待证据' },
] as const
// numeric/undated stay matchable for compatibility but are not visible buttons.
export type ValuationFilter = typeof VALUATION_FILTERS[number]['id'] | 'numeric' | 'undated'
export const STATUS_LABEL = { conditional: '条件初稿', reviewed: '已复核', insufficient: '等待证据' }

/** 展示规则，不是投资阈值：前瞻市盈率超过此值则市盈率法不适用。 */
export const RELIABILITY_PE_MAX = 60
/** 展示规则，不是投资阈值：前瞻 / 过去 12 个月每股收益跨度超过此倍数则标记。 */
export const RELIABILITY_EPS_RATIO_MAX = 3
/** 展示规则，不是投资阈值：现价 / 基准超过此倍数则标记相差过大。 */
export const RELIABILITY_GAP_HIGH = 2
/** 展示规则，不是投资阈值：现价 / 基准低于此比例则标记相差过大。 */
export const RELIABILITY_GAP_LOW = 0.5

export type ValuationReliabilityReason = {
  code: 'pe' | 'eps' | 'gap'
  text: string
  short: string
}
export type ValuationReliability =
  | { ok: true }
  | { ok: false; reasons: ValuationReliabilityReason[] }

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const recordOf = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const texts = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string')
const dateOk = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v
const rangeOk = (v: unknown): v is number[] => Array.isArray(v) && v.length === 3 && v.every(x => finite(x) && x >= 0) && v[0] <= v[1] && v[1] <= v[2]
export function parseValuationDocument(data: unknown, market: Market): Map<string, CompanyValuation> {
  const out = new Map<string, CompanyValuation>()
  if (!recordOf(data) || data.schemaVersion !== 1 || !dateOk(data.asOf) || !Array.isArray(data.records)) return out
  for (const r of data.records) {
    if (!recordOf(r) || r.market !== market || typeof r.code !== 'string' || r.key !== `${market}:${r.code}` || r.asOf !== data.asOf
      || !['name', 'currency', 'quality', 'pricing', 'expectations', 'risk'].every(k => typeof r[k] === 'string' && r[k])
      || !['conditional', 'reviewed', 'insufficient'].includes(String(r.status)) || !texts(r.assumptions) || !texts(r.missing)
      || !recordOf(r.price) || r.price.currency !== r.currency || !Array.isArray(r.sources) || !Array.isArray(r.methods)
      || !recordOf(r.review) || !['programmatic', 'company', 'independent'].includes(String(r.review.mode))
      || typeof r.review.by !== 'string' || typeof r.review.note !== 'string' || (r.status === 'reviewed' && r.review.mode === 'programmatic')) continue
    if (!r.sources.every(s => recordOf(s) && ['id', 'title', 'url'].every(k => typeof s[k] === 'string' && s[k]) && dateOk(s.asOf))) continue
    const ids = r.sources.map(s => s.id)
    if (new Set(ids).size !== ids.length) continue
    if (r.price.value !== null && (!finite(r.price.value) || r.price.value <= 0 || !dateOk(r.price.date) || !ids.includes(r.price.source))) continue
    const methods = r.methods
    if (!methods.every(m => recordOf(m) && typeof m.name === 'string' && typeof m.applicable === 'boolean' && typeof m.reason === 'string' && typeof m.formula === 'string' && recordOf(m.inputs) && texts(m.sourceIds) && m.sourceIds.every(id => ids.includes(id)) && (m.values === null || (m.applicable && m.sourceIds.length > 0 && rangeOk(m.values))))) continue
    if (!['PE', 'PEG', 'PB'].every(name => methods.some(m => m.name === name))) continue
    if (r.status === 'insufficient' && (r.value !== null || !r.missing.length)) continue
    if (r.value !== null) {
      const v = r.value
      if (!recordOf(v) || !rangeOk([v.low, v.base, v.high])) continue
      if ((v.kind === 'present' && v.date !== r.asOf) || (v.kind === 'future' && (!dateOk(v.date) || v.date <= String(r.asOf))) || (v.kind === 'undated' && v.date !== null) || !['present', 'future', 'undated'].includes(String(v.kind))) continue
      const method = methods.find(m => m.name === v.primaryMethod)
      if (!method || JSON.stringify(method.values) !== JSON.stringify([v.low, v.base, v.high])) continue
    }
    out.set(r.code, r as unknown as CompanyValuation)
  }
  return out
}
export async function loadCompanyValuations(market: Market): Promise<Map<string, CompanyValuation>> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data/company-valuations/${market}.json`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const document: unknown = await response.json()
    const parsed = parseValuationDocument(document, market)
    if (!recordOf(document) || !Array.isArray(document.records) || parsed.size !== document.records.length) {
      console.warn(`[company-valuation] ${market}: 估值文档包含无效记录，仅展示通过校验的记录`)
    }
    return parsed
  } catch (error) {
    console.warn(`[company-valuation] ${market}: 估值加载失败`, error)
    return new Map()
  }
}
export function compareValuation(record: CompanyValuation, refreshed?: { price: number; priceDate: string; currency?: string }) {
  const label = record.value?.kind === 'present' ? '基准日条件估值' : record.value?.kind === 'future' ? '未来情景' : '未定期限情景'
  const newer = refreshed && refreshed.currency === record.currency && refreshed.price > 0 && Number.isFinite(refreshed.price) && dateOk(refreshed.priceDate.slice(0, 10)) && (!record.price.date || refreshed.priceDate.slice(0, 10) >= record.price.date)
  const current = newer ? refreshed.price : finite(record.price.value) && record.price.value > 0 ? record.price.value : null
  const priceDate = newer ? refreshed.priceDate.slice(0, 10) : current === null ? null : record.price.date
  const usable = record.value && record.status !== 'insufficient' && current !== null && current > 0
  const comparable = usable && record.value!.base > 0
  return {
    current, priceDate, label,
    baseGap: usable ? record.value!.base / current - 1 : null,
    lowGap: usable ? record.value!.low / current - 1 : null,
    highGap: usable ? record.value!.high / current - 1 : null,
    position: !comparable ? null : current < record.value!.low ? 'below' : current > record.value!.high ? 'above' : 'within',
  }
}

/**
 * 展示层可信度：区间是否宜作为偏低 / 偏高依据。
 * 未来情景、等待证据、无数值估值、无现价不参与判定（返回 ok）。
 */
export function valuationReliability(
  record: CompanyValuation,
  refreshed?: { price: number; priceDate: string; currency?: string },
): ValuationReliability {
  if (record.status === 'insufficient' || !record.value || record.value.kind === 'future') return { ok: true }
  const { current } = compareValuation(record, refreshed)
  if (current === null || !(current > 0)) return { ok: true }

  const reasons: ValuationReliabilityReason[] = []
  const v = record.value
  const primary = v.primaryMethod
  const peInputs = record.methods.find(m => m.name === 'PE')?.inputs ?? {}
  const epsForward = peInputs.epsForward
  const epsTtm = peInputs.epsTrailingTwelveMonths

  if (primary === 'PE') {
    if (!finite(epsForward) || !(epsForward > 0)) {
      reasons.push({
        code: 'pe',
        text: '前瞻盈利不为正，市盈率法不适用',
        short: '市盈率法不适用',
      })
    } else {
      const forwardPe = current / epsForward
      if (forwardPe > RELIABILITY_PE_MAX) {
        reasons.push({
          code: 'pe',
          text: `按前瞻盈利计市盈率 ${Math.round(forwardPe)} 倍，盈利过低，市盈率法不适用`,
          short: '市盈率法不适用',
        })
      }
    }
    if (finite(epsForward) && epsForward > 0 && finite(epsTtm) && epsTtm > 0) {
      const ratio = epsForward / epsTtm
      if (ratio > RELIABILITY_EPS_RATIO_MAX) {
        reasons.push({
          code: 'eps',
          text: `前瞻盈利是过去 12 个月的 ${ratio.toFixed(1)} 倍，估值高度依赖盈利预测`,
          short: '盈利预测跨度过大',
        })
      } else if (ratio < 1 / RELIABILITY_EPS_RATIO_MAX) {
        reasons.push({
          code: 'eps',
          text: '前瞻盈利不到过去 12 个月的 1/3',
          short: '盈利预测跨度过大',
        })
      }
    }
  }

  if (v.base > 0) {
    const gap = current / v.base
    if (gap > RELIABILITY_GAP_HIGH) {
      reasons.push({
        code: 'gap',
        text: `现价是基准的 ${gap >= 1000 ? '>1000' : gap.toFixed(1)} 倍，估值输入待核`,
        short: '现价与基准相差过大',
      })
    } else if (gap < RELIABILITY_GAP_LOW) {
      reasons.push({
        code: 'gap',
        text: `现价只有基准的 ${Math.round(gap * 100)}%，估值输入待核`,
        short: '现价与基准相差过大',
      })
    }
  }

  return reasons.length ? { ok: false, reasons } : { ok: true }
}

export function matchValuationFilter(filter: ValuationFilter, record?: CompanyValuation, refreshed?: Company['marketRefresh']): boolean {
  if (filter === 'all') return true
  if (filter === 'waiting') return !record || record.status === 'insufficient' || !record.value
  if (!record || !record.value || record.status === 'insufficient') return false
  if (filter === 'numeric') return true
  if (filter === 'undated' || filter === 'future') return record.value.kind === filter
  const quote = refreshed?.tradability === 'unverified' ? undefined : refreshed
  const reliability = valuationReliability(record, quote)
  if (filter === 'unreliable') return !reliability.ok
  if (record.value.kind === 'future') return false
  if (!reliability.ok) return false
  return compareValuation(record, quote).position === filter
}
