// 测试用合成数据（非真实行情）
const bins = (labels: string[], ns: number[]) => labels.map((label, i) => ({ label, n: ns[i] ?? 0 }))
const row = (over: Record<string, unknown>) => ({
  code: '110001', name: '示例转债', price: 120, pct: 0.5, stockCode: '600001', stockName: '示例正股', stockPrice: 10, stockPct: 1, convPrice: 10, convValue: 100,
  premium: 20, bondValue: 95, ytm: -2.5, remain: 5e8, years: 3.2, rating: 'AA', dualLow: 140, redeemTrigger: 13, expireRedeem: 110, expireDate: '2030-01-01',
  putStart: '2028-01-01', convStart: '2025-06-01', inConvert: true, ...over,
})

export const cbondFixture = () => ({
  version: 1, generatedAt: '2026-11-17T19:13:00Z', asOf: '2026-11-17', source: 'report', note: '盘后统计，不是买卖建议。',
  index: { close: 432.82, pct: -0.1, prevClose: 433.24 },
  summary: {
    count: 3, priced: 3, avgPrice: 136.7, medianPrice: 123.88, avgPremium: 72.55, medianPremium: 58.5, up: 2, down: 1, flat: 0,
    priceBins: bins(['<100', '100–110', '110–120', '120–130', '>130'], [7, 22, 92, 85, 109]),
    premiumBins: bins(['<0%', '0–10%', '10–20%', '20–30%', '30–50%', '50–100%', '>100%'], [5, 11, 19, 29, 69, 119, 62]),
    pctBins: bins(['≤−3%', '−3~−1%', '−1~0%', '0%', '0~1%', '1~3%', '≥3%'], [16, 39, 90, 6, 98, 55, 11]),
  },
  rows: [
    row({ code: '110001', name: '双低甲', price: 105, premium: 5, dualLow: 110, ytm: 2.1 }),
    row({ code: '110002', name: '高价乙', price: 189.97, pct: -1.2, premium: -1.9, dualLow: 188.07, ytm: null, rating: 'AA+' }),
    row({ code: '110003', name: '缺字段丙', price: 130, pct: null, stockPrice: null, stockPct: null, convValue: null, premium: null, bondValue: null, ytm: null, remain: null, rating: null, dualLow: null }),
  ],
  discount: [{ code: '110002', name: '高价乙', price: 189.97, convValue: 193.65, premium: -1.9, stockPct: 1.55, gapPerLot: 36.8, remain: 1.87e6 }],
  call: [
    { code: '123255', name: '强赎丁', price: 217, stockPrice: 57.79, trigger: 36.89, ratio: 130, hit: 14, need: 15, calc: 30, window: 14, status: 'counting', note: '不强赎承诺期已过，自 2026-10-29 起重新计数', partial: false, emText: '14/15|30', emHit: 14, remain: 9.1e8 },
    { code: '110077', name: '承诺戊', price: 190, stockPrice: 8.54, trigger: 5.73, ratio: 130, hit: null, need: 15, calc: 30, window: null, status: 'promised', note: '本次内不强赎', partial: false, emText: '不强赎【2026-11-20】重新计算', emHit: null, remain: 1.8e6 },
  ],
  clauseCheck: { agree: 8, total: 8, asOf: '2026-11-17' },
  down: [
    { code: '110081', name: '提议己', price: 85.17, stockPrice: 10.27, convPrice: 18.36, trigger: 15.61, ratio: 85, hit: null, need: 15, calc: 30, window: null, status: 'proposed', note: '董事会已提议下修（东财标注日期 2026-11-26）', emText: '提议下修,【2026-11-26】', emHit: null, premium: 52.27, remain: 7.15e9 },
    { code: '113049', name: '计数庚', price: 110, stockPrice: 20, convPrice: 38.74, trigger: 32.93, ratio: 85, hit: 30, need: 15, calc: 30, window: 30, status: 'counting', note: '', emText: '至少还需5天,10/15|30', emHit: 10, premium: 80, remain: 3e9 },
  ],
  maturity: [{ code: '123076', name: '到期辛', price: 112.93, expireDate: '2026-11-19', years: 0.01, expireRedeem: 113, redeemGap: 0.07, ytm: 11.79, inPut: true, putTrigger: 7.42, putHit: 0, putNeed: 30, remain: 1.1e8 }],
  issues: [
    { code: '111027', name: '新债壬', applyCode: '713016', stockCode: '605016', stockName: '正股壬', applyDate: '2026-11-19', recordDate: '2026-11-18', lotDate: '2026-11-21', listDate: null, scale: 7.48, rating: 'AA', convPrice: 19.42, perShare: 1.781, winRate: null, refPrice: 20.5, refDate: '2026-11-17', rightsPer100: 8.69, minShares: 600, firstOpen: null, firstClose: null, firstPct: null, profitPerLot: null },
    { code: '123291', name: '上市癸', applyCode: '370181', stockCode: '300181', stockName: '正股癸', applyDate: '2026-10-29', recordDate: '2026-10-28', lotDate: '2026-11-02', listDate: '2026-11-13', scale: 13.71, rating: 'AA', convPrice: 13.13, perShare: 1.9704, winRate: 0.00386, refPrice: 12.85, refDate: '2026-10-28', rightsPer100: 15.33, minShares: 600, firstOpen: 130, firstClose: 132, firstPct: 32, profitPerLot: 317.9 },
  ],
  rights: [
    { code: '111027', name: '新债壬', applyCode: '713016', stockCode: '605016', stockName: '正股壬', applyDate: '2026-11-19', recordDate: '2026-11-18', lotDate: '2026-11-21', listDate: null, scale: 7.48, rating: 'AA', convPrice: 19.42, perShare: 1.781, winRate: null, refPrice: 20.5, refDate: '2026-11-17', rightsPer100: 8.69, minShares: 600, firstOpen: null, firstClose: null, firstPct: null, profitPerLot: null },
  ],
  history: [
    { date: '2026-11-13', count: 316, avgPrice: 140, medianPrice: 127.5, avgPremium: 70, medianPremium: 56, up: 100, down: 200, priceBins: [5, 20, 80, 90, 121], source: 'report', backfilled: true },
    { date: '2026-11-16', count: 316, avgPrice: 137, medianPrice: 124.1, avgPremium: 72, medianPremium: 58, up: 50, down: 260, priceBins: [6, 21, 90, 86, 113], source: 'report', backfilled: true },
    { date: '2026-11-17', count: 315, avgPrice: 136.7, medianPrice: 123.88, avgPremium: 72.55, medianPremium: 58.5, up: 164, down: 145, priceBins: [7, 22, 92, 85, 109], source: 'report' },
  ],
  indexHistory: [{ date: '2026-11-13', close: 447.68 }, { date: '2026-11-16', close: 433.24 }, { date: '2026-11-17', close: 432.82 }],
  sources: [{ id: 'list', label: '东方财富可转债数据一览', url: 'https://data.eastmoney.com/kzz/default.html' }],
})
