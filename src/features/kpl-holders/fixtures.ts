import type { FundRow, Holding, KplHolders, MarginRow } from './model'
// 仅供测试的虚构数据，不作为公开行情文件。
const m = (i: number, net: number, extra: Partial<MarginRow> = {}): MarginRow => ({ code: String(600000 + i), name: `两融${i}`, close: 10, pct: i === 1 ? 2.5 : null, balance: 5e8, buy: 1e8, repay: 1e8 - net, net, net3: null, net5: net * 2, net10: null, growth: 1.5, ratio: 3.2, floatCap: 1.5e10, ...extra })
const f = (i: number, change: number, extra: Partial<FundRow> = {}): FundRow => ({ code: String(300000 + i), name: `基金股${i}`, funds: 100 - i, shares: 1e7, value: 5e8, freeRatio: 4.5, change, changeRatio: 12.3, changeValue: change * 50, industry: '半导体', isNew: false, ...extra })
const h = (code: string, name: string, state: Holding['state'], extra: Partial<Holding> = {}): Holding => ({ code, name, end: '2026-09-30', notice: '2026-10-28', rank: 8, shares: 2e6, value: 3e7, ratio: 1.2, state, change: state === 'new' ? null : 1e5, ...extra })

export function holdersFixture(): KplHolders {
  return {
    version: 1, generatedAt: '2026-11-18T08:00:00Z', asOf: '2026-11-17', note: '测试说明',
    margin: {
      date: '2026-11-17', count: 3900,
      totals: { balance: 2.1e12, net: -2.4e10, net5: null, up: 1200, down: 2600 },
      buy: [m(1, 1.5e8), m(2, 5e7)], sell: [m(3, -9e7)], buy5: [m(1, 1.5e8)], sell5: [m(3, -9e7)],
      growth: [m(4, 2e7, { growth: 25.5 })], ratio: [m(5, 1e6, { ratio: 9.87 })], minBalance: 1e8,
      industries: { count: 127, inflow: [{ code: '1043', name: '专业服务', balance: 4.7e9, buy: 2.2e8, repay: 1.7e8, net: 5.6e7, ratio: 4.14, floatCap: 1.1e11 }], outflow: [{ code: '1036', name: '半导体', balance: 2e11, buy: 1e10, repay: 1.3e10, net: -3e9, ratio: 5.1, floatCap: 4e12 }] },
    },
    funds: {
      fetched: '2026-11-18', industryDate: '2026-11-17', period: '2026-09-30', label: '2026 年三季报', full: false, prevPeriod: '2026-06-30', prevLabel: '2026 年中报', prevFull: true,
      count: 3863, totalValue: 4e12, newCount: 1, addCount: 1, cutCount: 1,
      top: [f(1, 1e6)], add: [f(1, 1e6)], cut: [f(2, -2e6, { name: '减持股' })], fresh: [f(3, 1e7, { name: '新进股', isNew: true, changeRatio: null })],
      industries: [{ name: '半导体', stocks: 3, value: 1.5e9, changeValue: -5e7, newCount: 1, addCount: 1, cutCount: 1 }],
    },
    investors: {
      fetched: '2026-11-18', minEnd: '2025-10-14', candidates: 15000, eligible: 2, rows: 19000, minStocks: 3, endFrom: '2026-03-31', endTo: '2026-11-13',
      list: [
        { name: '甲散户', count: 3, value: 9e7, newCount: 1, addCount: 1, cutCount: 0, latestEnd: '2026-09-30', items: [h('000001', '股票一', 'new'), h('000002', '股票二', 'add'), h('000003', '股票三', 'same', { value: null })] },
        { name: '乙散户', count: 3, value: 6e7, newCount: 0, addCount: 0, cutCount: 1, latestEnd: '2026-09-30', items: [h('000001', '股票一', 'cut', { change: -5e5 }), h('000004', '股票四', 'same'), h('000005', '股票五', 'same')] },
      ],
    },
    sources: [{ id: 'margin', label: '东方财富数据中心 · 融资融券个股明细', url: 'https://data.eastmoney.com/rzrq/detail/all.html' }],
  }
}
