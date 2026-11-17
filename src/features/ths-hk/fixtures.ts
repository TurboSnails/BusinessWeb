import type { HoldRow, ThsHkData } from './model'
// 仅供测试的虚构数据，不作为公开行情文件。
const code5 = (i: number): string => String(i).padStart(5, '0')
const hold = (i: number, chg: number): HoldRow => ({ code: code5(i), name: `港股${i}`, ratio: 10, ratioChg: chg, cap: 5e9, capChg: chg * 1e8, shareChg: chg * 1e6, close: 10, pct: null, industry: i % 2 ? '软件服务' : null })
export function hkFixture(): ThsHkData {
  const days = ['2026-11-13', '2026-11-16', '2026-11-17']
  return {
    version: 1, generatedAt: '2026-11-17T10:00:00Z', asOf: '2026-11-17',
    south: {
      asOf: '2026-11-17',
      history: [
        { date: days[0], net: 2333.44, netSh: 1000, netSz: 1333.44, buy: 44128.37, sell: 41794.93, turnover: 85923.3 },
        { date: days[1], net: -4226.73, netSh: -1333.68, netSz: -2893.05, buy: 32412.72, sell: 36639.45, turnover: 69052.17 },
        { date: days[2], net: 2203.66, netSh: 2686.44, netSz: -482.78, buy: 40937.42, sell: 38733.76, turnover: 79671.18 },
      ],
      top10: { sh: Array.from({ length: 10 }, (_, i) => ({ rank: i + 1, code: code5(9988 + i), name: `成交${i + 1}`, buy: 2e9, sell: i ? 1e9 : 3e9, total: 5e9 - i, net: i ? 1e9 : -1e9 })), sz: null },
    },
    ah: {
      asOf: '2026-11-17', fx: { date: '2026-11-17', rate: 0.8556 },
      rows: Array.from({ length: 60 }, (_, i) => ({ name: `AH${i + 1}`, aCode: String(600000 + i), hCode: code5(100 + i), aPrice: i === 59 ? null : 10, aPct: 1, hPrice: 10, hPct: -1, premium: i === 59 ? null : 60 - i })),
      index: { asOf: '2026-11-17', history: days.map((date, i) => ({ date, close: 130 + i })), stats: { close: 132, y1: { mean: 122.23, pctile: 97.6, n: 246 }, y3: { mean: null, pctile: null, n: 3 } } },
    },
    holdings: { asOf: '2026-11-17', count: 668, top: [hold(700, 0.02)], ratioUp: [hold(1, 1.5), hold(2, 0.5)], ratioDown: [hold(3, -0.8)] },
    short: {
      asOf: '2026-11-17', market: { short: 39727930174, turnover: 198051560759, ratio: 20.06 }, since: '2026-09-21',
      history: days.map((date, i) => ({ date, ratio: 18 + i, short: 3e10, turnover: 1.8e11 })),
      top: [
        { code: '02057', name: '中通快遞-W', short: 68122190, turnover: 117722368, ratio: 57.87, pctile: 95, label: '较高', n: 40 },
        { code: '00700', name: '騰訊控股', short: 1e9, turnover: 1.1e10, ratio: 9.09, pctile: 50, label: '正常', n: 40 },
        { code: '09999', name: '新股', short: 1e8, turnover: 1.2e9, ratio: 8.33, pctile: null, label: null, n: 5 },
      ],
    },
    sources: [{ label: 'HKEX', url: 'https://www.hkex.com.hk/chi/stat/smstat/dayquot/d261117c.htm' }],
  }
}
