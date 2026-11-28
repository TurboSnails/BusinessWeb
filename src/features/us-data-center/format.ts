const numberFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 })
const compactFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 })

export const formatNumber = (value: number): string => numberFormat.format(value)
export const formatPrice = (value: number): string => `$${value.toFixed(2)}`
export const formatChange = (value: number | null): string => value === null ? '—' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(2)}%`
export const formatVolume = (value: number): string => value >= 100_000_000
  ? `${compactFormat.format(value / 100_000_000)} 亿`
  : value >= 10_000 ? `${compactFormat.format(value / 10_000)} 万` : formatNumber(value)
export const formatMarketCap = (value: number): string => value >= 1_000_000_000_000
  ? `${compactFormat.format(value / 1_000_000_000_000)} 万亿美元`
  : `${compactFormat.format(value / 100_000_000)} 亿美元`

export function formatNyTime(value: string | null): string {
  if (!value) return '时间待核对'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '时间待核对'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(date)
}

export function nyMonth(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit' }).format(now)
}

export const stockPath = (symbol: string): string => `/research-notes?tab=lookup&s=${encodeURIComponent(symbol)}`
