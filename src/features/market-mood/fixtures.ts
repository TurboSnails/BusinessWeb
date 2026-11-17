// 测试用合成数据（非真实行情）
import type { MoodDay } from './model'

const day = (date: string, over: Partial<MoodDay> = {}): MoodDay => ({
  date, amount: { total: 15000, sh: 4500, kcb: 2400, sz: 4000, cyb: 4000, bj: 100 }, up: 3000, down: 2000, flat: 200,
  zt: 60, dt: 10, ztReal: 58, dtReal: 9, broken: 20, sealRate: 75, brokenRate: 25,
  boards: { b1: 45, b2: 8, b3: 4, b4: 2, high: 1, max: 6 }, rates: { r12: 20, r23: 40, r34: 50, rHigh: 33.3, lb: 30, lbPromotion: 35 },
  perf: { zt: 1.5, lb: 2.1, broken: -0.8, ztRed: 62 }, mood: 1.2, lbStrength: 58, composite: 61, retreat: 2, ...over,
})

export const moodFixture = () => ({
  version: 1, generatedAt: '2026-11-17T08:30:00Z', asOf: '2026-11-17', note: '盘后统计，不是买卖建议。',
  latest: {
    ...day('2026-11-17', { mood: 2.4 }),
    buckets: { limitUp: 60, above7: 40, from5To7: 70, from3To5: 200, from0To3: 2630, flat: 200, from0ToMinus3: 1700, fromMinus3ToMinus5: 200, fromMinus5ToMinus7: 60, belowMinus7: 30, limitDown: 10 },
    medianPct: 0.42, suspended: 5,
    retreatStocks: [{ code: '000001', name: '回撤甲', pct: -3.2, retreat: 12.5, sector: '软件' }, { code: '000002', name: '回撤乙', pct: 1, retreat: 8, sector: '' }],
    vane: [{ sector: '算力', count: 6, stocks: [{ code: '000003', name: '龙头丙', boards: 4 }, { code: '000004', name: '跟风丁', boards: 1 }] }],
    ladder: [{ boards: 6, stocks: [{ code: '000005', name: '高标戊', sector: '算力' }] }],
    weight: { indices: [{ symbol: 'sh000001', name: '上证指数', price: 3500, pct: 0.5 }], stocks: [{ code: '600519', name: '贵州茅台', pct: -0.3, amount: 50 }], avg: -0.3 },
    intraday: { date: '2026-11-17', prevDate: '2026-11-16', total: 14900, prevTotal: 14500, points: [{ t: '09:30', cum: 120, prevCum: 130 }, { t: '09:31', cum: 300, prevCum: 280 }, { t: '15:00', cum: 14900, prevCum: 14500 }] },
    moodStatus: '活跃', zone: '中性', comment: '上涨 3000 家、下跌 2000 家；涨停 60 家、跌停 10 家。',
  },
  history: [day('2026-11-13', { seeded: true, amount: null, mood: null }), day('2026-11-16', { zt: 50, dt: 20, sealRate: 70 }), day('2026-11-17', { mood: 2.4 })],
  amountHistory: [{ date: '2026-11-13', total: 14000 }, { date: '2026-11-16', total: 14500 }, { date: '2026-11-17', total: 14900 }],
  margin: [{ date: '2026-11-13', balance: 22500, ratio: 2.53, hs300: 4000 }, { date: '2026-11-16', balance: 22357, ratio: 2.537, hs300: 3979.8 }],
  sources: [{ id: 'pools', label: '东方财富股池', url: 'https://quote.eastmoney.com/ztb/' }],
})
