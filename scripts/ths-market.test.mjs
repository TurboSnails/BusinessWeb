// 虚构响应验证解析、日期门禁与汇总口径，不把测试数据当公开快照。
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseCsiPerf, parseCsiValuation, parseBoardPe, percentile, zoneOf, weekly, valuationRow, liftWeeks, holderMonths,
  financingMonths, parseFundIssue, fundMonths, parseTreasury, parseShibor, stylePair, monthList, validDate, num, INDICES,
} from './ths-market-lib.mjs'

const T = '2026-11-17'
const perf = (rows) => ({ code: '200', data: rows.map(([d, close, peg, vol = 1]) => ({ tradeDate: d.replaceAll('-', ''), close, peg, tradingVol: vol })) })

test('基础工具：日期、数字、月份列表', () => {
  assert.equal(validDate('2026-02-30'), false)
  assert.equal(validDate(T), true)
  assert.equal(num('-'), null); assert.equal(num(''), null); assert.equal(num(null), null); assert.equal(num('1.5'), 1.5)
  assert.deepEqual(monthList(T, 3), ['2026-09', '2026-10', '2026-11'])
  assert.deepEqual(monthList('2026-01-05', 2), ['2025-12', '2026-01'])
  assert.equal(INDICES.length, 9)
})

test('中证行情：过滤周末与节假日复制行，目标日不符即抛错', () => {
  const rows = parseCsiPerf(perf([['2026-11-13', 10, 12, 5], ['2026-11-14', 10, 12, 5], ['2026-11-16', 10, 12, 5], ['2026-11-17', 11, -3, 6]]), T)
  assert.deepEqual(rows.map(r => r.date), ['2026-11-13', '2026-11-17']) // 周六与重复行都去掉
  assert.equal(rows[1].pe, null) // 负 PE 视为缺失
  assert.throws(() => parseCsiPerf(perf([['2026-11-16', 10, 12]]), T), /未更新/)
  assert.throws(() => parseCsiPerf({ code: '500', data: [] }, T))
})

test('中证估值快照：tradeDate 必须是目标日', () => {
  const body = { code: '200', data: { tradeDate: '20261117', indexValuations: [{ tradeDate: '20261117', indexName: '沪深300', peg: 13.05, pb: '1.28', dp: null }] } }
  assert.deepEqual(parseCsiValuation(body, T)['沪深300'], { peTtm: 13.05, pb: 1.28, dp: null })
  assert.throws(() => parseCsiValuation({ ...body, data: { ...body.data, tradeDate: '20261116' } }, T), /日期/)
})

test('板块 PE：去重排序，最新日须为目标日', () => {
  const rows = [{ TRADE_DATE: `${T} 00:00:00`, PE_TTM_AVG: 30 }, { TRADE_DATE: '2026-11-16 00:00:00', PE_TTM_AVG: null }, { TRADE_DATE: `${T} 00:00:00`, PE_TTM_AVG: 31 }]
  assert.deepEqual(parseBoardPe(rows, T), [{ date: '2026-11-16', pe: null }, { date: T, pe: 30 }])
  assert.throws(() => parseBoardPe(rows.slice(1, 2), T))
})

test('分位：覆盖不足返回 null；分区阈值 80/20', () => {
  const series = []
  for (let i = 0; i < 600; i++) series.push({ date: new Date(Date.parse('2024-01-01T00:00:00Z') + i * 864e5 * 1.5).toISOString().slice(0, 10), value: i % 100 })
  series.push({ date: '2026-06-30', value: 90 })
  const p1 = percentile(series, 1)
  assert.ok(p1 > 80 && p1 <= 100)
  assert.equal(percentile(series, 5), null)
  assert.equal(percentile([...series.slice(0, -1), { date: '2026-06-30', value: null }], 1), null)
  assert.equal(zoneOf(80), '危险'); assert.equal(zoneOf(20), '机会'); assert.equal(zoneOf(50), '合理'); assert.equal(zoneOf(null), null)
})

test('周采样与估值行：每周一点，10 年分位缺失时改用 5 年', () => {
  const w = weekly([{ date: '2026-11-09' }, { date: '2026-11-13' }, { date: '2026-11-16' }, { date: '2026-11-17' }])
  assert.deepEqual(w.map(p => p.date), ['2026-11-13', '2026-11-17'])
  const series = Array.from({ length: 1400 }, (_, i) => ({ date: new Date(Date.parse('2021-01-01T00:00:00Z') + i * 864e5 * 1.4).toISOString().slice(0, 10), pe: 10 + (i % 50) }))
  const row = valuationRow({ code: 'X', name: 'X', source: 'csi' }, series, { pb: 1.2, dp: null })
  assert.equal(row.peP10, null); assert.equal(row.zoneBasis, 5); assert.ok(row.zone); assert.equal(row.pb, 1.2)
})

test('解禁按周汇总：只取目标日后 30 天，首尾周裁剪', () => {
  const r = liftWeeks([
    { SECURITY_CODE: 'A', FREE_DATE: '2026-11-17 00:00:00', LIFT_MARKET_CAP: 1e4 },
    { SECURITY_CODE: 'A', FREE_DATE: '2026-11-18 00:00:00', LIFT_MARKET_CAP: 2e4 },
    { SECURITY_CODE: 'B', FREE_DATE: '2026-11-19 00:00:00', LIFT_MARKET_CAP: null },
    { SECURITY_CODE: 'C', FREE_DATE: '2026-11-24 00:00:00', LIFT_MARKET_CAP: 1e4 },
    { SECURITY_CODE: 'D', FREE_DATE: '2026-12-18 00:00:00', LIFT_MARKET_CAP: 1e4 },
  ], T)
  assert.deepEqual(r.weeks[0], { start: '2026-11-18', end: '2026-11-22', amount: 2, stocks: 2, unpriced: 1 })
  assert.equal(r.weeks.length, 2); assert.equal(r.total, 3); assert.equal(r.to, '2026-12-17')
})

test('增减持：均价优先，缺失用收盘价估算并计数，无价不计金额', () => {
  const m = holderMonths([
    { NOTICE_DATE: '2026-11-03', DIRECTION: '增持', CHANGE_NUM: 100, TRADE_AVERAGE_PRICE: 10, CLOSE_PRICE: 9 },
    { NOTICE_DATE: '2026-11-04', DIRECTION: '减持', CHANGE_NUM: 300, TRADE_AVERAGE_PRICE: null, CLOSE_PRICE: 20 },
    { NOTICE_DATE: '2026-11-05', DIRECTION: '减持', CHANGE_NUM: 300, TRADE_AVERAGE_PRICE: null, CLOSE_PRICE: null },
    { NOTICE_DATE: '2026-11-18', DIRECTION: '减持', CHANGE_NUM: 300, TRADE_AVERAGE_PRICE: 1 },
  ], T).at(-1)
  assert.deepEqual(m, { month: '2026-11', increase: 0.1, decrease: 0.6, net: -0.5, records: 3, estimated: 1, unpriced: 1 })
})

test('融资：IPO 募资缺失时用发行价×股数，增发元转亿元，未来日期剔除', () => {
  const m = financingMonths({
    ipo: [{ LISTING_DATE: '2026-11-10', TOTAL_RAISE_FUNDS: null, ISSUE_PRICE: 10, ISSUE_NUM: 1000 }, { LISTING_DATE: '2026-11-11', TOTAL_RAISE_FUNDS: 2 }],
    seo: [{ ISSUE_LISTING_DATE: '2026-11-12', TOTAL_RAISE_FUNDS: 5e8 }, { ISSUE_LISTING_DATE: '2026-11-20', TOTAL_RAISE_FUNDS: 5e8 }],
    cb: [{ VALUE_DATE: '2026-11-16', ACTUAL_ISSUE_SCALE: '7.5' }],
  }, T).at(-1)
  assert.deepEqual(m, { month: '2026-11', ipo: 3, ipoCount: 2, seo: 5, seoCount: 1, cb: 7.5, cbCount: 1 })
})

test('新发基金：稀疏数组可解析，A/C 份额不重复计', () => {
  const text = 'var newfunddata={datas:[["1","甲混合A","某基金","8","混合型-偏股","2.00","2026-11-03","","",,"x"],["2","甲混合C","某基金","8","混合型-偏股","2.00","2026-11-03"],["3","乙债券","某基金","8","债券型","1.00","2026-11-04"],["4","丙","某基金","8","债券型","","2026-11-04"],["5","丁","某基金","8","债券型","3","—"]],record:5,pages:1,curpage:1}'
  const rows = parseFundIssue(text)
  assert.equal(rows.length, 5); assert.equal(rows[4].setup, null)
  assert.deepEqual(fundMonths(rows, T).at(-1), { month: '2026-11', shares: 3, funds: 2, equityShares: 2 })
  assert.throws(() => parseFundIssue('<html>'))
})

test('利率：10 年国债与 Shibor 按日期整理，剔除未来与空值', () => {
  const t = parseTreasury([{ SOLAR_DATE: '2026-11-16 00:00:00', EMM00166466: 1.6, EMM00588704: 1.2 }, { SOLAR_DATE: '2026-11-15', EMM00166466: null }, { SOLAR_DATE: '2026-11-18', EMM00166466: 1.7 }], T)
  assert.deepEqual(t, [{ date: '2026-11-16', y10: 1.6, y2: 1.2 }])
  const s = parseShibor([{ REPORT_DATE: T, INDICATOR_ID: '001', IR_RATE: 1.3 }, { REPORT_DATE: T, INDICATOR_ID: '101', IR_RATE: '1.4' }], T)
  assert.deepEqual(s, [{ date: T, on: 1.3, w1: 1.4 }])
})

test('风格比值：同日对齐，20/60 日相对强弱', () => {
  const dates = Array.from({ length: 80 }, (_, i) => new Date(Date.parse('2026-06-01T00:00:00Z') + i * 864e5).toISOString().slice(0, 10))
  const a = dates.map((date, i) => ({ date, close: 100 + i }))
  const b = dates.map(date => ({ date, close: 100 }))
  const r = stylePair({ id: 's', label: 's', num: { name: 'A' }, den: { name: 'B' } }, a, b)
  assert.equal(r.rel20, Math.round(((179 / 159) - 1) * 1e4) / 100)
  assert.equal(r.series[0][1], 100)
  assert.equal(stylePair({ id: 's', label: 's', num: { name: 'A' }, den: { name: 'B' } }, a.slice(0, 30), b), null)
})
