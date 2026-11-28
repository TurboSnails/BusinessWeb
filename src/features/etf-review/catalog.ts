import type { PlanKey } from '../etf-signal-plans/plan-trades'

export const CATALOG_GROUPS = [
  { id: 'cyb-good', name: '创业板择时优选', plan: 'cyb' },
  { id: 'hs-good', name: '沪深300择时优选', plan: 'hs' },
  { id: 'cyb-watch', name: '创业板择时待选', plan: 'cyb' },
  { id: 'hs-watch', name: '沪深300择时待选', plan: 'hs' },
] as const

export type CatalogId = typeof CATALOG_GROUPS[number]['id']
export type CatalogItem = { code: string; name: string; plan?: PlanKey }
export type CatalogGroup = typeof CATALOG_GROUPS[number] & { items: CatalogItem[] }

export function reviewCatalog(cyb: CatalogItem[], hs: CatalogItem[], watch: CatalogItem[]): CatalogGroup[] {
  return CATALOG_GROUPS.map((group, index) => ({
    ...group, items: index === 0 ? cyb : index === 1 ? hs : watch.filter(item => item.plan === group.plan),
  }))
}

export function defaultPlans(groups: CatalogGroup[]): Map<string, PlanKey> {
  const result = new Map<string, PlanKey>()
  for (const group of groups) {
    for (const { code } of group.items) if (!result.has(code)) result.set(code, group.plan)
  }
  return result
}

export async function loadReviewCatalog(signal: AbortSignal): Promise<CatalogGroup[]> {
  const names = ['etf-macd-good', 'etf-hs300-timing', 'etf-watch-pool']
  const lists = await Promise.all(names.map(async name => {
    const res = await fetch(`${import.meta.env.BASE_URL}data/${name}.json`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
    })
    if (!res.ok) throw new Error('清单暂不可用')
    const data = await res.json() as { items?: CatalogItem[] }
    if (!Array.isArray(data?.items) || !data.items.every(item => item && typeof item.code === 'string'
      && /^\d{6}$/.test(item.code) && typeof item.name === 'string')) {
      throw new Error('清单暂不可用')
    }
    return data.items
  }))
  return reviewCatalog(lists[0], lists[1], lists[2])
}
