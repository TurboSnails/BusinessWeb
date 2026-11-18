// 测试用合成数据（非真实行情）
const base = (code: string, name: string, board: string, over = {}) => ({
  code, name, board, close: 10, pct: 5, dev1: 5.5, dev3: 12, dev3Days: 3, dev10: 20, dev10Days: 10, dev30: 30, dev30Days: 30, ...over,
})

export const abnormalFixture = () => ({
  version: 1, generatedAt: '2026-11-17T09:00:00Z', date: '2026-11-17', note: '按规则机械计算，不是预测。',
  indices: [
    { board: 'sh', code: '000001', name: '上证指数', pct: -0.5 }, { board: 'kcb', code: '000688', name: '科创50', pct: 0.62 },
    { board: 'sz', code: '399107', name: '深证A股指数', pct: -0.9 }, { board: 'cyb', code: '399102', name: '创业板综合指数', pct: null },
  ],
  summary: { universe: 5000, d3up: 1, d3down: 1, severe: 1, nearUp: 2, nearDown: 1, suspended: 1, resumed: 1, lhbPredicted: 3, lhbHit: 2, radarTotal: 3 },
  triggered: [
    { ...base('300001', '触发甲', 'cyb', { pct: 16.05, dev3: 46.29 }), trig: ['d3up'], trigDev: 44.62, trigDays: 2, official: 'd3up' },
    { ...base('600002', '触发乙', 'sh', { pct: -9.98, dev3: -25.21 }), trig: ['d3down', 'same3'], trigDev: -25.21, trigDays: 3, official: 'none' },
    { ...base('000003', '缺字段丙', 'sz', { close: null, pct: null, dev1: null, dev3: null, dev10: null, dev30: null }), trig: [], trigDev: null, trigDays: null, official: 'severe' },
  ],
  nearUp: [
    { ...base('002187', '接近丁', 'sz', { dev3: 19.51, dev3Days: 2 }), up3: { need: 0.42, price: 8.14 }, down3: null, sameUp: 2, sameDown: 0 },
    { ...base('000628', '接近戊', 'sz'), up3: { need: 1.39, price: 49.39 }, down3: null, sameUp: 0, sameDown: 0 },
  ],
  nearDown: [{ ...base('600228', '接近己', 'sh', { pct: -10.03 }), up3: null, down3: { need: -2.86, price: 8.62 }, sameUp: 0, sameDown: 1 }],
  severeWatch: [{ ...base('300999', '严重庚', 'cyb', { dev10: 85 }), up10: { need: 8.11, price: 12.3 }, down10: null, up30: null, down30: null, sameUp: 2, sameDown: 0, sameNext: true }],
  lhb: {
    available: true,
    rows: [
      { code: '002242', name: '上榜辛', board: 'sz', cat: 'devup', value: 10.9, hit: true },
      { code: '600829', name: '落榜壬', board: 'sh', cat: 'devdown', value: -9.53, hit: false },
      { code: '300001', name: '触发甲', board: 'cyb', cat: 'd3up', value: 44.62, hit: true },
    ],
    missed: [{ code: '603536', name: '漏判癸', board: 'sh', cat: 'devdown' }],
    stats: { predicted: 3, actual: 3, hit: 2, precision: 66.7, recall: 66.7 },
    backtest: { days: 20, calc: 353, actual: 353, hit: 352, from: '2026-10-21', to: '2026-11-17', precision: 99.7, recall: 99.7 },
  },
  suspend: {
    today: [{ code: '000635', name: '停牌子', market: '深交所主板', start: '2026-11-13', startTime: '09:30', end: '2026-11-19', kind: '连续停牌', reason: '拟筹划重大资产重组', resume: '2026-11-20', days: 3 }],
    intraday: [{ code: '920309', name: '盘中丑', market: '北京证券交易所', start: '2026-11-17', startTime: '13:16', end: '2026-11-17', endTime: '13:26', kind: '盘中停牌', reason: '交易异常波动', resume: null }],
    resumed: [{ code: '000831', name: '复牌寅', market: '深交所主板', start: '2026-11-02', startTime: '09:30', end: '2026-11-13', kind: '连续停牌', reason: '拟筹划重大资产重组', resume: '2026-11-16', nth: 2, suspendedDays: 10, since: -5.82, dev3: null }],
  },
  radar: {
    date: '2026-11-17', total: 3,
    types: [{ id: 4, name: '封涨停板', dir: 1, count: 1 }, { id: 16, name: '打开涨停板', dir: -1, count: 1 }, { id: 8193, name: '大笔买入', dir: 1, count: 1 }],
    buckets: [{ t: '09:30', c: { 4: 1 } }, { t: '14:30', c: { 16: 1, 8193: 1 } }],
    top: { 4: [{ code: '600770', name: '雷达卯', n: 1, first: '09:35:12', last: '09:35:12', amount: null }], 8193: [{ code: '603370', name: '大单辰', n: 1, first: '14:55:41', last: '14:55:41', amount: 2167808 }] },
    timeline: [{ time: '09:35:12', code: '600770', name: '雷达卯', type: 4, price: 5.53 }, { time: '15:00:00', code: '600770', name: '雷达卯', type: 16, price: 5.52 }],
  },
  regulatory: {
    from: '2026-10-18', to: '2026-11-17', partial: true,
    sources: [
      { id: 'sse', label: '上交所 监管问询 / 监管措施 / 纪律处分', url: 'https://www.sse.com.cn/', ok: true, n: 2 },
      { id: 'szse', label: '深交所 问询函件 / 监管措施 / 纪律处分', url: 'https://www.szse.cn/', ok: false, n: null, error: 'ECONNRESET' },
      { id: 'cninfo', label: '巨潮资讯 问询函 / 关注函回复公告', url: 'https://www.cninfo.com.cn/', ok: true, n: 1 },
    ],
    counts: {
      d5: { from: '2026-11-11', inquiry: 1, attention: 0, measure: 1, discipline: 0, replies: 1, companies: 2 },
      d20: { from: '2026-10-21', inquiry: 2, attention: 0, measure: 1, discipline: 1, replies: 1, companies: 4 },
    },
    items: [
      { ex: 'sz', code: '300197', name: '问询甲', date: '2026-11-14', kind: 'inquiry', type: '问询函回复', title: '问询甲关于重组问询函回复的公告', url: 'https://static.cninfo.com.cn/finalpage/2026-11-14/1.PDF', src: 'cninfo', reply: true, pct: 2.5, dev3: 7.15 },
      { ex: 'sh', code: '603366', name: '监管乙', date: '2026-11-12', kind: 'measure', type: '监管工作函', title: '关于监管乙股价波动事项的监管工作函', url: null, src: 'sse', pct: -10.04, dev3: -25.84 },
      { ex: 'sz', code: '000821', name: '处分丙', date: '2026-11-06', kind: 'discipline', type: '通报批评、公开谴责', title: '关于对处分丙及相关当事人给予纪律处分的决定', url: 'https://reportdocs.static.szse.cn/UpFiles/zqjghj/x.pdf', src: 'szse', pct: null, dev3: null },
      { ex: 'sz', code: '300364', name: '问询丁', date: '2026-11-02', kind: 'inquiry', type: '问询函', title: '问询丁 问询函', url: 'https://reportdocs.static.szse.cn/UpFiles/zqjghj/y.pdf', src: 'szse', replyUrl: 'https://reportdocs.static.szse.cn/UpFiles/zqjghj/z.pdf', pct: -1.2, dev3: 0.5 },
    ],
  },
  regulatoryNote: '深交所 问询函件 / 监管措施 / 纪律处分 本次未取到，列表沿用此前存档中该来源的条目',
  history: [
    { date: '2026-11-16', d3up: 4, d3down: 20, severe: 0, nearUp: 80, nearDown: 120, suspended: 6, radarTotal: null, kline: true },
    { date: '2026-11-17', d3up: 1, d3down: 1, severe: 1, nearUp: 2, nearDown: 1, suspended: 1, radarTotal: 3 },
  ],
  archive: { from: '2026-09-15', to: '2026-11-17', days: 40, backfilled: 39 },
  sources: [{ id: 'kline', label: '东方财富日 K', url: 'https://quote.eastmoney.com/' }],
})
