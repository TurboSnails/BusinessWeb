// 按 DCF 筛选公司。DCF 来源：本人保存的记录优先，否则用预填库的自动估值；安全边际按最新股价计算。
import type { AutoStatus } from './autofill.ts'
import type { Credibility } from './assessment.ts'

export type DcfFilterId = 'all' | 'done' | 'none' | 'mos0' | 'mos20' | 'buy' | 'mine'

export const DCF_FILTERS: Array<{ id: DcfFilterId; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'done', label: '有 DCF 估值' },
  { id: 'none', label: '不适用/未覆盖' },
  { id: 'mos0', label: '安全边际 ≥0' },
  { id: 'mos20', label: '安全边际 ≥20%' },
  { id: 'buy', label: '低于买入参考价' },
  { id: 'mine', label: '我算过的' },
]

export interface DcfSummary {
  /** 合理价 */
  price: number | null
  /** 安全边际 = (合理价 − 现价) / 现价 */
  mos: number | null
  source?: 'mine' | 'auto'
  current?: number | null
  buyBelow?: number | null
  status?: AutoStatus
  credibility?: Credibility | null
  currency?: string
  savedAt?: string
}

export function matchDcfFilter(filter: DcfFilterId, dcf: DcfSummary | undefined): boolean {
  if (filter === 'all') return true
  const has = !!dcf && dcf.price != null
  if (filter === 'none') return !has
  if (!dcf || !has) return false
  if (filter === 'done') return true
  if (filter === 'mine') return dcf.source === 'mine'
  if (filter === 'buy') return dcf.buyBelow != null && dcf.current != null && dcf.current <= dcf.buyBelow
  if (dcf.mos === null || !Number.isFinite(dcf.mos)) return false
  return dcf.mos >= (filter === 'mos20' ? 0.2 : 0)
}
