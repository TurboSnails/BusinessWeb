// 测试用合成数据（非真实行情）
import type { ThsDay } from './model'

const parts = { breadth: 60, limit: 80, seal: 70, premium: 55, volume: 50 }
const day = (date: string, over: Partial<ThsDay> = {}): ThsDay => ({
  date, up: 3000, down: 2000, flat: 200, zt: 60, dt: 10, ztReal: 58, dtReal: 9, broken: 20, sealRate: 75,
  premium: 1.2, openPremium: 0.8, hotOpen: 2.5, amount: 15000, volRatio: 1.05, emotion: 63, parts, maxBoard: 5, ...over,
})

export const thsFixture = () => ({
  version: 1, generatedAt: '2026-11-17T08:30:00Z', asOf: '2026-11-17', note: '盘后统计，不是买卖建议。',
  latest: {
    ...day('2026-11-17', { emotion: 72 }),
    buckets: { limitUp: 60, above7: 40, from5To7: 70, from3To5: 200, from0To3: 2630, flat: 200, from0ToMinus3: 1700, fromMinus3ToMinus5: 200, fromMinus5ToMinus7: 60, belowMinus7: 30, limitDown: 10 },
    medianPct: 0.42, suspended: 5, amountPrev: 14500,
    emotionInfo: { value: 72, zone: '贪婪风险区', parts, state: '较高', p33: 45, p67: 62, n: 40 },
    trend: { date: '2026-11-17', close: 3584.58, pct: 0.5, ma5: 3570, ma10: 3560, ma20: 3600, chg5: 1.2, score: 3, level: '偏强', rsi: 56.2, checks: [true, true, false, false, true] },
    vane: {
      stocks: [{ code: '000001', name: '高标甲', boards: 4, openPct: 5.2, pct: 10, sector: '算力' }, { code: '000002', name: '高标乙', boards: 3, openPct: -1.5, pct: -3, sector: '' }],
      avgOpen: 2.5, avgClose: 3.5, highOpen: 1, lowOpen: 1, verdict: '竞价高开', allOpen: 0.8, allClose: 1.2, all: 40,
    },
    fcb: {
      median: 0.35, top: [{ code: '000003', name: '封单丙', fcb: 5.2, boards: 1, fund: 3.1 }],
      groups: { high: { n: 10, fcbMin: 1, fcbMax: 9, avgPct: 3.1, red: 80 }, mid: { n: 10, fcbMin: 0.3, fcbMax: 1, avgPct: 0.5, red: 50 }, low: { n: 10, fcbMin: 0, fcbMax: 0.3, avgPct: -2.2, red: 30 } },
    },
    ztList: [
      { code: '000001', name: '高标甲', price: 12.3, pct: 10.01, boards: 5, days: 5, times: 5, firstSeal: '09:25', opens: 0, fund: 2.5, fcb: 1.8, sector: '算力', ten: 5 },
      { code: '000004', name: '首板丁', price: 8.8, pct: 9.98, boards: 1, days: 3, times: 2, firstSeal: '10:12', opens: 2, fund: 0.4, fcb: 0.12, sector: '电网设备', ten: 2 },
    ],
    sectors: [{ sector: '算力', count: 6, lead: { code: '000001', name: '高标甲', boards: 5 } }, { sector: '电网设备', count: 3, lead: { code: '000004', name: '首板丁', boards: 1 } }],
    ten: { covered: 10, window: 10, multi: 12, top: [{ code: '000001', name: '高标甲', count: 5, todayZt: true }, { code: '000005', name: '回落戊', count: 4, todayZt: false }] },
    review: '上证指数收 3584.58（+0.5%），短期趋势偏强；涨停 60 家、跌停 10 家。',
  },
  history: [day('2026-11-13', { seeded: true, emotion: null, hotOpen: null }), day('2026-11-16', { zt: 50, dt: 20, sealRate: 70, emotion: 55 }), day('2026-11-17', { emotion: 72 })],
  trendHistory: [
    { date: '2026-11-13', close: 3560, pct: -0.2, ma5: 3570, ma10: 3565, ma20: 3600, chg5: -1, score: 1, level: '弱', rsi: 44 },
    { date: '2026-11-16', close: 3566.7, pct: 0.19, ma5: 3568, ma10: 3562, ma20: 3600, chg5: 0.2, score: 2, level: '偏弱', rsi: 50 },
    { date: '2026-11-17', close: 3584.58, pct: 0.5, ma5: 3570, ma10: 3560, ma20: 3600, chg5: 1.2, score: 3, level: '偏强', rsi: 56.2 },
  ],
  amountHistory: [{ date: '2026-11-13', total: 14000 }, { date: '2026-11-16', total: 14500 }, { date: '2026-11-17', total: 15000 }],
  sources: [{ id: 'pools', label: '东方财富股池', url: 'https://quote.eastmoney.com/ztb/' }],
})
