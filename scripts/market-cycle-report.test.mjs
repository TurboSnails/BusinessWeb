import { test } from 'node:test'
import assert from 'node:assert/strict'
import { archivedShadow, buildReport, parseMacroInput, parsePriceInput, weekEnding } from './market-cycle-report.mjs'

test('输入格式错误时明确拒绝，不让单个坏文件击穿周报', () => {
  assert.throws(() => parseMacroInput({}))
  assert.throws(() => parseMacroInput({ series: { vix: { latest: {}, history: [] } } }))
  assert.throws(() => parsePriceInput({ schemaVersion: 1, markets: { hsi: {} }, warnings: [] }))
  assert.deepEqual(parseMacroInput({ series: {} }), { series: {} })
})

test('周末留档不把未完成周当确认；输入哈希确定且缺失不凑票', () => {
  assert.equal(weekEnding('2026-10-16'), '2026-10-10')
  assert.equal(weekEnding('2026-10-17'), '2026-10-17')
  const inputs = { price: null, automatic: null, breadth: null, cn: null, us: null }
  const one = buildReport(inputs, null, '2026-10-17T10:00:00Z')
  const two = buildReport(inputs, one, '2026-10-18T10:00:00Z')
  assert.equal(two.records.length, 1)
  assert.equal(one.records[0].inputHash, two.records[0].inputHash)
  assert.equal(two.records[0].markets.csi300.shadow.riskGate, '暂停提高风险')
  assert.equal(two.records[0].markets.csi300.rows.filter(r => r.available).length, 0)
})
test('同一周重跑不增加趋势确认，漏周不会冒充连续两周', () => {
  const inputs = { price: null, automatic: null, breadth: null, cn: null, us: null }
  const old = buildReport(inputs, null, '2026-10-10T10:00:00Z')
  old.records[0].markets.csi300.shadow.confirmations = 1
  const rerun = buildReport(inputs, old, '2026-10-10T11:00:00Z')
  assert.equal(rerun.records.length, 1)
  const next = buildReport(inputs, old, '2026-10-17T10:00:00Z')
  assert.equal(next.records.length, 2)
  const gap = buildReport(inputs, old, '2026-10-24T10:00:00Z')
  assert.equal(gap.records[0].markets.csi300.shadow.confirmations, 0)
})
test('旧价格跨周沿用不能变成第二份趋势确认，真实相邻周才可确认', () => {
  const rows = [{ id: 'technical', signal: 'positive', available: true, date: '2026-10-09 / 2026-09-30' }]
  const previous = { rows, shadow: archivedShadow(rows) }
  assert.equal(archivedShadow(rows, previous).confirmations, 1)
  const next = [{ ...rows[0], date: '2026-10-16 / 2026-09-30' }]
  assert.equal(archivedShadow(next, previous).confirmations, 2)
  assert.equal(archivedShadow([{ ...rows[0], date: '2026-10-23 / 2026-09-30' }], previous).confirmations, 1)
})
test('节假日周最后观测日可以不同；同一日历周的修订不能多计一次', () => {
  const rows = [{ id: 'technical', signal: 'positive', available: true, date: '2026-10-08 / 2026-09-30' }]
  const previous = { rows, shadow: archivedShadow(rows) }
  assert.equal(archivedShadow([{ ...rows[0], date: '2026-10-16 / 2026-09-30' }], previous).confirmations, 2)
  assert.equal(archivedShadow([{ ...rows[0], date: '2026-10-09 / 2026-09-30' }], previous).confirmations, 1)
})
