import type { InsiderTransaction, InsiderTxType } from '../types'

export const INSIDER_TYPE_LABEL: Record<InsiderTxType, string> = {
  buy: '公开市场买入',
  sell: '卖出',
  exercise: '行权',
  award: '公司授予',
  gift: '赠与',
  other: '未注明',
}

export const INSIDER_TYPE_TONE: Record<InsiderTxType, 'up' | 'down' | 'muted'> = {
  buy: 'up',
  sell: 'down',
  exercise: 'muted',
  award: 'muted',
  gift: 'muted',
  other: 'muted',
}

const ROLE_MAP: Record<string, string> = {
  'chief executive officer': '首席执行官',
  'chief financial officer': '首席财务官',
  'chief operating officer': '首席运营官',
  'chief technology officer': '首席技术官',
  'chief accounting officer': '首席会计官',
  'chief legal officer': '首席法务官',
  'chief marketing officer': '首席营销官',
  'chief revenue officer': '首席营收官',
  'chief people officer': '首席人力官',
  'chief product officer': '首席产品官',
  'chief information officer': '首席信息官',
  'general counsel': '总法律顾问',
  president: '总裁',
  director: '董事',
  officer: '高管',
  chairman: '董事长',
  'chairman of the board': '董事长',
  'executive chairman': '执行董事长',
  'vice chairman': '副董事长',
  'executive vice president': '执行副总裁',
  'senior vice president': '高级副总裁',
  'vice president': '副总裁',
  secretary: '公司秘书',
  treasurer: '财务主管',
  controller: '财务总监',
  'beneficial owner (10% or more)': '持股 10% 以上股东',
  'beneficial owner of more than 10% of a class of security': '持股 10% 以上股东',
  'former officer': '前高管',
  'former director': '前董事',
}

/** 英文职务 → 中文；组合职务按 and / 逗号拆开翻译，认不出的保留原文 */
export function roleLabel(role: string): string {
  const raw = role.trim()
  if (!raw) return '—'
  const whole = ROLE_MAP[raw.toLowerCase()]
  if (whole) return whole
  const parts = raw.split(/\s*(?:,|&|\band\b)\s*/i).filter(Boolean)
  if (parts.length > 1 && parts.every(p => ROLE_MAP[p.toLowerCase()])) {
    return parts.map(p => ROLE_MAP[p.toLowerCase()]).join('、')
  }
  return raw
}

export function insiderPriceText(tx: Pick<InsiderTransaction, 'priceLow' | 'priceHigh'>): string {
  if (tx.priceLow == null) return '—'
  if (tx.priceHigh == null || tx.priceHigh === tx.priceLow) return `$${tx.priceLow.toFixed(2)}`
  return `$${tx.priceLow.toFixed(2)}–${tx.priceHigh.toFixed(2)}`
}

export type InsiderFilter = 'all' | 'trade' | 'buy' | 'sell'

export function filterInsider(rows: InsiderTransaction[], filter: InsiderFilter): InsiderTransaction[] {
  if (filter === 'trade') return rows.filter(r => r.type === 'buy' || r.type === 'sell')
  if (filter === 'buy' || filter === 'sell') return rows.filter(r => r.type === filter)
  return rows
}

/** 各类型笔数，用于筛选按钮计数 */
export function insiderTypeCounts(rows: InsiderTransaction[]): Record<InsiderTxType, number> {
  const out: Record<InsiderTxType, number> = { buy: 0, sell: 0, exercise: 0, award: 0, gift: 0, other: 0 }
  for (const r of rows) out[r.type] += 1
  return out
}
