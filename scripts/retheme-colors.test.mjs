import { test } from 'node:test'
import assert from 'node:assert/strict'
import { retheme } from './retheme-colors.mjs'

test('苹果系统色字面量换成变量', () => {
  const { output, count } = retheme(`color: '#007AFF', background: '#f5f5f7'`)
  assert.equal(output, `color: 'var(--system-blue)', background: 'var(--bg-primary)'`)
  assert.equal(count, 2)
})

test('大小写不敏感', () => {
  assert.equal(retheme(`'#007aff'`).output, `'var(--system-blue)'`)
})

test('rgba 系统色换成 color-mix，保留透明度', () => {
  const { output } = retheme(`background: 'rgba(0, 122, 255, 0.1)'`)
  assert.equal(output, `background: 'color-mix(in srgb, var(--system-blue) 10%, transparent)'`)
})

test('无空格的 rgba 也认', () => {
  assert.equal(
    retheme(`'rgba(52,199,89,0.12)'`).output,
    `'color-mix(in srgb, var(--system-green) 12%, transparent)'`
  )
})

test('含 canvas 关键字的行不改', () => {
  const line = `ctx.fillStyle = '#007AFF'`
  assert.equal(retheme(line).output, line)
  assert.equal(retheme(line).count, 0)
})

test('不认识的颜色不改', () => {
  const line = `color: '#123456'`
  assert.equal(retheme(line).output, line)
})

test('白色半透明边框换成细线变量', () => {
  assert.equal(
    retheme(`border: '1px solid rgba(255,255,255,0.7)'`).output,
    `border: '1px solid var(--border-subtle)'`
  )
})

test('幂等：再跑一遍不再变化', () => {
  const once = retheme(`'#34C759'`).output
  assert.equal(retheme(once).output, once)
})
