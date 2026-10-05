import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createProgress, streamText } from './cli/index.mjs'

test('从各 CLI 的流式记录里取出模型文字', () => {
  assert.equal(streamText({ type: 'item.completed', item: { type: 'reasoning', text: '先看收入' } }), '先看收入')
  assert.equal(streamText({ type: 'text', part: { text: '{"base"' } }), '{"base"')
  assert.equal(streamText({ type: 'message_update', assistantMessageEvent: { delta: '增长' } }), '增长')
  assert.equal(streamText({ type: 'step_start' }), '')
})

test('进度汇报累计字数、保留最近输出，并按时间节流', () => {
  let t = 0
  const events = []
  const p = createProgress(e => events.push(e), { interval: 1000, now: () => t })
  p.push('第一段', 'reasoning')
  t = 500; p.push('第二段')
  assert.equal(events.length, 1)
  assert.equal(events[0].message, '模型正在推理')
  t = 1600; p.push('第三段')
  assert.equal(events.length, 2)
  assert.equal(events[1].chars, 9)
  assert.match(events[1].preview, /第二段第三段$/)
})
