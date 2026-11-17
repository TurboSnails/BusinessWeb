// 测试用合成数据（非真实行情）
const stock = (over: Record<string, unknown>) => ({
  code: '000000', name: '样本', industry: '半导体', tags: ['top'], yBoards: null,
  auctionPrice: 10.2, auctionPct: 2, auctionAmount: 1.2e8, auctionRatio: 1.5, auctionShare: 2.4,
  closePct: 3, afterAuctionPct: 0.98, dayAmount: 5e9, closeAuctionPct: 0.5, closeAuctionAmount: 6e7, closeAuctionShare: 1.2, ...over,
})
const board = (over: Record<string, unknown>) => ({
  code: 'BK0001', name: '板块', kind: 'industry', auctionPct: 0.5, auctionAmount: 3e8, prevAuctionAmount: 2e8, auctionRatio: 1.5, auctionShare: 0.8,
  closePct: 1, afterAuctionPct: 0.5, dayAmount: 4e10, closeAuctionPct: 0.1, closeAuctionAmount: 5e8, closeAuctionShare: 1.2, ...over,
})
const group = (over: Record<string, unknown> = {}) => ({
  n: 3, highOpen: 2, lowOpen: 1, flat: 0, highOpenRate: 66.7, avgAuctionPct: 1.5, avgAfterAuction: 0.3, avgClosePct: 1.8, auctionAmount: 3e8,
  buckets: { le5: 0, m5: 1, m2: 0, flat: 0, p2: 1, p5: 0, ge5: 1 }, ...over,
})

export const auctionFixture = () => ({
  version: 1, generatedAt: '2026-11-17T08:30:00Z', asOf: '2026-11-17', prevDate: '2026-11-16', note: '盘后统计，不是买卖建议。',
  market: {
    date: '2026-11-17', prevDate: '2026-11-16', auctionAmount: 1.114e10, closeAuctionAmount: 1.624e10, dayAmount: 1.4577e12, auctionShare: 0.76, closeAuctionShare: 1.11,
    prevAuctionAmount: 1.257e10, prevCloseAuctionAmount: 1.532e10, prevDayAmount: 1.4845e12, shAuction: 5.08e9, szAuction: 6.06e9, shCloseAuction: 8.89e9, szCloseAuction: 7.35e9,
  },
  universe: { topN: 400, candidates: 4, used: 4, failed: 0, stale: 0, pools: true, zt: 1, yzt: 2 },
  groups: { all: group({ n: 4 }), top: group(), yzt: group({ n: 2, avgAuctionPct: -0.3, highOpenRate: 50 }), zt: group({ n: 1 }) },
  indexes: [board({ code: '000001', name: '上证指数', kind: 'index', auctionPct: -0.47 })],
  boards: [
    board({ code: 'BK1036', name: '半导体甲', auctionPct: 1.2, auctionAmount: 1.3e9 }),
    board({ code: 'BK0448', name: '通信乙', auctionPct: -0.8, auctionAmount: 9e7, auctionRatio: null }),
    board({ code: 'BK0900', name: '概念丙', kind: 'concept', auctionPct: 2.5, auctionAmount: 4e8 }),
  ],
  stocks: [
    stock({ code: '000001', name: '金额王', auctionAmount: 2.66e8, auctionPct: -2.47, closeAuctionPct: 0.06 }),
    stock({ code: '000002', name: '高开甲', auctionPct: 6.1, auctionAmount: 5e7, tags: ['top', 'yzt'], yBoards: 2, closeAuctionPct: 1.14 }),
    stock({ code: '000003', name: '砸盘乙', auctionPct: -1, auctionAmount: 3e7, tags: ['yzt'], yBoards: 1, closeAuctionPct: -0.9, closeAuctionAmount: 9e7 }),
    stock({ code: '000004', name: '无竞价丙', auctionPct: null, auctionAmount: 0, auctionRatio: null, afterAuctionPct: null, tags: ['zt'], closeAuctionPct: null, industry: '' }),
  ],
  history: [
    { date: '2026-11-13', backfilled: true, auctionAmount: 126.5, closeAuctionAmount: 174.44, dayAmount: 16556.68, auctionShare: 0.76, closeAuctionShare: 1.05, n: 398, highOpenRate: 61.6, avgAuctionPct: 0.52, avgAfterAuction: -2.86, yztN: null, yztAvgAuction: null },
    { date: '2026-11-16', backfilled: true, auctionAmount: 125.73, closeAuctionAmount: 153.24, dayAmount: 14844.9, auctionShare: 0.85, closeAuctionShare: 1.03, n: 398, highOpenRate: 13.6, avgAuctionPct: -1.13, avgAfterAuction: -2.89, yztN: null, yztAvgAuction: null },
    { date: '2026-11-17', auctionAmount: 111.41, closeAuctionAmount: 162.39, dayAmount: 14576.95, auctionShare: 0.76, closeAuctionShare: 1.11, n: 400, highOpenRate: 15.5, avgAuctionPct: -1.19, avgAfterAuction: -0.16, yztN: 32, yztAvgAuction: -0.3 },
  ],
  sources: [{ id: 'trends', label: '东方财富分时', url: 'https://quote.eastmoney.com/' }],
})
