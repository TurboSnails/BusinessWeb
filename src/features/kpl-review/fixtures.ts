// 测试用合成数据（非真实行情）
const tag = (id: string, label: string, polarity: 'up' | 'down', stocks: unknown[]) => ({ id, label, polarity, def: `${label}的定义`, stocks })

export const reviewFixture = () => ({
  version: 1, generatedAt: '2026-11-17T08:30:00Z', asOf: '2026-11-17', note: '盘后统计，不是买卖建议。',
  summary: {
    zt: 37, zb: 20, dt: 67, sealRate: 64.9, brokenRate: 35.1, yzt: 32, yztProfit: 31.3, yztAvg: -1.52, first: 25, firstOk: 4, firstToSecond: 16,
    openAvg: 0.85, openHighRate: 55.6, bigLoss: 5, drop7: 88, maxBoard: 3, newHigh: 42, newHighFresh: 17,
  },
  openDist: {
    n: 27, oneWord: 5, avg: 0.85, high: 15, flat: 4, low: 8,
    buckets: [
      { id: 'le5', label: '≤ −5%', count: 2 }, { id: 'm5', label: '−5% ~ −2%', count: 3 }, { id: 'm2', label: '−2% ~ −0.5%', count: 3 },
      { id: 'flat', label: '平开', count: 4 }, { id: 'p2', label: '0.5% ~ 2%', count: 6 }, { id: 'p5', label: '2% ~ 5%', count: 5 }, { id: 'ge5', label: '≥ 5%', count: 4 },
    ],
  },
  intraday: {
    points: [{ t: '09:25', zt: 5, touched: 6, dt: 0 }, { t: '09:30', zt: 8, touched: 10, dt: 1 }, { t: '15:00', zt: 37, touched: 57, dt: 67 }],
    missing: { zt: 0, touched: 0, dt: 0 },
  },
  tags: [
    tag('yizi', '一字板', 'up', [{ code: '002451', name: '一字甲', pct: 10.03, sector: '电网设备', boards: 1 }]),
    tag('fanbao', '反包', 'up', [{ code: '000002', name: '反包乙', pct: 9.98, sector: '算力', boards: 1, why: '昨日炸板' }]),
    tag('ditian', '地天板', 'up', []),
    tag('damian', '大面', 'down', [{ code: '000156', name: '大面丙', pct: -9.95, sector: '电视广播', boards: 1 }, { code: '000157', name: '缺丁', pct: null, sector: '', boards: null }]),
  ],
  tagStats: {
    rows: [
      { id: 'yizi', label: '一字板', polarity: 'up', n: 12, days: 3, avg: 3.21, red: 75 },
      { id: 'damian', label: '大面', polarity: 'down', n: 0, days: 0, avg: null, red: null },
    ],
    from: '2026-11-13', to: '2026-11-16', days: 3,
  },
  newHigh: {
    count: 3, fresh: 2, eligible: 5000,
    groups: [
      { industry: '半导体', count: 2, stocks: [{ code: '688001', name: '新高戊', pct: 5.2, fresh: true }, { code: '688002', name: '新高己', pct: 1.1, fresh: false }] },
      { industry: '电网设备', count: 1, stocks: [{ code: '002451', name: '一字甲', pct: 10.03, fresh: true }] },
    ],
  },
  closes: { days: 122, from: '2026-05-21', to: '2026-11-17', complete: true, done: 5930, universe: 5930, failed: 0, end: '2026-11-17' },
  history: [
    { date: '2026-11-13', seeded: true, zt: 40, zb: 18, dt: 10, sealRate: 69, brokenRate: 31, yztProfit: 50, yztAvg: 1, firstToSecond: 20, openAvg: 1, openHighRate: 60, bigLoss: 2, drop7: 30, maxBoard: 4, newHigh: null, newHighFresh: null },
    { date: '2026-11-16', seeded: true, zt: 32, zb: 16, dt: 60, sealRate: 66.7, brokenRate: 33.3, yztProfit: 40, yztAvg: 0.5, firstToSecond: 18, openAvg: 0.2, openHighRate: 50, bigLoss: 3, drop7: 70, maxBoard: 3, newHigh: 50, newHighFresh: 20 },
    { date: '2026-11-17', zt: 37, zb: 20, dt: 67, sealRate: 64.9, brokenRate: 35.1, yztProfit: 31.3, yztAvg: -1.52, firstToSecond: 16, openAvg: 0.85, openHighRate: 55.6, bigLoss: 5, drop7: 88, maxBoard: 3, newHigh: 42, newHighFresh: 17 },
  ],
  sources: [{ id: 'pools', label: '东方财富股池', url: 'https://quote.eastmoney.com/ztb/' }],
})
