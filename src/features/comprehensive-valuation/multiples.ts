import { calculateMultiple, importReport, SCENARIOS } from '../valuation'
import type { MethodResult } from '../valuation'
import type { ValuationInputs } from './model'

export const MULTIPLE_METHODS = ['pe', 'peg', 'pb'] as const
export type MultipleMethod = typeof MULTIPLE_METHODS[number]
export const MULTIPLE_LABELS = { pe: 'PE', peg: 'PEG', pb: 'PB' }
export interface MultipleRow { eps: string; growth: string; bvps: string; pe: string; peg: string; pb: string }
export interface MultipleResearch {
  rows: MultipleRow[]
  applicable: Record<MultipleMethod, boolean>
  evidence: Record<MultipleMethod, string>
  differences: string
  financialBasis: string
  requiredReturn: string
  adopted: MultipleMethod | null
  source: null | { label: string; asOf: string; currency: string; years: string; sources: string[]; rationales: string[]; missing: string[] }
}
export function emptyMultiples(): MultipleResearch {
  return {
    rows: SCENARIOS.map(() => ({ eps: '', growth: '', bvps: '', pe: '', peg: '', pb: '' })),
    applicable: { pe: true, peg: true, pb: true }, evidence: { pe: '', peg: '', pb: '' },
    differences: '', financialBasis: '', requiredReturn: '', adopted: null, source: null,
  }
}
const numeric = (v: string) => v.trim() === '' ? null : Number(v)
export function calculateMultiples(research: MultipleResearch, years: string): Record<MultipleMethod, MethodResult>[] {
  return research.rows.map(row => Object.fromEntries(MULTIPLE_METHODS.map(method => {
    const result: MethodResult = research.applicable[method]
      ? calculateMultiple({
        method, metric: numeric(method === 'pb' ? row.bvps : row.eps), multiple: numeric(row[method]),
        growth: numeric(row.growth) === null ? null : Number(row.growth) / 100,
        years: numeric(years) ?? NaN,
        requiredReturn: research.requiredReturn.trim() === '' ? undefined : Number(research.requiredReturn) / 100,
      })
      : { status: 'notApplicable', price: null, reason: '研究者标记为不适用，请查看方法依据。' }
    return [method, result]
  })) as Record<MultipleMethod, MethodResult>)
}

export function researchFromReport(text: string) {
  const report = importReport(text)
  const { snapshot, assumptions } = report
  const date = new Date(snapshot.asOf)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshot.asOf) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== snapshot.asOf) {
    throw new Error('报告估值日期无效，请先核对日期。')
  }
  const forecastYears = SCENARIOS.map(k => assumptions.scenarios[k].year)
  if (new Set(forecastYears).size !== 1) throw new Error('导入需三情景采用同一预测年度，请先在工作台统一。')
  const years = forecastYears[0] - Number(snapshot.asOf.slice(0, 4))
  if (years < 0) throw new Error('预测年度早于估值日期，请先核对报告。')
  const foreign = Object.values(snapshot.facts).filter(f => f.unit !== 'shares' && f.value !== null && f.currency && f.currency !== snapshot.security.quoteCurrency)
  if (foreign.some(f => !(Number(snapshot.facts[`fx_${f.currency}`]?.value) > 0))) {
    throw new Error('报告缺少跨币种汇率，请先在工作台核对报价币种口径。')
  }
  if (snapshot.facts.price?.currency && snapshot.facts.price.currency !== snapshot.security.quoteCurrency) {
    throw new Error('现价币种与证券报价币种不一致，请先在工作台换算并核对。')
  }
  const str = (value: number | null) => value === null ? '' : String(value)
  const research = emptyMultiples()
  research.rows = SCENARIOS.map(k => {
    const s = assumptions.scenarios[k]
    return { eps: str(s.eps), bvps: str(s.bvps), growth: s.growth === null ? '' : String(Number((s.growth * 100).toPrecision(12))), pe: str(s.pe), peg: str(s.peg), pb: str(s.pb) }
  })
  for (const method of MULTIPLE_METHODS) {
    research.applicable[method] = assumptions.methodSuitability[method].applicable
    research.evidence[method] = assumptions.methodSuitability[method].reason
  }
  research.source = {
    label: `${snapshot.security.name} · ${snapshot.security.code}`,
    asOf: snapshot.asOf, currency: snapshot.security.quoteCurrency, years: String(years),
    sources: snapshot.sources.map(s => `${s.title}：${s.url}`),
    rationales: SCENARIOS.map(k => `${assumptions.scenarios[k].rationale}\n原报告要求年化回报率：${assumptions.scenarios[k].requiredReturn * 100}%`), missing: snapshot.missing,
  }
  research.financialBasis = `报告估值日期 ${snapshot.asOf}；预测年度 ${forecastYears[0]}；每股值沿用报告的报价币种口径。\n` +
    ['eps', 'equity', 'shares'].flatMap(key => {
      const f = snapshot.facts[key]
      return f ? [`${key}：${f.periodStart} 至 ${f.periodEnd}，${f.basis}，来源 ${f.sourceId}`] : []
    }).join('\n')
  const returns = SCENARIOS.map(k => assumptions.scenarios[k].requiredReturn)
  if (new Set(returns).size === 1) research.requiredReturn = String(returns[0] * 100)
  else research.financialBasis += '\n原报告三情景要求回报率不同，已保留在来源详情；本页统一要求回报率留空，请按研究目标另行设定。'
  return { research, company: research.source.label, currency: snapshot.security.quoteCurrency, current: str(snapshot.facts.price?.value ?? null), years: String(years) }
}

export function applyMultiple(research: MultipleResearch, method: MultipleMethod, input: ValuationInputs): ValuationInputs {
  if (!(Number(input.years) > 0) || !Number.isFinite(Number(input.years))) throw new Error('带入未来情景前，请填写大于 0 的兑现期限；基准日估值不能直接当未来卖价。')
  const results = calculateMultiples(research, input.years).map(row => row[method])
  if (results.some(r => r.status !== 'calculated' || r.price === null)) throw new Error('该方法三情景尚不能全部计算，请补齐指标并核对适用性。')
  const prices = results.map(r => r.price as number)
  if (prices[0] > prices[1] || prices[1] > prices[2]) throw new Error('该方法价格须满足悲观 ≤ 基准 ≤ 乐观；请核对经营假设与倍数。')
  return { ...input, scenarios: prices.map(price => ({ price: String(price), dividend: '0', probability: '' })) }
}

export function exportMultiples(research: MultipleResearch, years: string) {
  const results = calculateMultiples(research, years)
  return [
    '\n## PE / PEG / PB 估值分析',
    `已带入的主锚：${research.adopted ? MULTIPLE_LABELS[research.adopted] : '[未选择]'}；要求年化回报率：${research.requiredReturn.trim() || '[未设定]'}%；期限：${years} 年`,
    `财务口径与日期：${research.financialBasis || '[MISSING]'}`,
    ...research.rows.map((row, i) => `${['悲观', '基准', '乐观'][i]}：EPS ${row.eps || '[MISSING]'}；增长率 ${row.growth || '[MISSING]'}%；BVPS ${row.bvps || '[MISSING]'}；PE ${row.pe || '[MISSING]'}；PEG ${row.peg || '[MISSING]'}；PB ${row.pb || '[MISSING]'}\n` + MULTIPLE_METHODS.map(m => `${MULTIPLE_LABELS[m]}：${results[i][m].price ?? results[i][m].reason}；要求回报下现价约束 ${results[i][m].presentPrice ?? '未计算'}`).join('\n')),
    ...MULTIPLE_METHODS.map(m => `${MULTIPLE_LABELS[m]} ${research.applicable[m] ? '参与比较' : '不适用'}；倍数依据：${research.evidence[m] || '[MISSING]'}`),
    `共同假设、方法分歧与主辅锚理由：${research.differences || '[MISSING]'}`,
    ...(research.source ? [`导入来源：${research.source.label}；${research.source.asOf}；${research.source.currency}；原期限 ${research.source.years} 年`, ...research.source.rationales, ...research.source.sources, ...research.source.missing.map(s => `来源数据缺口：${s}`)] : ['手工研究假设，未导入工作台报告。']),
    '草稿 / 未经独立核验。乘数法共享经营假设，不自动平均；要求回报下现价约束未包含分红、税费及尾部。',
  ]
}
