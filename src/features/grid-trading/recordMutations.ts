import { adjustmentsOf, calculateGrid } from './simulation'
import type { Backup, Candle, GridParams, GridResult, ManualTrade, SavedRecord } from './types'

type OverridePatch = { price?: number | null; amount?: number | null; shares?: number | null }
type ParamPatch = Partial<Pick<GridParams, 'step' | 'rebound' | 'pullback'>>
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))

export function positionOf(result: GridResult): number {
  if (typeof result.position === 'number') return result.position
  const last = result.series[result.series.length - 1]
  return last && result.current > 0 ? last.positionValue / result.current : result.trades[result.trades.length - 1]?.shares ?? 0
}
export function assertPosition(result: GridResult): void {
  if (positionOf(result) < -1e-6 || result.series.some(point => point.positionValue < -1e-6) || result.trades.some(trade => trade.manual && trade.shares < -1e-6)) throw new Error('操作后持仓将变为负数；卖出份额不能超过当时持仓，记录未保存')
}

export function appendParamStage(record: SavedRecord, patch: ParamPatch, now = new Date()): SavedRecord {
  Object.entries(patch).forEach(([key, value]) => {
    if (!Number.isFinite(value) || value! < 0 || (key === 'step' && value === 0)) throw new Error('网格参数无效')
  })
  const row = { ...record.row, ...patch }
  if (!record.result.trades.some(t => t.side !== '建仓' && !t.manual)) return { ...record, row, paramHistory: undefined }
  const day = new Date(now.valueOf() + 8 * 3600 * 1000)
  day.setUTCDate(day.getUTCDate() - 1)
  const until = [record.result.lastTradeDate, day.toISOString().slice(0, 10)].sort()[1]
  const history = record.paramHistory ?? []
  const paramHistory = history.some(stage => stage.until === until) ? history : [...history, {
    until, step: record.row.step, rebound: record.row.rebound, pullback: record.row.pullback,
  }].sort((a, b) => a.until.localeCompare(b.until))
  return { ...record, row, paramHistory }
}

export function updateTradeOverride<T extends SavedRecord | Backup>(record: T, date: string, patch: OverridePatch): T {
  if (patch.amount != null && patch.shares != null) throw new Error('金额和份额不能同时设置')
  const updated = { ...record }
  const fields = { price: 'priceOverrides', amount: 'amountOverrides', shares: 'sharesOverrides' } as const
  for (const key of Object.keys(patch) as (keyof OverridePatch)[]) {
    const value = patch[key]
    if (value != null && (!Number.isFinite(value) || value <= 0)) throw new Error('成交修正必须大于零')
    const map = { ...updated[fields[key]] }
    if (value == null) delete map[date]
    else map[date] = value
    updated[fields[key]] = map
  }
  if (patch.amount != null) { updated.sharesOverrides = { ...updated.sharesOverrides }; delete updated.sharesOverrides[date] }
  if (patch.shares != null) { updated.amountOverrides = { ...updated.amountOverrides }; delete updated.amountOverrides[date] }
  return updated
}

export const updateBackupOverride = (backup: Backup, date: string, patch: OverridePatch): Backup => updateTradeOverride(backup, date, patch)

export function addManualTrade(record: SavedRecord, trade: ManualTrade): SavedRecord {
  const lastDate = record.result.series[record.result.series.length - 1]?.date
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trade.date) || trade.date < record.row.date || (lastDate && trade.date > lastDate)) throw new Error('手动成交日期必须在回测区间内')
  if (!['买入', '卖出'].includes(trade.side) || !Number.isFinite(trade.price) || trade.price <= 0 || !Number.isFinite(trade.shares) || trade.shares <= 0) throw new Error('手动成交价格和份额必须大于零')
  if ((record.manualTrades ?? []).some(item => item.id === trade.id)) throw new Error('手动成交 ID 已存在')
  return { ...record, manualTrades: [...record.manualTrades ?? [], { ...trade }] }
}
export const removeManualTrade = (record: SavedRecord, id: string): SavedRecord => ({ ...record, manualTrades: (record.manualTrades ?? []).filter(item => item.id !== id) })
export function setGridTradeDeleted(record: SavedRecord, date: string, deleted: boolean): SavedRecord {
  if (date === record.row.date) return record
  const dates = new Set(record.removedTrades ?? [])
  if (deleted) dates.add(date); else dates.delete(date)
  return { ...record, removedTrades: [...dates] }
}

export function createBackup(record: SavedRecord, now = new Date()): Backup {
  const { result } = record
  const last = result.series[result.series.length - 1]
  return clone({
    id: crypto.randomUUID(), at: now.toISOString(), date: last?.date ?? record.row.date,
    price: result.current, pnl: result.pnl, holding: positionOf(result) * result.current,
    position: positionOf(result), capital: last?.capitalUsed ?? record.row.initialAmount,
    maxCapital: result.maxCapital, buys: result.buys, sells: result.sells,
    lastTrade: result.lastTrade, lastTradeDate: result.lastTradeDate, row: record.row,
    priceOverrides: record.priceOverrides, amountOverrides: record.amountOverrides, sharesOverrides: record.sharesOverrides,
    paramHistory: record.paramHistory, manualTrades: record.manualTrades, removedTrades: record.removedTrades,
  })
}
export function appendBackup(record: SavedRecord, backup: Backup): SavedRecord {
  if ((record.backups?.length ?? 0) >= 20) throw new Error('最多保留 20 个快照，请先删除不再需要的快照')
  return { ...record, backups: [...record.backups ?? [], clone(backup)] }
}
export const replayBackup = (backup: Backup, candles: Candle[]) => calculateGrid(backup.row, candles, { ...adjustmentsOf(backup), anchor: { after: backup.date, price: backup.lastTrade } })
export function refreshBackupSnapshot(backup: Backup, candles: Candle[]): Backup {
  const result = calculateGrid(backup.row, candles.filter(c => c.date <= backup.date), adjustmentsOf(backup))
  const last = result.series[result.series.length - 1]
  return { ...backup, price: result.current, pnl: result.pnl, holding: (result.position ?? 0) * result.current,
    position: result.position ?? 0, capital: last?.capitalUsed ?? backup.capital, maxCapital: result.maxCapital,
    buys: result.buys, sells: result.sells, lastTrade: result.lastTrade, lastTradeDate: result.lastTradeDate }
}
