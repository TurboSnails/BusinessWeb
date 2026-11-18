import type { JixingTableData, JixingTableHist } from './model'

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
      peSeries: [], peRefs: [13.05, 15], pbKind: 'index', pbIndustry: null,
    },
    {
      code: '399812', name: '养老产业', group: 'pension', basis: 'pe', source: 'csi', date: '2026-11-17',
      pe: 15.55, pb: null, dp: null, roe: null, pePct: 0.75, pbPct: null, status: 'high',
      peHistory: { since: '2026-11-10', count: 2 }, pbHistory: { since: null, count: 0 },
      peSeries: [], peRefs: [15, 15.55], pbKind: 'index', pbIndustry: null,
    },
    {
      code: '399986', name: '中证银行', group: 'industry', basis: 'pb', source: 'csi', date: '2026-11-17',
      pe: 7.71, pb: 0.63, dp: 5.2, roe: 0.63 / 7.71, pePct: 0.4, pbPct: 0.2, status: 'low',
      peHistory: { since: '2016-11-17', count: 250 }, pbHistory: { since: '2016-11-17', count: 250 },
      peSeries: [], peRefs: [6, 10], pbKind: 'industry', pbIndustry: { code: '4010', name: '银行' },
    },
  ],
}

export const tableHistFixture: JixingTableHist = {
  code: '000300', asOf: '2026-11-17',
  peSeries: [['2026-11-10', 15], ['2026-11-17', 13.05]],
  pbSeries: [['2026-11-17', 1.28]],
  peRefs: [13.05, 15],
}
