import type { AnalystAction, RatingAction } from '../types'

export const ACTION_LABEL: Record<RatingAction, string> = {
  up: '升级',
  down: '降级',
  main: '维持',
  init: '首次覆盖',
  reit: '重申',
  other: '其他',
}

export const PAGE_SIZE = 20

export interface AnalystRow extends AnalystAction {
  upsidePct: number | null
}

export function sortActionsDesc(actions: AnalystAction[]): AnalystAction[] {
  return actions.slice().sort((a, b) => {
    const da = Date.parse(a.date)
    const db = Date.parse(b.date)
    return (Number.isFinite(db) ? db : 0) - (Number.isFinite(da) ? da : 0)
  })
}

export function withUpside(actions: AnalystAction[], currentPrice?: number): AnalystRow[] {
  return sortActionsDesc(actions).map(a => {
    const target = a.target
    let upsidePct: number | null = null
    if (target != null && currentPrice != null && currentPrice > 0) {
      upsidePct = ((target - currentPrice) / currentPrice) * 100
    }
    return { ...a, upsidePct }
  })
}

export function pageCount(total: number, pageSize = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize))
}

export function slicePage<T>(rows: T[], page: number, pageSize = PAGE_SIZE): T[] {
  const pages = pageCount(rows.length, pageSize)
  const p = Math.min(Math.max(1, page), pages)
  const start = (p - 1) * pageSize
  return rows.slice(start, start + pageSize)
}

export function clampPage(page: number, total: number, pageSize = PAGE_SIZE): number {
  return Math.min(Math.max(1, page), pageCount(total, pageSize))
}
