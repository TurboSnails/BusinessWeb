// 测试用合成数据（非真实行情）
const gene = (over = {}) => ({ zt: 5, nextN: 4, p5: 2, red: 3, firstTry: 3, firstSeal: 2, lbBase: 4, lb: 1, redRate: 75, firstSealRate: 66.7, firstBreakRate: 33.3, lbRate: 25, ...over })

export const dabanFixture = () => ({
  version: 1, generatedAt: '2026-11-17T08:30:00Z', asOf: '2026-11-17', note: '盘后统计，不是买卖建议。',
  summary: {
    zt: 3, zb: 1, dt: 1, natural: 2, touched: 1, auctionAvg: 1.25, sealRate: 75, newStocks: 1, oneWord: 1,
    auction: { n: 2, avgOpen: 1.25, highOpen: 1, lowOpen: 1, sealed: 1 },
  },
  zt: [
    { code: '000001', name: '高标甲', pct: 10.02, price: 6.7, boards: 3, streak: { days: 3, ct: 3 }, firstSeal: '09:25:00', lastSeal: '09:25:00', opens: 0, fund: 271326704, amount: 227901016, turnover: 3.38, floatCap: 6.75e9, sector: '工程机械', shape: '一字', natural: false, gene: gene() },
    { code: '000002', name: '换手乙', pct: 9.98, price: 12.1, boards: 1, streak: { days: 1, ct: 1 }, firstSeal: '10:01:02', lastSeal: '14:20:00', opens: 2, fund: 5.2e7, amount: 1.2e9, turnover: 12.5, floatCap: 9.8e9, sector: '算力', shape: '换手', natural: true, gene: gene({ zt: 1, nextN: 0, p5: 0, red: 0, redRate: null, firstTry: 1, firstSeal: 1, firstSealRate: 100, firstBreakRate: 0, lbBase: 0, lb: 0, lbRate: null }) },
    { code: '000003', name: '缺字段丙', pct: null, price: null, boards: null, streak: null, firstSeal: null, lastSeal: null, opens: null, fund: null, amount: null, turnover: null, floatCap: null, sector: '', shape: null, natural: null, gene: null },
  ],
  zb: [{ code: '000011', name: '炸板丁', pct: 5.61, price: 8.1, limitPrice: 8.44, streak: { days: 4, ct: 3 }, firstSeal: '09:30:03', opens: 13, amplitude: 7.3, amount: 1.65e9, turnover: 28.3, floatCap: 5.7e9, sector: '一般零售' }],
  dt: [{ code: '000021', name: '跌停戊', pct: -9.98, price: 5.23, days: 3, lastSeal: '13:01:01', opens: 17, fund: 1.456e8, boardAmount: 2.19e9, amount: 6.9e8, turnover: 14.93, floatCap: 4.6e9, sector: '一般零售' }],
  touched: [{ code: '000031', name: '地天己', pct: 10.02, price: 31.52, limitDown: 25.79, lowPct: -9.98, rebound: 20, amount: 3.5e9, sector: '小家电', limitUpToo: true }],
  auction: [
    { code: '000001', name: '高标甲', yBoards: 2, yFirstSeal: '11:01:21', openPct: 10.02, pct: 10.02, closeVsOpen: 0, sealed: true, amount: 2.3e8, sector: '工程机械' },
    { code: '000041', name: '低开庚', yBoards: 1, yFirstSeal: '14:08:18', openPct: -7.52, pct: -9.95, closeVsOpen: -2.6, sealed: false, amount: 7.8e8, sector: '电视广播' },
    { code: '000042', name: '停牌辛', yBoards: 1, yFirstSeal: null, openPct: null, pct: null, closeVsOpen: null, sealed: false, amount: null, sector: '' },
  ],
  newStocks: [{ code: '920309', name: 'N新股', pct: 77.88, price: 56.78, listDate: '2026-11-17', days: 1, turnover: 97.51, amount: 5.27e8, floatCap: 5.7e8, newHigh: false, noLimit: true, sector: '饮料乳品' }],
  gene: { from: '2026-09-14', to: '2026-11-17', days: 40, fullFrom: '2026-11-17', fullDays: 1 },
  history: [
    { date: '2026-11-13', seeded: true, zt: 37, zb: null, dt: null, natural: null, touched: null, auctionAvg: null, sealRate: null },
    { date: '2026-11-16', seeded: true, zt: 32, zb: null, dt: null, natural: null, touched: null, auctionAvg: null, sealRate: null },
    { date: '2026-11-17', zt: 3, zb: 1, dt: 1, natural: 2, touched: 1, auctionAvg: 1.25, sealRate: 75 },
  ],
  sources: [{ id: 'pools', label: '东方财富股池', url: 'https://quote.eastmoney.com/ztb/' }],
})
