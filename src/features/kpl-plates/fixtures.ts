// 测试用合成数据（非真实行情）
import type { Board } from './model'

const board = (code: string, name: string, over: Partial<Board> = {}): Board => ({
  code, name, pct: 1.2, amount: 120.5, mainNet: 2.35, mainNetPct: 1.9, up: 20, down: 8, members: 30,
  leader: { code: '000001', name: '领涨甲', pct: 10.01 }, zt: 1, maxBoards: 1, upRatio: 66.7, strength: 50, ...over,
})

export const platesFixture = () => ({
  version: 1, generatedAt: '2026-11-17T08:30:00Z', asOf: '2026-11-17', note: '盘后统计，不是买卖建议。',
  summary: { zt: 37, ztMatched: 37, industries: 3, concepts: 2, industryWithZt: 2, conceptWithZt: 2, upIndustries: 2, upConcepts: 1 },
  industry: [
    board('BK0001', '电子化学品Ⅱ', { strength: 63, pct: 1.86, zt: 3, maxBoards: 2 }),
    board('BK0002', '贵金属', { strength: 55, pct: 2.5, zt: 0, maxBoards: null, mainNet: -1.2 }),
    board('BK0003', '综合Ⅱ', { strength: null, pct: null, members: 5, up: null, upRatio: null, mainNet: null, leader: null, zt: 1 }),
  ],
  concept: [
    board('BK1001', '光刻机', { strength: 81, pct: 3.08, zt: 5, maxBoards: 1 }),
    board('BK1002', '央国企改革', { strength: 40, pct: -0.5, zt: 11, maxBoards: 3 }),
  ],
  groups: {
    industry: [{ name: '电子化学品Ⅱ', code: 'BK0001', pct: 1.86, count: 3, maxBoards: 2, stocks: [
      { code: '002584', name: '西陇科学', boards: 2, firstSeal: '09:35', st: false },
      { code: '603078', name: '江化微', boards: 1, firstSeal: '10:28', st: false },
      { code: '600001', name: '*ST测试', boards: 1, firstSeal: null, st: true },
    ] }],
    concept: [{ name: '央国企改革', code: 'BK1002', pct: -0.5, count: 11, maxBoards: 3, stocks: [{ code: '600881', name: '亚泰集团', boards: 3, firstSeal: '09:30', st: false }] }],
  },
  unmatched: [],
  trend: [
    { code: 'BK0001', name: '电子化学品Ⅱ', kind: 'industry', r5: -5.75, r20: 4.2, points: [
      { date: '2026-11-13', close: 1000, pct: 0.5, zt: 1, strength: null },
      { date: '2026-11-16', close: 990, pct: -1, zt: 0, strength: 30 },
      { date: '2026-11-17', close: 1008.4, pct: 1.86, zt: 3, strength: 63 },
    ] },
    { code: 'BK1001', name: '光刻机', kind: 'concept', r5: 6.1, r20: null, points: [{ date: '2026-11-17', close: 2000, pct: 3.08, zt: 5, strength: 81 }] },
  ],
  strong: {
    industry: [{ date: '2026-11-17', boards: [{ code: 'BK0001', name: '电子化学品Ⅱ', strength: 63, pct: 1.86, zt: 3 }] }],
    concept: [{ date: '2026-11-17', boards: [{ code: 'BK1001', name: '光刻机', strength: 81, pct: 3.08, zt: 5 }] }],
  },
  seededDays: ['2026-11-13'],
  sources: [{ id: 'boards', label: '东方财富行业 / 概念板块行情', url: 'https://quote.eastmoney.com/center/boardlist.html' }],
})

const T = ['09:30', '09:31', '11:30', '13:01', '15:00']
/** 附加模块：板块分布、分时叠加、概念成分变动 */
export const platesExtras = () => ({
  dist: {
    source: 'daban', counts: { zt: 37, zb: 20, dt: 67, natural: 34, touched: 25 },
    industry: [{ code: 'BK0001', name: '电子化学品Ⅱ', zt: 3, zb: 1, dt: 0, natural: 3, touched: 0 }],
    concept: [{ code: 'BK1002', name: '央国企改革', zt: 11, zb: 6, dt: 30, natural: 10, touched: 7 }],
  },
  intraday: {
    date: '2026-11-17', times: T,
    boards: [
      { code: 'BK0001', name: '电子化学品Ⅱ', kind: 'industry', strength: 63, pct: 1.86, pre: 1000, values: [-0.9, -0.5, 0.8, 1.2, 1.86] },
      { code: 'BK0002', name: '贵金属', kind: 'industry', strength: 55, pct: 2.5, pre: 500, values: [0.2, 0.4, null, 2, 2.5] },
      { code: 'BK1001', name: '光刻机', kind: 'concept', strength: 81, pct: 3.08, pre: 2000, values: [0.5, 1, 2, 2.5, 3.08] },
      { code: 'BK1002', name: '央国企改革', kind: 'concept', strength: 40, pct: -0.5, pre: 900, values: [0, -0.2, -0.3, -0.4, -0.5] },
    ],
  },
  members: {
    date: '2026-11-17', base: '2026-11-16', prevDay: '2026-11-16', stocks: 5930, withConcepts: 5519, unmatchedNames: 0,
    today: {
      base: '2026-11-16', skipped: 2,
      concepts: [{ code: 'BK1001', name: '光刻机', members: 80, addedCount: 2, removedCount: 1, added: [{ code: '000001', name: '新进甲' }, { code: '000002', name: '新进乙' }], removed: [{ code: '000003', name: '剔除丙' }] }],
      newConcepts: [{ code: 'BK1999', name: '新概念', members: 12 }], droppedConcepts: [],
    },
    recent: [{ date: '2026-11-16', base: '2026-11-13', concepts: 3, added: 5, removed: 1, newConcepts: [], droppedConcepts: [] }],
  },
})
