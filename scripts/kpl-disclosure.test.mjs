// node --test scripts/kpl-disclosure.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  boardOf, buildBlock, buildCalendar, buildHolders, buildRiskTrading, buildSurvey, capLimit, checkComplete, compactDay, compareConsensus, contiguous,
  financeFlags, lastTradingDays, nextTradingDays, num, parseBlock, parseConsensus, parseFinance, parseForecasts, parseKline, parseSnapshot, parseSurveys,
  perfAfter, revLimit, sameContent, stDiff, streaks, faceTest, paginate, publishDecision, boundHolders, exDividendDates, parseAdjKline, secidOf,
} from './kpl-disclosure-lib.mjs'

test('num：缺失不是 0', () => {
  assert.equal(num(null), null); assert.equal(num(''), null); assert.equal(num('-'), null); assert.equal(num('abc'), null)
  assert.equal(num('0'), 0); assert.equal(num(-1.5), -1.5)
})

test('板块与阈值', () => {
  assert.equal(boardOf('600000'), 'main'); assert.equal(boardOf('002717'), 'main'); assert.equal(boardOf('300001'), 'gem')
  assert.equal(boardOf('688121'), 'star'); assert.equal(boardOf('920992'), 'bj'); assert.equal(boardOf('830001'), 'bj')
  assert.equal(capLimit('main'), 5e8); assert.equal(capLimit('gem'), 3e8); assert.equal(capLimit('bj'), null)
  assert.equal(revLimit('main'), 3e8); assert.equal(revLimit('star'), 1e8); assert.equal(revLimit('bj'), null)
})

test('交易日工具：跳过周末与国庆', () => {
  assert.deepEqual(lastTradingDays('2026-11-17', 3), ['2026-11-13', '2026-11-16', '2026-11-17'])
  assert.deepEqual(lastTradingDays('2026-11-15', 1), ['2026-11-13'])
  assert.deepEqual(nextTradingDays('2026-09-30', 2), ['2026-10-08', '2026-10-09'])
})

test('checkComplete：行数不等即报错', () => {
  assert.throws(() => checkComplete([1], 2, 'x'))
  assert.deepEqual(checkComplete([1, 2], 2, 'x'), [1, 2])
})

const snapRow = (code, name, close, cap, date = '2026-11-17') => ({ SECURITY_CODE: code, SECURITY_NAME_ABBR: name, CLOSE_PRICE: close, TOTAL_MARKET_CAP: cap, TOTAL_SHARES: 1e8, TRADE_DATE: `${date} 00:00:00` })

test('估值快照：日期不符或行数不足时拒绝', () => {
  assert.throws(() => parseSnapshot([snapRow('600000', 'A', 1, 1)], '2026-11-17'), /行数不足/)
  assert.throws(() => parseSnapshot([snapRow('600000', 'A', 1, 1, '2026-11-16')], '2026-11-17', 1), /日期不符/)
  const s = parseSnapshot([snapRow('600000', '浦发', '10', '1e11'), snapRow('000001', '*ST甲', '0.5', 3e8)], '2026-11-17', 2)
  assert.equal(s.length, 2)
  const c = compactDay('2026-11-17', s)
  assert.deepEqual(c.st, ['000001'])
  assert.equal(c.low.length, 1)
})

const dayOf = (date, low, st = []) => ({ date, count: 5000, st, low })

test('ST 增减：与上一交易日比较；上一日缺失时为 null', () => {
  const prev = dayOf('2026-11-16', [['000001', '*ST甲', 0.5, 3e8], ['600001', 'ST乙', 3, 2e9]], ['000001', '600001'])
  const today = dayOf('2026-11-17', [['000001', '*ST甲', 0.5, 3e8], ['000002', 'ST丙', 2, 9e8]], ['000001', '000002'])
  const d = stDiff(today, prev)
  assert.equal(d.count, 2); assert.equal(d.star, 1)
  assert.deepEqual(d.added.map((x) => x.code), ['000002'])
  assert.deepEqual(d.removed, [{ code: '600001', name: null, prevName: 'ST乙' }])
  assert.equal(stDiff(today, null).added, null)
})

test('面值 / 市值连续天数：中断就停，数到存档起点标 capped；北交所不纳入', () => {
  const days = [
    dayOf('2026-11-12', [['000001', 'A', 0.8, 1e8], ['000002', 'B', 0.9, 6e8]]),
    dayOf('2026-11-13', [['000001', 'A', 0.8, 1e8], ['000002', 'B', 1.1, 6e8]]),
    dayOf('2026-11-16', [['000001', 'A', 0.8, 1e8], ['000002', 'B', 0.95, 6e8], ['920001', 'C', 0.5, 1e8]]),
    dayOf('2026-11-17', [['000001', 'A', 0.8, 1e8], ['000002', 'B', 0.95, 6e8], ['920001', 'C', 0.5, 1e8], ['300001', 'D', 3, 2.9e8]]),
  ]
  const s = streaks(days, faceTest)
  assert.deepEqual(s.find((x) => x.code === '000001'), { code: '000001', name: 'A', close: 0.8, cap: 1e8, days: 4, capped: true })
  assert.equal(s.find((x) => x.code === '000002').days, 2)
  const r = buildRiskTrading(days)
  assert.equal(r.face.some((x) => x.code === '920001'), false)
  assert.deepEqual(r.cap.map((x) => [x.code, x.days, x.limit]), [['000001', 4, 5e8], ['300001', 1, 3e8]]) // 000002 主板 6 亿不低于 5 亿
})

test('存档必须是连续交易日：遇到缺口截断', () => {
  const run = contiguous([dayOf('2026-11-10', []), dayOf('2026-11-13', []), dayOf('2026-11-16', []), dayOf('2026-11-17', [])])
  assert.deepEqual(run.map((d) => d.date), ['2026-11-13', '2026-11-16', '2026-11-17'])
})

test('财务类：亏损且营收低于板块阈值、净资产为负；只取 A 股、北交所不纳入', () => {
  const row = (code, profit, deps, rev, bps, extra = {}) => ({ SECURITY_CODE: code, SECURITY_NAME_ABBR: code, SECURITY_TYPE_CODE: '058001001', TRADE_MARKET_CODE: '069001001001', REPORTDATE: '2025-12-31 00:00:00', NOTICE_DATE: '2026-04-20 00:00:00', PARENT_NETPROFIT: profit, DEDUCT_BASIC_EPS: deps, TOTAL_OPERATE_INCOME: rev, BPS: bps, ...extra })
  const list = parseFinance([
    row('600001', -1e7, -0.1, 2e8, 1), row('600002', 1e7, -0.05, 2.5e8, 2), row('600003', -1e7, -0.1, 4e8, -0.2),
    row('688001', -1e7, -0.1, 2e8, 1), row('300001', -1e7, null, 5e7, null), row('920001', -1e7, -1, 1e6, -1),
    row('872893', -1, -1, 1, 1, { TRADE_MARKET_CODE: '069001004001' }), row('600009', -1, -1, 1, 1, { REPORTDATE: '2024-12-31 00:00:00' }),
  ], '2025-12-31')
  assert.equal(list.length, 6)
  const f = financeFlags(list, new Set(['600001']))
  assert.deepEqual(f.lossLowRev.map((x) => x.code), ['300001', '600001', '600002']) // 688001 营收 2 亿 ≥ 科创板 1 亿
  assert.equal(f.lossLowRev.find((x) => x.code === '600001').st, true)
  assert.deepEqual(f.negEquity.map((x) => x.code), ['600003'])
})

test('业绩预告：同一预告多指标行合并，取归母净利润，区间中值', () => {
  const base = { SECURITY_CODE: '300001', SECURITY_NAME_ABBR: '甲', SECURITY_TYPE_CODE: '058001001', TRADE_MARKET_CODE: '069001002002', NOTICE_DATE: '2026-11-18 00:00:00', REPORT_DATE: '2026-12-31 00:00:00', PREDICT_TYPE: '预增' }
  const f = parseForecasts([
    { ...base, PREDICT_FINANCE_CODE: '006', PREDICT_FINANCE: '营业收入', PREDICT_AMT_LOWER: 1e9, PREDICT_AMT_UPPER: 2e9, ADD_AMP_LOWER: 10, ADD_AMP_UPPER: 20 },
    { ...base, PREDICT_FINANCE_CODE: '004', PREDICT_FINANCE: '归属于上市公司股东的净利润', PREDICT_AMT_LOWER: 1e8, PREDICT_AMT_UPPER: 3e8, ADD_AMP_LOWER: 100, ADD_AMP_UPPER: 200 },
    { ...base, SECURITY_CODE: '200025', SECURITY_TYPE_CODE: '058001002', PREDICT_FINANCE_CODE: '004' },
  ])
  assert.equal(f.length, 1)
  assert.equal(f[0].profit, 2e8); assert.equal(f[0].yoy, 150); assert.equal(f[0].type, '预增'); assert.equal(f[0].isProfit, true)
})

test('与一致预期比较：只比年度归母净利润，少于 3 家不比', () => {
  const cons = parseConsensus([{ SECURITY_CODE: '600001', YEAR1: 2025, YEAR_MARK1: 'A', EPS1: 1, YEAR2: 2026, YEAR_MARK2: 'E', EPS2: 2, RATING_ORG_NUM: 5 }]).get('600001')
  assert.deepEqual(cons.eps, { 2026: 2 })
  const it = { period: '2026-12-31', isProfit: true, eps: 2.5, profit: null }
  assert.deepEqual(compareConsensus(it, cons, null), { eps: 2, actual: 2.5, orgs: 5, diff: 25, label: 'beat' })
  assert.equal(compareConsensus({ ...it, eps: null, profit: 1.9e8 }, cons, 1e8).label, 'inline')
  assert.equal(compareConsensus({ ...it, period: '2026-09-30' }, cons, null), null)
  assert.equal(compareConsensus(it, { ...cons, orgs: 2 }, null), null)
})

test('公告后表现：周末公告顺延；尚未走到的日子为 null', () => {
  const k = parseKline({ data: { klines: ['2026-11-12,10', '2026-11-13,10', '2026-11-16,11', '2026-11-17,12.1', '2026-11-18,9'] } })
  // 11-14（周六）公告 → 第 1 个反应日 11-16，基准 11-13
  assert.deepEqual(perfAfter('2026-11-14', k, '2026-11-17'), { start: '2026-11-16', base: '2026-11-13', d1: 10, d3: null, d5: null })
  assert.deepEqual(perfAfter('2026-11-13', k, '2026-11-17'), { start: '2026-11-13', base: '2026-11-12', d1: 0, d3: 21, d5: null })
  assert.equal(perfAfter('2026-11-18', k, '2026-11-17').d1, null)
  assert.equal(perfAfter('2026-11-16', [], '2026-11-17').d1, null)
})

test('预约披露日历：只列未来交易日内、未披露的 A 股', () => {
  const r = (code, d, pub = '0') => ({ SECURITY_CODE: code, SECURITY_NAME_ABBR: code, SECURITY_TYPE_CODE: '058001001', TRADE_MARKET_CODE: '069001001001', APPOINT_PUBLISH_DATE: `${d} 00:00:00`, IS_PUBLISH: pub, REPORT_DATE: '2026-09-30 00:00:00', REPORT_TYPE_NAME: '2026年 三季报' })
  const c = buildCalendar([r('600001', '2026-11-18'), r('600002', '2026-11-18', '1'), r('600003', '2026-12-31')], '2026-11-17', 3)
  assert.equal(c.from, '2026-11-18'); assert.equal(c.to, '2026-11-20'); assert.equal(c.total, 1)
  assert.equal(c.days[0].stocks[0].code, '600001')
})

test('股东户数：沿 PRE_END_DATE 追连降期数，累计降幅；上市前户数不进增减幅榜', () => {
  const latest = [
    { SECURITY_CODE: '600001', SECURITY_NAME_ABBR: '甲', SECURITY_TYPE_CODE: '058001001', END_DATE: '2026-09-30', PRE_END_DATE: '2026-06-30', HOLDER_NUM: 8000, PRE_HOLDER_NUM: 9000, HOLDER_NUM_RATIO: -11.1, HOLD_NOTICE_DATE: '2026-10-28' },
    { SECURITY_CODE: '600002', SECURITY_NAME_ABBR: '乙', SECURITY_TYPE_CODE: '058001001', END_DATE: '2026-09-30', PRE_END_DATE: '2026-06-30', HOLDER_NUM: 50000, PRE_HOLDER_NUM: 100, HOLDER_NUM_RATIO: 49900, HOLD_NOTICE_DATE: '2026-11-10' },
    { SECURITY_CODE: '600003', SECURITY_NAME_ABBR: '丙', SECURITY_TYPE_CODE: '058001001', END_DATE: '2026-09-30', PRE_END_DATE: '2026-06-30', HOLDER_NUM: 12000, PRE_HOLDER_NUM: 10000, HOLDER_NUM_RATIO: 20, HOLD_NOTICE_DATE: '2026-10-20' },
  ]
  const dec = [
    { SECURITY_CODE: '600001', END_DATE: '2026-06-30', PRE_END_DATE: '2026-03-31', PRE_HOLDER_NUM: 9500, HOLDER_NUM_RATIO: -5 },
    { SECURITY_CODE: '600001', END_DATE: '2026-03-31', PRE_END_DATE: '2025-12-31', PRE_HOLDER_NUM: 10000, HOLDER_NUM_RATIO: -5 },
  ]
  const h = buildHolders(latest, dec, '2026-11-17', { since: '2026-01-01' })
  const a = h.falling.find((x) => x.code === '600001')
  assert.equal(a.streak, 3); assert.equal(a.capped, true); assert.equal(a.cum, -20)
  assert.deepEqual(h.rise.map((x) => x.code), ['600003'])
  assert.deepEqual(h.recent.map((x) => x.code), ['600002'])
  assert.equal(buildHolders(latest, dec, '2026-11-17', { since: '2025-01-01' }).falling[0].capped, false)
})

test('大宗交易：只取 A 股，当日明细、机构专用买入与近 20 日加权溢价率', () => {
  const r = (code, date, amt, prem, buyer, type = 'EQA') => ({ SECURITY_CODE: code, SECURITY_NAME_ABBR: code, SECURITY_TYPE: type, TRADE_DATE: `${date} 00:00:00`, DEAL_AMT: amt, PREMIUM_RATIO: prem, BUYER_NAME: buyer, SELLER_NAME: 'x' })
  const t = parseBlock([r('600001', '2026-11-17', 3e8, -10, '机构专用'), r('600001', '2026-11-16', 1e8, 10, 'y'), r('127045', '2026-11-17', 1e9, 0, 'z', 'BD0')])
  assert.equal(t.length, 2)
  const b = buildBlock(t, '2026-11-17', ['2026-11-16', '2026-11-17'])
  assert.equal(b.count, 1); assert.equal(b.instBuy.amount, 3e8); assert.equal(b.discountCount, 1)
  assert.equal(b.window.top[0].premium, -5); assert.equal(b.window.inst[0].instBuyCount, 1)
})

test('机构调研：按次去重，按接待机构数排序', () => {
  const r = (code, notice, start, sum) => ({ SECURITY_CODE: code, SECURITY_NAME_ABBR: code, NOTICE_DATE: `${notice} 00:00:00`, RECEIVE_START_DATE: `${start} 00:00:00`, SUM: sum })
  const ev = parseSurveys([r('600001', '2026-11-17', '2026-11-10', 50), r('600001', '2026-11-17', '2026-11-10', 50), r('600001', '2026-11-12', '2026-11-05', 30), r('600002', '2026-11-16', '2026-11-09', 100), r('600003', '2026-10-01', '2026-09-20', 500)])
  assert.equal(ev.length, 4)
  const s = buildSurvey(ev, '2026-11-17')
  assert.deepEqual(s.short.rank.map((x) => [x.code, x.events, x.orgs]), [['600002', 1, 100], ['600001', 2, 80]])
  assert.equal(s.long.rank.some((x) => x.code === '600003'), false)
  assert.equal(s.latest.length, 1)
})

test('sameContent 忽略 generatedAt', () => {
  assert.equal(sameContent({ generatedAt: 'a', x: 1 }, { generatedAt: 'b', x: 1 }), true)
  assert.equal(sameContent({ x: 1 }, { x: 2 }), false)
  assert.equal(sameContent({ x: 1 }, null), false)
})

/* ---------------- 代码审查回归 ---------------- */
const page = (data, count, pages) => ({ success: true, code: 0, result: { data, count, pages } })
const EMPTY = { success: false, code: 9201, message: '返回数据为空', result: null }

test('paginate：后续页「返回数据为空」不能截断成空表或半张表', async () => {
  // 第 1 页为空 = 真的没有数据
  assert.deepEqual(await paginate(async () => EMPTY, 'x'), [])
  // 第 2 页为空：抛错，不返回 []，也不返回第 1 页
  await assert.rejects(paginate(async (p) => (p === 1 ? page([1, 2], 4, 2) : EMPTY), 'x'), /第 2 页返回为空/)
  // 页数到了但行数少于总数：抛错
  await assert.rejects(paginate(async () => page([1, 2], 3, 1), 'x'), /行数不完整/)
  assert.deepEqual(await paginate(async (p) => page(p === 1 ? [1, 2] : [3], 3, 2), 'x'), [1, 2, 3])
  await assert.rejects(paginate(async () => ({ success: false, message: '系统繁忙' }), 'x'), /返回异常/)
})

test('公告后表现：按确切交易日取价，缺一天为 null 而不是顺延', () => {
  // 11-16 缺收盘（停牌或存档缺失）：基准 11-13，d1 应为 null；d3 = 11-18 也缺 → null
  const k = parseKline({ data: { klines: ['2026-11-13,10', '2026-11-17,12', '2026-11-19,13', '2026-11-20,14'] } })
  const p = perfAfter('2026-11-16', k, '2026-11-20')
  assert.equal(p.base, '2026-11-13')
  assert.equal(p.d1, null) // 旧实现会拿 11-17 当第 1 日
  assert.equal(p.d3, null) // 第 3 日 = 11-18，缺
  // 基准缺失：全部 null
  assert.deepEqual(perfAfter('2026-11-17', k, '2026-11-20'), { start: '2026-11-17', base: '2026-11-16', d1: null, d3: null, d5: null })
})

test('除权除息：识别窗口内除权日；前复权 K 线必须是请求的股票', () => {
  const ex = exDividendDates([
    { SECURITY_CODE: '688150', EX_DIVIDEND_DATE: '2026-11-17 00:00:00' },
    { SECURITY_CODE: '600000', EX_DIVIDEND_DATE: '2026-09-01 00:00:00' },
    { SECURITY_CODE: '000001', EX_DIVIDEND_DATE: '2026-11-18 00:00:00' },
  ], '2026-10-01', '2026-11-17')
  assert.deepEqual([...ex.keys()], ['688150'])
  assert.equal(secidOf('688150'), '1.688150'); assert.equal(secidOf('300001'), '0.300001'); assert.equal(secidOf('920000'), '0.920000')
  // 10 送 10：未复权 20 → 10 会算成 −50%；前复权序列则连续
  const adj = parseAdjKline({ data: { code: '600001', klines: ['2026-11-13,10', '2026-11-16,10.2'] } }, '600001')
  assert.equal(perfAfter('2026-11-16', adj, '2026-11-16').d1, 2)
  assert.throws(() => parseAdjKline({ data: null }, '600001'), /前复权/)
  assert.throws(() => parseAdjKline({ data: { code: '600002', klines: [] } }, '600001'), /前复权/)
})

test('预约披露日历：asOf 之后才实际披露的仍算当时未披露', () => {
  const r = (code, d, pub, actual) => ({ SECURITY_CODE: code, SECURITY_NAME_ABBR: code, SECURITY_TYPE_CODE: '058001001', TRADE_MARKET_CODE: '069001001001', APPOINT_PUBLISH_DATE: `${d} 00:00:00`, IS_PUBLISH: pub, ACTUAL_PUBLISH_DATE: actual, REPORT_DATE: '2026-09-30 00:00:00', REPORT_TYPE_NAME: '2026年 三季报' })
  const c = buildCalendar([r('600001', '2026-11-18', '1', '2026-11-18 00:00:00'), r('600002', '2026-11-18', '1', '2026-11-17 00:00:00')], '2026-11-17', 3)
  assert.deepEqual(c.days[0].stocks.map((x) => x.code), ['600001'])
})

test('股东户数：公告日晚于 asOf 的最新一期换成之前一期，没有就不列入', () => {
  const latest = [
    { SECURITY_CODE: '600001', END_DATE: '2026-11-10', HOLD_NOTICE_DATE: '2026-11-18', HOLDER_NUM: 1 },
    { SECURITY_CODE: '600002', END_DATE: '2026-10-31', HOLD_NOTICE_DATE: '2026-11-05', HOLDER_NUM: 2 },
    { SECURITY_CODE: '600003', END_DATE: '2026-11-10', HOLD_NOTICE_DATE: '2026-11-18', HOLDER_NUM: 3 },
  ]
  const older = [
    { SECURITY_CODE: '600001', END_DATE: '2026-09-30', HOLD_NOTICE_DATE: '2026-10-20', HOLDER_NUM: 10 },
    { SECURITY_CODE: '600001', END_DATE: '2026-10-31', HOLD_NOTICE_DATE: '2026-11-08', HOLDER_NUM: 11 },
    { SECURITY_CODE: '600001', END_DATE: '2026-11-10', HOLD_NOTICE_DATE: '2026-11-18', HOLDER_NUM: 12 },
  ]
  assert.deepEqual(boundHolders(latest, older, '2026-11-17').map((r) => [r.SECURITY_CODE, r.HOLDER_NUM]), [['600001', 11], ['600002', 2]])
})

test('机构调研：部分调研缺机构家数时记缺失次数，全部缺失为 null', () => {
  const ev = [
    { code: '600001', name: 'a', notice: '2026-11-17', start: null, orgs: 5, ways: '' },
    { code: '600001', name: 'a', notice: '2026-11-16', start: null, orgs: null, ways: '' },
    { code: '600002', name: 'b', notice: '2026-11-17', start: null, orgs: null, ways: '' },
  ]
  const rank = buildSurvey(ev, '2026-11-17').short.rank
  assert.deepEqual(rank.map((x) => [x.code, x.orgs, x.orgsMissing]), [['600001', 5, 1], ['600002', null, 1]])
})

test('发布判断：换日期时某节失败而上一份有该节，放弃发布', () => {
  const prev = { asOf: '2026-11-16', risk: { x: 1 }, survey: null }
  assert.equal(publishDecision([], prev, '2026-11-17').ok, true)
  assert.equal(publishDecision(['risk'], prev, '2026-11-17').ok, false)
  assert.equal(publishDecision(['survey'], prev, '2026-11-17').ok, true) // 上一份本来就缺
  assert.equal(publishDecision(['risk'], null, '2026-11-17').ok, true)
  assert.equal(publishDecision(['risk'], { ...prev, asOf: '2026-11-17', risk: null }, '2026-11-17').ok, true)
})
