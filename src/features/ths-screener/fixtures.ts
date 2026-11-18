import type { ThsScreenerData } from './model'
// 仅供测试的虚构数据，不作为公开行情文件。
export function screenerFixture(): ThsScreenerData {
  const dates = ['2026-11-13', '2026-11-16', '2026-11-17']
  return {
    version: 1, asOf: '2026-11-17', generatedAt: '2026-11-17T19:30:00Z',
    store: { from: '2026-05-21', to: '2026-11-17', days: 122, stocks: 5573, source: 'kline', backfillEnd: '2026-11-17' },
    presets: [
      {
        id: 'bull', group: '均线', label: '均线多头排列', formula: 'MA5 > MA10 > MA20 > MA60，且收盘价 > MA5。', xLabel: 'MA5 较 MA60', xUnit: '%', asc: false,
        count: 3, eligible: 5500, hits: [['600001', 12.5], ['000002', 8.25], ['300003', null]],
        history: [{ date: dates[0], count: null }, { date: dates[1], count: 5 }, { date: dates[2], count: 3 }],
      },
      {
        id: 'low20', group: '新高新低', label: '20 日新低', formula: '今日最低价 < 此前 19 个交易日最低价的最小值。', xLabel: '20 日涨幅', xUnit: '%', asc: true,
        count: 1, eligible: 5560, hits: [['000002', -15.2]],
        history: [{ date: dates[1], count: 40 }, { date: dates[2], count: 1 }],
      },
      {
        id: 'gap', group: 'K 线形态', label: '跳空缺口未回补', formula: '今日最低价 > 上一交易日最高价。', xLabel: '缺口幅度', xUnit: '%', asc: false,
        count: 0, eligible: 5560, hits: [], history: [{ date: dates[2], count: 0 }],
      },
    ],
    stocks: {
      600001: ['样本甲', '银行', 10.5, 2.34, 3.1, 66.2],
      '000002': ['样本乙', '银行', 3.2, -1.5, -4.2, null],
      300003: ['', '', 20, null, null, null],
    },
    breadth: dates.map((date, i) => ({ date, seeded: i < 2, above20: 20 + i, above60: i ? 15 : null, high20: 200 + i, low20: 300, up: 1000, down: i ? 4000 : 0, flat: 50, ratio: i ? 0.25 : null, n: 5500 })),
    snapshot: {
      date: '2026-11-17', eligible: 5400,
      presets: [
        {
          id: 'volUp', group: '量能（当日快照）', label: '放量上涨', formula: '量比 ≥ 2 且涨幅 ≥ 3%。', xLabel: '量比', xUnit: '', asc: false,
          count: 2, eligible: 5400, hits: [['600001', 3.5], ['000002', 2.1]],
          history: [{ date: dates[1], count: null }, { date: dates[2], count: 2 }],
        },
        {
          id: 'turnover', group: '量能（当日快照）', label: '高换手 ≥10%', formula: '换手率 ≥ 10%。', xLabel: '换手率', xUnit: '%', asc: false,
          count: 1, eligible: 5400, hits: [['600001', 12.34]], history: [{ date: dates[2], count: 1 }],
        },
      ],
      stocks: {
        600001: ['样本甲', '银行', 10.5, 4.2, 3.5, 12.34, 8.5, 6.1],
        '000002': ['样本乙', '', 3.2, 3.1, 2.1, null, 1.25, 4],
      },
    },
    snapshotNote: null,
    sources: [{ label: '东方财富日 K', url: 'https://quote.eastmoney.com/' }],
  }
}
