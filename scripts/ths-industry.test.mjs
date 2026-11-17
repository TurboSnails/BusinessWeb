// 虚构响应验证解析、日期门禁与汇总口径，不把测试数据当公开快照。
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  weekEnds, tradingDaysBack, quarterEnds, periodLabel, lastYear, parseCsiIndustry, historyEntry, valuationPct,
  parseCsiStocks, parseCpd, industryFinance, industryReturns, rankPct, scoreRows, parseDet, parseCsiWeights, parseCniSample,
  driftWeights, cniPrevWeights, contributions, summarize, crossCheck, parseKline, closePair,
} from './ths-industry-lib.mjs'

const T = '2026-11-17'

test('交易日与报告期工具', () => {
  assert.deepEqual(weekEnds('2026-11-02', T), ['2026-11-06', '2026-11-13', '2026-11-17'])
  assert.equal(tradingDaysBack(T, 1), '2026-11-16')
  assert.equal(tradingDaysBack(T, 2), '2026-11-13')
  assert.deepEqual(quarterEnds(T, 3), ['2026-09-30', '2026-06-30', '2026-03-31'])
  assert.deepEqual(quarterEnds('2027-02-01', 2), ['2026-12-31', '2026-09-30'])
  assert.equal(periodLabel('2026-09-30'), '2026年三季报')
  assert.equal(lastYear('2026-09-30'), '2025-09-30')
})

const l2 = (code, name, pe, extra = {}) => ({ level: '2', tradeDate: '20261117', industryCode: code, industryName: name, pe, consNum: 10, lossNum: 2, children: [], ...extra })
const tree = (v) => [{ level: '1', industryCode: '45', industryName: '信息技术', tradeDate: '20261117', children: Array.from({ length: 30 }, (_, i) => l2(String(4500 + i), `行业${i}`, v(i))) }]
const industryBody = (date = '20261117') => ({ code: '200', data: { tradeDate: date, csipeindustryMapList: { 1: tree(() => '1'), 2: tree(i => (i === 0 ? '-5' : String(20 + i))), 3: tree(() => '2.5'), 4: tree(i => (i === 1 ? null : '1.2')) } } })

test('中证行业估值：日期门禁、负 PE 为 null、缺值不补 0', () => {
  assert.throws(() => parseCsiIndustry(industryBody('20201231'), T), /日期/)
  const rows = parseCsiIndustry(industryBody(), T)
  assert.equal(rows.length, 30)
  assert.equal(rows[0].pe, null)
  assert.equal(rows[1].pe, 21)
  assert.equal(rows[1].dy, null)
  assert.equal(rows[2].pb, 2.5)
  assert.equal(rows[2].l1Name, '信息技术')
  assert.deepEqual(historyEntry(rows)['4502'], [22, 2.5, 1.2])
})

test('估值分位：周采样，5 年窗口，当日缺失返回 null', () => {
  const hist = {}
  const dates = weekEnds('2021-12-17', '2026-11-13')
  dates.forEach((d, i) => { hist[d] = { A: [10 + (i % 10), 1, 1] } })
  hist[T] = { A: [10, 1, 1] }
  const p = valuationPct(hist, 'A', T, 5)
  assert.ok(p > 0 && p < 20)
  assert.equal(valuationPct(hist, 'A', '2026-11-18', 5), null)
  assert.equal(valuationPct(hist, 'B', T, 5), null)
})

test('个股行业映射与业绩报表整体法汇总', () => {
  assert.throws(() => parseCsiStocks({ code: '200', data: { tradeDate: '20261116', list: [] } }, T), /日期/)
  const list = Array.from({ length: 4000 }, (_, i) => ({ securityCode: String(100000 + i), cics1stName: '工业', cics2ndCode: '2040', cics2ndName: '机械制造' }))
  const stocks = parseCsiStocks({ code: '200', data: { tradeDate: '20261117', list } }, T)
  assert.equal(stocks.get('100001').l2Code, '2040')
  const cur = parseCpd([
    { SECURITY_CODE: '100000', REPORTDATE: '2026-09-30 00:00:00', NOTICE_DATE: '2026-10-20', PARENT_NETPROFIT: 120, TOTAL_OPERATE_INCOME: 1100, WEIGHTAVG_ROE: 10 },
    { SECURITY_CODE: '100001', REPORTDATE: '2026-09-30 00:00:00', NOTICE_DATE: '2026-10-21', PARENT_NETPROFIT: -20, TOTAL_OPERATE_INCOME: 900, WEIGHTAVG_ROE: -4 },
    { SECURITY_CODE: '100002', REPORTDATE: '2026-09-30 00:00:00', NOTICE_DATE: '2026-10-21', PARENT_NETPROFIT: 1, TOTAL_OPERATE_INCOME: '-', WEIGHTAVG_ROE: 0.1 },
    { SECURITY_CODE: '100003', REPORTDATE: '2026-06-30 00:00:00', PARENT_NETPROFIT: 999 },
  ], '2026-09-30')
  assert.equal(cur.size, 3)
  assert.equal(cur.get('100002').rev, null)
  const prev = parseCpd([
    { SECURITY_CODE: '100000', REPORTDATE: '2025-09-30', PARENT_NETPROFIT: 100, TOTAL_OPERATE_INCOME: 1000 },
    { SECURITY_CODE: '100001', REPORTDATE: '2025-09-30', PARENT_NETPROFIT: 0, TOTAL_OPERATE_INCOME: 1000 },
  ], '2025-09-30')
  const f = industryFinance(cur, prev, stocks).get('2040')
  assert.equal(f.npYoy, 0) // (120 − 20) ÷ (100 + 0) − 1
  assert.equal(f.revYoy, 0) // 2000 ÷ 2000 − 1，100002 无营收不计
  assert.equal(f.roe, 5.88) // 倒推净资产 120/0.1=1200、−20/−0.04=500 → 100 ÷ 1700
  assert.equal(f.roeCount, 2) // |ROE| < 0.5% 的 100002 不计入
  assert.equal(f.finCount, 3)
  const neg = industryFinance(cur, parseCpd([{ SECURITY_CODE: '100000', REPORTDATE: '2025-09-30', PARENT_NETPROFIT: -5, TOTAL_OPERATE_INCOME: 1 }], '2025-09-30'), stocks).get('2040')
  assert.equal(neg.npYoy, null)
})

test('涨跌幅、排名与景气得分', () => {
  const stocks = new Map([['1', { l2Code: 'A' }], ['2', { l2Code: 'A' }], ['3', { l2Code: 'A' }], ['4', { l2Code: 'A' }], ['5', { l2Code: 'B' }]])
  const t = new Map([['1', { cap: 110 }], ['2', { cap: 220 }], ['3', { cap: 330 }], ['4', { cap: null }], ['5', { cap: 9 }]])
  const b = new Map([['1', { cap: 100 }], ['2', { cap: 200 }], ['3', { cap: 300 }], ['4', { cap: 50 }], ['5', { cap: 10 }]])
  const ret = industryReturns(stocks, t, b)
  assert.equal(ret.get('A'), 10) // 缺市值的 4 不计
  assert.equal(ret.get('B'), null) // 成分少于 3 只
  assert.deepEqual(rankPct([1, 2, 3, null]), [0, 50, 100, null])
  assert.deepEqual(rankPct([1, 1, 3]), [25, 25, 100])
  const rows = scoreRows([
    { npYoy: 10, revYoy: 5, roe: 8, ret60: 1 },
    { npYoy: -5, revYoy: 1, roe: 2, ret60: null },
    { npYoy: null, revYoy: null, roe: 3, ret60: 2 },
  ])
  assert.equal(rows[0].score, 75) // ret60 在两个有效值里最低
  assert.equal(rows[1].score, 0)
  assert.equal(rows[2].score, null) // 只有 2 项
})

test('指数贡献：权重解析、漂移、国证还原与汇总', () => {
  const head = ['日期Date', '指数代码IndexCode', '成份券代码ConstituentCode', '成份券名称ConstituentName', '权重(%)weight']
  assert.throws(() => parseCsiWeights({ head, rows: [['20261030', '000300', '000001', 'A', '60']] }, '000300'), /权重和/)
  const w = parseCsiWeights({ head, rows: [['20261030', '000300', '000001', 'A', '60'], ['20261030', '000300', '000002', 'B', '40']] }, '000300')
  assert.equal(w.date, '2026-10-30')
  const day = (rows) => new Map(rows.map(([code, close, pct, floatCap]) => [code, { name: code, close, pct, floatCap }]))
  const base = day([['000001', 10, 0, 1], ['000002', 10, 0, 1]])
  const prev = day([['000001', 20, 0, 1], ['000002', 10, 0, 1]])
  const drift = driftWeights(w.list, base, prev)
  assert.ok(Math.abs(drift[0].weight - 75) < 1e-9)
  const today = day([['000001', 21, 5, 1], ['000002', 9, -10, 1]])
  const rows = contributions({ weights: drift, today, prevClose: 4000, stocks: new Map([['000001', { l1: '金融' }]]) })
  assert.equal(rows[0].points, 150) // 75% × 5% × 4000
  assert.equal(rows[1].points, -100)
  const sum = summarize(rows, 46)
  assert.equal(sum.estSum, 50)
  assert.equal(sum.residual, -4)
  assert.equal(sum.up[0].code, '000001')
  assert.equal(sum.down[0].code, '000002')
  assert.deepEqual(sum.industries.map(i => i.name), ['金融', '未分类'])
  assert.deepEqual(crossCheck([{ securityName: '000001', contributionPoint: '149.9' }, { securityName: '无', contributionPoint: '1' }], rows), { listed: 2, matched: 1, maxDiff: 0.1 })
  assert.equal(crossCheck(undefined, rows), null)

  const cni = parseCniSample({ head: ['日期', '样本代码', '样本简称', '所属行业', '权重（%）'], rows: [
    ...Array.from({ length: 5 }, (_, i) => ['2026-11-17', `30000${i}`, `T${i}`, '工业', '10']),
    ...Array.from({ length: 50 }, (_, i) => ['2026-11-17', String(300100 + i), `R${i}`, '工业', '--']),
  ] })
  assert.equal(cni.list.filter(r => r.weight === null).length, 50)
  const td = new Map(cni.list.map(r => [r.code, { pct: r.weight ? 10 : 0 }]))
  const pd = new Map(cni.list.map(r => [r.code, { floatCap: 1 }]))
  const back = cniPrevWeights(cni.list, td, pd)
  const total = back.reduce((a, r) => a + r.weight, 0)
  assert.ok(Math.abs(total - 100) < 1e-9)
  // 前五大当日各涨 10%：还原后 50/1.1 ÷ (50/1.1 + 50) ≈ 47.62%
  assert.ok(Math.abs(back.filter(r => !r.est).reduce((a, r) => a + r.weight, 0) - 47.619) < 0.01)
  assert.throws(() => cniPrevWeights(cni.list, td, new Map()), /流通市值/)
})

test('个股日数据与指数收盘的日期门禁', () => {
  assert.throws(() => parseDet([{ TRADE_DATE: '2026-11-16 00:00:00', SECURITY_CODE: '000001' }], T), /混入/)
  const k = parseKline({ data: { klines: ['2026-11-13,3000', '2026-11-16,3010', '2026-11-17,2990', '2026-11-18,1'] } }, T)
  assert.equal(k.length, 3)
  assert.deepEqual(closePair(k, T), { prevClose: 3010, close: 2990, change: -20, changePct: -0.66 })
  assert.throws(() => closePair(k.slice(0, 2), T), /未覆盖/)
  assert.throws(() => closePair([k[0], k[2]], T), /未覆盖/)
})
