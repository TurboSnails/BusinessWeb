export function readingPrecision(value, unit) {
  if (['百分位', '指数', '基点'].includes(unit)) return 0
  if (['点', '分', '‰'].includes(unit)) return 2
  return value !== 0 && Math.abs(value) < 1 ? 2 : 1
}

export function formatReading(value, unit = '', precision = readingPrecision(value, unit)) {
  if (unit === '指数') return `${value.toLocaleString('en-US', { maximumFractionDigits: precision })} 点`
  if (unit === '百分位' || unit === '基点') {
    const rounded = Math.round(value * 10 ** precision) / 10 ** precision
    return unit === '百分位' ? `第 ${rounded.toFixed(precision)} 百分位` : `${rounded.toFixed(precision)} 个基点`
  }
  const rounded = Number(value.toFixed(precision))
  const number = (['点', '分', '%', '百分点'].includes(unit) ? rounded.toFixed(precision) : String(rounded)).replace('-', '−')
  const suffix = unit === '百分点' ? ' 个百分点' : ['%', '‰', ''].includes(unit) ? unit : ' ' + unit
  return number + suffix
}

export function formatDate(date, frequency = 'daily') {
  const [year, month, day] = date.split('-').map(Number)
  if (frequency === 'monthly') return `${year} 年 ${month} 月`
  return `${month} 月 ${day} 日${frequency === 'weekly' ? '当周' : ''}`
}
