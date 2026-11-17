// 复盘页计算：快照仓读写、日 K 合并、缺口修补、复权百日新高、盘面亮点标签、赚钱效应、开盘分布、盘中曲线、标签次日表现、历史种子
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  GRID, REPAIR_MAX_FAIL, buildDay, canReplaceOut, firstSeenOf, formatCloses, intradayCurve, limitPrice, limitRateOf, mergeKline, mergeStore, newHighHistory, newHighsAt,
  missingDays, newRepair, nextPerf, openDistribution, parseCloses, repairEntry, repairFinalize, repairPlan, repairRecord, repairTodo, parseKline, pctAt, prevCloseAt, seedDays, sinaToRows, snapshotComplete, tagStats, tagStocks, tradingWindow,
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

const dates = (n) => tradingWindow('2026-11-17', n) // 精确交易日（跳过周末与休市）
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

test('百日新高：窗口按精确交易日；快照仓漏一天时窗口内的日子返回 null，不拿第 101 个交易日凑数', () => {
  const ds = tradingWindow('2026-11-17', 102)
  // 漏掉第 50 个交易日的快照：剩 101 个文件，最后一天往前数 100 个文件会跨 101 个交易日
  const days = ds.filter((_, k) => k !== 50).map((d) => day(d, [['A', row(10, { h: d === '2026-11-17' ? 10.5 : 10.2 })]]))
  const fs = firstSeenOf(days)
  assert.equal(newHighsAt(days, days.length - 1, fs), null)
  assert.deepEqual(newHighHistory(days, fs), [])
  assert.equal(tradingWindow('2026-11-17', 3).join(), '2026-11-13,2026-11-16,2026-11-17')
})

test('快照完整性与输出日期守卫：回补中的日 K 快照不算完整；更新日期的输出不被历史日覆盖', () => {
  assert.equal(snapshotComplete({ source: 'sina' }, false), true)
  assert.equal(snapshotComplete({ source: 'em-kline-qfq' }, false), false)
  assert.equal(snapshotComplete({ source: 'em-kline-qfq' }, true), true)
  assert.equal(snapshotComplete({}, false), false)
  assert.equal(canReplaceOut({ asOf: '2026-11-17' }, '2026-11-16'), false)
  assert.equal(canReplaceOut({ asOf: '2026-11-17' }, '2026-11-17'), true)
  assert.equal(canReplaceOut({ asOf: '2026-11-16' }, '2026-11-17'), true)
  assert.equal(canReplaceOut(null, '2026-11-17'), true)
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
  // 上一交易日快照不完整（回补中）：按缺失处理，开盘分布为空
  const r3 = buildDay({ date: '2026-11-17', pools, days, prevRec: null, yUsable: false })
  assert.equal(r3.dist, null)
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

/* ---------- 快照仓缺口修补 ---------- */
const sdays = (list) => list.map(([date, entries, source = 'sina']) => ({ date, meta: { date, source }, rows: new Map(entries) }))

test('缺口检测：指数日 K 与交易日历都认定开市、快照仓没有的日子；两者不一致的不修补，只列出', () => {
  const isTrading = (d) => !['2026-11-14', '2026-11-15', '2026-11-12'].includes(d) // 11-12 假装日历写成休市
  const r = missingDays({
    stored: ['2026-11-10', '2026-11-13'],
    indexDates: ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-16'],
    from: '2026-11-10', to: '2026-11-16', isTrading,
  })
  assert.deepEqual(r.missing, ['2026-11-11', '2026-11-16'])
  assert.deepEqual(r.indexOnly, ['2026-11-12'])
  assert.deepEqual(r.calendarOnly, [])
  // 日历认定开市而指数没有：不当缺口；指数最后一天之后不报（数据源还没更新）
  const r2 = missingDays({ stored: ['2026-11-10'], indexDates: ['2026-11-10', '2026-11-12'], from: '2026-11-10', to: '2026-11-17', isTrading: () => true })
  assert.deepEqual(r2.missing, ['2026-11-12'])
  assert.deepEqual(r2.calendarOnly, ['2026-11-11'])
  assert.deepEqual(missingDays({ stored: ['2026-11-10'], indexDates: [], from: '2026-11-10', to: '2026-11-17', isTrading: () => true }).missing, [])
})

test('修补计划：缺口前后快照日的代码并集；下一条记录日按该股实际出现的日子', () => {
  const days = sdays([
    ['2026-11-10', [['000001', row(10)], ['000002', row(5)]]],
    ['2026-11-12', [['000001', row(10)], ['000003', row(8)]]],
    ['2026-11-13', [['000001', row(10)], ['000002', row(5)], ['000003', row(8)]]],
  ])
  assert.deepEqual(repairPlan(days, '2026-11-11'), { '000001': '2026-11-12', '000002': '2026-11-13', '000003': '2026-11-12' })
  assert.deepEqual(repairPlan(days, '2026-11-16'), { '000001': null, '000002': null, '000003': null }) // 最后一天之后的缺口
  const bars = [{ date: '2026-11-11', o: 1, h: 2, l: 0.5, c: 1.5, p: 1.2 }, { date: '2026-11-12', o: 1.5, h: 1.6, l: 1.4, c: 1.6, p: 1.5 }]
  assert.deepEqual(repairEntry(bars, '2026-11-11', '2026-11-12'), [1, 2, 0.5, 1.5, 1.2, 1.6, 1.5])
  assert.deepEqual(repairEntry(bars, '2026-11-11', null), [1, 2, 0.5, 1.5, 1.2, null, null])
  assert.equal(repairEntry(bars, '2026-11-10', '2026-11-12'), 0) // 缺口日停牌
})

test('修补可断点续做：每次最多 max 只；失败计数跨运行累计，达到上限后放弃；未处理完不生成快照', () => {
  const days = sdays([['2026-11-10', [['000001', row(10)], ['000002', row(5)], ['000003', row(8)]]]])
  let rep = newRepair('2026-11-11', repairPlan(days, '2026-11-11'), 't0')
  assert.deepEqual(repairTodo(rep, 2), ['000001', '000002'])
  repairRecord(rep, '000001', [10, 11, 9.5, 10.5, 10, null, null])
  repairRecord(rep, '000002', new Error('timeout'))
  assert.equal(repairFinalize(days, rep).ready, false)
  // 进度经 JSON 落盘再读回（模拟下一次运行）
  rep = JSON.parse(JSON.stringify(rep))
  assert.deepEqual(repairTodo(rep), ['000002', '000003'])
  repairRecord(rep, '000003', 0) // 停牌
  for (let k = 1; k < REPAIR_MAX_FAIL; k++) repairRecord(rep, '000002', new Error('x'))
  assert.deepEqual(repairTodo(rep), [])
  const fin = repairFinalize(days, rep)
  assert.equal(fin.ready, true)
  assert.deepEqual(fin.skipped, ['000002'])
  assert.deepEqual([...fin.rows.keys()], ['000001'])
  assert.equal(fin.ok, false) // 只剩 1 行，不到相邻快照日的 90%：不写
  assert.match(fin.reason, /只有 1 行/)
  // 失败后成功：失败计数清掉
  const r2 = newRepair('2026-11-11', { '000009': null })
  repairRecord(r2, '000009', new Error('x'))
  repairRecord(r2, '000009', 0)
  assert.deepEqual(r2.failed, {})
})

test('修补口径：缺口日写当前前复权价，昨收在口径变化处写出；下一条记录补上换算到自身口径的昨收，链上涨幅与复权新高不变', () => {
  // 真实价：A=10，G=11（G 当日最高 11.5），N=12；快照仓 A/N 为旧前复权口径（×0.8），N 原本隐含昨收 = G；当前前复权口径 ×0.5
  const A = '2026-11-10', G = '2026-11-11', N = '2026-11-12'
  const days = sdays([
    [A, [['000001', row(8, { h: 8 })], ['000002', row(20)]], 'em-kline-qfq'],
    [N, [['000001', row(9.6, { h: 9.6 })], ['000002', row(21, { p: 20.5 })]], 'em-kline-qfq'],
  ])
  const rep = newRepair(G, repairPlan(days, G))
  repairRecord(rep, '000001', repairEntry([{ date: G, o: 5, h: 5.75, l: 5, c: 5.5, p: 5 }, { date: N, o: 5.5, h: 6, l: 5.5, c: 6, p: 5.5 }], G, N))
  repairRecord(rep, '000002', repairEntry([{ date: G, o: 20, h: 20.6, l: 20, c: 20.5, p: 20 }, { date: N, o: 21, h: 21, l: 21, c: 21, p: 20.5 }], G, N))
  const fin = repairFinalize(days, rep)
  assert.equal(fin.ok, true)
  assert.equal(fin.rows.get('000001').p, 5) // 5 ≠ 快照仓 A 收盘 8：写出
  assert.equal(fin.rows.get('000002').p, undefined) // 与 A 收盘相同：不写
  assert.deepEqual([...fin.patches.get(N)], [['000001', 8.8]]) // 5.5 × 9.6 ÷ 6；000002 已有显式昨收不改
  // 写回后核对链
  days[1].rows.get('000001').p = 8.8
  const all = [days[0], { date: G, meta: {}, rows: fin.rows }, days[1]]
  assert.equal(pctAt(all, 1, '000001'), 10)
  assert.equal(pctAt(all, 2, '000001'), 9.09)
  assert.equal(pctAt(all, 2, '000002'), 2.44)
  // 复权链：N 往前 G 的最高 5.75 × (8.8 / 5.5) = 9.2，A 的 8 × 1.6 × (5 / 8) = 8 → 与旧前复权口径一致
  const f1 = 8.8 / 5.5, f2 = f1 * (5 / 8)
  assert.ok(Math.abs(5.75 * f1 - 9.2) < 1e-9 && Math.abs(8 * f2 - 8) < 1e-9)
})

test('修补：取数之后才出现的下一条新浪记录，没有显式昨收时补成缺口前一条收盘；校验放弃过多时不写', () => {
  const A = '2026-11-16', G = '2026-11-17', T = '2026-11-18'
  const before = sdays([[A, [['000001', row(10)], ['000002', row(20)]]]])
  const rep = newRepair(G, repairPlan(before, G)) // 当时 G 之后还没有快照
  repairRecord(rep, '000001', [10, 11, 10, 11, 10, null, null])
  repairRecord(rep, '000002', [20, 20, 19, 19, 20, null, null])
  const days = [...before, ...sdays([[T, [['000001', row(10.5)], ['000002', row(19.5, { p: 19 })]]]])]
  const fin = repairFinalize(days, rep)
  assert.equal(fin.ok, true)
  assert.deepEqual([...fin.patches.get(T)], [['000001', 10]]) // 新浪写入时真实昨收 ≈ 10（A 收盘）
  const many = newRepair(G, Object.fromEntries(Array.from({ length: 30 }, (_, k) => [String(k).padStart(6, '0'), null])))
  for (const c of Object.keys(many.plan)) for (let k = 0; k < REPAIR_MAX_FAIL; k++) repairRecord(many, c, new Error('x'))
  const f2 = repairFinalize(sdays([[A, []]]), many)
  assert.equal(f2.ok, false)
  assert.match(f2.reason, /放弃的股票 30 只/)
})

test('快照头部附加字段：写出再读回', () => {
  const text = formatCloses('2026-11-11', 'em-kline-repair', new Map([['000001', row(10)]]), { repaired: '2026-11-18', skipped: 0 })
  assert.match(text, /^# date=2026-11-11 source=em-kline-repair fields=code,open,high,low,close,prev\? repaired=2026-11-18 skipped=0\n/)
  assert.deepEqual(parseCloses(text).meta, { date: '2026-11-11', source: 'em-kline-repair', fields: 'code,open,high,low,close,prev?', repaired: '2026-11-18', skipped: '0' })
})
