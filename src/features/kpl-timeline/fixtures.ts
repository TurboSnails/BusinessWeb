// 测试用合成数据（非真实行情）
const times = ['09:30', '09:31', '10:00', '11:30', '13:01', '15:00']
const idx = (id: string, code: string, name: string, pct: number | null) => ({
  id, code, name, prevClose: 100, open: 99.5, openPct: -0.5, close: 100 + (pct ?? 0), pct,
  high: { t: '10:00', v: 100.8, pct: 0.8 }, low: { t: '13:01', v: 98.9, pct: -1.1 }, amp: 1.9,
  checkpoints: [{ t: '10:00', pct: 0.6 }, { t: '10:30', pct: null }, { t: '11:00', pct: 0.1 }, { t: '11:30', pct: -0.2 }, { t: '13:30', pct: -0.9 }, { t: '14:00', pct: -0.6 }, { t: '14:30', pct: -0.4 }],
  series: [-0.5, -0.6, 0.6, -0.2, -1, pct],
})
const slot = (id: string, label: string, over = {}) => ({
  id, label, ztNew: 0, ztCum: 0, touchNew: 0, shChange: null, shEnd: null, topIndustry: null, topConcept: null, radar: null, sealEv: null, openEv: null, stocks: [], ...over,
})

export const timelineFixture = () => ({
  version: 1, generatedAt: '2026-11-17T09:00:00Z', date: '2026-11-17', prevDate: '2026-11-16',
  note: '收盘后还原，不是盘中直播。',
  times,
  indices: [idx('sh', '000001', '上证指数', -0.5), idx('sz', '399001', '深证成指', -0.49), idx('cyb', '399006', '创业板指', null)],
  parts: { index: true, pools: 'daban', boards: '15:00:00', concepts: true, radar: null },
  summary: { zt: 3, touch: 1, firstZt: '09:25:00', boardTop: { name: '概念甲', count: 3650 }, radarTotal: null, events: 6 },
  slots: [
    slot('09:25', '集合竞价', { ztNew: 1, ztCum: 1, shChange: -0.5, shEnd: -0.5, stocks: ['股票甲'] }),
    slot('09:30', '09:30–10:00', { ztNew: 2, ztCum: 3, touchNew: 1, shChange: 1.1, shEnd: 0.6, topIndustry: { name: '行业乙', zt: 2 }, topConcept: { name: '概念甲', zt: 2 }, stocks: ['股票乙', '股票丙'] }),
    slot('10:00', '10:00–10:30', { ztCum: 3, shChange: -0.3, shEnd: 0.3 }),
  ],
  events: [
    { t: '09:25:00', kind: 'board', title: '行业乙 首只涨停：股票甲', detail: '申万二级行业，当日共 2 只涨停', board: '行业乙', code: '000001', hint: [{ name: '概念甲', zt: 2 }], dir: 1 },
    { t: '09:25:00', kind: 'zt', title: '股票甲 首次封涨停', detail: '行业乙 · 3 板', code: '000001', hint: [{ name: '概念甲', zt: 2 }], dir: 1 },
    { t: '09:30:00', kind: 'index', title: '开盘', detail: '上证 −0.50% · 深成 −0.49% · 创业板 —', dir: -1 },
    { t: '09:41:00', kind: 'touch', title: '股票丁 首次触及涨停（收盘未封住）', detail: '收盘 +2.00%', code: '000004', dir: -1 },
    { t: '10:00:00', kind: 'index', title: '上证指数日内最高', detail: '100.80（+0.80%）', dir: 1 },
    { t: '15:00:00', kind: 'index', title: '收盘', detail: '上证 −0.50%', dir: -1 },
  ],
  boards: {
    asOf: '15:00:00', total: 1070, kept: 3,
    rows: [
      { code: 'BK0001', name: '概念甲', kind: 'concept', pct: -1.23, flow: -58.24, count: 3650, up: 1336, down: 1368, types: [[8202, 383], [8, 229]], ms: { code: '000819', name: '股票戊', type: 8 }, zt: 11, firstZt: { time: '09:25:02', code: '000001', name: '股票甲' }, hint: [{ name: '概念丙', zt: 5 }] },
      { code: 'BK0002', name: '地域乙', kind: 'region', pct: 0.5, flow: null, count: 3570, up: 10, down: 0, types: [], ms: null, zt: null, firstZt: null, hint: [] },
      { code: 'BK0003', name: '行业丙', kind: 'industry2', pct: null, flow: 1.2, count: 20, up: 0, down: 0, types: [], ms: null, zt: 0, firstZt: null, hint: [] },
    ],
  },
  history: [{ date: '2026-11-17', zt: 3, shPct: -0.5, shAmp: 1.9, boardTop: '概念甲', boardTopCount: 3650, radarTotal: null }],
  sources: [{ id: 'trends', label: '东方财富指数分时', url: 'https://quote.eastmoney.com/' }],
})
