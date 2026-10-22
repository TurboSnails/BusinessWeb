import type { CompanyValuation } from './model'
export const exampleValuation = (): CompanyValuation => ({
  key: 'us:TEST', market: 'us', code: 'TEST', name: '测试公司', currency: 'USD', asOf: '2026-10-22', status: 'conditional',
  price: { value: 100, date: '2026-10-21', currency: 'USD', source: 'quote' },
  value: { low: 90, base: 100, high: 120, kind: 'present', date: '2026-10-22', primaryMethod: 'PE' },
  methods: [
    { name: 'PE', applicable: true, reason: '正常化盈利', formula: 'EPS 5 × PE 18/20/24', inputs: { eps: 5, multiples: [18, 20, 24] }, values: [90, 100, 120], sourceIds: ['quote'] },
    { name: 'PEG', applicable: false, reason: '缺增长证据', formula: '', inputs: {}, values: null, sourceIds: [] },
    { name: 'PB', applicable: false, reason: '账面值无约束力', formula: '', inputs: {}, values: null, sourceIds: [] },
  ],
  quality: '现金与再投资待核实', pricing: '按正常化盈利条件估值', expectations: '共识缺失，不宣称预期差', risk: '经营与倍数同时下修',
  assumptions: ['PE倍数为研究假设'], missing: ['完整现金流'],
  sources: [{ id: 'quote', title: '测试来源', url: 'https://example.com/test', asOf: '2026-10-21' }],
  review: { mode: 'programmatic', by: 'test', note: '条件初稿' },
})
