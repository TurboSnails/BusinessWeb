// 同花顺数据中心页签计算：缺失值、数据日期、日 K 解析、新股/次新、解禁表现、增减持汇总、质押与商誉、回购进度、历史合并
import test from 'node:test'
import assert from 'node:assert/strict'
import { addDays, buildBuyback, buildCalendar, buildGoodwill, buildHolders, buildLift, buildPledge, buildSubNew, checkComplete, closeOn, latestPeriod, liftPerf, mergeHistory, num, parseKline, secidOf, targetDay } from './ths-datacenter-lib.mjs'

const D = '2026-11-17'
const bars = (pairs) => pairs.map(([date, close]) => ({ date, close }))

test('null / 空串 / "-" 是缺失，不是 0', () => {
  for (const x of [null, undefined, '', ' ', '-', 'abc', true]) assert.equal(num(x), null)
  assert.equal(num(0), 0)
  assert.equal(num('1.5'), 1.5)
})

test('数据日期：交易日 15:30 后取当天，否则上一个交易日；周末取周五', () => {
  assert.equal(targetDay(D, 15 * 60 + 29), '2026-11-16')
  assert.equal(targetDay(D, 15 * 60 + 30), D)
  assert.equal(targetDay('2026-11-18', 60), D)
  assert.equal(targetDay('2026-11-22', 20 * 60), '2026-11-20')
  assert.equal(addDays(D, 30), '2026-12-17')
})

test('secid、行数完整性、日 K 解析只保留 ≤ asOf 的并剔除坏行', () => {
  assert.equal(secidOf('600001.SH', '600001'), '1.600001')
  assert.equal(secidOf('920309.BJ', '920309'), '0.920309')
  assert.equal(secidOf('', '300750'), '0.300750')
  assert.throws(() => checkComplete([1], 2, 'x'))
  assert.deepEqual(checkComplete([1, 2], 2, 'x'), [1, 2])
  const k = parseKline({ data: { klines: ['2026-11-18,9', '2026-11-16,10.5', '2026-11-17,11', 'bad,1', '2026-11-13,-'] } }, D)
  assert.deepEqual(k, bars([['2026-11-16', 10.5], ['2026-11-17', 11]]))
  assert.equal(parseKline({ data: null }, D), null)
  assert.equal(closeOn(k, D), 11)
  assert.equal(closeOn(k, '2026-11-18'), null, '最后一根不是当天（停牌）时为 null，不用更早的收盘')
  assert.equal(closeOn(null, D), null)
})

test('申购日历：近 30 日起，状态、发行 PE 相对行业 PE', () => {
  const rows = [
    { SECURITY_CODE: '301661', SECURITY_NAME_ABBR: '待申', APPLY_DATE: '2026-11-26 00:00:00', INDUSTRY_PE_NEW: 37.08, ISSUE_PRICE: null },
    { SECURITY_CODE: '920067', SECURITY_NAME_ABBR: '待上', APPLY_DATE: '2026-11-11 00:00:00', ISSUE_PRICE: 23.52, AFTER_ISSUE_PE: 13.88, INDUSTRY_PE_NEW: 38.47, ONLINE_ISSUE_LWR: 0.0256 },
    { SECURITY_CODE: '920309', SECURITY_NAME_ABBR: '已上', APPLY_DATE: '2026-11-04 00:00:00', LISTING_DATE: '2026-11-17 00:00:00', ISSUE_PRICE: 31.92, AFTER_ISSUE_PE: 20, INDUSTRY_PE_NEW: 10 },
    { SECURITY_CODE: '000001', SECURITY_NAME_ABBR: '太早', APPLY_DATE: '2026-10-01 00:00:00' },
  ]
  const c = buildCalendar(rows, D)
  assert.deepEqual(c.map((r) => [r.code, r.status]), [['301661', '待申购'], ['920067', '待上市'], ['920309', '已上市']])
  assert.equal(c[0].issuePrice, null)
  assert.equal(c[0].peDiff, null)
  assert.equal(c[1].peDiff, -63.9)
  assert.equal(c[2].peDiff, 100)
  assert.equal(c[1].board, '北交所')
})

test('次新股：后复权累计涨幅、首日涨幅、破发率；停牌或首根日期不符时留空、不计入统计', () => {
  const rows = [
    { SECURITY_CODE: '688001', SECURITY_NAME_ABBR: '涨', LISTING_DATE: '2026-11-10 00:00:00', ISSUE_PRICE: 10 },
    { SECURITY_CODE: '300002', SECURITY_NAME_ABBR: '破', LISTING_DATE: '2026-06-01 00:00:00', ISSUE_PRICE: 20 },
    { SECURITY_CODE: '000003', SECURITY_NAME_ABBR: '停', LISTING_DATE: '2026-05-01 00:00:00', ISSUE_PRICE: 5 },
    { SECURITY_CODE: '000004', SECURITY_NAME_ABBR: '超一年', LISTING_DATE: '2025-11-17 00:00:00', ISSUE_PRICE: 5 },
    { SECURITY_CODE: '000005', SECURITY_NAME_ABBR: '未上市', LISTING_DATE: '2026-11-20 00:00:00', ISSUE_PRICE: 5 },
  ]
  const m = new Map([
    ['688001', bars([['2026-11-10', 25], ['2026-11-17', 20]])],
    ['300002', bars([['2026-06-01', 30], ['2026-11-17', 18]])],
    ['000003', bars([['2026-05-06', 8], ['2026-11-14', 9]])],
  ])
  const s = buildSubNew(rows, m, D)
  assert.equal(s.count, 3)
  assert.deepEqual(s.rows.map((r) => r.code), ['688001', '300002', '000003'])
  const [a, b, c] = s.rows
  assert.equal(a.firstPct, 150)
  assert.equal(a.cumPct, 100)
  assert.equal(a.sinceFirstPct, -20)
  assert.equal(a.broke, false)
  assert.equal(b.cumPct, -10)
  assert.equal(b.broke, true)
  assert.equal(c.firstPct, null, '首根 K 线不是上市日')
  assert.equal(c.cumPct, null, '当天停牌')
  assert.equal(c.broke, null)
  assert.equal(s.valid, 2)
  assert.equal(s.brokeCount, 1)
  assert.equal(s.brokeRate, 50)
  assert.equal(s.medianCum, 45)
})

test('解禁日后表现：基准为解禁前一交易日；非交易日解禁顺延；不足 5 日留空', () => {
  const k = bars([['2026-11-06', 10], ['2026-11-09', 11], ['2026-11-10', 12], ['2026-11-11', 9], ['2026-11-12', 10], ['2026-11-13', 10.5], ['2026-11-16', 10], ['2026-11-17', 10]])
  assert.deepEqual(liftPerf(k, '2026-11-09'), { tDate: '2026-11-09', d1: 10, d5: 5 })
  assert.deepEqual(liftPerf(k, '2026-11-08'), { tDate: '2026-11-09', d1: 10, d5: 5 }, '周日解禁按周一算')
  assert.deepEqual(liftPerf(k, '2026-11-16'), { tDate: '2026-11-16', d1: -4.76, d5: null })
  assert.deepEqual(liftPerf(k, '2026-11-01'), { tDate: '2026-11-06', d1: null, d5: null }, '没有前一交易日')
  assert.deepEqual(liftPerf(null, D), { tDate: null, d1: null, d5: null })
})

test('解禁：未来/近 30 日分组、按数据日期收盘重算市值、停牌时市值缺失、只要 A 股', () => {
  const row = (code, date, shares, over = {}) => ({ SECURITY_CODE: code, SECURITY_NAME_ABBR: 'S' + code, FREE_DATE: `${date} 00:00:00`, CURRENT_FREE_SHARES: shares, ABLE_FREE_SHARES: shares, FREE_RATIO: 0.1, TOTAL_RATIO: 0.05, FREE_SHARES_TYPE: '首发原股东限售股份', SECURITY_TYPE_CODE: '058001001', ...over })
  const up = [row('000001', '2026-11-18', 100), row('000002', '2026-11-18', 50), row('000003', '2026-12-17', 10), row('000004', '2026-12-18', 10), row('900001', '2026-11-20', 10, { SECURITY_TYPE_CODE: '058001002' })]
  const past = [row('000005', '2026-11-16', 20), row('000006', '2026-10-17', 20)]
  const m = new Map([['000001', bars([['2026-11-17', 10]])], ['000002', bars([['2026-11-14', 10]])], ['000003', bars([['2026-11-17', 5]])], ['000005', bars([['2026-11-13', 10], ['2026-11-16', 11], ['2026-11-17', 12]])]])
  const l = buildLift(up, past, m, D)
  assert.equal(l.upcoming.from, '2026-11-18')
  assert.equal(l.upcoming.to, '2026-12-17')
  assert.deepEqual(l.upcoming.rows.map((r) => r.code), ['000001', '000002', '000003'])
  assert.equal(l.upcoming.rows[0].cap, 100 * 1e4 * 10)
  assert.equal(l.upcoming.rows[0].ratio, 10)
  assert.equal(l.upcoming.rows[0].totalRatio, 5)
  assert.equal(l.upcoming.rows[1].cap, null)
  assert.equal(l.upcoming.cap, 1e7 + 5e5)
  assert.equal(l.upcoming.capMissing, 1)
  assert.deepEqual(l.upcoming.byDate, [{ date: '2026-11-18', count: 2, cap: 1e7, capMissing: 1 }, { date: '2026-12-17', count: 1, cap: 5e5, capMissing: 0 }])
  assert.deepEqual(l.past.rows.map((r) => r.code), ['000005'])
  assert.equal(l.past.rows[0].d1, 10)
  assert.equal(l.past.d1.n, 1)
  assert.equal(l.past.d5.n, 0)
  assert.equal(l.past.d5.mean, null)
})

test('增减持：只认公告均价，均价缺失时金额为 null；按个股净额排行；公告日晚于数据日期的不计', () => {
  const row = (code, dir, n, avg, notice = D, over = {}) => ({ SECURITY_CODE: code, SECURITY_NAME_ABBR: 'S' + code, HOLDER_NAME: 'H' + code, DIRECTION: dir, CHANGE_NUM: n, AFTER_CHANGE_RATE: 0.5, TRADE_AVERAGE_PRICE: avg, CLOSE_PRICE: 9, NOTICE_DATE: `${notice} 00:00:00`, START_DATE: '2026-11-01 00:00:00', END_DATE: '2026-11-16 00:00:00', MARKET: '二级市场', ...over })
  const h = buildHolders([
    row('000001', '增持', 100, 10), row('000001', '减持', 20, 10, '2026-11-10', { HOLDER_NAME: '另一人' }),
    row('000002', '减持', 50, 4), row('000003', '增持', 10, null), row('000004', '增持', 10, 10, '2026-11-18'), row('000005', '增持', 10, 10, '2026-10-18'), row('000006', '其他', 10, 10),
  ], D)
  assert.equal(h.count, 4)
  assert.equal(h.from, '2026-10-19')
  assert.equal(h.rows.find((r) => r.code === '000003').amount, null, '不用收盘价估算')
  assert.equal(h.rows.find((r) => r.code === '000002').amount, -2e6)
  assert.equal(h.missing, 1)
  assert.equal(h.incAmount, 1e7)
  assert.equal(h.decAmount, -4e6)
  assert.deepEqual(h.rank.inc.map((r) => [r.code, r.net, r.count, r.holders, r.netRatio]), [['000001', 8e6, 2, 2, 0]])
  assert.deepEqual(h.rank.dec.map((r) => [r.code, r.net]), [['000002', -2e6]])
})

test('质押与商誉：日期校验、比例换算、净资产为负的剔除；报告期按法定披露截止日', () => {
  const p = buildPledge([{ SECURITY_CODE: '600370', SECURITY_NAME_ABBR: '甲', TRADE_DATE: '2026-11-13 00:00:00', PLEDGE_RATIO: 78.74, PLEDGE_DEAL_NUM: 34, REPURCHASE_BALANCE: 100, PLEDGE_MARKET_CAP: 2.5, INDUSTRY: '化纤' }], '2026-11-13', { 50: 1, 30: 2 }, 2000)
  assert.equal(p.rows[0].cap, 25000)
  assert.equal(p.rows[0].ratio, 78.74)
  assert.throws(() => buildPledge([{ SECURITY_CODE: '600370', TRADE_DATE: '2026-11-06 00:00:00', PLEDGE_RATIO: 1 }], '2026-11-13', {}, 1))
  const g = buildGoodwill([
    { SECURITY_CODE: '002775', SECURITY_NAME_ABBR: '乙', REPORT_DATE: '2026-09-30 00:00:00', GOODWILL: 44, SUMSHEQUITY: 4, SUMSHEQUITY_RATIO: 11.5222, NOTICE_DATE: '2026-10-24' },
    { SECURITY_CODE: '000001', SECURITY_NAME_ABBR: '负', REPORT_DATE: '2026-09-30 00:00:00', GOODWILL: 4, SUMSHEQUITY: -1, SUMSHEQUITY_RATIO: -4 },
  ], '2026-09-30', { 100: 1 }, 10, 1)
  assert.deepEqual(g.rows.map((r) => [r.code, r.ratio]), [['002775', 1152.22]])
  assert.throws(() => buildGoodwill([{ SECURITY_CODE: '1', REPORT_DATE: '2026-06-30' }], '2026-09-30', {}, 1, 0))
  assert.equal(latestPeriod(D), '2026-09-30')
  assert.equal(latestPeriod('2026-10-31'), '2026-06-30')
  assert.equal(latestPeriod('2026-05-06'), '2026-03-31')
  assert.equal(latestPeriod('2026-02-01'), '2025-09-30')
})

test('回购：近 30 日公告、状态文字、进度相对计划金额上下限、新预案合计', () => {
  const row = (code, status, upd, over = {}) => ({ DIM_SCODE: code, SECURITYSHORTNAME: 'S' + code, REPURPROGRESS: status, UPD: `${upd} 00:00:00`, DIM_DATE: `${upd} 00:00:00`, REPURAMOUNTLOWER: 1e8, REPURAMOUNTLIMIT: 2e8, REPURAMOUNT: null, ...over })
  const b = buildBuyback([row('000001', '004', D, { REPURAMOUNT: 5e7, DIM_DATE: '2026-08-01 00:00:00' }), row('000002', '001', '2026-11-10'), row('000003', '007', D, { REPURAMOUNTLIMIT: 3e8 }), row('000004', '006', '2026-11-18'), row('000005', '004', '2026-10-01')], D)
  assert.deepEqual(b.rows.map((r) => r.code), ['000003', '000001', '000002'])
  assert.equal(b.rows[0].statusLabel, '未标注')
  assert.equal(b.rows[1].progressLow, 50)
  assert.equal(b.rows[1].progressHigh, 25)
  assert.equal(b.rows[2].progressLow, null)
  assert.deepEqual(b.counts, { 未标注: 1, 实施中: 1, 董事会预案: 1 })
  assert.equal(b.newPlans, 1)
  assert.equal(b.newPlanHigh, 2e8)
})

test('历史：同日覆盖、按日期排序', () => {
  const h = mergeHistory([{ date: '2026-11-16', a: 1 }, { date: '2026-11-17', a: 1 }], { date: '2026-11-17', a: 2 })
  assert.deepEqual(h, [{ date: '2026-11-16', a: 1 }, { date: '2026-11-17', a: 2 }])
})
