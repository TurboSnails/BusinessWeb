import type { JixingThresholdData } from './model'

export const thresholdFixture: JixingThresholdData = {
  version: 1,
  asOf: '2026-11-17',
  generatedAt: '2026-11-17T12:00:00Z',
  sourceAsOf: '2026-11-17',
  method: {
    lines: '低估线 / 高估线示例',
    dist: '距线示例',
    status: '状态示例',
  },
  sources: [{ label: '中证指数官网', url: 'https://www.csindex.com.cn/' }],
  rows: [
    {
      code: '000300', name: '沪深300', group: 'broad', basis: 'pe', basisLabel: 'PE(TTM)',
      current: 13, lowLine: 11, highLine: 15, pct: 0.4,
      distLowPct: 11 / 13 - 1, alreadyLow: false, distHighPct: 15 / 13 - 1, alreadyHigh: false,
      status: 'normal', sampleCount: 2400, sampleSince: '2016-11-17', date: '2026-11-17',
    },
    {
      code: '399986', name: '中证银行', group: 'industry', basis: 'pb', basisLabel: '行业 PB（银行）',
      current: 0.6, lowLine: 0.65, highLine: 0.9, pct: 0.2,
      distLowPct: null, alreadyLow: true, distHighPct: 0.9 / 0.6 - 1, alreadyHigh: false,
      status: 'low', sampleCount: 250, sampleSince: '2016-11-17', date: '2026-11-17',
    },
    {
      code: '399812', name: '养老产业', group: 'pension', basis: 'pe', basisLabel: 'PE(TTM)',
      current: 18, lowLine: 12, highLine: 16, pct: 0.8,
      distLowPct: 12 / 18 - 1, alreadyLow: false, distHighPct: null, alreadyHigh: true,
      status: 'high', sampleCount: 1000, sampleSince: '2018-01-01', date: '2026-11-17',
    },
  ],
}
