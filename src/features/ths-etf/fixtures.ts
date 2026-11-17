import { CATEGORIES, type CategoryAgg, type EtfRow, type ThsEtfData } from './model'
// 仅供测试的虚构数据，不作为公开行情文件。
export function etfFixture(): ThsEtfData {
  const rows = (n: number, dir: 1 | -1, base: number): EtfRow[] => Array.from({ length: n }, (_, i) => ({ code: String(base + i), name: `样本${base + i}`, flow1: (n - i) * 1e8 * dir, flow5: (n - i) * 2e8 * dir, flow20: (n - i) * 3e8 * dir, scale: 5e9, streak: dir > 0 ? 2 : 0 }))
  const cat = (c: string, i: number): CategoryAgg => ({
    cat: c, n: 40, flow1: i ? -1e8 : 3e9, flow5: null, flow20: 5e9, covered: { d1: 40, d5: 38, d20: 36 },
    rank: { d1: { inflow: rows(20, 1, 510000 + i * 100), outflow: rows(20, -1, 520000 + i * 100) }, d5: { inflow: rows(5, 1, 530000 + i * 100), outflow: [] }, d20: { inflow: [], outflow: rows(3, -1, 540000 + i * 100) } },
  })
  return {
    version: 1, asOf: '2026-11-17', generatedAt: '2026-11-17T19:00:00Z', historyStart: '2026-08-14', backfill: { from: '2026-08-14', to: '2026-11-17' },
    broad: {
      list: [
        { code: '510300', name: '沪深300ETF华泰柏瑞', index: '沪深300', shares: 4.8e10, sharesChg: 1.3e9, close: 4.042, scale: 1.95e11, flow1: 5.4e9, flow5: 8e9, flow20: 7.8e10, streak: 2 },
        { code: '510050', name: '上证50ETF华夏', index: '上证50', shares: 1.6e10, sharesChg: -6.8e7, close: 2.884, scale: 4.7e10, flow1: -1.97e8, flow5: null, flow20: 1.5e10, streak: 0 },
      ],
      byIndex: [{ index: '沪深300', n: 1, scale: 1.95e11, flow1: 5.4e9, flow5: 8e9, flow20: 7.8e10 }, { index: '上证50', n: 1, scale: 4.7e10, flow1: -1.97e8, flow5: null, flow20: 1.5e10 }],
      total: { flow1: 5.2e9, flow5: null, flow20: 9.3e10, scale: 2.42e11 },
      history: [{ date: '2026-11-13', flow: null }, { date: '2026-11-16', flow: 1.6e10 }, { date: '2026-11-17', flow: 5.2e9 }],
    },
    market: { n: 200, categories: CATEGORIES.map(cat) },
    rebalance: [
      { id: '3006137', title: '关于沪深300等指数定期调整结果的公告', publishDate: '2026-05-29', effectiveDate: '2026-06-12', url: 'https://www.csindex.com.cn/#/about/newsDetail?id=3006137', attachmentUrl: 'https://oss-ch.csindex.com.cn/notice/a.pdf', status: 'parsed', indexes: [{ index: '沪深300', out: [{ code: '000661', name: '长春高新' }], in: [{ code: '000657', name: '中钨高新' }] }] },
      { id: '3006300', title: '关于沪深300等指数定期调整结果的公告（新）', publishDate: '2026-11-28', effectiveDate: '2026-12-11', url: 'https://www.csindex.com.cn/#/about/newsDetail?id=3006300', attachmentUrl: null, status: 'pending', indexes: [] },
    ],
    sources: [{ label: '上交所', url: 'https://query.sse.com.cn/commonQuery.do' }],
  }
}
