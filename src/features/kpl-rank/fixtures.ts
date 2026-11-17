// 人气排行页测试数据（虚构股票与数值，仅用于组件测试）
import type { BoardRow, KplRank } from './model'

const board = (code: string, name: string, over: Partial<BoardRow> = {}): BoardRow => ({
  code, name, pct: 1, close: 1000, net1: 1e8,
  r5: 2, r10: 3, r20: 4, net5: 5e8, net10: 6e8, net20: null, in5: 3, in10: 6, in20: null,
  lead5: 0, lead10: 0, lead20: 0, ...over,
})

export function rankFixture(): KplRank {
  return {
    version: 1,
    generatedAt: '2026-11-18T07:40:00.000Z',
    asOf: '2026-11-18',
    note: '盘后统计，不是买卖建议。',
    popularity: {
      date: '2026-11-18', prevDate: '2026-11-17', takenAt: '15:40',
      top: [
        { code: '000001', name: '人气甲', price: 10, pct: 10.01, rank: 1, prevRank: 1, change: 0, streak10: 8, streak100: 12, tags: ['连续上榜'] },
        { code: '600002', name: '人气乙', price: 20, pct: -3.2, rank: 2, prevRank: 1520, change: 1518, streak10: 1, streak100: 1, tags: ['人气激增'] },
        { code: '300003', name: null, price: null, pct: null, rank: 3, prevRank: null, change: null, streak10: null, streak100: null, tags: [] },
      ],
      surge: [{ code: '002004', name: '飙升丙', price: 5, pct: 2, rank: 900, prevRank: 2900, change: 2000 }],
    },
    stockRange: {
      date: '2026-11-18',
      windows: [
        { days: 5, gain: [{ code: '000005', name: '五日涨', price: 8, pct: 10, amount: 1e9, value: 46.4 }], loss: [{ code: '000006', name: '五日跌', price: 3, pct: -10, amount: 1e8, value: -30.1 }] },
        { days: 20, gain: [{ code: '000007', name: '二十日涨', price: 9, pct: 1, amount: 1e9, value: 88.8 }], loss: [] },
      ],
      nets: [{ days: 5, inflow: [{ code: '000008', name: '净流入王', price: 50, pct: 2, amount: 5e9, value: 2.2e9, inflowDays: 4 }], outflow: [{ code: '000009', name: '净流出王', price: 50, pct: -2, amount: 5e9, value: -1.5e9, inflowDays: null }] }],
    },
    boards: {
      date: '2026-11-17',
      industry: {
        rows: [board('BK0001', '行业甲', { r5: 6.5, lead5: 2, lead10: 3, lead20: 4 }), board('BK0002', '行业乙', { r5: -1.2, pct: -0.5 })],
        missing: 0,
        leaders: [{ date: '2026-11-16', code: 'BK0001', name: '行业甲', pct: 3.02 }, { date: '2026-11-17', code: 'BK0001', name: '行业甲', pct: 1.86 }],
      },
      concept: { rows: [board('BK1001', '概念甲', { r5: 9.9, lead5: null, lead10: null, lead20: null })], missing: 1, leaders: null },
      region: { rows: [board('BK0161', '辽宁板块', { r5: -4.43 }), board('BK0175', '内蒙古', { r5: 1.5 })], missing: 0 },
    },
    inst: {
      date: '2026-11-17',
      windows: [
        { days: 3, from: '2026-11-13', to: '2026-11-17', missing: [], complete: true, totals: { net: -1.4e9, stocks: 66 }, buy: [{ code: '301313', name: '机构甲', buy: 2.17e8, sell: 4.6e7, net: 1.71e8, times: 2, seats: 5, last: '2026-11-17', lastPct: -13.88 }], sell: [{ code: '600010', name: '机构乙', buy: null, sell: 3e8, net: -3e8, times: 1, seats: 2, last: '2026-11-16', lastPct: -10 }] },
        { days: 20, from: '2026-10-21', to: '2026-11-17', missing: ['2026-10-22'], complete: false, totals: { net: null, stocks: null }, buy: [], sell: [] },
      ],
    },
    sources: [{ id: 'popularity', label: '东方财富股吧 · 人气榜', url: 'https://guba.eastmoney.com/rank/' }],
  }
}
