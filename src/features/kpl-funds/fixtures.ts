import type { FlowRow, KplFundsData } from './model'
// 仅供测试的虚构数据，不作为公开行情文件。
export function fundsFixture(): KplFundsData {
  const rows = (count: number, direction: number, industry = false): FlowRow[] => Array.from({ length: count }, (_, i) => ({ code: industry ? `BK${String(i).padStart(4, '0')}` : String(i + 1).padStart(6, '0'), name: `${industry ? '行业' : '样本'}${i + 1}`, pct: i ? null : 2.5 * direction, main: (count - i) * 1e8 * direction, mainRatio: 5 * direction, superLarge: null, large: 1e8 * direction, amount: 8e8, industry: industry ? null : '测试行业' }))
  return { version: 1, asOf: '2026-11-17', generatedAt: '2026-11-17T08:00:00Z', history: [{ date: '2026-11-16', main: null, small: null, medium: null, large: null, superLarge: null }, { date: '2026-11-17', main: -2e8, small: 1e8, medium: 1e8, large: -1e8, superLarge: -1e8 }], stocks: { inflow: rows(30, 1), outflow: rows(30, -1) }, industries: { inflow: rows(15, 1, true), outflow: rows(15, -1, true) }, sources: [{ label: '东方财富', url: 'https://push2.eastmoney.com/api/qt/clist/get' }] }
}
