import type { SavedRecord } from './types'
type Obj = Record<string, unknown>
const object = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const date = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))
const numbers = (v: Obj, fields: string[]) => fields.every(k => finite(v[k]))
const optionalArray = (v: unknown, validate: (item: unknown) => boolean) => v === undefined || Array.isArray(v) && v.every(validate)
function row(v: unknown): boolean {
  if (!object(v) || typeof v.name !== 'string' || typeof v.code !== 'string' || !/^\d{6}$/.test(v.code) || !date(v.date)) return false
  return ['initialPrice', 'initialAmount', 'step', 'gridAmount'].every(k => finite(v[k]) && v[k] > 0) && ['rebound', 'pullback'].every(k => finite(v[k]) && v[k] >= 0)
}
function adjustments(v: Obj): boolean {
  for (const key of ['priceOverrides', 'amountOverrides', 'sharesOverrides']) {
    const map = v[key]
    if (map !== undefined && (!object(map) || !Object.entries(map).every(([day, value]) => date(day) && finite(value) && value > 0))) return false
  }
  return optionalArray(v.paramHistory, s => object(s) && date(s.until) && numbers(s, ['step', 'rebound', 'pullback']) && Number(s.step) > 0 && Number(s.rebound) >= 0 && Number(s.pullback) >= 0)
    && optionalArray(v.manualTrades, t => object(t) && typeof t.id === 'string' && date(t.date) && ['买入', '卖出'].includes(String(t.side)) && finite(t.price) && t.price > 0 && finite(t.shares) && t.shares > 0)
    && optionalArray(v.removedTrades, date)
}
function backup(v: unknown): boolean {
  return object(v) && typeof v.id === 'string' && typeof v.at === 'string' && date(v.date) && row(v.row) && adjustments(v)
    && numbers(v, ['price', 'pnl', 'holding', 'position', 'capital', 'maxCapital', 'buys', 'sells', 'lastTrade']) && typeof v.lastTradeDate === 'string'
}
export function validSavedRecord(v: unknown): v is SavedRecord {
  if (!object(v) || typeof v.id !== 'string' || !v.id.trim() || typeof v.savedAt !== 'string' || !Number.isFinite(Date.parse(v.savedAt)) || !row(v.row) || !object(v.result) || !adjustments(v)) return false
  const r = v.result
  return numbers(r, ['current', 'lastTrade', 'nextBuy', 'nextSell', 'buyTrigger', 'sellTrigger', 'pnl', 'value', 'realized', 'maxCapital', 'buys', 'sells'])
    && typeof r.range === 'string' && typeof r.lastTradeDate === 'string'
    && Array.isArray(r.trades) && r.trades.every(t => object(t) && date(t.date) && ['建仓', '买入', '卖出'].includes(String(t.side)) && numbers(t, ['price', 'amount', 'shares', 'pnl']) && Number(t.price) > 0 && Number(t.amount) > 0 && (t.quantity === undefined || finite(t.quantity)) && (t.capitalUsed === undefined || finite(t.capitalUsed)))
    && Array.isArray(r.series) && r.series.every(p => object(p) && date(p.date) && numbers(p, ['current', 'positionValue', 'capitalUsed', 'pnl']))
    && (r.position === undefined || finite(r.position)) && optionalArray(v.backups, backup)
    && (v.endDate === undefined || v.endDate === '' || date(v.endDate))
    && (v.updatedAt === undefined || typeof v.updatedAt === 'string' && Number.isFinite(Date.parse(v.updatedAt)))
}
