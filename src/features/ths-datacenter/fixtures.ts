// 测试用合成数据（非真实行情）
import type { BuybackRow, HolderRow, LiftRow, ReportsBlock, StockReport, SubNew } from './model'

const sub = (code: string, name: string, listDate: string, cumPct: number | null, over: Partial<SubNew> = {}): SubNew => ({
  code, name, board: '科创板', listDate, issuePrice: 20, issuePe: 30, firstPct: 150, cumPct, sinceFirstPct: cumPct === null ? null : -10, days: 5, broke: cumPct === null ? null : cumPct < 0, ...over,
})
const lift = (code: string, date: string, over: Partial<LiftRow> = {}): LiftRow => ({ code, name: '解禁' + code.slice(-1), date, type: '首发原股东限售股份', shares: 1000, able: 1000, ratio: 12.5, totalRatio: 5, close: 10, cap: 1e8, ...over })
const holder = (code: string, dir: '增持' | '减持', amount: number | null, over: Partial<HolderRow> = {}): HolderRow => ({
  code, name: '股东' + code.slice(-1), holder: '某某集团有限公司', dir, notice: '2026-11-17', shares: 100, ratio: 0.5, start: '2026-11-01', end: '2026-11-16', avgPrice: amount === null ? null : 10, amount, way: '二级市场', ...over,
})
const bb = (code: string, status: string, statusLabel: string, over: Partial<BuybackRow> = {}): BuybackRow => ({
  code, name: '回购' + code.slice(-1), status, statusLabel, notice: '2026-11-17', planDate: '2026-11-03', start: '2026-11-02', low: 1e8, high: 2e8, priceCap: 50, amount: null, shares: null, avgPrice: null, progressLow: null, progressHigh: null, ...over,
})

const report = (id: string, code: string, over: Partial<StockReport> = {}): StockReport => ({
  id, date: '2026-11-17', code, name: '研报' + code.slice(-1), org: '某证券', rating: '增持', sRating: '增持', change: '维持', last: '增持',
  aimLow: null, aimHigh: null, close: null, upLow: null, upHigh: null, ind: '电池', title: '标题' + id, url: `https://data.eastmoney.com/report/info/${id}.html`, ...over,
})
export const reportsFixture = (): ReportsBlock => ({
  day: '2026-11-17', w7: '2026-11-11', w30: '2026-10-19', missingDays: [],
  pending: { date: '2026-11-18', stock: 14, industry: 14 },
  dayStock: 3, dayIndustry: 2, counts: { 上调: 1, 下调: 0, 首次: 1, 维持: 1, 无: 0, 未标注: 0 },
  stock7: 10, stock30: 40, industry7: 5, industry30: 20, closeDate: '2026-11-17',
  rows: [
    report('AP2026111700000001', '300001', { change: '首次', last: null, aimLow: 11, aimHigh: 12, close: 10, upLow: 10, upHigh: 20 }),
    report('AP2026111700000002', '300002', { change: '上调', last: '中性', aimLow: 20, aimHigh: 20, close: null }),
    report('AP2026111700000003', '300003'),
  ],
  upgrades: [report('AP2026111700000002', '300002', { change: '上调', last: '中性' })],
  initiations: [report('AP2026111700000001', '300001', { change: '首次', last: null }), report('AP2026111300000004', '300004', { date: '2026-11-13', change: '首次', last: null })],
  covered: [{ code: '600519', name: '覆盖甲', ind: '白酒Ⅱ', count: 10, orgs: 9, latest: '2026-11-13', first: 0, up: 1 }],
  industries: [{ name: '汽车零部件', n7: 17, n30: 71 }, { name: '未标注行业', n7: 0, n30: 2 }],
  daily: [{ date: '2026-11-16', stock: 18, industry: 59 }, { date: '2026-11-17', stock: 3, industry: 2 }],
  seed: { from: '2026-10-19', to: '2026-11-18' },
})

export const datacenterFixture = () => ({
  version: 1, generatedAt: '2026-11-17T09:30:00Z', asOf: '2026-11-17', note: '盘后整理的公开披露数据，不构成投资建议。',
  ipo: {
    calendar: [
      { code: '301661', name: '待申新股', board: '创业板', applyCode: '301661', applyDate: '2026-11-26', ballotDate: '2026-11-30', listDate: null, issuePrice: null, issuePe: null, industryPe: 37.08, lotRate: null, peDiff: null, status: '待申购' },
      { code: '920067', name: '待上新股', board: '北交所', applyCode: '920067', applyDate: '2026-11-11', ballotDate: '2026-11-16', listDate: null, issuePrice: 23.52, issuePe: 13.88, industryPe: 38.47, lotRate: 0.0256, peDiff: -63.9, status: '待上市' },
    ],
    recent: [sub('688001', '近新甲', '2026-11-10', 85.98)],
    subNew: { from: '2025-11-18', to: '2026-11-17', count: 3, valid: 2, brokeCount: 1, brokeRate: 50, medianCum: 37.99, medianFirst: 150, rows: [sub('688001', '近新甲', '2026-11-10', 85.98), sub('300002', '破发乙', '2026-06-01', -10), sub('000003', '停牌丙', '2026-05-06', null, { firstPct: null })] },
  },
  lift: {
    upcoming: { from: '2026-11-18', to: '2026-12-17', count: 2, cap: 1e8, capMissing: 1, byDate: [{ date: '2026-11-18', count: 2, cap: 1e8, capMissing: 1 }], rows: [lift('600001', '2026-11-18'), lift('600002', '2026-11-18', { close: null, cap: null, ratio: 422.49 })] },
    past: { from: '2026-10-19', to: '2026-11-17', count: 1, d1: { n: 1, mean: 0.26, median: 0.26, up: 1 }, d5: { n: 0, mean: null, median: null, up: 0 }, rows: [lift('600003', '2026-11-17', { tDate: '2026-11-17', d1: 0.26, d5: null })] },
  },
  holders: {
    from: '2026-10-19', to: '2026-11-17', count: 3, incCount: 2, decCount: 1, incAmount: 1e7, decAmount: -3e7, missing: 1,
    rows: [holder('000001', '增持', 1e7), holder('000002', '减持', -3e7), holder('000003', '增持', null)],
    rank: {
      inc: [{ code: '000001', name: '股东1', inc: 1e7, dec: 0, net: 1e7, netRatio: 0.5, count: 1, known: 1, holders: 1, missing: 0 }],
      dec: [{ code: '000002', name: '股东2', inc: 0, dec: -3e7, net: -3e7, netRatio: -0.5, count: 1, known: 1, holders: 1, missing: 0 }],
    },
  },
  pledge: { date: '2026-11-13', total: 2262, counts: { 50: 11, 30: 91 }, rows: [{ code: '600370', name: '质押甲', industry: '化学纤维', ratio: 78.74, deals: 34, shares: 316745.56, cap: 4.72e9, y1: -47.9 }] },
  goodwill: { period: '2026-09-30', total: 2769, negative: 22, counts: { 100: 16, 50: 45, 30: 110 }, rows: [{ code: '002775', name: '商誉乙', industry: '基础建设', goodwill: 4.4e7, equity: 3.8e6, ratio: 1152.22, notice: '2026-10-24' }] },
  buyback: {
    from: '2026-10-19', to: '2026-11-17', count: 3, counts: { 实施中: 1, 董事会预案: 1, 未标注: 1 }, newPlans: 1, newPlanLow: 1e8, newPlanHigh: 2e8,
    rows: [bb('300001', '004', '实施中', { amount: 5e7, shares: 1e6, avgPrice: 50, progressLow: 50, progressHigh: 25 }), bb('300002', '001', '董事会预案'), bb('300003', '007', '未标注', { low: null, priceCap: null })],
  },
  reports: reportsFixture() as ReportsBlock | null,
  reportsError: null as string | null,
  history: [{ date: '2026-11-17', subNew: 2, brokeRate: 50, medianCum: 37.99, liftCount: 2, liftCap: 1e8, holderInc: 1e7, holderDec: -3e7, buybackCount: 3, pledge50: 11 }],
  sources: [{ id: 'ipo', label: '东方财富数据中心 · 新股申购与中签', url: 'https://data.eastmoney.com/xg/xg/default.html' }],
})
