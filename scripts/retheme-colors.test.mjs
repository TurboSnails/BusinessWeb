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

test('Tailwind 灰蓝文字与边框按语义映射', () => {
  const { output } = retheme(`color: '#1e293b', border: '1px solid #e2e8f0', background: '#f8fafc'`)
  assert.equal(output, `color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)'`)
})

test('Tailwind 蓝绿红琥珀：浅底、主色、深字各归其位', () => {
  assert.equal(retheme(`'#eff6ff'`).output, `'var(--accent-soft)'`)
  assert.equal(retheme(`'#3b82f6'`).output, `'var(--accent)'`)
  assert.equal(retheme(`'#1e40af'`).output, `'var(--accent-ink)'`)
  assert.equal(retheme(`'#f0fdf4'`).output, `'var(--system-green-light)'`)
  assert.equal(retheme(`'#16a34a'`).output, `'var(--down)'`)
  assert.equal(retheme(`'#166534'`).output, `'var(--down-ink)'`)
  assert.equal(retheme(`'#fef2f2'`).output, `'var(--system-red-light)'`)
  assert.equal(retheme(`'#dc2626'`).output, `'var(--up)'`)
  assert.equal(retheme(`'#991b1b'`).output, `'var(--up-ink)'`)
  assert.equal(retheme(`'#fef3c7'`).output, `'var(--accent-warm-soft)'`)
  assert.equal(retheme(`'#f59e0b'`).output, `'var(--accent-warm)'`)
  assert.equal(retheme(`'#92400e'`).output, `'var(--warm-ink)'`)
})

test('同色系成对的浅色渐变压平成纯色', () => {
  assert.equal(
    retheme(`background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)'`).output,
    `background: 'var(--system-green-light)'`
  )
  assert.equal(
    retheme(`background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)'`).output,
    `background: 'var(--up)'`
  )
})

test('三段渐变也压平成第一色', () => {
  assert.equal(
    retheme(`background: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 50%, #93c5fd 100%)'`).output,
    `background: 'var(--accent)'`
  )
})
