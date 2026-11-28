const KEY = 'stock-lookup-recent'
const MAX = 8

export interface RecentHit {
  symbol: string
  name: string
}

export function loadRecentSymbols(): RecentHit[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((x): x is RecentHit => !!x && typeof x === 'object' && typeof (x as RecentHit).symbol === 'string')
      .slice(0, MAX)
  } catch {
    return []
  }
}

export function pushRecentSymbol(hit: RecentHit): RecentHit[] {
  const next = [hit, ...loadRecentSymbols().filter(r => r.symbol.toUpperCase() !== hit.symbol.toUpperCase())].slice(0, MAX)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch { /* 隐私模式 */ }
  return next
}
