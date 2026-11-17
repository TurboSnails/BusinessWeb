import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { validateCatalog } from './index-etf-catalog.mjs'
import { assertIndexSnapshot } from './lib/index-snapshot-validation.mjs'
const data = JSON.parse(await readFile(new URL('../public/data/index-etf-catalog.json', import.meta.url)))
test('核验目录每条关系都有公开官方证据且不混淆行业指数', () => {
  assert.deepEqual(validateCatalog(data), [])
  assert.equal(data.relations.find(r => r.indexKey === 'csiMedicine').code, '159938')
  const bad = structuredClone(data); bad.relations[0].benchmarkCode = '999999'
  assert.match(validateCatalog(bad).join(','), /不匹配/)
  bad.relations[0].evidenceUrl = 'https://example.com/'
  assert.match(validateCatalog(bad).join(','), /官方/)
  assert.match(validateCatalog({ schemaVersion: 1, relations: [null] }).join(','), /条目无效/)
  const spoof = structuredClone(data); Object.assign(spoof.relations[0], { indexCode: '399001', benchmarkCode: '399001', indexProvider: 'SZSE' }); assert.match(validateCatalog(spoof).join(','), /注册身份/)
  const blankNote = structuredClone(data); Object.assign(blankNote.relations[0], { relationship: 'related_theme', benchmarkCode: '000905', relationNote: '   ' }); assert.match(validateCatalog(blankNote).join(','), /跟踪关系/)
})
const ix = { latest: { date: '2020-02-28', value: 2 }, monthly: [['2020-01-31', 1], ['2020-02-28', 2]], fpe: [] }
test('发布门禁拒绝指数消失、历史缩水和最新日回退', () => {
  const old = { indexes: { x: ix } }
  assert.doesNotThrow(() => assertIndexSnapshot(structuredClone(old), old))
  assert.throws(() => assertIndexSnapshot({ indexes: { y: ix } }, old), /消失/)
  assert.throws(() => assertIndexSnapshot({ indexes: { x: { ...ix, monthly: ix.monthly.slice(1) } } }, old), /退化/)
  assert.throws(() => assertIndexSnapshot({ indexes: { x: { ...ix, latest: { date: '2019-01-01', value: 2 } } } }, old), /回退/)
})
test('发布门禁拒绝无效、重复乱序价格与非有限值', () => {
  assert.throws(() => assertIndexSnapshot({ indexes: { x: { ...ix, monthly: [['2020-01-31', NaN]] } } }), /无效/)
  assert.throws(() => assertIndexSnapshot({ indexes: { x: { ...ix, monthly: [...ix.monthly].reverse() } } }), /无效/)
})

test('门禁拒绝非法日历日与截止日之后观测', () => {
  assert.throws(() => assertIndexSnapshot({ indexes: { x: { ...ix, monthly: [['2020-02-30', 1]] } } }, null, '2020-03-01'), /无效/)
  assert.throws(() => assertIndexSnapshot({ indexes: { x: ix } }, null, '2020-02-20'), /无效/)
})


test('自动更新拒绝中间历史改写，人工导入可明确修订但仍受日期门禁', () => {
  const threeMonths = { latest: { date: '2020-03-31', value: 3 }, monthly: [['2020-01-31', 1], ['2020-02-28', 2], ['2020-03-31', 3]], fpe: [] }
  const old = { generatedAt: '2020-03-31', indexes: { x: threeMonths } }
  const changed = { generatedAt: '2020-03-31', indexes: { x: { ...threeMonths, monthly: [['2020-01-31', 1], ['2020-02-15', 99], ['2020-03-31', 3]] } } }
  assert.throws(() => assertIndexSnapshot(changed, old, '2020-04-01'), /改写/)
  assert.doesNotThrow(() => assertIndexSnapshot(changed, old, '2020-04-01', { allowHistoryRewrite: true }))
  assert.throws(() => assertIndexSnapshot({ generatedAt: '2020-03-31', indexes: { x: { ...threeMonths, fpe: [['2020-04-01', 20]] } } }, old, '2020-03-20', { allowHistoryRewrite: true }), /无效/)
})
