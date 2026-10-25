import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mergeSnapshot, parseRampAiIndex } from '../server/ramp-ai-index.mjs'

const html = readFileSync(new URL('./fixtures/ramp-ai-index.html', import.meta.url), 'utf8')
const snap = parseRampAiIndex(html)

test('读取周期与总量变化', () => {
  assert.equal(snap.weekEnding, '2026-10-11')
  assert.equal(snap.comparedWeekEnding, '2026-09-13')
  assert.equal(snap.tokenUsage, 0.524)
  assert.equal(snap.tokenSpend, 0.23)
})

test('读取三组综合价格与支出份额', () => {
  assert.deepEqual(snap.price.combined, { now: 0.64, prev: 0.86, change: -0.254 })
  assert.deepEqual(snap.price.openai, { now: 0.48, prev: 0.73, change: -0.345 })
  assert.deepEqual(snap.price.anthropic, { now: 0.8, prev: 1, change: -0.192 })
  assert.deepEqual(snap.spendShare.anthropic, { now: 0.601, prev: 0.538 })
  assert.equal(snap.spendShare.openai.now, 0.364)
})

test('页面结构变化时抛错而不是返回残缺数据', () => {
  assert.throws(() => parseRampAiIndex('<html></html>'), /Tokenomics/)
  assert.throws(() => parseRampAiIndex(html.replace('Blended price per million tokens: OpenAI &amp; Anthropic', 'x')), /combined/)
  assert.throws(() => parseRampAiIndex(html.replace('Total token spending rose', 'Spending was')), /总支出/)
})

test('下降用词解析为负数', () => {
  assert.equal(parseRampAiIndex(html.replace('spending rose 23.0', 'spending fell 4.0')).tokenSpend, -0.04)
})

test('mergeSnapshot 按周去重并升序，同周以新值覆盖', () => {
  const a = { weekEnding: '2026-10-11', tokenUsage: 1 }, b = { weekEnding: '2026-09-13', tokenUsage: 2 }
  assert.deepEqual(mergeSnapshot([a], b).map(s => s.weekEnding), ['2026-09-13', '2026-10-11'])
  assert.deepEqual(mergeSnapshot([a], { ...a, tokenUsage: 9 }), [{ weekEnding: '2026-10-11', tokenUsage: 9 }])
})
