import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildRow, canPublish, marketCloses, mergeHistory, parseCniSnapshot, parseCsiHistory, parseCsiSnapshot,
  percentile, sourceDate, valuationStatus, windowStart,
} from './jixing-table-lib.mjs'

const target = '2026-11-17'
const dates = new Map([['2026-11-16', 10690.78], [target, 10638.5242]])
const csi = data => ({ code: '200', success: true, data })
const broad = { code: '000300', name: '沪深300', group: 'broad', basis: 'pe', source: 'csi', csiName: '沪深300', snapshot: true }
const cni = { code: '399001', name: '深证成指', group: 'broad', basis: 'pe', source: 'cni' }
const bank = { code: '399986', name: '中证银行', group: 'industry', basis: 'pb', source: 'csi' }

test('日期严格校验紧凑格式、闰日、溢出与尾缀', () => {
  assert.equal(sourceDate('20240229'), '2024-02-29')
  assert.equal(sourceDate(target), target)
  for (const bad of ['', '-', null, '20230229', '2026-11-31', '2026-11-17x', 20261117]) assert.equal(sourceDate(bad), null)
  assert.equal(windowStart('2024-02-29'), '2014-02-28')
  assert.equal(windowStart(target), '2016-11-17')
})

test('百分位用并列平均名次，保留真实零并忽略缺失', () => {
  assert.equal(percentile([1, 2, 2, 3, null, '', '-', NaN], 2), 0.5)
  assert.equal(percentile([1, 2, 2, 2, 3], 1), 0.1)
  assert.equal(percentile([0, 1], 0), 0.25)
  assert.equal(percentile([], 1), null)
  assert.equal(percentile([1], null), null)
})

test('中证 PE 历史只留下指数匹配的真实交易日，排除请求起点补点及无效 PE', () => {
  const item = (tradeDate, peg, indexName = '沪深300') => ({ tradeDate, peg, indexName })
  const body = csi([
    item('20261113', 20), item('20261114', 20), item('20261116', '-'), item('20261116', ''),
    item('20261117', '13.05'), item('20261118', 15), item('20261117', 100, '上证50'), item('20261131', 100),
  ])
  assert.deepEqual(parseCsiHistory(body, broad, '2026-11-13', target, dates), [[target, 13.05, null]])
  assert.deepEqual(parseCsiHistory({ ...body, success: false }, broad, '2026-11-13', target, dates), [])
  assert.deepEqual(parseCsiHistory(csi([item('20261117', 13.05), item('20261117', 13.06)]), broad, '2026-11-13', target, dates), [])
})

test('中证快照校验总日期与行日期，只映射滚动 PE，股息率零有效', () => {
  const row = { tradeDate: '20261117', indexName: '沪深300', pe: 20, peg: '13.05', pb: '', dp: 0 }
  const data = { tradeDate: '20261117', indexValuations: [row, { ...row, indexName: '中证红利', tradeDate: '20261116' }] }
  assert.deepEqual([...parseCsiSnapshot(csi(data), target)], [['沪深300', { date: target, pe: 13.05, pb: null, dp: 0 }]])
  assert.equal(parseCsiSnapshot(csi({ ...data, tradeDate: '20261116' }), target).size, 0)
  assert.equal(parseCsiSnapshot(csi({ ...data, indexValuations: [row, row] }), target).size, 0)
})

test('国证逐日收盘价按严格日期筛选，快照日期与收盘点位均须吻合', () => {
  const quote = (date, close) => [date, null, null, null, null, close]
  const closes = marketCloses({ code: 200, data: { data: [quote(target, '10638.5242'), quote('2026-11-18', 100), quote('2026-11-16', '-'), quote('2026-11-31', 100)] } }, target)
  const overview = { code: 200, data: [{ indexcode: '399001', indexname: '深证成指', closeingPoint: '10638.5242', peStatic: 22.49, peDynamic: 18.7603, pb: 2.11 }] }
  const day = { code: 200, data: Date.parse('2026-11-17T00:00:00+08:00') }
  assert.deepEqual([...closes], [[target, 10638.5242]])
  assert.deepEqual([...parseCniSnapshot(overview, day, target, [cni], new Map([[cni.code, closes]]))], [
    [cni.code, { date: target, pe: 18.7603, pb: 2.11, dp: null }],
  ])
  assert.equal(parseCniSnapshot(overview, day, target, [cni], new Map([[cni.code, new Map([[target, 10690.78]])]])).size, 0)
  assert.equal(parseCniSnapshot(overview, day, '2026-11-18', [cni], new Map([[cni.code, closes]])).size, 0)
})

test('PE/PB 历史按日期排序去重，缺项与未来数据不会覆盖已知记录', () => {
  const existing = [[target, 13.05, 1.28], ['2026-11-16', 13.05, null]]
  const extra = [[target, null, 1.29], [target, 13.06, null], ['2026-11-18', 15, 1.3], ['2026-11-15', 13, 1.2], ['2026-11-31', 1, 1]]
  const expected = [['2026-11-16', 13.05, null], [target, 13.06, 1.29]]
  assert.deepEqual(mergeHistory(existing, extra, target), expected)
  assert.deepEqual(mergeHistory(expected, extra, target), expected)
  assert.deepEqual(existing[0], [target, 13.05, 1.28])
})

test('PE 与 PB 的估值状态分别取指定指标，恰好 30% 与 70% 都是正常', () => {
  assert.equal(valuationStatus('pe', 0.299, 0.9), 'low')
  assert.equal(valuationStatus('pe', 0.701, 0.1), 'high')
  assert.equal(valuationStatus('pb', 0.8, 0.1), 'low')
  assert.equal(valuationStatus('pb', 0.1, 0.8), 'high')
  assert.equal(valuationStatus('pb', 0.5, null), null)
  for (const p of [0.3, 0.7]) assert.equal(valuationStatus('pe', p, null), 'normal')
})

test('表格按近十年逐日样本计算，样本不足时保留起点和数量但不计算 PB 分位', () => {
  const history = [['2016-11-16', 99, 0.1], ['2016-11-17', 10, null], ['2026-11-16', 20, 1], [target, 20, 2]]
  const row = buildRow(bank, target, { date: target, pe: 20, pb: 2, dp: 3 }, history)
  assert.deepEqual(row.peHistory, { since: '2016-11-17', count: 3 })
  assert.deepEqual(row.pbHistory, { since: '2026-11-16', count: 2 })
  assert.equal(row.pePct, 2 / 3)
  assert.equal(row.pbPct, null)
  assert.equal(row.roe, 0.1)
  assert.equal(row.status, null)
  assert.deepEqual(row.peRefs, [10, 20])
  assert.deepEqual(row.peSeries.at(-1), [target, 20])
})

test('PB 满 250 个有效交易日才计算并应用分位', () => {
  const days = Array.from({ length: 370 }, (_, i) => new Date(Date.UTC(2024, 0, i + 1)))
    .filter(d => ![0, 6].includes(d.getUTCDay())).slice(0, 249).map(d => [d.toISOString().slice(0, 10), 20, 1])
  const current = { date: target, pe: 20, pb: 2, dp: null }
  assert.equal(buildRow(bank, target, current, [...days, [target, 20, 2]]).status, 'high')
  assert.equal(buildRow(bank, target, current, [...days.slice(1), [target, 20, 2]]).status, null)
})

test('发布时拒绝错日、缺指数、缺预期字段、同日重跑和历史回跑', () => {
  const indices = [broad, cni]
  const ready = new Map([[broad.code, { date: target, pe: 13.05, pb: 1.28, dp: 3.05 }], [cni.code, { date: target, pe: 18.76, pb: 2.11, dp: null }]])
  assert.equal(canPublish(null, target, indices, ready), true)
  assert.equal(canPublish('2026-11-16', target, indices, ready), true)
  assert.equal(canPublish(target, target, indices, ready), false)
  assert.equal(canPublish('2026-11-18', target, indices, ready), false)
  assert.equal(canPublish(null, target, indices, new Map([[broad.code, ready.get(broad.code)]])), false)
  assert.equal(canPublish(null, target, indices, new Map(ready).set(broad.code, { ...ready.get(broad.code), pb: null })), false)
  assert.equal(canPublish(null, target, indices, new Map(ready).set(cni.code, { ...ready.get(cni.code), date: '2026-11-16' })), false)
})
