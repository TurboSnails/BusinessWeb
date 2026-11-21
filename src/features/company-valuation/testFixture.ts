import type { CompanyValuation } from './model'
export const exampleValuation = (): CompanyValuation => ({
  key: 'us:TEST', market: 'us', code: 'TEST', name: '测试公司', currency: 'USD', asOf: '2026-10-22', status: 'conditional',
  price: { value: 100, date: '2026-10-21', currency: 'USD', source: 'quote' },
  value: { low: 90, base: 100, high: 120, kind: 'present', date: '2026-10-22', primaryMethod: 'PE' },
  methods: [
    { name: 'PE', applicable: true, reason: '正常化盈利', formula: 'EPS 5 × PE 18/20/24', inputs: { eps: 5, epsForward: 5, epsTrailingTwelveMonths: 5, multiples: [18, 20, 24] }, values: [90, 100, 120], sourceIds: ['quote'] },
    { name: 'PEG', applicable: false, reason: '缺增长证据', formula: '', inputs: {}, values: null, sourceIds: [] },
    { name: 'PB', applicable: false, reason: '账面值无约束力', formula: '', inputs: {}, values: null, sourceIds: [] },
  ],
  quality: '现金与再投资待核实', pricing: '按正常化盈利条件估值', expectations: '共识缺失，不宣称预期差', risk: '经营与倍数同时下修',
  assumptions: ['PE倍数为研究假设'], missing: ['完整现金流'],
  sources: [{ id: 'quote', title: '测试来源', url: 'https://example.com/test', asOf: '2026-10-21' }],
  review: { mode: 'programmatic', by: 'test', note: '条件初稿' },
})

/** 真实字段摘自 public/data/company-valuations（展示规则测试夹具，非投资结论）。 */
export const fixtureQihoo360 = (): CompanyValuation => ({
  key: 'cn:601360', market: 'cn', code: '601360', name: '三六零', currency: 'CNY', asOf: '2026-11-20', status: 'conditional',
  price: { value: 7.41, date: '2026-11-20', currency: 'CNY', source: 'snap-cn' },
  value: { low: 0.22, base: 0.32, high: 0.44, kind: 'undated', date: null, primaryMethod: 'PE' },
  methods: [
    {
      name: 'PE', applicable: true, reason: '条件适用', formula: '前瞻EPS×研究倍数',
      inputs: {
        epsTrailingTwelveMonths: 0.11, epsForward: 0.01,
        researchMultiples: { low: 22, base: 32, high: 44 },
      },
      values: [0.22, 0.32, 0.44], sourceIds: ['snap-cn'],
    },
    { name: 'PEG', applicable: false, reason: '缺增长证据', formula: '', inputs: {}, values: null, sourceIds: [] },
    { name: 'PB', applicable: false, reason: '账面值无约束力', formula: '', inputs: {}, values: null, sourceIds: [] },
  ],
  quality: 'q', pricing: 'p', expectations: 'e', risk: 'r',
  assumptions: [], missing: [],
  sources: [{ id: 'snap-cn', title: '行情快照', url: 'https://example.com/cn', asOf: '2026-11-20' }],
  review: { mode: 'programmatic', by: 'batch', note: '条件初稿' },
})

export const fixtureNvidia = (): CompanyValuation => ({
  key: 'us:NVDA', market: 'us', code: 'NVDA', name: '英伟达', currency: 'USD', asOf: '2026-11-20', status: 'conditional',
  price: { value: 125.53, date: '2026-11-20', currency: 'USD', source: 'snap-us' },
  value: { low: 332.11, base: 464.95, high: 531.37, kind: 'undated', date: null, primaryMethod: 'PE' },
  methods: [
    {
      name: 'PE', applicable: true, reason: '条件适用', formula: '前瞻EPS×研究倍数',
      inputs: {
        epsTrailingTwelveMonths: 9.31, epsForward: 16.60528,
        researchMultiples: { low: 20, base: 28, high: 32 },
      },
      values: [332.11, 464.95, 531.37], sourceIds: ['snap-us'],
    },
    { name: 'PEG', applicable: false, reason: '缺增长证据', formula: '', inputs: {}, values: null, sourceIds: [] },
    { name: 'PB', applicable: false, reason: '账面值无约束力', formula: '', inputs: {}, values: null, sourceIds: [] },
  ],
  quality: 'q', pricing: 'p', expectations: 'e', risk: 'r',
  assumptions: [], missing: [],
  sources: [{ id: 'snap-us', title: '行情快照', url: 'https://example.com/us', asOf: '2026-11-20' }],
  review: { mode: 'programmatic', by: 'batch', note: '条件初稿' },
})

export const fixtureApple = (): CompanyValuation => ({
  key: 'us:AAPL', market: 'us', code: 'AAPL', name: '苹果', currency: 'USD', asOf: '2026-11-20', status: 'conditional',
  price: { value: 342.56, date: '2026-11-20', currency: 'USD', source: 'snap-us' },
  value: { low: 264.32, base: 348.9, high: 391.19, kind: 'undated', date: null, primaryMethod: 'PE' },
  methods: [
    {
      name: 'PE', applicable: true, reason: '条件适用', formula: '前瞻EPS×研究倍数',
      inputs: {
        epsTrailingTwelveMonths: 8.98, epsForward: 10.57273,
        researchMultiples: { low: 25, base: 33, high: 37 },
      },
      values: [264.32, 348.9, 391.19], sourceIds: ['snap-us'],
    },
    { name: 'PEG', applicable: false, reason: '缺增长证据', formula: '', inputs: {}, values: null, sourceIds: [] },
    { name: 'PB', applicable: false, reason: '账面值无约束力', formula: '', inputs: {}, values: null, sourceIds: [] },
  ],
  quality: 'q', pricing: 'p', expectations: 'e', risk: 'r',
  assumptions: [], missing: [],
  sources: [{ id: 'snap-us', title: '行情快照', url: 'https://example.com/us', asOf: '2026-11-20' }],
  review: { mode: 'programmatic', by: 'batch', note: '条件初稿' },
})
