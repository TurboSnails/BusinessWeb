import type { Market } from '../../data/companies'

const ALL_MARKETS: Market[] = ['us', 'ndx', 'adr', 'hk', 'cn']
// 海外公司归入标普、纳指，其余归入其他美股。
export const RESEARCH_US_MARKETS = ['us', 'ndx'] as const

export function marketsForTab(tab: 'mine' | 'research', items: { market: Market }[]): readonly Market[] {
  if (tab === 'research') return RESEARCH_US_MARKETS
  const seen = new Set(items.map(item => item.market))
  return ALL_MARKETS.filter(market => seen.has(market))
}
