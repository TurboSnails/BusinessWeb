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
