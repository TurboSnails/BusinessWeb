// 开盘啦龙虎榜页签计算：上榜原因窗口、席位类型、日期与完整性校验、席位去重、主记录、机构/营业部汇总、历史合并、目标交易日
import test from 'node:test'
import assert from 'node:assert/strict'
import { isByType, assembleDay, buildLatest, buildWindow, candidateDays, checkComplete, dayStats, kindOf, mergeHistory, num, parseList, parseSeats, pickDay, primaryEntries, shortDept, uniqueSeats, windowOf } from './kpl-lhb-lib.mjs'

const D = '2026-11-17'
const listRow = (id, code, reason, over = {}) => ({
  TRADE_ID: id, TRADE_DATE: `${D} 00:00:00`, SECURITY_CODE: code, SECUCODE: `${code}.${code.startsWith('6') ? 'SH' : 'SZ'}`, SECURITY_NAME_ABBR: '股' + code,
  EXPLANATION: reason, CLOSE_PRICE: 10, CHANGE_RATE: 10.01, TURNOVERRATE: 20, ACCUM_AMOUNT: 1e9,
  BILLBOARD_BUY_AMT: 3e8, BILLBOARD_SELL_AMT: 1e8, BILLBOARD_NET_AMT: 2e8, BILLBOARD_DEAL_AMT: 4e8, DEAL_AMOUNT_RATIO: 40, DEAL_NET_RATIO: 20, TRADE_MARKET: '深交所主板', SECURITY_TYPE_CODE: '058001001', ...over,
})
const seatRow = (id, code, dept, name, buy, sell, over = {}) => ({ TRADE_ID: String(id), TRADE_DATE: `${D} 00:00:00`, SECURITY_CODE: code, OPERATEDEPT_CODE: dept, OPERATEDEPT_NAME: name, BUY: buy, SELL: sell, NET: buy === null || sell === null ? null : buy - sell, ...over })

function sampleDay() {
  const list = parseList([
    listRow(1, '000001', '日涨幅偏离值达到7%的前5只证券'),
    listRow(2, '000001', '连续三个交易日内，涨幅偏离值累计达到20%的证券', { ACCUM_AMOUNT: 3e9, BILLBOARD_NET_AMT: 5e8 }),
    listRow(3, '600001', '日跌幅偏离值达到7%的前5只证券', { CHANGE_RATE: -9.98, BILLBOARD_NET_AMT: -1e8 }),
  ], D)
  const buy = parseSeats([
    seatRow(1, '000001', '0', '机构专用', 1e8, 0),
    seatRow(1, '000001', '100', '甲证券股份有限公司某路证券营业部', 5e7, 1e6),
    seatRow(2, '000001', '0', '机构专用', 2e8, 0),
    seatRow(3, '600001', '200', '沪股通专用', 3e7, 4e7),
    seatRow(3, '600001', '100', '甲证券股份有限公司某路证券营业部', 2e7, null, { NET: 2e7 }),
  ], D, 'buy')
  const sell = parseSeats([
    seatRow(1, '000001', '100', '甲证券股份有限公司某路证券营业部', 5e7, 1e6), // 同时在买入前五：只算一次
    seatRow(1, '000001', '0', '机构专用', 0, 3e7),
    seatRow(2, '000001', '0', '机构专用', 0, 3e7),
    seatRow(3, '600001', '0', '机构专用', null, 9e7),
  ], D, 'sell')
  return assembleDay(D, list, buy, sell)
}

test('null / 空串是缺失，不是 0', () => {
  assert.equal(num(null), null)
  assert.equal(num(''), null)
  assert.equal(num('  '), null)
  assert.equal(num(0), 0)
  assert.equal(num('1.5'), 1.5)
})

test('上榜原因窗口、席位类型与营业部简称', () => {
  assert.equal(windowOf('日换手率达到20%的前5只证券'), 1)
  assert.equal(windowOf('连续三个交易日内，涨幅偏离值累计达到20%的证券'), 3)
  assert.equal(windowOf('非S证券连续三个交易日内收盘价格跌幅偏离值累计达到20%的证券'), 3)
  assert.equal(windowOf('连续10个交易日内，日收盘价格涨幅偏离值累计达到100%'), 10)
  assert.equal(kindOf('机构专用'), 'inst')
  assert.equal(kindOf('深股通专用'), 'hk')
  assert.equal(kindOf('国泰海通证券股份有限公司总部'), 'dept')
  assert.equal(shortDept('开源证券股份有限公司西安西大街证券营业部'), '开源证券西安西大街证券营业部')
})

test('日期不符、行数不全、席位缺失时报错（不写错日或残缺数据）', () => {
  assert.throws(() => parseList([listRow(1, '000001', 'x', { TRADE_DATE: '2026-11-16 00:00:00' })], D), /日期不符/)
  assert.throws(() => parseSeats([seatRow(1, '000001', '0', '机构专用', 1, 0, { TRADE_DATE: '2026-11-16 00:00:00' })], D, 'buy'), /日期不符/)
  assert.throws(() => checkComplete([{}, {}], 3, '上榜明细'), /不完整/)
  const list = parseList([listRow(1, '000001', 'x'), listRow(2, '000002', 'y')], D)
  const b = parseSeats([seatRow(1, '000001', '0', '机构专用', 1, 0)], D, 'buy')
  const s = parseSeats([seatRow(1, '000001', '0', '机构专用', 1, 0)], D, 'sell')
  assert.throws(() => assembleDay(D, list, b, s), /数据未发全/)
  // 可转债记录与它的席位一起剔除，不算残缺
  const withBond = parseList([listRow(1, '000001', 'x'), listRow(5, '127117', '转债', { SECURITY_TYPE_CODE: '060' })], D)
  const day = assembleDay(D, withBond, [...b, ...parseSeats([seatRow(5, '127117', '1', '自然人', 1e11, 0)], D, 'buy')], s)
  assert.deepEqual(day.entries.map((e) => e.code), ['000001'])
  assert.equal('aShare' in day.entries[0], false)
  assert.throws(() => assembleDay(D, list.slice(0, 1), [...b, ...parseSeats([seatRow(9, '000009', '1', '某营业部', 1, 0)], D, 'buy')], s), /不属于/)
})

test('席位去重：同一席位同时在买入前五与卖出前五只算一次；缺失金额保持 null', () => {
  const day = sampleDay()
  const e1 = day.entries.find((e) => e.id === '1')
  assert.equal(uniqueSeats(e1).length, 3)
  const e3 = day.entries.find((e) => e.id === '3')
  assert.equal(e3.buySeats.find((s) => s.kind === 'dept').sell, null)
  assert.equal(e3.sellSeats[0].buy, null)
  assert.equal(e3.buySeats[0].name, '沪股通专用')
})

test('主记录：同一股票优先当日口径，3 日累计只在没有当日口径时使用', () => {
  const day = sampleDay()
  assert.deepEqual(primaryEntries(day.entries).map((e) => e.id).sort(), ['1', '3'])
})

test('当日汇总：个股、上榜原因分组、机构与北向席位、营业部排行', () => {
  const l = buildLatest(sampleDay())
  assert.equal(l.stockCount, 2)
  assert.equal(l.entryCount, 3)
  assert.equal(l.up, 1)
  assert.equal(l.down, 1)
  assert.deepEqual(l.totals, { buy: 6e8, sell: 2e8, net: 1e8 }) // 只计主记录，3 日口径那条不重复加
  assert.equal(l.stocks[0].code, '000001')
  assert.deepEqual(l.stocks[0].reasons.map((r) => r.id), ['1', '2'])
  assert.equal(l.stocks[0].instNet, 1e8 - 3e7)
  assert.equal(l.stocks[0].instBuyCount, 1)
  assert.equal(l.stocks[1].hasHk, true)
  // 机构：600001 的机构席位买入额缺失 → 净额只用已知卖出额
  assert.deepEqual(l.instRank.map((r) => [r.code, r.net]), [['000001', 7e7], ['600001', -9e7]])
  assert.deepEqual(l.inst, { buy: 1e8, sell: 1.2e8, net: -2e7, stocks: 2 })
  assert.deepEqual(l.hk, { buy: 3e7, sell: 4e7, net: -1e7, stocks: 1 })
  assert.equal(l.reasons.length, 3)
  assert.deepEqual(l.deptRank.map((r) => [r.name, r.count, r.buy, r.sell, r.net]), [['甲证券某路证券营业部', 2, 7e7, 1e6, 6.9e7]])
})

test('窗口：营业部上榜次数、天数与明细，个股上榜次数', () => {
  const d1 = sampleDay()
  const d2 = { ...sampleDay(), date: '2026-11-16' }
  d2.entries = d2.entries.map((e) => ({ ...e }))
  const w = buildWindow([d1, d2])
  assert.equal(w.days, 2)
  assert.equal(w.from, '2026-11-16')
  assert.equal(w.deptRank[0].count, 4)
  assert.equal(w.deptRank[0].days, 2)
  assert.equal(w.deptRank[0].last, D)
  assert.equal(w.deptTrades['100'][0].date, D)
  assert.deepEqual(w.stockRank.map((s) => [s.code, s.count]), [['000001', 2], ['600001', 2]])
})

test('历史合并与重抓：记录数变少的残缺数据不覆盖已有完整数据', () => {
  const s = dayStats(sampleDay())
  assert.deepEqual(s, { date: D, stockCount: 2, entryCount: 3, net: 1e8, instNet: -2e7, instStocks: 2, hkNet: -1e7 })
  const h = mergeHistory([{ ...s, entryCount: 5 }], [s])
  assert.equal(h[0].entryCount, 5)
  assert.equal(mergeHistory([{ ...s, date: '2026-11-16' }], [s]).length, 2)
  const full = sampleDay(), part = { ...full, entries: full.entries.slice(0, 1) }
  assert.equal(pickDay(full, part), full)
  assert.equal(pickDay(part, full), full)
  assert.equal(pickDay(null, part), part)
})

test('目标交易日：16:30 前和凌晨从上一交易日开始，跳过周末与假期', () => {
  assert.deepEqual(candidateDays('2026-11-17', 15 * 60, 2), ['2026-11-16', '2026-11-13'])
  assert.deepEqual(candidateDays('2026-11-17', 18 * 60 + 30, 2), ['2026-11-17', '2026-11-16'])
  assert.deepEqual(candidateDays('2026-11-18', 40, 1), ['2026-11-17'])
  assert.deepEqual(candidateDays('2026-11-15', 20 * 60, 1), ['2026-11-13'])
  assert.deepEqual(candidateDays('2026-10-08', 10 * 60, 1), ['2026-09-30'])
})

test('投资者类别披露（严重异常波动）：不当席位汇总，个股金额留空，主记录优先席位披露', () => {
  assert.equal(kindOf('中小投资者'), 'type')
  assert.equal(kindOf('机构'), 'type')
  const list = parseList([
    listRow(1, '000001', '严重异常期间日收盘价格涨幅偏离值累计达到100%的证券', { BILLBOARD_BUY_AMT: 9e9, BILLBOARD_NET_AMT: 1e8 }),
    listRow(2, '000002', '严重异常期间日收盘价格涨幅偏离值累计达到100%的证券'),
    listRow(3, '000002', '日涨幅偏离值达到7%的前5只证券', { BILLBOARD_NET_AMT: 3e7 }),
  ], D)
  const seats = (side) => parseSeats([
    seatRow(1, '000001', '1', '自然人', 6e9, 5e9), seatRow(1, '000001', '2', '机构投资者', 3e9, 3e9),
    seatRow(2, '000002', '1', '自然人', 6e9, 5e9),
    seatRow(3, '000002', '100', '甲证券某路证券营业部', 5e7, 0), seatRow(3, '000002', '0', '机构专用', 0, 2e7),
  ], D, side)
  const day = assembleDay(D, list, seats('buy'), seats('sell'))
  assert.equal(isByType(day.entries[0]), true)
  assert.deepEqual(primaryEntries(day.entries).map((e) => e.id).sort(), ['1', '3'])
  const l = buildLatest(day)
  assert.equal(l.byTypeCount, 1)
  assert.deepEqual(l.totals, { buy: 3e8, sell: 1e8, net: 3e7 })
  const s1 = l.stocks.find((s) => s.code === '000001')
  assert.equal(s1.byType, true)
  assert.equal(s1.net, null)
  assert.equal(s1.reasons[0].byType, true)
  assert.deepEqual(l.deptRank.map((r) => r.name), ['甲证券某路证券营业部'])
  assert.deepEqual(l.inst, { buy: 0, sell: 2e7, net: -2e7, stocks: 1 })
})
