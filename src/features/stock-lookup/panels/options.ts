import type { OptionContract, OptionSideTotal } from '../types'

/** 每张合约按 100 股计 */
export const CONTRACT_MULTIPLIER = 100

/** 看跌 ÷ 看涨；看涨为 0 时无意义 */
export function putCallRatio(puts: number, calls: number): number | null {
  return calls > 0 ? puts / calls : null
}

export function sideRatios(calls: OptionSideTotal, puts: OptionSideTotal): { volume: number | null; openInterest: number | null } {
  return { volume: putCallRatio(puts.volume, calls.volume), openInterest: putCallRatio(puts.openInterest, calls.openInterest) }
}

/** 粗算权利金 = 成交量 × 最新价 × 100（美元） */
export function roughPremium(c: Pick<OptionContract, 'volume' | 'lastPrice'>): number | null {
  if (c.lastPrice == null) return null
  return c.volume * c.lastPrice * CONTRACT_MULTIPLIER
}

export function volOiRatio(c: Pick<OptionContract, 'volume' | 'openInterest'>): number | null {
  return c.openInterest > 0 ? c.volume / c.openInterest : null
}

/** 当日成交超过持仓：多半是新开的仓位，但看不出是买方还是卖方 */
export function exceedsOpenInterest(c: Pick<OptionContract, 'volume' | 'openInterest'>): boolean {
  return c.volume > 0 && c.volume > c.openInterest
}

/** ISO 时间 → 美东日期 */
export function etDate(iso?: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return null
  try { return d.toLocaleDateString('sv-SE', { timeZone: 'America/New_York' }) } catch { return iso.slice(0, 10) }
}

/** 本批合约里最近的成交日；早于它的合约成交量来自更早的交易日 */
export function latestTradeDay(rows: Pick<OptionContract, 'lastTrade'>[]): string | null {
  let best: string | null = null
  for (const r of rows) {
    const d = etDate(r.lastTrade)
    if (d && (!best || d > best)) best = d
  }
  return best
}

/** 到期日距今天数（含当天为 0） */
export function daysToExpiry(expiration: string, today: string): number {
  return Math.round((Date.parse(`${expiration}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
}
