import type { Overseas, ThsMarketData } from './model'
// 仅供测试的虚构数据，不作为公开行情文件。
export function marketFixture(): ThsMarketData {
  const hist: Array<[string, number | null]> = [['2026-11-06', 12], ['2026-11-13', null], ['2026-11-17', 13]]
  const months = ['2026-10', '2026-11']
  return {
    version: 1, asOf: '2026-11-17', generatedAt: '2026-11-17T09:00:00Z', thresholds: { danger: 80, chance: 20 },
    valuation: [
      { code: '000300', name: '沪深300', source: 'csi', pe: 13.05, pb: 1.28, dp: 3.05, peP5: 66.3, peP10: 47, zoneBasis: 10, zone: '合理', since: '2015-11-17', pbDays: 1, history: hist },
      { code: '000922', name: '中证红利', source: 'csi', pe: 9.21, pb: 0.79, dp: 4.49, peP5: 99.9, peP10: 84.8, zoneBasis: 10, zone: '危险', since: '2015-11-17', pbDays: 1, history: hist },
      { code: '399006', name: '创业板（整体）', source: 'board', pe: 33.58, pb: null, dp: null, peP5: 19, peP10: null, zoneBasis: 5, zone: '机会', since: '2017-01-03', pbDays: 0, history: hist },
    ],
    supply: {
      lift: { from: '2026-11-18', to: '2026-12-17', total: 399.0, weeks: [{ start: '2026-11-18', end: '2026-11-22', amount: 253.59, stocks: 29, unpriced: 0 }, { start: '2026-11-23', end: '2026-11-29', amount: 145.41, stocks: 28, unpriced: 1 }] },
      holder: months.map((month, i) => ({ month, increase: 100, decrease: i ? 80 : 120, net: i ? 20 : -20, records: 10, estimated: 4, unpriced: 1 })),
      financing: months.map(month => ({ month, ipo: 10, ipoCount: 2, seo: null, seoCount: 0, cb: 7.48, cbCount: 1 })),
      funds: months.map(month => ({ month, shares: 600, funds: 100, equityShares: 300 })),
    },
    rates: { treasury: [['2026-11-16', 1.6285, 1.2406], ['2026-11-17', 1.6055, 1.2303]], shibor: [['2026-11-16', 1.304, 1.39], ['2026-11-17', 1.303, null]] },
    style: [{ id: 'size', label: '大盘 vs 小盘', num: '沪深300', den: '中证1000', rel20: 6.37, rel60: -9.7, series: [['2026-11-16', 100], ['2026-11-17', 105.02]] }],
    overseas: overseasFixture(),
    overseasError: null,
    sources: [{ label: '中证指数官网', url: 'https://www.csindex.com.cn/csindex-home/data-service/indexValuation' }],
  }
}

/** 外盘联动虚构数据：数据日 2026-11-17，美股取 11-16 美东收盘。 */
export function overseasFixture(): Overseas {
  return {
    asOf: '2026-11-17', usSession: '2026-11-16', hkDate: '2026-11-17', hkNote: null,
    boardsTime: '15:12', boardsNote: null, boardIssues: [], mapReviewed: '2026-11-18',
    thresholds: { pct: 3, sigma: 2, window: 60, minObs: 40 },
    indices: [
      { symbol: 'DJIA', name: '道琼斯', close: 50000.12, pct: -1.64 },
      { symbol: 'SOX', name: '费城半导体', close: 9600.5, pct: 0.34 },
      { symbol: 'HXC', name: '纳斯达克中国金龙', close: null, pct: null },
    ],
    items: [
      { symbol: 'TSM', name: '台积电', market: 'US', date: '2026-11-16', close: 359.69, pct: -3.68, sigma: 2.1, z: -1.75, anomaly: true, reason: '全球晶圆代工龙头', boards: [{ code: 'BK1036', name: '半导体', pct: -1.25, flow: -12.5 }, { code: 'BK1101', name: '先进封装', pct: 0.8, flow: null }] },
      { symbol: 'NVDA', name: '英伟达', market: 'US', date: '2026-11-16', close: 155.46, pct: -0.44, sigma: 2.5, z: -0.18, anomaly: false, reason: 'AI 加速芯片龙头', boards: [{ code: 'BK1161', name: '英伟达概念', pct: 1.78, flow: 23.62 }] },
      { symbol: 'XOM', name: '埃克森美孚', market: 'US', date: null, close: null, pct: null, sigma: null, z: null, anomaly: false, reason: '国际石油巨头', boards: [{ code: 'BK0464', name: '石油石化', pct: null, flow: null }] },
      { symbol: '09868', name: '小鹏集团-W', market: 'HK', date: '2026-11-17', close: 39.54, pct: 3.29, sigma: 3.9, z: 0.84, anomaly: true, reason: '智能电动车与飞行汽车', boards: [{ code: 'BK0802', name: '智能驾驶', pct: 0.66, flow: 4.1 }] },
    ],
    summary: { anomalies: 2, obs: 3, same: 2 },
    history: { since: '2026-11-17', days: 1, rows: [{ symbol: 'TSM', name: '台积电', events: 1, obs: 2, same: 1 }] },
  }
}
