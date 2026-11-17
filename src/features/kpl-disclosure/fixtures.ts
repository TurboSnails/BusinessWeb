// 测试用合成数据（非真实行情）
import type { DisclosureItem } from './model'

const item = (over: Partial<DisclosureItem>): DisclosureItem => ({
  code: '000001', name: '业绩甲', kind: 'report', period: '2026-09-30', notice: '2026-11-10', metric: '归属于上市公司股东的净利润', type: null,
  profit: 5e8, profitLow: null, profitHigh: null, yoy: 20, yoyLow: null, yoyHigh: null, revenue: 3e9, revenueYoy: 10, eps: 0.5, consensus: null,
  perf: { start: '2026-11-10', base: '2026-11-09', d1: 3.2, d3: -1.5, d5: null },
  ...over,
})

export const disclosureFixture = () => ({
  version: 1, generatedAt: '2026-11-17T12:00:00Z', asOf: '2026-11-17', note: '盘后统计，不是买卖建议。',
  disclosure: {
    from: '2026-10-18', to: '2026-11-17', windowDays: 30, counts: { forecast: 2, express: 1, report: 1 }, truncated: false,
    items: [
      item({ code: '300002', name: '预告乙', kind: 'forecast', period: '2026-12-31', notice: '2026-11-18', type: '预增', profit: 6e8, profitLow: 5e8, profitHigh: 7e8, yoy: 150, yoyLow: 100, yoyHigh: 200, eps: null, revenue: null, perf: { start: '2026-11-18', base: null, d1: null, d3: null, d5: null } }),
      item({ code: '600003', name: '快报丙', kind: 'express', period: '2026-12-31', notice: '2026-11-12', profit: 1e9, yoy: -30, eps: 0.8, consensus: { eps: 1, actual: 0.8, orgs: 12, diff: -20, label: 'miss' }, perf: { start: '2026-11-12', base: '2026-11-11', d1: -4.1, d3: -6, d5: -2 } }),
      item({ code: '000004', name: '预告丁', kind: 'forecast', period: '2026-12-31', notice: '2026-11-11', type: '首亏', profit: -2e8, profitLow: -3e8, profitHigh: -1e8, yoy: null, eps: null, consensus: null }),
      item({}),
    ],
    calendar: { from: '2026-11-18', to: '2026-12-01', total: 1, days: [{ date: '2026-11-18', count: 0, stocks: [] }, { date: '2026-11-19', count: 1, stocks: [{ code: '688005', name: '预约戊', period: '2026-09-30', label: '2026年 三季报', change: '延后' }] }], next: { date: '2026-12-31', label: '2026年 三季报' } },
    progress: { period: '2026-09-30', label: '2026年三季报', total: 5000, published: 4999 },
  },
  risk: {
    date: '2026-11-17',
    st: { count: 3, star: 2, list: [{ code: '600010', name: '*ST避一', star: true }, { code: '000011', name: '*ST避二', star: true }, { code: '000012', name: 'ST避三', star: false }], prevDate: '2026-11-16', added: [{ code: '000012', name: 'ST避三', prevName: '避三' }], removed: [{ code: '600013', name: '摘帽四', prevName: 'ST摘帽四' }] },
    span: 30,
    face: [
      { code: '600010', name: '*ST避一', board: 'main', close: 0.45, cap: 8e8, days: 30, capped: true, st: true, delisting: false },
      { code: '000011', name: '*ST避二', board: 'main', close: 0.9, cap: 4e8, days: 3, capped: false, st: true, delisting: false },
    ],
    cap: [{ code: '000011', name: '*ST避二', board: 'main', close: 0.9, cap: 4e8, days: 3, capped: false, st: true, delisting: false, limit: 5e8 }],
    annual: { period: '2025-12-31', label: '2025年年报', lossLowRev: [{ code: '688020', name: '亏损五', board: 'star', st: false, profit: -1e8, deductEps: -0.5, revenue: 5e7, bps: 3, limit: 1e8 }], negEquity: [{ code: '600010', name: '*ST避一', board: 'main', st: true, profit: -5e8, deductEps: -1, revenue: 2e8, bps: -0.5 }] },
    observe: { period: '2026-09-30', label: '2026年三季报', lossLowRev: [], negEquity: [] },
    history: [{ date: '2026-11-16', st: 3, face: 2 }, { date: '2026-11-17', st: 3, face: 2 }],
  },
  holders: {
    date: '2026-11-17', total: 100, fallingCount: 1, since: '2025-12-22',
    falling: [{ code: '000030', name: '筹码六', end: '2026-09-30', prevEnd: '2026-06-30', notice: '2026-10-28', holders: 12000, prevHolders: 13000, change: -7.69, streak: 4, capped: false, cum: -25.5, avgCap: 1e5, close: 10 }],
    drop: [{ code: '000030', name: '筹码六', end: '2026-09-30', prevEnd: '2026-06-30', notice: '2026-10-28', holders: 12000, prevHolders: 13000, change: -7.69, streak: 4, capped: false, cum: -25.5, avgCap: 1e5, close: 10 }],
    rise: [{ code: '000031', name: '散户七', end: '2026-09-30', prevEnd: '2026-06-30', notice: '2026-10-28', holders: 30000, prevHolders: 20000, change: 50, streak: 0, capped: false, cum: null, avgCap: 1e5, close: 10 }],
    recent: [],
  },
  block: {
    date: '2026-11-17', count: 2, stocks: 1, amount: 3e8, premiumCount: 0, discountCount: 1, instBuy: { count: 1, amount: 2e8 },
    items: [
      { date: '2026-11-17', code: '000040', name: '大宗八', price: 9, close: 10, premium: -10, volume: 2e7, amount: 2e8, pct: 1.5, buyer: '机构专用', seller: '某证券某营业部', freeRatio: 0.5 },
      { date: '2026-11-17', code: '000040', name: '大宗八', price: 10, close: 10, premium: 0, volume: 1e7, amount: 1e8, pct: 1.5, buyer: '某证券另一营业部', seller: '某证券某营业部', freeRatio: 0.2 },
    ],
    window: { from: '2026-10-21', to: '2026-11-17', days: 20, count: 5, amount: 8e8, top: [{ code: '000040', name: '大宗八', count: 5, days: 3, amount: 8e8, premium: -4, instBuy: 2e8, instBuyCount: 1, last: '2026-11-17' }], inst: [{ code: '000040', name: '大宗八', count: 5, days: 3, amount: 8e8, premium: -4, instBuy: 2e8, instBuyCount: 1, last: '2026-11-17' }] },
  },
  survey: {
    short: { days: 5, from: '2026-11-11', to: '2026-11-17', rank: [{ code: '000050', name: '调研九', events: 2, orgs: 150, last: '2026-11-17' }] },
    long: { days: 20, from: '2026-10-21', to: '2026-11-17', rank: [{ code: '000050', name: '调研九', events: 3, orgs: 200, last: '2026-11-17' }, { code: '000051', name: '调研十', events: 1, orgs: null, last: '2026-10-30' }], events: 4, stocks: 2 },
    latest: [{ code: '000050', name: '调研九', notice: '2026-11-17', start: '2026-11-10', orgs: 80, ways: '电话会议' }],
  },
  sources: [{ id: 'value', label: '东方财富数据中心 · 估值分析', url: 'https://data.eastmoney.com/gzfx/list.html' }],
})
