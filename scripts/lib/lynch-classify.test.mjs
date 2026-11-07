import test from 'node:test'
import assert from 'node:assert/strict'
import {
  effectiveGrowth,
  classifyLynchType,
  classifyLynchAttention,
  computePeg,
  applyLynchReclassification,
} from './lynch-classify.mjs'

test('有效增速取近一年与两年年化的较小者', () => {
  assert.equal(effectiveGrowth({ g: 32, c: 15 }), 15)
  assert.equal(effectiveGrowth({ g: 5, c: 20 }), 5)
  assert.equal(effectiveGrowth({ g: null, c: 10 }), null)
})

test('类型：快速/稳健/缓慢边界（含 eg=8 归稳健）', () => {
  assert.equal(classifyLynchType({ g: 26, c: 25, rg: 10 }), '快速增长型')
  assert.equal(classifyLynchType({ g: 32, c: 15, rg: 14 }), '稳健型')
  assert.equal(classifyLynchType({ g: 8, c: 8, rg: 12 }), '稳健型')
  assert.equal(classifyLynchType({ g: 7.9, c: 20, rg: 30 }), '缓慢增长型')
  assert.equal(classifyLynchType({ g: 25, c: 25, rg: 9 }), '稳健型') // 营收不足 10%，不能进快速
})

test('类型：困境/周期/资产在缺新序列时保留', () => {
  assert.equal(classifyLynchType({ t: '周期型', g: 40, c: 30, rg: 20 }), '周期型')
  assert.equal(classifyLynchType({ t: '困境反转型', g: 5, c: 5, rg: 5 }), '困境反转型')
  assert.equal(classifyLynchType({ t: '资产型', g: 1, c: 1, rg: 1, pb: 0.5 }), '资产型')
})

test('关注度：快速看 PEG，稳健看 PE，缓慢看低PE/高股息', () => {
  assert.equal(classifyLynchAttention('快速增长型', { pe: 20, g: 30, c: 30 }), '高') // PEG 20/30
  assert.equal(classifyLynchAttention('快速增长型', { pe: 36, g: 30, c: 30 }), '中') // 1.2
  assert.equal(classifyLynchAttention('快速增长型', { pe: 50, g: 30, c: 30 }), '低')
  assert.equal(classifyLynchAttention('稳健型', { pe: 14 }), '高')
  assert.equal(classifyLynchAttention('稳健型', { pe: 20 }), '中')
  assert.equal(classifyLynchAttention('稳健型', { pe: 38 }), '低')
  assert.equal(classifyLynchAttention('缓慢增长型', { pe: 12 }), '中')
  assert.equal(classifyLynchAttention('缓慢增长型', { pe: 20, dy: 4 }), '中')
  assert.equal(classifyLynchAttention('缓慢增长型', { pe: 20 }), '低')
})

test('PEG 仅快速增长型计算，增速封顶 50%', () => {
  assert.equal(computePeg('稳健型', { pe: 20, g: 15, c: 15 }), null)
  assert.equal(computePeg('快速增长型', { pe: 40, g: 80, c: 80 }), 0.8) // 40/50
})

test('apply 写入 classificationAsOf 与说明', () => {
  const out = applyLynchReclassification(
    { t: '稳健型', r: '低', pe: 14, g: 12, c: 12, rg: 11, checkedAt: 'T' },
    { asOf: '2026-11-07' },
  )
  assert.equal(out.t, '稳健型')
  assert.equal(out.r, '高')
  assert.equal(out.classificationAsOf, '2026-11-07')
  assert.match(out.v, /类型与同类关注度于2026-11-07/)
})
