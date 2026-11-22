const moneyFormatter = new Intl.NumberFormat('zh-CN', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
})

export function money(value: number): string {
  return Number.isFinite(value) ? moneyFormatter.format(value) : '—'
}

export function signedMoney(value: number): string {
  return `${value > 0 ? '+' : ''}${money(value)}`
}

export function number(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits).replace('-', '−') : '—'
}

export function percent(value: number, digits = 1): string {
  return Number.isFinite(value) ? `${number(value * 100, digits)}%` : '—'
}

export function signedPercent(value: number, digits = 1): string {
  return Number.isFinite(value) ? `${value > 0 ? '+' : ''}${percent(value, digits)}` : '—'
}

export function returnClass(value: number): string {
  return value > 0 ? 'pr-positive' : value < 0 ? 'pr-negative' : ''
}

const SIGNAL_LABELS: Record<string, string> = {
  QQQ: '纳指 100',
  SPY: '标普 500',
}

/** 信号指数短名，如「纳指 100」「标普 500」；未知代码回退为 symbol 本身 */
export function signalLabel(symbol: string): string {
  return SIGNAL_LABELS[symbol] ?? symbol
}

/** 下拉选项文案，如「纳指 100（QQQ）」 */
export function signalOptionLabel(symbol: string): string {
  return `${signalLabel(symbol)}（${symbol}）`
}
