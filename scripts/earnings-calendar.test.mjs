// 单测：node --test scripts/earnings-calendar.test.mjs（固定样本，不触网）
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  yahooSymbol, periodFromEvent, usTime, hkTime, usDateFromRow, confirmedOf, surpriseHistory, historyAt, revenueAt, yahooFields,
  parseHkPeriod, hkPeriodLabel, parseHkexBoardMeetings, cnPeriodsForWindow, nextCnWindow, cnAppointDate, pickForecasts, forecastNotice,
  expressNotice, cnReportResult, cnConsensus, researchSummary, carryForward, fillFromPrevious, sortItems, eastmoneyAll, zoned, addDays,
} from './earnings-calendar.mjs'

const fixture = name => readFileSync(new URL(`./fixtures/earnings/${name}`, import.meta.url), 'utf8')

test('Yahoo symbols: class shares use a dash, HK codes become 4-digit .HK, A shares are not queried on Yahoo', () => {
  assert.equal(yahooSymbol('us', 'BRK.B'), 'BRK-B')
  assert.equal(yahooSymbol('adr', 'TSM'), 'TSM')
  assert.equal(yahooSymbol('hk', '00700'), '0700.HK')
  assert.equal(yahooSymbol('hk', '09988'), '9988.HK')
  assert.equal(yahooSymbol('cn', '600519'), null)
})

test('Yahoo calendar row → exchange-local date, BMO/AMC only when Yahoo says so, fiscal period from the event name', () => {
  assert.equal(periodFromEvent('Q3 2027 Earnings Announcement'), 'FY2027Q3')
  assert.equal(periodFromEvent(null), null)
  assert.equal(usTime('BMO'), 'bmo')
  assert.equal(usTime('AMC'), 'amc')
  assert.equal(usTime('TAS'), 'unknown', 'time-as-scheduled is not inferred')
  assert.equal(usTime(null), 'unknown')
  // 21:00Z = 16:00 ET on the same day; 02:00Z next day is still the previous ET day
  assert.deepEqual(usDateFromRow({ symbol: 'NVDA', event: 'Q3 2027 Earnings Announcement', start: '2026-11-17T21:00:00Z', timing: 'AMC' }), { date: '2026-11-17', time: 'amc', period: 'FY2027Q3' })
  assert.equal(usDateFromRow({ start: '2026-11-18T02:00:00Z', timing: 'AMC' }).date, '2026-11-17')
  assert.equal(usDateFromRow({ start: null }), null)
  assert.equal(confirmedOf({ isEarningsDateEstimate: false }), true)
  assert.equal(confirmedOf({ isEarningsDateEstimate: true }), false)
  assert.equal(confirmedOf({}), null)
})

test('HK time is only derived for confirmed dates (HKT): pre-open / lunch break / after close', () => {
  const sec = iso => Date.parse(iso) / 1000
  assert.equal(hkTime(sec('2026-11-18T08:10:00Z'), true), 'amc') // 16:10 HKT
  assert.equal(hkTime(sec('2026-11-18T00:30:00Z'), true), 'bmo') // 08:30 HKT
  assert.equal(hkTime(sec('2026-11-18T04:15:00Z'), true), 'midday') // 12:15 HKT
  assert.equal(hkTime(sec('2026-11-18T08:10:00Z'), false), 'unknown')
  assert.equal(zoned(sec('2026-11-18T17:00:00Z'), 'Asia/Hong_Kong').day, '2026-11-19')
})

const NVDA = JSON.parse(fixture('yf-nvda.json'))

test('surprise history: last 4 reported quarters before the report, newest first; ±3 day match for the report itself', () => {
  const h = surpriseHistory(NVDA.history, '2026-11-17')
  assert.deepEqual(h.map(r => r.date), ['2026-08-26', '2026-05-20', '2026-02-25', '2025-11-19'])
  assert.deepEqual(h[0], { date: '2026-08-26', epsActual: 2.22, epsEstimate: 2.09, surprisePct: 6.16 })
  assert.equal(historyAt(NVDA.history, '2026-08-27').epsActual, 2.22)
  assert.equal(historyAt(NVDA.history, '2026-09-10'), null)
})

test('quarterly revenue: latest quarter ending ≤120 days before the report, YoY vs the quarter ~1 year earlier', () => {
  const q = [{ periodEnd: '2026-10-26', value: 110e9 }, { periodEnd: '2026-07-27', value: 90e9 }, { periodEnd: '2025-10-26', value: 57e9 }]
  assert.deepEqual(revenueAt(q, '2026-11-18'), { periodEnd: '2026-10-26', revenue: 110e9, revenueYoY: 92.98 })
  assert.equal(revenueAt(q, '2027-06-30'), null, 'stale quarter is not used')
  assert.equal(revenueAt([{ periodEnd: '2026-10-26', value: 1 }], '2026-11-18').revenueYoY, null, 'no prior-year quarter → YoY missing')
})

test('yahooFields upcoming: 0q consensus only when Yahoo next date matches the entry; reported: actual + surprise + revenue', () => {
  const up = yahooFields(NVDA, { date: '2026-11-17', today: '2026-11-14', asOf: '2026-11-14' })
  assert.deepEqual(up.consensus, { eps: 2.4712, revenue: 108731903900, analysts: 43, revenueAnalysts: 45, currency: 'USD', asOf: '2026-11-14', source: 'yahoo' })
  assert.deepEqual(up.lastYear, { eps: 1.3, revenue: 57006000000 })
  assert.equal(up.result, undefined)
  const far = yahooFields(NVDA, { date: '2026-12-20', today: '2026-11-14', asOf: '2026-11-14' })
  assert.equal(far.consensus, undefined, 'a different report date does not borrow the current-quarter consensus')

  const done = yahooFields(NVDA, { date: '2026-08-26', today: '2026-09-01', asOf: '2026-09-01' })
  assert.equal(done.result.epsActual, 2.22)
  assert.equal(done.result.surprisePct, 6.16)
  assert.equal(done.result.revenueActual, 96221000000)
  assert.equal(done.result.revenueYoY, 105.85)
  assert.equal(done.consensus, undefined, 'past entries never show the (moved-on) current-quarter estimate')
  const none = yahooFields({}, { date: '2026-08-26', today: '2026-09-01', asOf: '2026-09-01' })
  assert.equal(none.result, undefined, 'nothing reported yet → no result object')
  assert.deepEqual(none.history, [])
})

test('HKEX board meeting notifications: parse the consolidated table; purpose + period → results label', () => {
  const rows = parseHkexBoardMeetings(fixture('hkex-bmn-sample.htm'))
  assert.ok(rows.length >= 8)
  assert.deepEqual(rows[0], { date: '2026-11-13', code: '00896', shortName: 'HANISON', purpose: 'INT RES/DIV', period: '6-MTH-ENDED30/09/26' })
  assert.ok(rows.some(r => r.code === '09888' && r.purpose === '3RD QUARTER RES'))
  assert.deepEqual(parseHkPeriod('6-MTH-ENDED30/09/26'), { months: 6, periodEnd: '2026-09-30' })
  assert.deepEqual(hkPeriodLabel('INT RES/DIV', '6-MTH-ENDED30/09/26'), { label: '中期业绩', periodEnd: '2026-09-30', months: 6 })
  assert.equal(hkPeriodLabel('3RD QUARTER RES', '3-MTH-ENDED30/09/26').label, '第三季度业绩')
  assert.equal(hkPeriodLabel('RESULTS', '9-MTH-ENDED30/09/26').label, '前三季度业绩')
  assert.equal(hkPeriodLabel('RESULTS', '3-MTH-ENDED30/09/26').label, '季度业绩')
  assert.equal(hkPeriodLabel('FIN RES/DIV', 'YR-ENDED31/12/26').label, '全年业绩')
  assert.equal(hkPeriodLabel('SPECIAL DIVIDEND', ''), null, 'dividend-only meetings are not results')
  assert.deepEqual(parseHkexBoardMeetings('<html>maintenance</html>'), [])
})

test('A-share disclosure windows: periods overlapping the page window, and the next window in the off-season', () => {
  assert.deepEqual(cnPeriodsForWindow('2026-10-31', '2026-12-26').map(p => p.period), ['FY2026Q3'])
  assert.deepEqual(cnPeriodsForWindow('2026-12-20', '2027-01-31').map(p => p.period), ['FY2026'])
  assert.deepEqual(cnPeriodsForWindow('2026-04-20', '2026-05-31').map(p => p.period), ['FY2025', 'FY2026Q1'])
  assert.deepEqual(nextCnWindow('2026-11-14'), { reportDate: '2026-12-31', period: 'FY2026', label: '2026 年年报', start: '2027-01-01', end: '2027-04-30' })
  assert.equal(nextCnWindow('2026-08-15').period, 'FY2026H1')
})

test('A-share appointment: actual date wins, otherwise the latest change, otherwise the first appointment', () => {
  assert.deepEqual(cnAppointDate({ FIRST_APPOINT_DATE: '2027-03-28 00:00:00', FIRST_CHANGE_DATE: '2027-04-18 00:00:00', ACTUAL_PUBLISH_DATE: null }), { date: '2027-04-18', actual: null, firstAppoint: '2027-03-28', changes: 1 })
  assert.equal(cnAppointDate({ FIRST_APPOINT_DATE: '2026-10-31 00:00:00', APPOINT_PUBLISH_DATE: '2026-10-31 00:00:00', ACTUAL_PUBLISH_DATE: '2026-10-30 00:00:00' }).date, '2026-10-30')
  assert.equal(cnAppointDate({ FIRST_APPOINT_DATE: '2026-10-25 00:00:00' }).date, '2026-10-25')
})

test('A-share forecasts: one row per company+period (net profit preferred), normalised notice; express and report rows', () => {
  const rows = [
    { SECURITY_CODE: '688845', REPORT_DATE: '2026-12-31 00:00:00', NOTICE_DATE: '2026-11-13 00:00:00', PREDICT_FINANCE_CODE: '006', PREDICT_FINANCE: '营业收入' },
    { SECURITY_CODE: '688845', REPORT_DATE: '2026-12-31 00:00:00', NOTICE_DATE: '2026-11-13 00:00:00', PREDICT_FINANCE_CODE: '004', PREDICT_FINANCE: '归属于上市公司股东的净利润', PREDICT_TYPE: '略增', PREDICT_AMT_LOWER: 1.3e8, PREDICT_AMT_UPPER: 1.5e8, ADD_AMP_LOWER: 13.75, ADD_AMP_UPPER: 31.25, PREYEAR_SAME_PERIOD: 1.14e8, PREDICT_CONTENT: '预计2026年1-12月归属于上市公司股东的净利润盈利:13,000万元至15,000万元' },
    { SECURITY_CODE: '600000', REPORT_DATE: '2026-12-31 00:00:00', NOTICE_DATE: '2026-11-01 00:00:00', PREDICT_FINANCE_CODE: '006', PREDICT_FINANCE: '营业收入' },
  ]
  const picked = pickForecasts(rows)
  assert.equal(picked.length, 2)
  const n = forecastNotice(picked.find(r => r.SECURITY_CODE === '688845'))
  assert.deepEqual({ ...n, content: undefined }, { kind: 'forecast', noticeDate: '2026-11-13', period: 'FY2026', reportDate: '2026-12-31', metric: '归属于上市公司股东的净利润', type: '略增', lower: 1.3e8, upper: 1.5e8, changeLower: 13.75, changeUpper: 31.25, lastYear: 1.14e8, content: undefined, source: 'cnForecast' })
  const e = expressNotice({ REPORT_DATE: '2026-09-30 00:00:00', NOTICE_DATE: '2026-11-06 00:00:00', BASIC_EPS: 4.16, TOTAL_OPERATE_INCOME: 34993317000, YSTZ: 26.809282, PARENT_NETPROFIT: 6055116000, JLRTBZCL: 431.8054 })
  assert.deepEqual(e, { kind: 'express', noticeDate: '2026-11-06', period: 'FY2026Q3', reportDate: '2026-09-30', eps: 4.16, revenue: 34993317000, revenueYoY: 26.81, netProfit: 6055116000, netProfitYoY: 431.81, source: 'cnExpress' })
  const r = cnReportResult({ BASIC_EPS: 51.53, TOTAL_OPERATE_INCOME: 133283652508.95, YSTZ: 1.8179, SJLTZ: -0.25, REPORTDATE: '2026-09-30 00:00:00' }, '2026-11-14')
  assert.equal(r.surprisePct, null, 'A 股季报没有一致预期 → 不算超预期')
  assert.equal(r.revenueYoY, 1.82)
  assert.equal(cnReportResult(undefined, '2026-11-14'), null)
})

test('A-share consensus only for the matching fiscal year marked E', () => {
  const row = { YEAR1: 2025, YEAR_MARK1: 'A', EPS1: 65.85, YEAR2: 2026, YEAR_MARK2: 'E', EPS2: 66.807209, RATING_ORG_NUM: 43 }
  assert.deepEqual(cnConsensus(row, 2026, '2026-12-20'), { eps: 66.8072, revenue: null, analysts: 43, revenueAnalysts: null, currency: 'CNY', asOf: '2026-12-20', source: 'cnConsensus', note: '机构年度 EPS 预测均值；analysts 为给出评级的机构数' })
  assert.equal(cnConsensus(row, 2025, '2026-12-20'), null, 'actual year is not a forecast')
  assert.equal(cnConsensus(null, 2026, '2026-12-20'), null)
})

test('research summary: rating, Lynch type, scenario band from scenarios or the Bear/Base/Bull metric, earnings-related checks first', () => {
  const c = {
    code: 'LLY', market: 'us', rating: '条件关注', asOf: '价格锚定 2026-09-21/22 美股收盘',
    metrics: [['价格锚点', '$1,164.89'], ['Bear / Base / Bull', '$912 / $1,410 / $1,972']],
    next: ['关注管线节点', 'Q3 业绩（约 10-29）：orforglipron 爬坡'], risk: ['IPR&D 属持续 BD 成本'], calendar: undefined,
  }
  const s = researchSummary(c, { t: '稳定增长型', r: '中' })
  assert.deepEqual(s.scenarios, { bear: 912, base: 1410, bull: 1972, price: 1164.89, priceDate: null, currency: null })
  assert.deepEqual(s.verify, ['Q3 业绩（约 10-29）：orforglipron 爬坡'], 'earnings-related checks only when there are any')
  const generic = researchSummary({ ...c, next: ['关注管线节点', '回落 300–315 分批买入', '下单前核对 PE 口径', '评分 = 质量 + 增长'] })
  assert.deepEqual(generic.verify, ['关注管线节点'], 'trading instructions and scoring notes are not verification items')
  assert.equal(s.lynch, '稳定增长型')
  assert.equal(s.rating, '条件关注')
  assert.equal(s.asOf, '2026-09-21')
  const refreshed = researchSummary({ ...c, marketRefresh: { price: 1200, priceDate: '2026-11-13', currency: 'USD' }, scenarios: [{ name: '悲观', price: '$900' }, { name: '基准', price: '$1,400' }, { name: '乐观', price: '$2,000' }] })
  assert.deepEqual(refreshed.scenarios, { bear: 900, base: 1400, bull: 2000, price: 1200, priceDate: '2026-11-13', currency: 'USD' })
  assert.equal(researchSummary({ ...c, marketRefresh: { price: 1200, priceDate: '2026-11-13', tradability: 'unverified' } }).scenarios.price, 1164.89, 'unverified quotes are not used')
  assert.equal(researchSummary({ ...c, metrics: [['Bear / Base / Bull', '市值 1 / 2 / 3 万亿']] }).scenarios, null, 'market-cap scenarios are not prices')
  assert.equal(researchSummary(null), null)
})

test('carry forward: a failed source keeps its previous in-window entries (original dates); others are not resurrected', () => {
  const window = { start: '2026-11-01', end: '2026-12-26' }
  const prev = [
    { market: 'hk', code: '00700', date: '2026-11-18', dateSource: 'hkex', asOf: '2026-11-12' },
    { market: 'hk', code: '00005', date: '2026-10-20', dateSource: 'hkex', asOf: '2026-10-10' },
    { market: 'us', code: 'NVDA', date: '2026-11-17', dateSource: 'yahoo', asOf: '2026-11-12' },
  ]
  const out = carryForward([], prev, new Set(['hkex']), window)
  assert.deepEqual(out.map(i => [i.code, i.asOf, i.carried]), [['00700', '2026-11-12', true]])
  assert.equal(carryForward([{ market: 'hk', code: '00700', date: '2026-11-19' }], prev, new Set(['hkex']), window).length, 1, 'fresh entry for the same company wins')
  const filled = fillFromPrevious({ date: '2026-11-17', consensus: null, history: [] }, { date: '2026-11-17', consensus: { eps: 1 }, history: [{ date: '2026-08-26' }] })
  assert.deepEqual(filled.consensus, { eps: 1 })
  assert.equal(fillFromPrevious({ date: '2026-11-18', consensus: null }, { date: '2026-11-17', consensus: { eps: 1 } }).consensus, null, 'different date → not reused')
})

test('items are sorted deterministically by date, market, code', () => {
  const s = sortItems([{ date: '2026-11-18', market: 'cn', code: '1' }, { date: '2026-11-18', market: 'us', code: 'B' }, { date: '2026-11-18', market: 'us', code: 'A' }, { date: '2026-11-17', market: 'hk', code: '9' }])
  assert.deepEqual(s.map(i => i.code), ['9', 'A', 'B', '1'])
  assert.equal(addDays('2026-11-14', 42), '2026-12-26')
})

test('eastmoney paging: stops at the last page, treats code 9201 as empty, throws on failure', async () => {
  const pages = [{ success: true, result: { pages: 2, data: [{ a: 1 }] } }, { success: true, result: { pages: 2, data: [{ a: 2 }] } }]
  const urls = []
  const rows = await eastmoneyAll({ reportName: 'X', filter: "(REPORT_DATE='2026-09-30')", fetchText: async url => { urls.push(url); return JSON.stringify(pages[urls.length - 1]) } })
  assert.deepEqual(rows, [{ a: 1 }, { a: 2 }])
  assert.match(urls[0], /reportName=X/)
  assert.match(urls[0], /pageNumber=1/)
  assert.deepEqual(await eastmoneyAll({ reportName: 'X', fetchText: async () => JSON.stringify({ success: false, code: 9201, message: '返回数据为空' }) }), [])
  await assert.rejects(eastmoneyAll({ reportName: 'X', fetchText: async () => JSON.stringify({ success: false, code: 500, message: 'bad' }) }), /bad/)
})
