// 开盘啦人气排行页签计算：快照时段、人气榜解析与连续上榜、区间行过滤、资金流日线、板块区间与领涨次数、机构多日汇总
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertFresh, boardStats, buildBoardKind, buildPopularity, cutTo, inflowDays, instDay, instWindow, isClose, lastClosedDay, keepBetterBoards, lastBars, leaderCounts, listedDays,
  num, parseCurrentList, parseFflow, parseHisList, parseQuotes, parseSc, parseSurgeList, rangePct, snapshotAllowed, snapshotStillValid, stockRangeRows, stockrankData, streakOf, tradingDaysBack,
} from './kpl-rank-lib.mjs'

const D = '2026-11-17' // 周二
const ts = (date, hhmm) => (Date.parse(`${date}T${hhmm}:00+08:00`) / 1000)

test('缺失值不是 0', () => {
  assert.equal(num('-'), null)
  assert.equal(num(''), null)
  assert.equal(num(null), null)
  assert.equal(num(0), 0)
})

test('快照时段与最近收盘日', () => {
  assert.equal(snapshotAllowed(D, 15 * 60 + 40), true)
  assert.equal(snapshotAllowed(D, 15 * 60), false)
  assert.equal(snapshotAllowed('2026-11-15', 16 * 60), false) // 周日
  // 跨午夜：23:59 开始、00:01 取完，不能把快照记成前一天
  assert.equal(snapshotStillValid(D, { today: D, minutes: 23 * 60 + 59 }), true)
  assert.equal(snapshotStillValid(D, { today: '2026-11-18', minutes: 1 }), false)
  assert.equal(snapshotStillValid(D, { today: '2026-11-18', minutes: 16 * 60 }), false)
  assert.equal(lastClosedDay('2026-11-18', 3 * 60), D)
  assert.equal(lastClosedDay(D, 16 * 60), D)
  assert.equal(lastClosedDay('2026-11-16', 10 * 60), '2026-11-13') // 周一盘中 → 上周五
  assert.deepEqual(tradingDaysBack(D, 3), ['2026-11-13', '2026-11-16', D])
  assert.equal(isClose(ts(D, '15:34'), D), true)
  assert.equal(isClose(ts(D, '14:59'), D), false)
  assert.equal(isClose(ts('2026-11-16', '15:34'), D), false)
})

test('人气榜：代码解析、名次连续校验、飙升榜、历史', () => {
  assert.deepEqual(parseSc('SZ920961'), { code: '920961', secid: '0.920961' })
  assert.deepEqual(parseSc('SH600106'), { code: '600106', secid: '1.600106' })
  assert.equal(parseSc('HK00700'), null)
  assert.throws(() => stockrankData({ code: 404, message: 'NotFound', data: null }, 'x'), /NotFound/)
  const rows = Array.from({ length: 100 }, (_, i) => ({ sc: `SZ${String(i + 1).padStart(6, '0')}`, rk: i + 1 }))
  assert.equal(parseCurrentList(rows).length, 100)
  assert.throws(() => parseCurrentList(rows.slice(0, 50)), /条数/)
  assert.throws(() => parseCurrentList(rows.slice(0, 90)), /条数/) // 截断到 1–90 名也不收
  assert.throws(() => parseCurrentList([...rows, { sc: 'SZ000999', rk: 101 }]), /条数/)
  assert.throws(() => parseSurgeList([]), /飙升榜为空/)
  assert.throws(() => parseSurgeList([{ sc: 'bad', rk: 1 }]), /飙升榜为空/)
  assert.throws(() => parseCurrentList(rows.map((r, i) => (i === 5 ? { ...r, rk: 99 } : r))), /不连续|重复/)
  const s = parseSurgeList([{ sc: 'SH600106', rk: 2915, hrc: 563, hrcrk: 2 }, { sc: 'SZ000001', rk: 10, hrc: 900, hrcrk: 1 }])
  assert.equal(s[0].code, '000001')
  const h = parseHisList([{ calcTime: '2026-11-16', rank: 3 }, { calcTime: '2026-11-17', rank: 1 }, { calcTime: 'bad', rank: 2 }, { calcTime: '2026-11-15', rank: null }])
  assert.equal(h.size, 2)
})

test('连续上榜：按交易日往前数，周末跳过，缺一天停止', () => {
  const h = new Map([['2026-11-16', 5], ['2026-11-13', 8], ['2026-11-12', 30], ['2026-11-15', 99]])
  assert.equal(streakOf(3, h, D, 10), 3) // 11-17、11-16、11-13
  assert.equal(streakOf(3, h, D, 100), 4)
  assert.equal(streakOf(11, h, D, 10), 0)
  assert.equal(streakOf(3, new Map(), D, 10), 1)
})

test('人气榜组装：上一交易日排名、标签、飙升榜按交易日重算排序', () => {
  const hist = new Map([
    ['000001', new Map([['2026-11-16', 2], ['2026-11-13', 1], ['2026-11-12', 1], ['2026-11-11', 1], ['2026-11-10', 1], ['2026-11-09', 1]])],
    ['000002', new Map([['2026-11-16', 1800]])],
    ['000003', new Map([['2026-11-16', 3000], ['2026-11-15', 2000]])],
  ])
  const quotes = new Map([['000001', { name: '甲', price: 10, pct: 10 }]])
  const p = buildPopularity({ date: D, takenAt: '15:40', top: [{ code: '000001', rank: 1 }, { code: '000002', rank: 2 }, { code: '000009', rank: 3 }], surge: [{ code: '000003', rank: 1000 }, { code: '000002', rank: 2 }], hist, quotes })
  assert.equal(p.prevDate, '2026-11-16')
  assert.deepEqual(p.top[0].tags, ['连续上榜'])
  assert.equal(p.top[0].streak10, 7)
  assert.equal(p.top[0].change, 1)
  assert.deepEqual(p.top[1].tags, ['人气激增'])
  assert.equal(p.top[2].prevRank, null)
  assert.equal(p.top[2].streak10, null)
  assert.equal(p.top[2].name, null)
  assert.deepEqual(p.surge.map((r) => [r.code, r.change]), [['000002', 1798], ['000003', 2000]].sort((a, b) => b[1] - a[1]))
})

test('行情：只收当天收盘后的', () => {
  const m = parseQuotes({ data: { diff: [{ f12: '000001', f14: '甲', f2: 10, f3: 1, f124: ts(D, '15:34') }, { f12: '000002', f14: '乙', f2: 5, f3: 1, f124: ts('2026-11-16', '15:34') }] } }, D)
  assert.deepEqual([...m.keys()], ['000001'])
})

test('个股区间行：剔除停牌、旧行情、缺失值与上市不足的新股', () => {
  const t = ts(D, '15:34')
  const diff = [
    { f12: '000001', f14: '正常', f2: 10, f3: 1, f6: 1e8, f26: 20100101, f124: t, f109: 30 },
    { f12: '000002', f14: '停牌', f2: '-', f3: '-', f6: '-', f26: 20100101, f124: t, f109: 25 },
    { f12: '000003', f14: '旧', f2: 10, f3: 1, f6: 1e8, f26: 20100101, f124: ts('2026-11-16', '15:34'), f109: 20 },
    { f12: '000004', f14: '缺', f2: 10, f3: 1, f6: 1e8, f26: 20100101, f124: t, f109: '-' },
    { f12: '000005', f14: '新股', f2: 10, f3: 1, f6: 1e8, f26: 20261112, f124: t, f109: 50 },
  ]
  assert.deepEqual(stockRangeRows(diff, D, 'f109', 5).map((r) => r.code), ['000001'])
  assert.equal(listedDays(20261112, D), 4)
  assert.equal(listedDays('-', D), null)
  assert.throws(() => assertFresh(diff.slice(2, 3), D, 'x'), /不是/)
  assert.doesNotThrow(() => assertFresh(diff.slice(0, 1), D, 'x'))
})

test('资金流日线：解析、截到目标日、净流入天数与区间涨幅', () => {
  const body = { rc: 0, data: { klines: ['2026-11-13,100,0,0,0,0,0,0,0,0,0,10,1.0,0,0', '2026-11-16,-50,0,0,0,0,0,0,0,0,0,11,10.0,0,0', '2026-11-17,30,0,0,0,0,0,0,0,0,0,12.1,10.0,0,0'] } }
  const s = parseFflow(body)
  assert.deepEqual(s[2], { date: D, main: 30, close: 12.1, pct: 10 })
  assert.throws(() => parseFflow({ rc: 102 }), /结构/)
  assert.equal(cutTo(s, '2026-11-16').length, 2)
  assert.equal(cutTo(s, '2026-11-18'), null)
  assert.equal(inflowDays(s, 3), 2)
  assert.equal(inflowDays(s, 5), null)
  assert.equal(rangePct(s, 2), 21)
  assert.equal(rangePct(s, 3), null)
  const st = boardStats(s)
  assert.equal(st.r5, null)
  assert.equal(st.net1, 30)
})

test('区间按确切交易日：中间缺一天时为 null，不拿更早的一根顶上', () => {
  const k = (date, main, close) => ({ date, main, close, pct: 0 })
  // 缺 11-16：最后 3 根是 11-12、11-13、11-17，按位置会被当成 3 日
  const gap = [k('2026-11-11', 5, 9), k('2026-11-12', 5, 10), k('2026-11-13', 5, 11), k(D, 5, 12)]
  assert.equal(lastBars(gap, 3), null)
  assert.equal(inflowDays(gap, 3), null)
  assert.equal(rangePct(gap, 2), null)
  assert.equal(boardStats(gap).net5, null)
  assert.equal(inflowDays(gap, 1), 1)
  assert.deepEqual(lastBars([k('2026-11-13', 1, 1), k('2026-11-16', 1, 1), k(D, 1, 1)], 3).map((x) => x.date), ['2026-11-13', '2026-11-16', D])
  assert.equal(lastBars([], 1), null)
})

test('领涨次数：同类板块每日涨幅第一计一次，缺日线的板块不参与', () => {
  const k = (rows) => rows.map(([date, pct]) => ({ date, main: 1, close: 100, pct }))
  const boards = [
    { code: 'BK0001', name: '甲', series: k([['2026-11-13', 3], ['2026-11-16', 1], [D, 5]]) },
    { code: 'BK0002', name: '乙', series: k([['2026-11-13', 1], ['2026-11-16', 2], [D, null]]) },
  ]
  const { counts, leaders } = leaderCounts(boards, tradingDaysBack(D, 3))
  assert.deepEqual(leaders.map((l) => l.code), ['BK0001', 'BK0002', 'BK0001'])
  assert.deepEqual(counts.get('BK0001'), { lead5: 2, lead10: 2, lead20: 2 })
  const kind = buildBoardKind([...boards, { code: 'BK0003', name: '停', series: k([['2026-11-13', 9]]) }, { code: 'BK0004', name: '无', series: null }], D, tradingDaysBack(D, 3))
  assert.equal(kind.missing, 2)
  // 有板块缺日线：缺的那个可能就是某天第一，领涨次数与每日领涨都不发布
  assert.equal(kind.leaders, null)
  assert.equal(kind.rows.find((r) => r.code === 'BK0002').lead5, null)
  const full = buildBoardKind(boards, D, tradingDaysBack(D, 3))
  assert.equal(full.missing, 0)
  assert.equal(full.rows.find((r) => r.code === 'BK0002').lead5, 1)
  assert.equal(full.leaders.length, 3)
})

test('板块段：同一天已有结果缺得更少时保留旧的', () => {
  const b = (date, m) => ({ date, industry: { missing: m }, concept: { missing: 0 }, region: { missing: 0 } })
  const prev = b(D, 0), worse = b(D, 3)
  assert.equal(keepBetterBoards(prev, worse), prev)
  assert.equal(keepBetterBoards(b(D, 3), prev), prev)
  assert.equal(keepBetterBoards(b('2026-11-16', 0), worse), worse) // 新的一天总是替换
  assert.equal(keepBetterBoards(null, worse), worse)
})

const seat = (name, buy, sell, dept = '0') => ({ dept, name, kind: 'x', buy, sell, net: buy === null || sell === null ? null : buy - sell })
const entry = (id, code, window, buySeats, sellSeats, pct = 10) => ({ id: String(id), code, name: '股' + code, window, pct, buySeats, sellSeats })

test('机构多日：去重席位、跳过三日口径与类别披露、按交易日窗口汇总', () => {
  const inst1 = seat('机构专用', 1e8, 0)
  const day17 = { date: D, entries: [
    entry(1, '000001', 1, [inst1, seat('某营业部', 5e7, 0, '9')], [inst1, seat('机构专用', 0, 3e7)]),
    entry(2, '000001', 3, [seat('机构专用', 9e8, 0)], [seat('某营业部', 0, 1, '9')]), // 三日口径，非主记录
    entry(3, '000002', 3, [seat('机构专用', 2e8, 0)], [seat('某营业部', 0, 1, '9')]), // 只有三日口径：跳过
    entry(4, '000003', 1, [seat('自然人', 1e9, 0)], [seat('机构投资者', 0, 1e8)]), // 类别披露：跳过
  ] }
  const r = instDay(day17)
  assert.equal(r.length, 1)
  assert.deepEqual([r[0].buy, r[0].sell, r[0].net, r[0].seats], [1e8, 3e7, 7e7, 2])
  const day13 = { date: '2026-11-13', entries: [entry(5, '000001', 1, [seat('机构专用', 0, 2e7)], [seat('机构专用', 0, 2e7)], -5), entry(6, '600009', 1, [seat('机构专用', 1e7, null)], [seat('某营业部', 0, 1, '9')])] }
  const gappy = instWindow(new Map([[D, day17], ['2026-11-13', day13]]), D, 3)
  // 缺 11-16：不能把 2 天合计当 3 日榜发布
  assert.deepEqual(gappy.missing, ['2026-11-16'])
  assert.equal(gappy.complete, false)
  assert.deepEqual([gappy.totals.net, gappy.totals.stocks, gappy.buy.length, gappy.sell.length], [null, null, 0, 0])
  const days = new Map([[D, day17], ['2026-11-16', { date: '2026-11-16', entries: [] }], ['2026-11-13', day13]])
  const w = instWindow(days, D, 3)
  assert.deepEqual(w.missing, [])
  assert.equal(w.complete, true)
  assert.equal(w.from, '2026-11-13')
  const a = w.buy.find((x) => x.code === '000001')
  assert.deepEqual([a.net, a.times, a.seats, a.last, a.lastPct], [5e7, 2, 3, D, 10])
  assert.equal(w.buy.length, 1) // 600009 净额缺失，不进排行
  assert.equal(w.totals.stocks, 2)
  assert.equal(instWindow(days, D, 1).buy[0].net, 7e7)
})
