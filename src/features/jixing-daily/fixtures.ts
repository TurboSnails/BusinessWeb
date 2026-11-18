import type { JixingDailyIndex, JixingDailyReport } from './model'

export const dailyReportFixture: JixingDailyReport = {
  version: 1,
  asOf: '2026-11-17',
  prevDate: '2026-11-14',
  missingPrev: false,
  star: 4.0,
  starBasis: 'neutral',
  starAsOf: '2026-11-17',
  starPrev: 3.8,
  starChange: 0.2,
  counts: { low: 2, normal: 1, high: 1 },
  countsDelta: { low: 1, normal: -1, high: 0 },
  transitions: {
    enterLow: ['000300'],
    exitLow: [],
    enterHigh: [],
    exitHigh: ['399812'],
  },
  note: null,
  rows: [
    {
      code: '000300', name: '沪深300', group: 'broad', close: 4000, changePct: 1.2,
      pe: 13, pePct: 0.25, pb: 1.2, pbPct: null, status: 'low',
      peDelta: -0.3, pePctDelta: -0.1, pbDelta: null, pbPctDelta: null, statusPrev: 'normal',
    },
    {
      code: '399812', name: '养老产业', group: 'pension', close: 8000, changePct: -0.5,
      pe: 18, pePct: 0.6, pb: null, pbPct: null, status: 'normal',
      peDelta: -1, pePctDelta: -0.15, pbDelta: null, pbPctDelta: null, statusPrev: 'high',
    },
  ],
}

export const dailyIndexFixture: JixingDailyIndex = {
  version: 1,
  generatedAt: '2026-11-17T12:00:00Z',
  dates: ['2026-11-17', '2026-11-14'],
  latest: dailyReportFixture,
}

export const dailyMissingPrevFixture: JixingDailyReport = {
  ...dailyReportFixture,
  prevDate: null,
  missingPrev: true,
  starPrev: null,
  starChange: null,
  countsDelta: null,
  transitions: { enterLow: [], exitLow: [], enterHigh: [], exitHigh: [] },
  note: '缺少前一交易日完整日报快照，变化列均为 null。',
  rows: dailyReportFixture.rows.map(r => ({
    ...r, changePct: null, peDelta: null, pePctDelta: null, pbDelta: null, pbPctDelta: null, statusPrev: null,
  })),
}
