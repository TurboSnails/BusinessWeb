import { test } from 'node:test'
import assert from 'node:assert/strict'
import { drawdown, monthly, parseCsv, subtract, underperformStreak, yoy } from '../server/macro.mjs'

test('解析 FRED CSV，跳过缺失值', () => {
  assert.deepEqual(parseCsv('observation_date,X\n2026-01-01,1.5\n2026-01-02,.\n2026-01-03,2'), [['2026-01-01', 1.5], ['2026-01-03', 2]])
})

test('日度数据按月取最后一个观测', () => {
  assert.deepEqual(monthly([['2026-01-05', 1], ['2026-01-30', 2], ['2026-02-02', 3]]), [['2026-01-30', 2], ['2026-02-02', 3]])
})

test('同比按 12 个月前同月计算，缺基期的月份不输出', () => {
  assert.deepEqual(yoy([['2025-01-01', 100], ['2025-02-01', 100], ['2026-01-01', 103]]), [['2026-01-01', 3]])
})

test('回撤取窗口内历史最高点', () => {
  assert.deepEqual(drawdown([['a', 100], ['b', 120], ['c', 90]]).map(r => r[1]), [0, 0, 25])
})

test('两个序列按月对齐相减', () => {
  assert.deepEqual(subtract([['2026-08-01', 3.63]], [['2026-08-01', 3.01], ['2026-09-01', 3]]), [['2026-08-01', 0.62]])
})

test('连续跑输周数从最近一周往前数，遇到跑赢即停', () => {
  const kre = [['w1', 100], ['w2', 102], ['w3', 100], ['w4', 99]]
  const spy = [['w1', 100], ['w2', 101], ['w3', 100], ['w4', 100.5]]
  assert.equal(underperformStreak(kre, spy), 2)
})

test('FRED CSV：兼容 DATE 表头与科学计数法', () => {
  assert.deepEqual(parseCsv('DATE,X\n2026-01-01,1e2\r\n2026-01-02,-0.5\r\n'), [['2026-01-01', 100], ['2026-01-02', -0.5]])
})

test('FRED CSV：HTML/错误页、错误表头、非法日期、空值不是有效观测', () => {
  assert.deepEqual(parseCsv('<!DOCTYPE html>\n<html>\n<link rel="x" href="a,400">\n</html>'), [])
  assert.deepEqual(parseCsv('<link rel="stylesheet" href="/a.css">,400\n<link href="b">,400'), [])
  assert.deepEqual(parseCsv('foo,bar\n2026-01-01,1'), [])
  assert.deepEqual(parseCsv('observation_date,X\n2026-02-30,1\n2026-13-01,2\n20260101,3\n2026-01-01,\n2026-01-02, \n2026-01-03,abc\n2026-01-04,Infinity'), [])
  assert.deepEqual(parseCsv('observation_date,X\n2026-01-01,1\n<link rel="a">,400'), [['2026-01-01', 1]])
})

test('FRED 返回 HTML 时 buildSnapshots 抛错并沿用旧快照，不写入污染值', async () => {
  const { buildSnapshots } = await import('../server/macro.mjs')
  const realFetch = globalThis.fetch
  globalThis.fetch = async url => String(url).includes('fredgraph')
    ? new Response('<!DOCTYPE html>\n<html>\n<link rel="canonical" href="x">,400\n</html>', { status: 200 })
    : new Response('', { status: 500 })
  try {
    const old = { latest: { date: '2026-01-01', value: 4.1 }, history: [['2026-01-01', 4.1]] }
    const snap = await buildSnapshots({ us: { series: { unrate: old } } })
    assert.deepEqual(snap.us.series.unrate, { ...old, live: false })
    assert.ok(snap.warnings.some(w => w.startsWith('unrate：') && w.includes('无数据')))
  } finally { globalThis.fetch = realFetch }
})
