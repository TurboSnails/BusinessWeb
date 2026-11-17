// 复盘页计算：快照仓读写、日 K 合并、复权百日新高、盘面亮点标签、赚钱效应、开盘分布、盘中曲线、标签次日表现、历史种子
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  GRID, buildDay, firstSeenOf, formatCloses, intradayCurve, limitPrice, limitRateOf, mergeKline, mergeStore, newHighHistory, newHighsAt,
  nextPerf, openDistribution, parseCloses, parseKline, pctAt, prevCloseAt, seedDays, sinaToRows, tagStats, tagStocks,
} from './kpl-review-lib.mjs'

const row = (c, { o = c, h = Math.max(o, c), l = Math.min(o, c), p } = {}) => ({ o, h, l, c, ...(p !== undefined ? { p } : {}) })
const day = (date, entries) => ({ date, rows: new Map(entries) })

test('快照仓：写出再读回一致；昨收只在显式给出时保留；坏行跳过', () => {
  const rows = new Map([['600000', row(10.86, { o: 10.78, h: 10.88, l: 10.73 })], ['000001', row(12.25, { p: 12.3 })]])
  const text = formatCloses('2026-11-17', 'em-kline-qfq', rows)
  assert.match(text, /^# date=2026-11-17 source=em-kline-qfq/)
  assert.ok(text.indexOf('000001') < text.indexOf('600000'))
  const back = parseCloses(text + 'abc,1,2,3\n300001,,1,1,1\n')
  assert.equal(back.meta.date, '2026-11-17')
  assert.deepEqual(back.rows.get('600000'), { o: 10.78, h: 10.88, l: 10.73, c: 10.86 })
  assert.equal(back.rows.get('000001').p, 12.3)
  assert.equal(back.rows.size, 2)
})

test('日 K：昨收 = 收盘 − 涨跌额；超过截止日的丢弃；rc 异常报错；已有行不覆盖；昨收与上一条收盘相同不写', () => {
  const body = { rc: 0, data: { klines: ['2026-11-13,10.19,10.40,10.44,10.12,0.19', '2026-11-16,10.45,10.78,10.78,10.39,0.38', '2026-11-18,1,1,1,1,0'] } }
  const bars = parseKline(body, '2026-11-17')
  assert.equal(bars.length, 2)
  assert.equal(bars[0].p, 10.21)
  assert.throws(() => parseKline({ rc: 102 }))
  assert.deepEqual(parseKline({ rc: 0, data: { klines: null } }), [])
  const maps = new Map([['2026-11-13', new Map()], ['2026-11-16', new Map([['000002', row(1)]])]])
  mergeKline(maps, '600000', bars)
  assert.equal(maps.get('2026-11-13').get('600000').p, 10.21) // 首条写昨收
  assert.equal(maps.get('2026-11-16').get('600000').p, undefined) // 10.40 = 上一条收盘
  mergeKline(maps, '000002', [{ date: '2026-11-16', o: 9, h: 9, l: 9, c: 9, p: 9 }])
  assert.equal(maps.get('2026-11-16').get('000002').c, 1) // 不覆盖
})

test('新浪行 → 快照：停牌不写；昨收与上一条收盘不同（除权）才写', () => {
  const rows = [
    { code: '600000', price: 11, open: 10.5, high: 11, low: 10.4, prev: 10 },
    { code: '600001', price: 5, open: 5, high: 5.1, low: 4.9, prev: 4.5 },
    { code: '600002', price: null, open: null, high: null, low: null, prev: 8 },
  ]
  const m = sinaToRows(rows, (c) => ({ 600000: 10, 600001: 5 })[c] ?? null)
  assert.equal(m.size, 2)
  assert.equal(m.get('600000').p, undefined)
  assert.equal(m.get('600001').p, 4.5)
})

test('涨跌幅：昨收取显式值或更早一条收盘；停牌日跳过', () => {
  const days = [day('2026-11-12', [['A', row(10)]]), day('2026-11-13', []), day('2026-11-16', [['A', row(11)]]), day('2026-11-17', [['A', row(5.5, { p: 5 })]])]
  assert.equal(prevCloseAt(days, 2, 'A'), 10)
  assert.equal(pctAt(days, 2, 'A'), 10)
  assert.equal(pctAt(days, 3, 'A'), 10) // 除权：昨收 5
  assert.equal(pctAt(days, 1, 'A'), null)
  assert.equal(pctAt(days, 0, 'A'), null)
})

const dates = (n) => Array.from({ length: n }, (_, k) => { const t = Date.UTC(2026, 0, 5) + k * 864e5; return new Date(t).toISOString().slice(0, 10) })
test('百日新高：窗口 100 天、需上市满窗口、按除权复权；当日新增', () => {
  const ds = dates(102)
  const days = ds.map((d, k) => {
    const e = []
    // A：平稳 10 元，第 101 天最高 10.5 创新高
    e.push(['A', row(10, { h: k === 101 ? 10.5 : 10.2 })])
    // B：前 60 天 20 元（最高 20.5），第 60 天 10 送 10 除权（昨收 10），之后 10 元附近，最后一天最高 10.3 —— 复权后 20.5→10.25，创新高
    if (k < 60) e.push(['B', row(20, { h: 20.5 })])
    else e.push(['B', row(10, { h: k === 101 ? 10.3 : 10.1, ...(k === 60 ? { p: 10 } : {}) })])
    // C：不复权会误判为未创新高的反例：未除权、最后一天最高 20.4 < 20.5
    if (k < 60) e.push(['C', row(20, { h: 20.5 })])
    else e.push(['C', row(20, { h: k === 101 ? 20.4 : 20.1 })])
    // D：上市不足（第 10 天才有数据）
    if (k >= 10) e.push(['D', row(5, { h: k === 101 ? 9 : 5 })])
    return day(d, e)
  })
  const fs = firstSeenOf(days)
  const r = newHighsAt(days, 101, fs)
  assert.deepEqual([...r.codes].sort(), ['A', 'B'])
  assert.equal(r.eligible, 3)
  assert.equal(newHighsAt(days, 98, fs), null)
  const h = newHighHistory(days, fs)
  assert.equal(h.length, 3)
  assert.equal(h.at(-1).count, 2)
})

test('涨跌停价：按股池涨幅就近取档位；四舍五入到分', () => {
  assert.equal(limitRateOf(10.03), 10)
  assert.equal(limitRateOf(-19.98), 20)
  assert.equal(limitRateOf(4.98), 5)
  assert.equal(limitRateOf(7), null)
  assert.equal(limitRateOf(null), null)
  assert.equal(limitPrice(6.48, 10, 1), 7.13)
  assert.equal(limitPrice(6.48, 10, -1), 5.83)
  assert.equal(limitPrice(null, 10, 1), null)
})

const zt = (code, { pct = 10, boards = 1, firstSeal = '10:00:00' } = {}) => ({ code, name: '涨' + code, pct, boards, firstSeal, sector: '行业' })
test('标签：一字 / T字 / 换手 / 首板 / 反包 / 地天 / 天地 / 断板 / 大面', () => {
  const today = new Map([
    ['Y1', row(11, { o: 11, h: 11, l: 11 })], // 一字
    ['T1', row(11, { o: 11, h: 11, l: 10.5 })], // T字
    ['H1', row(11, { o: 10.2, h: 11, l: 9 })], // 换手 + 地天（跌停 9）
    ['D1', row(9, { o: 10, h: 11, l: 9 })], // 天地
  ])
  const tags = tagStocks({
    zt: [zt('Y1', { boards: 3 }), zt('T1'), zt('H1')], dt: [{ code: 'D1', name: '跌', pct: -10, sector: '' }],
    yzt: [{ code: 'Y1', name: '', pct: 10, yBoards: 2 }, { code: 'B1', name: '断', pct: -8, yBoards: 2 }, { code: 'B2', name: '面', pct: -7.5, yBoards: 1 }],
    today, prevClose: () => 10, yZb: new Set(['T1']), yPct: (c) => (c === 'H1' ? -6 : 1),
  })
  const ids = (k) => tags.get(k).map((r) => r.code)
  assert.deepEqual(ids('yizi'), ['Y1'])
  assert.deepEqual(ids('tzi'), ['T1'])
  assert.deepEqual(ids('huanshou'), ['H1'])
  assert.deepEqual(ids('shouban'), ['T1', 'H1'])
  assert.deepEqual(ids('fanbao'), ['T1', 'H1'])
  assert.equal(tags.get('fanbao')[0].why, '昨日炸板')
  assert.deepEqual(ids('ditian'), ['H1'])
  assert.deepEqual(ids('tiandi'), ['D1'])
  assert.deepEqual(ids('duanban'), ['B1'])
  assert.deepEqual(ids('damian'), ['B1', 'B2'])
  // 昨日炸板名单缺失时只按昨日大跌判断反包
  const t2 = tagStocks({ zt: [zt('T1')], dt: [], yzt: [], today, prevClose: () => 10, yZb: null, yPct: () => null })
  assert.equal(t2.get('fanbao').length, 0)
})

test('开盘分布：剔除昨日一字；昨日快照缺失返回 null；分档与高开 / 平开 / 低开', () => {
  const y = { A: row(11, { o: 11, h: 11, l: 11 }), B: row(11, { o: 10, h: 11, l: 10 }), C: row(11, { o: 10, h: 11, l: 10 }), D: row(11, { o: 10, h: 11, l: 10 }) }
  const open = { B: 3, C: 0.2, D: -6 }
  const d = openDistribution(['A', 'B', 'C', 'D', 'E'], (c) => y[c], (c) => open[c] ?? null, true)
  assert.equal(d.oneWord, 1)
  assert.equal(d.n, 3)
  assert.deepEqual([d.high, d.flat, d.low], [1, 1, 1])
  assert.equal(d.buckets.find((b) => b.id === 'p5').count, 1)
  assert.equal(d.buckets.find((b) => b.id === 'le5').count, 1)
  assert.equal(openDistribution(['A'], () => undefined, () => 1, false), null)
})

test('盘中曲线：按封板时间累计；缺时间不计入', () => {
  assert.equal(GRID[0], '09:25')
  assert.equal(GRID.at(-1), '15:00')
  assert.ok(!GRID.includes('12:00'))
  const c = intradayCurve({ zt: [{ firstSeal: '09:25:00' }, { firstSeal: '10:03:10' }, { firstSeal: null }], zb: [{ firstSeal: '09:31:00' }], dt: [{ lastSeal: '14:56:00' }] })
  const at = (t) => c.points.find((p) => p.t === t)
  assert.deepEqual(at('09:25'), { t: '09:25', zt: 1, touched: 1, dt: 0 })
  assert.deepEqual(at('09:35'), { t: '09:35', zt: 1, touched: 2, dt: 0 })
  assert.deepEqual(at('15:00'), { t: '15:00', zt: 2, touched: 3, dt: 1 })
  assert.equal(c.missing.zt, 1)
})

test('当日记录：打板成功率、昨日涨停盈利率、首板→二板、大面；昨日快照缺失时开盘分布为 null', () => {
  const days = [
    day('2026-11-16', [['A', row(10, { o: 9.5 })], ['B', row(10, { o: 9, h: 10, l: 9 })], ['C', row(10)]]),
    day('2026-11-17', [['A', row(11, { o: 10.5, h: 11, l: 10.4 })], ['B', row(9.2, { o: 10.3, h: 10.5, l: 9.1 })], ['C', row(10)]]),
  ]
  const pools = {
    zt: [zt('A', { boards: 2 })], zb: [{ code: 'Z', firstSeal: '10:00:00' }], dt: [],
    yzt: [{ code: 'A', name: '甲', pct: 10, yBoards: 1 }, { code: 'B', name: '乙', pct: -8, yBoards: 1 }, { code: 'X', name: '停', pct: null, yBoards: 2 }],
  }
  const { record, dist } = buildDay({ date: '2026-11-17', pools, days, prevRec: null })
  const c = record.counts
  assert.equal(c.sealRate, 50)
  assert.equal(c.yztProfit, 50) // 停牌的不计入分母
  assert.equal(c.firstToSecond, 50)
  assert.equal(c.bigLoss, 1)
  assert.equal(c.drop7, 1)
  assert.equal(dist.n, 2)
  assert.deepEqual(record.tags.duanban, ['X'])
  const r2 = buildDay({ date: '2026-11-17', pools, days: [days[1]], prevRec: null })
  assert.equal(r2.dist, null)
  assert.equal(r2.record.counts.openAvg, null)
  assert.throws(() => buildDay({ date: '2026-11-18', pools, days, prevRec: null }))
})

test('标签次日表现与汇总：只算有行情的股票；样本均值与红盘率', () => {
  const days = [day('2026-11-16', [['A', row(10)], ['B', row(10)]]), day('2026-11-17', [['A', row(11)], ['B', row(9.5)]])]
  const n = nextPerf({ yizi: ['A', 'B', 'S'], damian: [] }, days, 1)
  assert.deepEqual(n.yizi, { n: 2, sum: 5, red: 1 })
  assert.deepEqual(n.damian, { n: 0, sum: 0, red: 0 })
  const s = tagStats({ days: { '2026-11-16': { next: n }, '2026-11-13': { next: { yizi: { n: 2, sum: 1, red: 2 } } }, '2026-11-17': {} } })
  const y = s.rows.find((r) => r.id === 'yizi')
  assert.deepEqual([y.n, y.days, y.avg, y.red], [4, 2, 1.5, 75])
  assert.equal(s.rows.find((r) => r.id === 'damian').avg, null)
  assert.deepEqual([s.from, s.to, s.days], ['2026-11-13', '2026-11-16', 2])
})

test('历史种子：归档计数 + 打板页名单 + 快照仓；昨日名单缺失的项不补；真实记录不被种子覆盖', () => {
  const snapshots = [{ session: 'closed', dataDate: '2026-11-17', metrics: { ztCount: 3, ztOpen: 1, dtCount: 2 }, sources: [{ id: 'limitUp', status: 'ready' }] },
    { session: 'closed', dataDate: '2026-11-13', metrics: { ztCount: 5, ztOpen: null, dtCount: 0 }, sources: [{ id: 'limitUp', status: 'ready' }] }]
  const daban = { '2026-11-16': { zt: [['A', 1], ['B', 2]], seeded: true }, '2026-11-17': { zt: [['A', 2]], zb: ['Z'], counts: { zt: 1, zb: 1, dt: 4 } } }
  const days = [day('2026-11-16', [['A', row(10)], ['B', row(10)]]), day('2026-11-17', [['A', row(11)], ['B', row(9)]])]
  const s = seedDays({ snapshots, daban, days })
  assert.equal(s['2026-11-17'].counts.dt, 4) // 打板页真实计数优先
  assert.equal(s['2026-11-17'].counts.yztProfit, 50)
  assert.equal(s['2026-11-17'].counts.firstToSecond, 100)
  assert.equal(s['2026-11-17'].counts.bigLoss, 1)
  assert.equal(s['2026-11-13'].counts.sealRate, null)
  assert.equal(s['2026-11-13'].counts.yztProfit, undefined)
  assert.equal(s['2026-11-16'].counts.yztProfit, undefined) // 11-13 没有名单
  const merged = mergeStore({ days: { '2026-11-17': { date: '2026-11-17', counts: { zt: 9 } } } }, s)
  assert.equal(merged.days['2026-11-17'].counts.zt, 9)
  assert.ok(merged.days['2026-11-13'].seeded)
})
