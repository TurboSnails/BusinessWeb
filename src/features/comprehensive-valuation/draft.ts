import { emptyMultiples, MULTIPLE_METHODS, type MultipleResearch } from './multiples'
import { exampleInputs, type ValuationInputs } from './model'

const KEY = 'businessweb.comprehensive-valuation.v1'
export interface ResearchDraft {
  version: 1
  inputs: ValuationInputs
  company: string
  currency: string
  notes: string[]
  checked: boolean[]
  multiples: MultipleResearch
}
export const emptyDraft = (): ResearchDraft => ({ version: 1, inputs: exampleInputs(), company: '', currency: 'CNY', notes: ['', '', '', ''], checked: Array(8).fill(false), multiples: emptyMultiples() })
export function loadDraft(): ResearchDraft {
  try {
    const value: ResearchDraft = JSON.parse(localStorage.getItem(KEY) || 'null')
    const strings = (v: unknown) => Array.isArray(v) && v.every(s => typeof s === 'string')
    const r = value?.multiples
    if (value?.version !== 1 || typeof value.company !== 'string' || typeof value.currency !== 'string'
      || !strings(value.notes) || value.notes.length !== 4 || !Array.isArray(value.checked) || value.checked.length !== 8 || !value.checked.every(v => typeof v === 'boolean')
      || !value.inputs || typeof value.inputs.current !== 'string' || typeof value.inputs.years !== 'string'
      || value.inputs.scenarios.length !== 3 || !value.inputs.scenarios.every(s => ['price', 'dividend', 'probability'].every(k => typeof s[k as keyof typeof s] === 'string'))
      || !r || r.rows.length !== 3 || !r.rows.every(row => ['eps', 'bvps', 'growth', ...MULTIPLE_METHODS].every(k => typeof row[k as keyof typeof row] === 'string'))
      || !MULTIPLE_METHODS.every(m => typeof r.applicable[m] === 'boolean' && typeof r.evidence[m] === 'string')
      || typeof r.differences !== 'string' || typeof r.financialBasis !== 'string' || typeof r.requiredReturn !== 'string'
      || !(r.adopted === null || MULTIPLE_METHODS.includes(r.adopted))
      || !(r.source === null || (['label', 'asOf', 'currency', 'years'].every(k => typeof r.source?.[k as 'label'] === 'string') && strings(r.source.sources) && strings(r.source.rationales) && strings(r.source.missing)))) return emptyDraft()
    return value
  } catch { return emptyDraft() }
}
export function saveDraft(draft: ResearchDraft): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(draft)); return true } catch { return false }
}
