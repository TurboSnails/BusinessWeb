import type { ContribIndex, IndustryRow, ThsIndustryData } from './model'
// 仅供测试的虚构数据，不作为公开行情文件。
const row = (code: string, name: string, l1Code: string, l1Name: string, score: number | null, npYoy: number | null): IndustryRow => ({
  code, name, l1Code, l1Name, cons: 100, loss: 10, pe: 20.5, pb: 2.1, dy: 1.8, peP5: 40, peP10: null, pbP5: 30,
  npYoy, revYoy: 5, roe: 7.5, finCount: 100, yoyCount: 98, roeCount: 90, ret20: -1.2, ret60: 3.4, indexCode: '932139', indexName: '半导体行业',
  ranks: { npYoy: 50, revYoy: 50, roe: 50, ret60: 50 }, score,
})
const contrib = (code: string, name: string, source: 'csi' | 'cni'): ContribIndex => ({
  code, name, date: '2026-11-17', prevClose: 4600, close: 4590.5, change: -9.5, changePct: -0.21,
  weightSource: source, weightDate: source === 'csi' ? '2026-10-30' : '2026-11-17', weightNote: source === 'csi' ? '中证指数官网收盘权重（2026-10-30），按成分股价格漂移到 2026-11-16' : '国证指数官网前 10 大权重还原',
  constituents: 300, estSum: -9.1, residual: -0.4, missing: 0, upCount: 120, downCount: 175,
  up: [{ code: '688981', name: '中芯国际', weight: 0.9, pct: 6.59, points: 2.51, industry: '信息技术', est: false }],
  down: [{ code: '300308', name: '中际旭创', weight: 1.7, pct: -3.9, points: -3.13, industry: '通信服务', est: source === 'cni' }],
  industries: [{ name: '信息技术', points: 1.2, count: 40, weight: 15 }, { name: '通信服务', points: -4.1, count: 10, weight: 5 }],
  check: source === 'csi' ? { listed: 10, matched: 10, maxDiff: 0.05 } : null,
})
export function industryFixture(): ThsIndustryData {
  return {
    version: 1, asOf: '2026-11-17', generatedAt: '2026-11-17T09:00:00Z',
    method: { scoreItems: ['净利润同比', '营收同比', 'ROE', '近 60 日涨跌幅'], scoreMin: 3, roeMinAbs: 0.5, coverage: 0.85 },
    industry: {
      period: '2026-09-30', periodLabel: '2026年三季报', priorPeriod: '2025-09-30', historyFrom: '2021-12-17', historySamples: 250,
      rows: [row('4530', '半导体', '45', '信息技术', 80, 35.2), row('4010', '银行', '40', '金融', 20.5, -2.1), row('6010', '房地产', '60', '房地产', null, null)],
    },
    contribution: [contrib('000300', '沪深300', 'csi'), contrib('399006', '创业板指', 'cni')],
    sources: [{ label: '中证指数官网', url: 'https://www.csindex.com.cn/csindex-home/data-service/indexValuation' }],
  }
}
