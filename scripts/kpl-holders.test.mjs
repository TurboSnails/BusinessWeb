import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildFunds, buildInvestors, buildMargin, checkComplete, isFullPeriod, isStockCode, num, parseFunds, parseInvestors, parseMargin, parseMarginIndustries,
  periodLabel, pickFundPeriod, prevQuarter, quartersBefore, sameContent,
} from './kpl-holders-lib.mjs'

const mrow = (code, net, extra = {}) => ({ DATE: '2026-11-16 00:00:00', SCODE: code, SECNAME: `股${code}`, SPJ: 10, ZDF: 1, RZYE: 5e8, RZMRE: 1e8, RZCHE: 1e8 - net, RZJME: net, RZJME3D: null, RZJME5D: net * 2, RZJME10D: null, FIN_BALANCE_GR: 1, RZYEZB: 2, SZ: 2.5e10, ...extra })

test('缺失值与代码过滤', () => {
  assert.equal(num(null), null); assert.equal(num('-'), null); assert.equal(num(''), null); assert.equal(num('0'), 0)
  for (const c of ['600000', '000001', '300750', '688256', '920000', '830799', '430047']) assert.ok(isStockCode(c), c)
  for (const c of ['513180', '159915', '110000', '60000']) assert.ok(!isStockCode(c), c)
  assert.throws(() => checkComplete([1], 2, 'x'))
})

test('报告期工具', () => {
  assert.equal(periodLabel('2026-09-30'), '2026 年三季报')
  assert.equal(prevQuarter('2026-03-31'), '2025-12-31')
  assert.deepEqual(quartersBefore('2026-11-18', 3), ['2026-09-30', '2026-06-30', '2026-03-31'])
  assert.ok(isFullPeriod('2026-06-30')); assert.ok(!isFullPeriod('2026-09-30'))
  // 季末未满 25 天或覆盖不足的报告期跳过
  assert.equal(pickFundPeriod([{ period: '2026-09-30', count: 3863 }], '2026-10-20'), null)
  assert.equal(pickFundPeriod([{ period: '2026-09-30', count: 800 }, { period: '2026-06-30', count: 5311 }], '2026-11-18'), '2026-06-30')
  assert.equal(pickFundPeriod([{ period: '2026-09-30', count: 3863 }], '2026-11-18'), '2026-09-30')
})

test('两融：日期校验、剔除基金、排行与余额阈值', () => {
  const rows = [mrow('600001', 3e8), mrow('600002', -2e8), mrow('600003', 1e7, { FIN_BALANCE_GR: 50, RZYE: 5e7 }), mrow('600004', 0, { FIN_BALANCE_GR: 9, RZYEZB: 12 }), mrow('513180', 9e9), mrow('600005', '-', { RZJME5D: '-' })]
  assert.throws(() => parseMargin([mrow('600001', 1, { DATE: '2026-11-13 00:00:00' })], '2026-11-16', 0), /日期不符/)
  assert.throws(() => parseMargin(rows, '2026-11-16'), /不足/)
  const s = parseMargin(rows, '2026-11-16', 1)
  assert.equal(s.length, 5)
  assert.equal(s.find((r) => r.code === '600005').net, null)
  const ind = parseMarginIndustries([{ TRADE_DATE: '2026-11-16 00:00:00', BOARD_TYPE_CODE: '005', BOARD_CODE: '475', BOARD_NAME: '银行Ⅱ', FIN_NETBUY_AMT: 5 }, { TRADE_DATE: '2026-11-16 00:00:00', BOARD_TYPE_CODE: '006', BOARD_CODE: '1', BOARD_NAME: '概念', FIN_NETBUY_AMT: 9 }], '2026-11-16')
  assert.equal(ind.length, 1)
  const m = buildMargin(s, ind, '2026-11-16')
  assert.deepEqual(m.buy.map((r) => r.code), ['600001', '600003'])
  assert.deepEqual(m.sell.map((r) => r.code), ['600002'])
  assert.equal(m.totals.net, 3e8 - 2e8 + 1e7)
  assert.equal(m.totals.up, 2); assert.equal(m.totals.down, 1)
  // 600003 余额 5000 万 < 1 亿，不进增幅榜
  assert.equal(m.growth[0].code, '600004')
  assert.equal(m.ratio[0].code, '600004')
  assert.equal(m.industries.inflow[0].name, '银行Ⅱ')
})

test('基金持仓：新进、变动市值估算、行业汇总', () => {
  const r = (code, shares, value, change, extra = {}) => ({ REPORT_DATE: '2026-09-30 00:00:00', ORG_TYPE: '01', SECURITY_CODE: code, SECURITY_NAME_ABBR: `股${code}`, HOULD_NUM: 10, TOTAL_SHARES: shares, HOLD_VALUE: value, FREESHARES_RATIO: 3, HOLDCHA_NUM: change, HOLDCHA_RATIO: 5, ...extra })
  assert.throws(() => parseFunds([r('600001', 1, 1, 1, { REPORT_DATE: '2026-06-30' })], '2026-09-30'), /报告期不符/)
  const cur = parseFunds([r('600001', 1e6, 2e7, 1e5), r('600002', 1e6, 1e7, -2e5), r('600003', 5e5, 5e6, null), r('600004', 1e6, null, 1e5)], '2026-09-30')
  const ind = new Map([['600001', '半导体'], ['600002', '半导体']])
  const f = buildFunds(cur, ['600001', '600002', '600004'], ind, '2026-09-30', '2026-06-30')
  assert.equal(f.add[0].changeValue, 2e6) // 10 万股 × 20 元
  assert.equal(f.cut[0].changeValue, -2e6)
  assert.equal(f.fresh[0].code, '600003'); assert.equal(f.fresh[0].change, 5e5); assert.equal(f.fresh[0].changeRatio, null)
  assert.equal(f.newCount, 1); assert.equal(f.addCount, 2); assert.equal(f.cutCount, 1)
  assert.equal(f.add.length, 1) // 600004 缺持股市值，变动市值为 null，不进榜
  assert.equal(f.full, false); assert.equal(f.prevFull, true)
  const semi = f.industries.find((x) => x.name === '半导体')
  assert.equal(semi.stocks, 2); assert.equal(semi.changeValue, 0)
  assert.equal(buildFunds(cur, null, ind, '2026-09-30', null).fresh, null)
})

test('牛散：排除内部人和陈旧记录，按出现只数排序', () => {
  const r = (holder, code, extra = {}) => ({ HOLDER_NAME: holder, SECURITY_CODE: code, SECURITY_NAME_ABBR: `股${code}`, END_DATE: '2026-09-30 00:00:00', NOTICE_DATE: '2026-10-28 00:00:00', HOLDER_RANK: 9, HOLD_NUM: 1e6, HOLDER_MARKET_CAP: 1e7, FREE_HOLDNUM_RATIO: 1.2, HOLDER_STATE_NEW: '新进', XZCHANGE: null, IS_SJKZR: '0', IS_DJG: '0', ...extra })
  const raw = [
    r('甲', '600001'), r('甲', '600002', { HOLDER_STATE_NEW: '加仓', XZCHANGE: 100 }), r('甲', '600003', { HOLDER_MARKET_CAP: '-' }),
    r('乙', '600001', { HOLDER_MARKET_CAP: 9e9 }), r('乙', '600002'), r('乙', '600004', { END_DATE: '2014-12-31 00:00:00' }),
    r('丙', '600001', { IS_SJKZR: '1' }), r('丙', '600002', { IS_DJG: '1' }), r('丙', '600003'),
    r('丁', '600001'), r('丁', '600002'), r('丁', '600005', { HOLDER_MARKET_CAP: 1e9 }), r('丁', '513180'),
  ]
  const rows = parseInvestors(raw, '2025-10-01')
  assert.equal(rows.length, 9)
  const out = buildInvestors(rows, { top: 10, minStocks: 2 })
  assert.deepEqual(out.list.map((p) => p.name), ['丁', '甲', '乙'])
  const jia = out.list.find((p) => p.name === '甲')
  assert.equal(jia.count, 3); assert.equal(jia.newCount, 2); assert.equal(jia.addCount, 1)
  assert.equal(jia.value, 2e7) // 缺失的不当 0，也不计入
  assert.equal(jia.items.at(-1).value, null)
  assert.equal(out.candidates, 4)
  assert.equal(buildInvestors(rows, { minStocks: 3 }).list.length, 2)
})

test('内容无变化判断忽略生成时间', () => {
  const a = { generatedAt: '1', asOf: '2026-11-16', funds: { fetched: '2026-11-17', x: 1 }, investors: null }
  assert.ok(sameContent(a, { ...a, generatedAt: '2', funds: { fetched: '2026-11-18', x: 1 } }))
  assert.ok(!sameContent(a, { ...a, asOf: '2026-11-17' }))
})
