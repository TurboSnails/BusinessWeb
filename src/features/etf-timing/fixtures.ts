// 测试用合成数据（非真实行情）
const rule = (holding: boolean, date?: string, side: 'buy' | 'sell' = 'buy') => ({ holding, pending: null, lastSignal: date ? { date, side } : null })
export const fixture = () => ({
  version: 1,
  generatedAt: '2026-11-15T08:00:00Z',
  latest: {
    asOf: '2026-11-13', generatedAt: '2026-11-15T08:00:00Z', complete: true, universeVersion: '2026-11-15',
    timing: { hs300Bull: false, cybBull: true },
    summary: { n: 3, hsHolding: 1, cybHolding: 2, missing: 0 },
    items: [
      { code: '512760', name: '芯片ETF', close: 1.234, date: '2026-11-13', hs: rule(true, '2026-11-10'), cyb: rule(true, '2026-11-10') },
      { code: '510050', name: '上证50ETF', close: 3.1, date: '2026-11-13', hs: rule(false, '2026-10-01', 'sell'), cyb: rule(true, '2026-09-20') },
      { code: '159915', name: '创业板ETF', close: 2.5, date: '2026-11-13', hs: rule(false), cyb: rule(false) },
      { code: 'bad' },
    ],
    missing: [],
  },
  history: [{ asOf: '2026-11-13', complete: true, hs300Bull: false, cybBull: true, n: 3, hsHolding: 1, cybHolding: 2, missing: 0 }],
  research: {
    generatedAt: '2026-11-15T14:00:00Z',
    windows: [['全期 2011-01 起', '2011-01-01', null], ['2015 股灾 2015-06-12～2016-01-28', '2015-06-12', '2016-01-28']],
    verdict: [{ code: 'H00905', name: '500收益', ddPass: true, annualPass: true }, { code: 'H00016', name: '50收益', ddPass: false, annualPass: false }],
    results: [
      { code: 'H00905', name: '500收益', start: '2004-12-31', end: '2026-11-11', windows: {
        '全期 2011-01 起': { hold: { years: 15.8, total: 60, annual: 3.1, dd: -64.1 }, hs: { years: 15.8, total: 110, annual: 4.8, dd: -36.8 }, cyb: null, macd: null, ma20: null },
        '2015 股灾 2015-06-12～2016-01-28': { hold: { years: 0.6, total: -54.2, annual: null, dd: -54.2 }, hs: { years: 0.6, total: 7.7, annual: null, dd: -15.9 }, cyb: null, macd: null, ma20: null },
      } },
    ],
    errors: [],
  },
})
