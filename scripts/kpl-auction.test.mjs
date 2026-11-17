import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EXPECTED_MINUTES, auctionRatio, checkSnapshot, completeBars, dayStats, groupSummary, historyRow, isBj, isRegression, marketDay, mergeHistory, mergeSameDay, num,
  parseMinutes, parseSnapshotRow, pickCandidates, secidOf, snapshotCovers, stockRow, topBy,
} from './kpl-auction-lib.mjs'

// 合成一天 241 根分钟线：09:30 竞价、09:31…15:00；opts 覆盖关键几根
function dayBars(date, { open = 10.2, openAmt = 1e6, mid = 10.3, midAmt = 2e6, before = 10.4, close = 10.5, closeAmt = 3e6 } = {}) {
  const out = [`${date} 09:30,${open},${openAmt}`]
  const times = []
  for (let h = 9, m = 31; h < 15 || (h === 15 && m === 0); m++) {
    if (m === 60) { h++; m = 0 }
    if (h === 11 && m > 30) { h = 13; m = 1 }
    if (h > 15 || (h === 15 && m > 0)) break
    times.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }
  for (const t of times) {
    if (t === '15:00') out.push(`${date} 15:00,${close},${closeAmt}`)
    else if (t === '14:58' || t === '14:59') out.push(`${date} ${t},${before},0.00`)
    else out.push(`${date} ${t},${mid},${midAmt}`)
  }
  return out
}
const body = (trends, preClose = 10) => ({ rc: 0, data: { code: '000001', name: '测试', preClose, trends } })

test('合成数据每天 241 根', () => {
  assert.equal(dayBars('2026-11-17').length, 241)
})

test('parseMinutes：按日期分组、缺失值为 null、空数据抛错', () => {
  const m = parseMinutes(body([...dayBars('2026-11-16'), '2026-11-17 09:30,-,'], 10))
  assert.deepEqual(Object.keys(m.days), ['2026-11-16', '2026-11-17'])
  assert.equal(m.days['2026-11-17'][0].close, null)
  assert.equal(m.days['2026-11-17'][0].amount, null)
  assert.throws(() => parseMinutes({ rc: 0, data: { trends: [] } }))
  assert.throws(() => parseMinutes({ rc: 102, data: null }))
})

test('dayStats：竞价 / 尾盘指标；昨收优先用传入值，否则取上一交易日 15:00', () => {
  const m = parseMinutes(body([...dayBars('2026-11-16', { close: 10, openAmt: 5e5 }), ...dayBars('2026-11-17')], 9.8))
  const s = dayStats(m, '2026-11-17', '2026-11-16', 10)
  assert.equal(s.auctionPrice, 10.2)
  assert.equal(s.auctionPct, 2)
  assert.equal(s.auctionAmount, 1e6)
  assert.equal(s.closePct, 5)
  assert.equal(s.afterAuctionPct, 2.94) // 10.5 / 10.2 − 1
  assert.equal(s.closeRef, 10.4)
  assert.equal(s.closeAuctionPct, 0.96) // 10.5 / 10.4 − 1
  assert.equal(s.closeAuctionAmount, 3e6)
  assert.equal(s.dayAmount, 1e6 + 237 * 2e6 + 3e6)
  assert.equal(s.prevAuctionAmount, 5e5)
  assert.equal(auctionRatio(s), 2)
  // 不传昨收：取 11-16 的 15:00 收盘价 10
  assert.equal(dayStats(m, '2026-11-17', '2026-11-16').auctionPct, 2)
  // 上一交易日不在数据里、也没传昨收：涨幅为 null，不用更早的日子
  const s2 = dayStats(m, '2026-11-17', '2026-11-13')
  assert.equal(s2.auctionPct, null)
  assert.equal(s2.prevAuctionAmount, null)
  assert.equal(auctionRatio(s2), null)
})

test('dayStats：竞价无成交时竞价涨幅为 null；不足 241 根返回 null', () => {
  const m = parseMinutes(body(dayBars('2026-11-17', { openAmt: 0, closeAmt: 0 })))
  const s = dayStats(m, '2026-11-17', null, 10)
  assert.equal(s.auctionAmount, 0)
  assert.equal(s.auctionPct, null)
  assert.equal(s.closeAuctionPct, null)
  const short = parseMinutes(body(dayBars('2026-11-17').slice(0, 200)))
  assert.equal(dayStats(short, '2026-11-17', null, 10), null)
  assert.equal(dayStats(short, '2026-11-18', null, 10), null)
})

test('分钟线完整性：241 个不重复的交易分钟，重复一根 + 缺一根不算完整', () => {
  assert.equal(EXPECTED_MINUTES.length, 241)
  assert.deepEqual([EXPECTED_MINUTES[0], EXPECTED_MINUTES[1], EXPECTED_MINUTES[120], EXPECTED_MINUTES[121], EXPECTED_MINUTES[240]], ['09:30', '09:31', '11:30', '13:01', '15:00'])
  const bars = dayBars('2026-11-17')
  assert.equal(completeBars(parseMinutes(body(bars)).days['2026-11-17']), true)
  const i = bars.findIndex((x) => x.includes(' 10:00,'))
  const dup = [...bars]; dup[i] = bars[i - 1] // 10:00 缺失，09:59 重复，总数仍是 241
  const m = parseMinutes(body(dup))
  assert.equal(m.days['2026-11-17'].length, 241)
  assert.equal(completeBars(m.days['2026-11-17']), false)
  assert.equal(dayStats(m, '2026-11-17', null, 10), null)
  const odd = [...bars]; odd[i] = '2026-11-17 12:00,10.3,2000000' // 午休时间的分钟
  assert.equal(dayStats(parseMinutes(body(odd)), '2026-11-17', null, 10), null)
})

test('pickCandidates：成交额前 N + 涨停 + 昨日涨停，剔除北交所，合并标签', () => {
  const snapshot = [
    { code: '600001', name: 'A', market: 1, amount: 9e9, industry: '银行' },
    { code: '000002', name: 'B', market: 0, amount: 8e9, industry: '' },
    { code: '920001', name: '北', market: 0, amount: 7e9, industry: 'x' },
    { code: '300003', name: 'C', market: 0, amount: 1e8, industry: '半导体' },
  ]
  const zt = [{ c: '300003', n: 'C', m: 0, hybk: '半导体' }]
  const yzt = [{ c: '600001', n: 'A', m: 1, ylbc: 2 }, { c: '830001', n: '北2', m: 0, ylbc: 1 }]
  const cands = pickCandidates({ snapshot, zt, yzt, topN: 2 })
  assert.deepEqual(cands.map((c) => c.code), ['600001', '000002', '300003'])
  assert.deepEqual(cands[0].tags, ['top', 'yzt'])
  assert.equal(cands[0].yBoards, 2)
  assert.equal(cands[2].industry, '半导体')
  assert.deepEqual(cands[2].tags, ['zt'])
  assert.equal(isBj('920001'), true)
  assert.equal(secidOf('600001'), '1.600001')
  assert.equal(secidOf('000002', 0), '0.000002')
})

test('parseSnapshotRow：缺失行业为空串、缺失金额为 null', () => {
  assert.deepEqual(parseSnapshotRow({ f12: '000001', f13: 0, f14: '平安', f6: '-', f100: '-' }), { code: '000001', name: '平安', market: 0, amount: null, industry: '' })
  assert.equal(num(''), null)
  assert.equal(num(0), 0)
})

test('checkSnapshot：成交额前列对得上才通过；快照被截断时不降低门槛', () => {
  const snapshot = Array.from({ length: 120 }, (_, i) => ({ code: String(i), amount: 1e9 + i }))
  const good = new Map(snapshot.map((r) => [r.code, { dayAmount: r.amount * 1.01 }]))
  assert.equal(checkSnapshot(snapshot, good).pass, true)
  const bad = new Map(snapshot.map((r, i) => [r.code, { dayAmount: r.amount * (i % 2 ? 1.5 : 1) }]))
  assert.equal(checkSnapshot(snapshot, bad).pass, false)
  assert.equal(checkSnapshot(snapshot, new Map()).pass, false)
  // 截断成只有 20 行：即使全部对得上也不通过
  const cut = snapshot.slice(0, 20)
  assert.equal(checkSnapshot(cut, good).pass, false)
  // 前 100 只里只有 20 只有分时：样本不足
  const few = new Map(snapshot.sort((a, b) => b.amount - a.amount).slice(0, 20).map((r) => [r.code, { dayAmount: r.amount }]))
  assert.equal(checkSnapshot(snapshot, few).pass, false)
})

test('snapshotCovers：剔除北交所后有成交额的行必须够 topN', () => {
  const rows = Array.from({ length: 400 }, (_, i) => ({ code: String(600000 + i), amount: 1e8 }))
  assert.equal(snapshotCovers(rows, 400), true)
  assert.equal(snapshotCovers(rows.slice(0, 399), 400), false)
  assert.equal(snapshotCovers([...rows.slice(0, 399), { code: '920001', amount: 1e8 }], 400), false)
  assert.equal(snapshotCovers([...rows.slice(0, 399), { code: '600999', amount: null }], 400), false)
})

test('同一天重跑合并 / 日期回退保护', () => {
  const D = '2026-11-17'
  const mk = (over) => ({ asOf: D, universe: { failed: 0 }, indexes: [1, 2, 3, 4, 5], boards: [{ kind: 'industry' }, { kind: 'industry' }], ...over })
  const prev = mk()
  // 指数 / 板块缺：沿用旧的
  const m = mergeSameDay(prev, mk({ indexes: [1, 2], boards: [] }))
  assert.equal(m.indexes.length, 5)
  assert.equal(m.boards.length, 2)
  // 个股失败更多：整份不替换
  assert.equal(mergeSameDay(prev, mk({ universe: { failed: 3 } })), null)
  // 更全：用新的
  const better = mk({ boards: [{ kind: 'industry' }, { kind: 'industry' }, { kind: 'industry' }] })
  assert.equal(mergeSameDay(prev, better).boards.length, 3)
  // 新的一天直接替换
  const nextDay = mk({ asOf: '2026-11-18', boards: [] })
  assert.equal(mergeSameDay(prev, nextDay), nextDay)
  assert.equal(mergeSameDay(null, nextDay), nextDay)
  assert.equal(isRegression({ asOf: '2026-11-18' }, D), true)
  assert.equal(isRegression({ asOf: D }, D), false)
  assert.equal(isRegression(null, D), false)
})

test('groupSummary：分布、高开率、均值只算有竞价涨幅的', () => {
  const rows = [3, -1, 0, 6, -6, null].map((p, i) => ({ code: String(i), auctionPct: p, afterAuctionPct: p === null ? null : 1, closePct: p, auctionAmount: 1e6 }))
  const g = groupSummary(rows)
  assert.equal(g.n, 5)
  assert.equal(g.highOpen, 2)
  assert.equal(g.lowOpen, 2)
  assert.equal(g.flat, 1)
  assert.equal(g.highOpenRate, 40)
  assert.equal(g.avgAuctionPct, 0.4)
  assert.deepEqual(g.buckets, { le5: 1, m5: 0, m2: 1, flat: 1, p2: 0, p5: 1, ge5: 1 })
  assert.equal(g.auctionAmount, 5e6)
  assert.equal(groupSummary([]).highOpenRate, null)
})

test('marketDay：两市合计；上一交易日缺失时 prev 为 null', () => {
  const sh = parseMinutes(body([...dayBars('2026-11-16', { openAmt: 4e9 }), ...dayBars('2026-11-17', { openAmt: 5e9, closeAmt: 8e9 })]))
  const sz = parseMinutes(body([...dayBars('2026-11-16', { openAmt: 5e9 }), ...dayBars('2026-11-17', { openAmt: 6e9, closeAmt: 7e9 })]))
  const mk = marketDay(sh, sz, '2026-11-17', '2026-11-16')
  assert.equal(mk.auctionAmount, 11e9)
  assert.equal(mk.prevAuctionAmount, 9e9)
  assert.equal(mk.closeAuctionAmount, 15e9)
  assert.equal(mk.prevDate, '2026-11-16')
  const lone = marketDay(sh, sz, '2026-11-16', '2026-11-13')
  assert.equal(lone.prevAuctionAmount, null)
  assert.equal(lone.prevDate, null)
  assert.equal(marketDay(sh, sz, '2026-11-18', '2026-11-17'), null)
})

test('historyRow / mergeHistory：正式记录覆盖回补，回补不覆盖正式', () => {
  const mk = { date: '2026-11-17', auctionAmount: 1.1e10, closeAuctionAmount: 1.5e10, dayAmount: 1.6e12, auctionShare: 0.69, closeAuctionShare: 0.94 }
  const s = { code: '1', auctionPct: 1, afterAuctionPct: 0.5, closePct: 1.5, auctionAmount: 1 }
  const real = historyRow(mk, [s], [s])
  assert.equal(real.auctionAmount, 110)
  assert.equal(real.yztAvgAuction, 1)
  const back = historyRow(mk, [s], [s], { backfilled: true })
  assert.equal(back.backfilled, true)
  assert.equal(back.yztAvgAuction, null)
  assert.equal(mergeHistory([real], [back])[0].backfilled, undefined)
  assert.equal(mergeHistory([back], [real])[0].backfilled, undefined)
  assert.equal(mergeHistory([], [{ ...back, date: '2026-11-16' }, real]).length, 2)
})

test('stockRow / topBy', () => {
  const m = parseMinutes(body(dayBars('2026-11-17')))
  const row = stockRow({ code: '000001', name: '测试', industry: '', tags: ['top'], yBoards: null }, dayStats(m, '2026-11-17', null, 10))
  assert.equal(row.auctionRatio, null)
  assert.equal(row.industry, '')
  const list = [{ v: 1 }, { v: null }, { v: 3 }, { v: 2 }]
  assert.deepEqual(topBy(list, 'v', 2).map((r) => r.v), [3, 2])
  assert.deepEqual(topBy(list, 'v', 2, 'asc').map((r) => r.v), [1, 2])
})
