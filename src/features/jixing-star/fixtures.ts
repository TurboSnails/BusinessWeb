import type { JixingStarData } from './model'
// 仅供测试的虚构数据，不作为公开行情文件。
export function starFixture(): JixingStarData {
  const bands = [
    { min: 5, max: 5.9, label: '估值很低' }, { min: 4, max: 4.9, label: '部分低估' }, { min: 3, max: 3.9, label: '正常偏低' },
    { min: 2, max: 2.9, label: '偏高' }, { min: 1, max: 1.9, label: '很高' },
  ]
  return {
    version: 1, asOf: '2026-11-17', prevDate: '2026-11-16', generatedAt: '2026-11-17T13:00:00Z',
    star: 4.2, raw: 4.236, band: '部分低估', prevStar: 4.1, change: 0.1,
    inputs: {
      pe: { value: 16.04, median: 16.52, pct: 43, start: '2016-11-18', n: 2427, sub: 0.132 },
      pb: { value: 1.58, median: 1.77, pct: 19.6, start: '2016-11-18', n: 2427, sub: 0.509 },
      erp: { value: 4.63, median: 3.4, pct: 91.6, start: '2016-11-18', n: 2427, sub: 0.814, y10: 1.6055, ey: 6.23 },
    },
    params: { min: 1, max: 5.9, center: 3.45, drop: 0.2, windowYears: 10, minYears: 3, step: 0.2231 },
    bands,
    since: { star: '2014-06-30', pe: '2011-06-28', pb: '2014-01-02', threeInputs: '2017-01-03' },
    history: [['2014-06-30', 3.1], ['2020-01-02', null], ['2024-02-05', 5.4], ['2026-11-16', 4.1], ['2026-11-17', 4.2]],
    inputsWeekly: [['2024-02-09', 12.1, 1.3, 5.8], ['2026-11-13', 16.1, 1.6, 4.6]],
    checks: [
      { date: '2015-06-12', ref: '1 星多（≈1.x）', star: 1, band: '很高', pe: 31.64, pb: 3.95, erp: -0.37 },
      { date: '2024-02-05', ref: '≈5.9（极低）', star: 5.4, band: '估值很低', pe: 11.94, pb: 1.26, erp: 5.94 },
      { date: '2012-01-04', ref: '示例', star: null, band: null, pe: null, pb: null, erp: null },
    ],
    sources: [{ label: '中证指数官网 · 中证全指行情（滚动市盈率）', url: 'https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=000985' }],
  }
}
