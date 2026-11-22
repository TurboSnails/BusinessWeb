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
