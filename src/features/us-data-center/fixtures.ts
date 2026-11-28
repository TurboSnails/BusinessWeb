import type { IpoData, MoversData, PutCallData, SectorData } from './types'

export const moversFixture: MoversData = {
  mode: 'gainers', asOf: '2026-11-27T21:00:00.000Z', delayedBy: 15,
  source: 'Yahoo Finance', fetchedAt: '2026-11-28T12:00:00.000Z',
  rows: [
    { symbol: 'AAPL', name: '苹果公司', price: 278.12, changePct: 3.21, volume: 62_000_000, volumeRatio: 1.25, marketCap: 4_100_000_000_000 },
    { symbol: 'SURG', name: '放量样本公司', price: 18.5, changePct: 8.4, volume: 9_000_000, volumeRatio: 3.5, marketCap: 2_500_000_000 },
  ],
}

export const ipoFixture: IpoData = {
  month: '2026-11', groups: {
    upcoming: [{ symbol: 'SOON', company: '即将上市样本', exchange: 'NASDAQ Global', date: '2026-11-30', filedDate: '2026-10-01', price: '10.00', shares: 1_000_000, amount: 10_000_000, status: 'Upcoming' }],
    priced: [{ symbol: 'DONE', company: '已定价样本', exchange: 'NYSE', date: '2026-11-25', filedDate: '2026-09-01', price: '12.00', shares: 2_000_000, amount: 24_000_000, status: 'Priced' }],
    filed: [{ symbol: null, company: '已递交样本', exchange: null, date: '2026-11-20', filedDate: '2026-11-20', price: null, shares: null, amount: 5_000_000, status: null }],
    withdrawn: [],
  },
  sourceUpdated: 'LAST UPDATED: 11/27/2026* - Source: EDGAR® Online', source: 'Nasdaq IPO Calendar',
  sourceUrl: 'https://www.nasdaq.com/market-activity/ipos', fetchedAt: '2026-11-28T12:00:00.000Z',
}

export const sectorFixture: SectorData = {
  source: 'Yahoo Finance', fetchedAt: '2026-11-28T12:00:00.000Z',
  rows: [
    { symbol: 'SPY', name: '标普 500', group: 'benchmark', returns: { day: 1, week: 2, month: 3, quarter: 4, ytd: 12 }, date: '2026-11-27', time: '2026-11-27T21:00:00.000Z', delayedBy: 15 },
    { symbol: 'XLK', name: '信息技术', group: 'sector', returns: { day: 2, week: 3, month: 4, quarter: 8, ytd: 20 }, date: '2026-11-27', time: '2026-11-27T21:00:00.000Z', delayedBy: 15 },
    { symbol: 'SMH', name: '半导体', group: 'theme', returns: { day: 5, week: -2, month: 7, quarter: 12, ytd: 30 }, date: '2026-11-27', time: '2026-11-27T21:00:00.000Z', delayedBy: 15 },
  ],
}

const ratio = (value: number) => ({ ratio: value, callVolume: 1_000_000, putVolume: Math.round(value * 1_000_000) })
export const putCallFixture: PutCallData = {
  rows: [
    { date: '2026-11-24', total: ratio(0.9), equity: ratio(0.6), index: ratio(1.2) },
    { date: '2026-11-25', total: ratio(0.98), equity: ratio(0.64), index: ratio(1.04) },
    { date: '2026-11-27', total: ratio(0.83), equity: ratio(0.58), index: ratio(1.08) },
  ],
  spy: [{ date: '2026-11-24', close: 680 }, { date: '2026-11-25', close: 690 }, { date: '2026-11-27', close: 700 }],
  asOf: '2026-11-27', source: 'Cboe Daily Market Statistics',
  sourceUrl: 'https://www.cboe.com/us/options/market_statistics/daily/', fetchedAt: '2026-11-28T12:00:00.000Z',
  requestedDays: 20, missingDays: 0,
}
