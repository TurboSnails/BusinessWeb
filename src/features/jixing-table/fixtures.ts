import type { JixingTableData } from './model'

export const tableFixture: JixingTableData = {
  version: 1,
  asOf: '2026-11-17',
  generatedAt: '2026-11-17T11:10:00Z',
  sources: [{ label: '中证指数官网', url: 'https://www.csindex.com.cn/' }],
  rows: [
    {
      code: '000300', name: '沪深300', group: 'broad', basis: 'pe', source: 'csi', date: '2026-11-17',
      pe: 13.05, pb: 1.28, dp: 3.05, roe: 1.28 / 13.05, pePct: 0.25, pbPct: null, status: 'low',
      peHistory: { since: '2026-11-10', count: 2 }, pbHistory: { since: '2026-11-17', count: 1 },
      peSeries: [['2026-11-10', 15], ['2026-11-17', 13.05]], peRefs: [13.05, 15],
    },
    {
      code: '399812', name: '养老产业', group: 'pension', basis: 'pe', source: 'csi', date: '2026-11-17',
      pe: 15.55, pb: null, dp: null, roe: null, pePct: 0.75, pbPct: null, status: 'high',
      peHistory: { since: '2026-11-10', count: 2 }, pbHistory: { since: null, count: 0 },
      peSeries: [['2026-11-10', 15], ['2026-11-17', 15.55]], peRefs: [15, 15.55],
    },
  ],
}
