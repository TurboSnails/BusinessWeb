// 测试用的小数据集（结构与 public/data/jixing-global.json 一致，数值为虚构）。
import type { Gold, JixingGlobalData, ValRow } from './model'

const months = (n: number, end: string, f: (i: number) => number | null): Array<[string, number | null]> =>
  Array.from({ length: n }, (_, i) => {
    const y = Number(end.slice(0, 4)), m = Number(end.slice(5, 7)) - (n - 1 - i)
    const d = new Date(Date.UTC(y, m - 1, 28)).toISOString().slice(0, 10)
    return [i === n - 1 ? end : d, f(i)]
  })

const win = (end: string, n: number, extra: Partial<NonNullable<ValRow['window']>> = {}): ValRow['window'] => ({ years: 5, freq: '月', start: '2021-11-30', end, n, peN: n, dyN: n, enough: true, loss: 0, distorted: false, ...extra })

export function globalFixture(): JixingGlobalData {
  const hk: ValRow[] = [
    { key: 'hsi', name: '恒生指数', basis: 'pe', date: '2026-11-18', freq: '日', source: '恒生指数公司每日指数报表', peKind: 'PE（恒生公布）', pe: 13.04, dy: 3.14, pb: null, pePct: 69.5, dyPct: 30.5, valPct: 69.5, state: '正常', window: win('2026-11-18', 59), refs: { low: 11.08, high: 13.04 }, history: months(59, '2026-11-18', i => 10 + i * 0.05), carried: false },
    { key: 'hstech', name: '恒生科技指数', basis: 'pe', date: '2026-10-30', freq: '月', source: '恒生指数公司 Monthly Roundup（月末）', peKind: 'PE（恒生公布）', pe: 25.43, dy: 1.23, pb: null, pePct: 14.4, dyPct: 97.5, valPct: 14.4, state: null, window: win('2026-10-30', 59, { loss: 8, distorted: true }), refs: { low: 27.56, high: 95 }, history: months(59, '2026-10-30', i => (i < 5 ? -140 : i < 10 ? 460 : 25 + i * 0.1)), carried: false },
    { key: 'hshdyi', name: '恒生高股息率指数', basis: 'dy', date: '2026-11-18', freq: '日', source: '恒生指数公司每日指数报表', peKind: 'PE（恒生公布）', pe: 9.54, dy: 6.78, pb: null, pePct: 89, dyPct: 20, valPct: 80, state: '高估', window: win('2026-11-18', 59), refs: { low: 8.52, high: 6.73 }, history: months(59, '2026-11-18', i => 9 - i * 0.03), carried: false },
    { key: 'csi930914', name: '中证港股通高股息投资指数', basis: 'pe', date: '2026-11-14', freq: '日', source: '中证指数官网（滚动市盈率）', peKind: 'PE（TTM）', pe: 6.5, dy: null, pb: null, pePct: 12, dyPct: null, valPct: 12, state: '低估', window: win('2026-11-14', 61), refs: { low: 7, high: 9 }, history: months(61, '2026-11-14', i => 9 - i * 0.04), carried: true },
  ]
  const global: ValRow[] = [
    { key: 'spx_fwd', name: '标普500', basis: 'pe', date: '2026-11-17', freq: '周', source: 'History of Market（CC BY 4.0）', peKind: 'Forward PE（未来 12 个月一致预期）', pe: 17.61, dy: null, pb: null, pePct: 29.6, dyPct: null, valPct: 29.6, state: null, window: { years: 10, freq: '周', start: '2016-11-18', end: '2026-11-17', n: 522, peN: 522, dyN: 0, enough: true, loss: 0, distorted: false, spliced: true, spliceDate: '2026-08-05' }, refs: { low: 17.62, high: 20.96 }, history: months(30, '2026-11-17', i => 18 + i * 0.05), carried: false, spliceDate: '2026-08-05' },
    { key: 'spx_cape', name: '标普500', basis: 'pe', date: '2026-11-17', freq: '月', source: 'multpl.com', peKind: '席勒 PE（CAPE）', pe: 38.76, dy: null, pb: null, pePct: 90.4, dyPct: null, valPct: 90.4, state: '高估', window: { years: 10, freq: '月', start: '2016-12-01', end: '2026-11-17', n: 120, peN: 120, dyN: 0, enough: true, loss: 0, distorted: false }, refs: { low: 29.94, high: 35.1 }, history: months(120, '2026-11-17', i => 28 + i * 0.09), carried: false, estimated: true },
    { key: 'spx_ttm', name: '标普500', basis: 'pe', date: null, freq: '月', source: 'multpl.com', peKind: 'PE（TTM，月均价）', pe: null, dy: null, pb: null, pePct: null, dyPct: null, valPct: null, state: null, window: null, refs: null, history: [], carried: false },
  ]
  const gold: Gold = {
    date: '2026-11-17', price: 3851.3, realPrice: 3851.3, cpiBase: { month: '2026-10', value: 337.511 }, pct: 88, state: '高估',
    window: { years: 10, freq: '月', start: '2016-11-30', end: '2026-11-17', n: 121, enough: true },
    refs: { low: 1943.2, high: 2436.5 },
    realYield: { date: '2026-11-17', value: 2.89, pct: 98.8, n: 121 },
    cpiCarried: ['2025-10', '2026-11'],
    history: months(40, '2026-11-17', i => 2000 + i * 40).map(([d, v]) => [d, v, (v as number) * 0.9]),
    yieldHistory: months(40, '2026-11-17', i => 0.5 + i * 0.06).map(([d, v]) => [d, v as number]),
    carried: false,
  }
  return {
    version: 1, generatedAt: '2026-11-18T12:30:00.000Z', asOf: '2026-11-18',
    thresholds: { low: 30, high: 70 }, windows: { hk: 5, global: 10, gold: 10 },
    hk: { rows: hk, roundupLatest: '2026-10', roundupMissing: ['2025-01', '2026-02'] },
    global: { rows: global },
    gold, goldError: null,
    sources: [{ label: '恒生指数公司每日指数报表', url: 'https://www.hsi.com.hk/' }, { label: 'multpl.com', url: 'https://www.multpl.com/' }],
  }
}
