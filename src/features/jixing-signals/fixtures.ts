import type { Indicator, JixingSignalsData } from './model'
// 仅供测试的虚构数据，不作为公开行情文件。
const base = (o: Partial<Indicator> & Pick<Indicator, 'id' | 'group' | 'name'>): Indicator => ({
  unit: '%', digits: 1, value: 1, date: '2026-11-17', pct: 50, window: '近 10 年', start: '2016-11-18', n: 2427,
  signal: '正常', rule: '示例规则：分位 ≥ 80% 记高。', note: null, extra: [], history: [['2026-11-16', 1], ['2026-11-17', 1.2]], ...o,
})
export function signalsFixture(): JixingSignalsData {
  const indicators: Indicator[] = [
    base({ id: 'buffett', group: 'valuation', name: '巴菲特指标', value: 68.1, signal: '低估', pct: 56.8, start: '2017-01-03', n: 2396, rule: '总市值 / GDP < 80% 记「低估」，> 100% 记「高估」。', extra: [{ label: 'A 股总市值', value: '99.36 万亿元' }] }),
    base({ id: 'erp', group: 'valuation', name: '股债性价比', unit: '百分点', digits: 2, value: 4.6289, signal: '低估', pct: 91.6 }),
    base({ id: 'amount', group: 'mood', name: '两市成交额', unit: '亿元', digits: 0, value: 14577, signal: '偏熊', pct: 2.7, window: '近 1 年', start: '2025-11-18', n: 242 }),
    base({ id: 'ipoBroken', group: 'mood', name: '新股破发率（近 60 个交易日）', value: 0, signal: null, pct: null, window: null, note: '破发 = 上市首日收盘价 < 发行价。' }),
    base({ id: 'accounts', group: 'mood', name: '新增投资者（上交所，月）', unit: '万户', digits: 2, value: 159.94, date: '2026-10-01', month: '2026-10', signal: '偏牛', pct: 86, window: '2021-01 起全部月份', start: '2021-01-01', n: 70 }),
  ]
  return {
    version: 1, asOf: '2026-11-17', generatedAt: '2026-11-17T13:00:00Z', indicators,
    summary: { 低估: 2, 正常: 0, 高估: 0, 偏牛: 1, 中性: 0, 偏熊: 1, none: 1 },
    missing: ['funds'], errors: ['funds：新发基金缺最近完整月'],
    sources: [{ label: '上海证券交易所 · 投资者月度新增', url: 'https://query.sse.com.cn/commonQuery.do?sqlId=COMMON_SSE_TZZ_M_ALL_ACCT_C' }],
  }
}
