import type { ThsMarketData } from './model'
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
    sources: [{ label: '中证指数官网', url: 'https://www.csindex.com.cn/csindex-home/data-service/indexValuation' }],
  }
}
