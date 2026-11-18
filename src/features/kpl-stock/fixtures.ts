import type { StockDetail, StockIndex } from './model'

export function stockFixture(): { index: StockIndex; detail: StockDetail } {
  const band = { status: 'ok' as const, current: 10, date: '2026-11-17', from: '2021-11-18', samples: 1200, points: [{ date: '2026-11-16', value: 9 }, { date: '2026-11-17', value: 10 }], percentile: 60, levels: [5, 7, 9, 11, 15] }
  const index: StockIndex = { version: 1, asOf: '2026-11-18', generatedAt: '2026-11-18T10:30:00Z', stocks: [
    { code: '600000', name: '浦发银行', industry: '银行', pct: 1, lists: ['zt', 'amount'], date: '2026-11-18', lastSeen: '2026-11-18', rank: 2 },
    { code: '000001', name: '平安银行', industry: '银行', pct: -1, lists: ['lhb'], date: '2026-11-18', lastSeen: '2026-11-18' },
  ] }
  const detail: StockDetail = { code: '600000', name: '浦发银行', industry: '银行', concepts: ['沪股通'], asOf: '2026-11-18', close: 10.72, pct: 1,
    intervals: [5, 20, 60, 120, 250].map(days => ({ days, from: '2026-11-01', to: '2026-11-18', change: days === 250 ? null : 5, drawdown: 2, amplitude: 10, avgTurnover: 1, amount: 1e9 })),
    months: [{ date: '2026-10-30', value: 2, partial: false }, { date: '2026-11-18', value: -1, partial: true }],
    chips: { days: 120, from: '2026-05-25', to: '2026-11-18', buckets: Array.from({ length: 50 }, (_, i) => ({ price: 8 + i / 10, weight: 0.02 })), average: 10.45, profit: 56, range90: { low: 8.2, high: 12.7, concentration: 0.215311 }, range70: { low: 8.7, high: 12.2, concentration: 0.167464 }, seedWeight: 0.1, clampedDays: 12 },
    valuation: { pe: { ...band }, pb: { ...band, current: 0.5, points: band.points.map(p => ({ ...p, value: p.value / 20 })), levels: band.levels.map(v => v / 20) } }, valuationReason: null }
  return { index, detail }
}
