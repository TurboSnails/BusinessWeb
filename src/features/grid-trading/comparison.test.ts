import { expect, it } from 'vitest'
import { comparisonRows } from './comparison'
import { calculateGrid } from './simulation'
import { createBackup } from './recordMutations'
it('uses peak capital for total return and snapshot capital for incremental return', () => {
  const row = { name: 'ETF', code: '510300', date: '2026-01-05', initialPrice: 10, initialAmount: 1000, step: 1, rebound: 0.1, pullback: 0.1, gridAmount: 100 }
  const base = calculateGrid(row, [])
  const backup = { ...createBackup({ id: 'one', savedAt: row.date, row, result: base }), pnl: 100, capital: 1000, maxCapital: 2000 }
  const pure = { ...base, pnl: 200, maxCapital: 2000 }
  const live = { ...base, pnl: 300, maxCapital: 3000 }
  const rows = comparisonRows(backup, pure, live)
  expect(rows.find(r => r.label === '总收益率 %')?.values).toEqual([5, 10, 10, 0])
  expect(rows.find(r => r.label === '快照后新增盈亏')?.values).toEqual([null, 100, 200, 100])
  expect(rows.find(r => r.label === '快照后收益率 %')?.values).toEqual([null, 10, 20, 10])
})
