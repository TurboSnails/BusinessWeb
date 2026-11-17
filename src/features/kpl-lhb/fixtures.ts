// 测试用合成数据（非真实行情）
import type { Reason, Seat } from './model'

const seat = (name: string, kind: Seat['kind'], buy: number | null, sell: number | null): Seat => ({ dept: name, name, kind, buy, sell, net: buy === null && sell === null ? null : (buy ?? 0) - (sell ?? 0) })
const reason = (id: string, text: string, window: number, over: Partial<Reason> = {}): Reason => ({
  id, reason: text, window, amount: 1e9, buy: 3e8, sell: 1e8, net: 2e8, dealRatio: 40,
  buySeats: [seat('机构专用', 'inst', 1.2e8, 0), seat('甲证券某路营业部', 'dept', 8e7, 1e6), seat('深股通专用', 'hk', 5e7, 2e7)],
  sellSeats: [seat('乙证券某街营业部', 'dept', 0, 6e7), seat('机构专用', 'inst', null, 3e7)],
  ...over,
})

export const lhbFixture = () => ({
  version: 1, generatedAt: '2026-11-17T11:00:00Z', asOf: '2026-11-17', note: '盘后统计，不是买卖建议。',
  latest: {
    date: '2026-11-17', stockCount: 3, entryCount: 4, up: 2, down: 1, netBuyCount: 2, netSellCount: 1,
    totals: { buy: 9e8, sell: 4e8, net: 5e8 }, inst: { buy: 2.4e8, sell: 1.5e8, net: 9e7, stocks: 2 }, hk: { buy: 5e7, sell: 2e7, net: 3e7, stocks: 1 },
    stocks: [
      { code: '000001', name: '龙虎甲', market: 'sz', board: '深交所主板', close: 11, pct: 10.01, turnover: 20, window: 1, amount: 1e9, buy: 3e8, sell: 1e8, net: 2e8, dealRatio: 40, netRatio: 20, instNet: 9e7, instBuyCount: 1, instSellCount: 1, hasHk: true,
        reasons: [reason('1', '日涨幅偏离值达到7%的前5只证券', 1), reason('2', '连续三个交易日内，涨幅偏离值累计达到20%的证券', 3, { net: 4e8, buySeats: [seat('丙证券营业部', 'dept', 2e8, 0)] })] },
      { code: '600002', name: '龙虎乙', market: 'sh', board: '上交所主板', close: 5, pct: 5.2, turnover: 8, window: 3, amount: 2e9, buy: 4e8, sell: 1e8, net: 3e8, dealRatio: 25, netRatio: 15, instNet: null, instBuyCount: 0, instSellCount: 0, hasHk: false,
        reasons: [reason('3', '连续三个交易日内，涨幅偏离值累计达到20%的证券', 3)] },
      { code: '920003', name: '龙虎丙', market: 'bj', board: '北京证券交易所', close: null, pct: null, turnover: null, window: 1, amount: null, buy: 2e8, sell: 2e8, net: null, dealRatio: null, netRatio: null, instNet: 0, instBuyCount: 0, instSellCount: 1, hasHk: false,
        reasons: [reason('4', '当日换手率达到20%的前5只股票', 1, { net: null, sellSeats: [] })] },
    ],
    reasons: [
      { reason: '连续三个交易日内，涨幅偏离值累计达到20%的证券', window: 3, codes: ['000001', '600002'] },
      { reason: '日涨幅偏离值达到7%的前5只证券', window: 1, codes: ['000001'] },
      { reason: '当日换手率达到20%的前5只股票', window: 1, codes: ['920003'] },
    ],
    instRank: [
      { code: '000001', name: '龙虎甲', pct: 10.01, window: 1, buy: 1.2e8, sell: 3e7, net: 9e7, buyCount: 1, sellCount: 1 },
      { code: '920003', name: '龙虎丙', pct: null, window: 1, buy: null, sell: 1.2e8, net: -1.2e8, buyCount: 0, sellCount: 1 },
    ],
    deptRank: [{ dept: 'd1', name: '甲证券某路营业部', count: 2, days: 1, buy: 1.6e8, sell: 2e6, net: 1.58e8, last: '2026-11-17', stocks: ['龙虎甲', '龙虎乙'] }],
  },
  window: {
    days: 20, from: '2026-10-21', to: '2026-11-17',
    deptRank: [{ dept: 'd1', name: '甲证券某路营业部', count: 12, days: 8, buy: 2.1e9, sell: 1.1e9, net: 1e9, last: '2026-11-17', stocks: ['龙虎甲'] }],
    deptTrades: { d1: [{ date: '2026-11-17', code: '000001', name: '龙虎甲', pct: 10.01, window: 1, buy: 8e7, sell: 1e6, net: 7.9e7 }, { date: '2026-11-12', code: '300009', name: '历史丁', pct: -3, window: 1, buy: null, sell: 5e6, net: -5e6 }] },
    stockRank: [{ code: '000001', name: '龙虎甲', count: 5, last: '2026-11-17', net: 6e8 }],
  },
  history: [
    { date: '2026-11-13', stockCount: 60, entryCount: 70, net: 1e8, instNet: -3e8, instStocks: 30, hkNet: null },
    { date: '2026-11-16', stockCount: 62, entryCount: 71, net: -2e8, instNet: 2e8, instStocks: 32, hkNet: 1e8 },
    { date: '2026-11-17', stockCount: 3, entryCount: 4, net: 5e8, instNet: 9e7, instStocks: 2, hkNet: 3e7 },
  ],
  sources: [{ id: 'lhb', label: '东方财富数据中心 · 龙虎榜单', url: 'https://data.eastmoney.com/stock/lhb.html' }],
})
