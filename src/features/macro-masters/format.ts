import type { Reading } from './types'

const NUMBER = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 })
const FRACTION = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 })
const QUARTERS = ['一', '二', '三', '四']

/** 读数数值 + 单位：pp/bp 中文化，大额十亿美元改万亿，负号用 −；四舍五入后为 0 时去掉负号 */
export function number(value: number, unit = ''): string {
  if (unit === '十亿美元' && Math.abs(value) >= 1000) {
    value /= 1000
    unit = '万亿美元'
  }
  if (unit === 'pp') unit = '个百分点'
  if (unit === 'bp') unit = '个基点'
  const format = Math.abs(value) < 1 ? FRACTION : NUMBER
  let digits = format.format(value).replace('-', '−')
  if (/^−0(?:\.0+)?$/.test(digits)) digits = '0'
  return unit && unit !== '%' ? `${digits} ${unit}` : digits + unit
}

/** 证据句里的短日期：月频「11 月」、季频「2026 年二季度」、其余 MM-DD */
export function dateLabel(date: string, frequency?: Reading['frequency']): string {
  const month = Number(date.slice(5, 7))
  if (frequency === 'monthly') return `${month} 月`
  if (frequency === 'quarterly') return `${date.slice(0, 4)} 年${QUARTERS[Math.floor((month - 1) / 3)]}季度`
  return date.slice(5)
}

/** 表格 / 单元格用的观测日期：月频到月、季频到季度、其余完整日 */
export function displayDate(date: string, frequency?: Reading['frequency']): string {
  if (!date || date.length < 7) return date
  if (frequency === 'monthly') return date.slice(0, 7)
  if (frequency === 'quarterly') {
    const month = Number(date.slice(5, 7))
    return `${date.slice(0, 4)} 年${QUARTERS[Math.floor((month - 1) / 3)]}季度`
  }
  return date
}

/** 读数展示用单位；高收益债强制基点；铜金比长单位不跟数字 */
export function readingUnit(reading: Pick<Reading, 'key' | 'unit'>): string {
  if (reading.key === 'hySpread') return 'bp'
  if (reading.key === 'copperGold') return ''
  return reading.unit
}

export function formattedReading(reading: Pick<Reading, 'key' | 'unit' | 'value'>, value = reading.value): string {
  return number(value, readingUnit(reading))
}

/** 拆成数字与单位后缀，便于单元格里分别加粗 / 测断言 */
export function formattedReadingParts(
  reading: Pick<Reading, 'key' | 'unit' | 'value'>,
  value = reading.value,
): { digits: string; unitSuffix: string } {
  const full = formattedReading(reading, value)
  const unit = readingUnit(reading)
  if (!unit) return { digits: full, unitSuffix: '' }
  if (unit === '%') return { digits: full.replace(/%$/, ''), unitSuffix: '%' }
  const mapped = unit === 'bp' ? '个基点'
    : unit === 'pp' ? '个百分点'
    : unit === '十亿美元' && Math.abs(value) >= 1000 ? '万亿美元'
    : unit === '十亿美元' ? '十亿美元'
    : unit
  const suffix = ` ${mapped}`
  if (full.endsWith(suffix)) {
    return { digits: full.slice(0, -suffix.length), unitSuffix: mapped }
  }
  return { digits: full, unitSuffix: '' }
}

export function copperGoldUnitNote(unit: string): string | undefined {
  if (!unit || unit === '%' || unit === 'bp' || unit === 'pp') return undefined
  if (unit.includes('÷') || unit.includes('/')) return `单位：${unit}`
  return undefined
}

/** 格式化后是否为数值 0（含 −0） */
export function formatsAsZero(value: number, unit = ''): boolean {
  const digits = number(value, unit).replace(/%$/, '').replace(/ .*$/, '')
  return digits === '0'
}
