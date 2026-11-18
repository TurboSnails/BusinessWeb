// 虚构数据验证信号板的解析、窗口分位与信号规则，不把测试数据当公开快照。
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  windowPct, rollingGdp, totalMcap, buffettSeries, marginSeries, parseIpo, ipoRolling, fundMonthly, mergeFundMonths, fundStart,
  parseSseAccounts, miniHistory, summarize, valuationSignal, moodSignal, buffettSignal, brokenSignal, RULES, trM2Series,
} from './jixing-signals-lib.mjs'

test('信号规则：分位与绝对阈值', () => {
  assert.equal(valuationSignal(15), '低估'); assert.equal(valuationSignal(85), '高估'); assert.equal(valuationSignal(50), '正常')
  assert.equal(valuationSignal(85, true), '低估'); assert.equal(valuationSignal(10, true), '高估'); assert.equal(valuationSignal(null), null)
  assert.equal(moodSignal(80), '偏牛'); assert.equal(moodSignal(20), '偏熊'); assert.equal(moodSignal(50), '中性')
  assert.equal(buffettSignal(79.9), '低估'); assert.equal(buffettSignal(100), '正常'); assert.equal(buffettSignal(101), '高估')
  assert.equal(brokenSignal(25, 30), '偏熊'); assert.equal(brokenSignal(0, 30), '偏牛'); assert.equal(brokenSignal(10, 30), '中性'); assert.equal(brokenSignal(50, 3), null)
  for (const k of ['buffett', 'erp', 'pb', 'marginRatio', 'amount', 'ipoCount', 'ipoBroken', 'funds', 'accounts', 'trM2']) assert.ok(RULES[k].length > 10)
})

test('全收益/M2：月末对齐并归一', () => {
  const tr = [
    { date: '2024-01-31', close: 100 },
    { date: '2024-02-29', close: 110 },
    { date: '2024-03-29', close: 120 },
  ]
  const m2 = [
    { month: '2024-01', m2: 1000 },
    { month: '2024-02', m2: 1000 },
    { month: '2024-03', m2: 1200 },
  ]
  const s = trM2Series(tr, m2)
  assert.equal(s.length, 3)
  assert.equal(s[0].v, 1)
  assert.ok(Math.abs(s[1].v - 1.1) < 1e-9)
  assert.ok(Math.abs(s[2].v - 1) < 1e-9) // 120/1200 ÷ (100/1000) = 1
})

test('窗口分位：窗口起点、样本数与统一定义', () => {
  const s = [['2015-01-05', 1], ['2017-06-01', 1], ['2020-01-02', 3], ['2026-11-17', 2]].map(([date, v]) => ({ date, v }))
  assert.deepEqual(windowPct(s, 10, 1), { pct: 50, start: '2017-06-01', n: 3 }) // 2015 年那天在窗口外；(1 + 0.5) / 3
  assert.deepEqual(windowPct(s, null, 1), { pct: 62.5, start: '2015-01-05', n: 4 })
  assert.equal(windowPct(s, 10).pct, null) // 样本太少
  assert.deepEqual(windowPct([], 10), { pct: null, start: null, n: 0 })
})

test('滚动 4 季度 GDP：当季累计 + 上年全年 − 上年同季累计；季末次月 20 日起可用', () => {
  const rows = [['2025-03-01', 30], ['2025-06-01', 60], ['2025-09-01', 95], ['2025-12-01', 130], ['2026-03-01', 33], ['2026-09-01', null]]
    .map(([d, v]) => ({ REPORT_DATE: `${d} 00:00:00`, DOMESTICL_PRODUCT_BASE: v }))
  const g = rollingGdp(rows)
  assert.deepEqual(g, [{ quarter: '2025-12', gdp: 130, avail: '2026-01-20' }, { quarter: '2026-03', gdp: 133, avail: '2026-04-20' }])
})

test('总市值：沪深合计 + 北交所；北交所开市后缺行为 null；巴菲特指标按已发布 GDP', () => {
  const rows = [
    { TRADE_DATE: '2021-11-12 00:00:00', TRADE_MARKET_CODE: '000300', TOTAL_MARKET_CAP: 9e9 },
    { TRADE_DATE: '2026-01-19 00:00:00', TRADE_MARKET_CODE: '000300', TOTAL_MARKET_CAP: 1e10 },
    { TRADE_DATE: '2026-01-20 00:00:00', TRADE_MARKET_CODE: '000300', TOTAL_MARKET_CAP: 1e10 },
    { TRADE_DATE: '2026-01-20 00:00:00', TRADE_MARKET_CODE: '899050', TOTAL_MARKET_CAP: 1e8 },
  ]
  const m = totalMcap(rows)
  assert.deepEqual(m, [{ date: '2021-11-12', mcap: 900000 }, { date: '2026-01-19', mcap: null }, { date: '2026-01-20', mcap: 1010000 }])
  const gdp = [{ quarter: '2025-09', gdp: 1000000, avail: '2025-10-20' }, { quarter: '2025-12', gdp: 1400000, avail: '2026-01-20' }]
  const b = buffettSeries(m, gdp)
  assert.equal(b[0].v, null) // 2021 年时还没有可用的 GDP
  assert.equal(b[2].v, 72.14); assert.equal(b[2].quarter, '2025-12')
})

test('融资余额：元 → 亿元，去重排序', () => {
  const s = marginSeries([{ DIM_DATE: '2026-11-17 00:00:00', RZYE: 2217095518841, RZYEZB: 2.529278 }, { DIM_DATE: '2026-11-16 00:00:00', RZYE: null, RZYEZB: '-' }, { DIM_DATE: '2026-11-17 00:00:00', RZYE: 1, RZYEZB: 1 }])
  assert.deepEqual(s, [{ date: '2026-11-16', balance: null, ratio: null }, { date: '2026-11-17', balance: 22170.96, ratio: 2.5293 }])
})

test('新股：近 k 个交易日上市数与破发率（首日收盘缺失不计入分母）', () => {
  const days = ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']
  const ipos = parseIpo([
    { SECURITY_CODE: '1', LISTING_DATE: '2026-11-10 00:00:00', ISSUE_PRICE: 10, CLOSE_PRICE: 9 },
    { SECURITY_CODE: '2', LISTING_DATE: '2026-11-12 00:00:00', ISSUE_PRICE: 10, CLOSE_PRICE: 20 },
    { SECURITY_CODE: '3', LISTING_DATE: '2026-11-13 00:00:00', ISSUE_PRICE: 10, CLOSE_PRICE: null },
    { SECURITY_CODE: '3', LISTING_DATE: '2026-11-13 00:00:00', ISSUE_PRICE: 10, CLOSE_PRICE: 5 },
  ])
  assert.equal(ipos.length, 3)
  const r = ipoRolling(ipos, days, 3)
  assert.equal(r[1].count, null)
  assert.deepEqual(r[2], { date: '2026-11-12', count: 2, priced: 2, broken: 1, rate: 50, from: '2026-11-10' })
  assert.deepEqual(r[3], { date: '2026-11-13', count: 2, priced: 1, broken: 0, rate: 0, from: '2026-11-11' })
})

test('新发基金：偏股口径、份额类别去重、缓存合并与覆盖起点', () => {
  const rows = [
    { company: 'A', name: '甲成长A', type: '股票型', shares: 10, setup: '2026-10-09' },
    { company: 'A', name: '甲成长C', type: '股票型', shares: 10, setup: '2026-10-09' },
    { company: 'B', name: '乙海外', type: '指数型-海外股票', shares: 50, setup: '2026-10-10' },
    { company: 'C', name: '丙偏股', type: '混合型-偏股', shares: null, setup: '2026-09-01' },
  ]
  const m = fundMonthly(rows)
  assert.deepEqual(m.find(x => x.month === '2026-10'), { month: '2026-10', equity: 10, equityFunds: 1, unknown: 0, funds: 2 })
  assert.equal(m.find(x => x.month === '2026-09').equity, null) // 偏股份额全部缺失 → null 不是 0
  const merged = mergeFundMonths([{ month: '2026-08', equity: 1 }, { month: '2026-09', equity: 2 }], [{ month: '2026-09', equity: 3 }, { month: '2026-10', equity: 4 }], '2026-09')
  assert.deepEqual(merged.map(x => x.equity), [1, 3, 4])
  const cover = [{ month: '2013-08', funds: 1 }, { month: '2022-12', funds: 3 }, { month: '2023-01', funds: 40 }, { month: '2023-02', funds: 80 }, { month: '2023-03', funds: 90 }]
  assert.equal(fundStart(cover), '2023-02') // 跳过可能不完整的首月
  assert.equal(fundStart([{ month: '2026-10', funds: 3 }]), null)
})

test('上交所新增投资者：MDATE 之后的 0.00 是未公布，丢弃；合计行忽略', () => {
  const body = { pageHelp: { data: [{ TERM: '2026.09', TOTAL: '205.14', MDATE: '202610' }, { TERM: '2026.10', TOTAL: '159.94', MDATE: '202610' }, { TERM: '2026.11', TOTAL: '0.00', MDATE: '202610' }, { TERM: '2026年合计', TOTAL: '3106.96', MDATE: '202610' }] } }
  assert.deepEqual(parseSseAccounts(body), [{ month: '2026-09', v: 205.14 }, { month: '2026-10', v: 159.94 }])
  assert.throws(() => parseSseAccounts({}))
})

test('迷你图周采样与计数', () => {
  const s = Array.from({ length: 400 }, (_, i) => ({ date: new Date(Date.UTC(2025, 0, 1) + i * 864e5).toISOString().slice(0, 10), v: i }))
  const h = miniHistory(s, 10, 0)
  assert.ok(h.length < 70 && h.at(-1)[0] === s.at(-1).date)
  assert.deepEqual(summarize([{ signal: '低估' }, { signal: '偏牛' }, { signal: null }]), { 低估: 1, 正常: 0, 高估: 0, 偏牛: 1, 中性: 0, 偏熊: 0, none: 1 })
})
