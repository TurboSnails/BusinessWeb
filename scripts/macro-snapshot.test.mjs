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
