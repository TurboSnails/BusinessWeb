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

test('翠绿、天蓝、紫、橙与 Bootstrap 提示色也归入纸书色板', () => {
  const cases = {
    '#059669': 'var(--down)', '#28a745': 'var(--down)',
    '#86efac': 'var(--system-green-light)', '#d1fae5': 'var(--system-green-light)', '#d4edda': 'var(--system-green-light)',
    '#155724': 'var(--down-ink)',
    '#0369a1': 'var(--accent-ink)', '#0c4a6e': 'var(--accent-ink)',
    '#e0f2fe': 'var(--accent-soft)', '#7dd3fc': 'var(--accent)',
    '#7c3aed': 'var(--system-purple)', '#9333ea': 'var(--system-purple)', '#4f46e5': 'var(--accent)',
    '#e9d5ff': 'var(--bg-secondary)', '#f3e8ff': 'var(--bg-secondary)', '#fafafa': 'var(--bg-secondary)',
    '#fff7ed': 'var(--accent-warm-soft)', '#fed7aa': 'var(--accent-warm-soft)', '#fff3cd': 'var(--accent-warm-soft)',
    '#fcd34d': 'var(--accent-warm)', '#ffc107': 'var(--accent-warm)',
    '#d97706': 'var(--warm-ink)', '#856404': 'var(--warm-ink)',
    '#dc3545': 'var(--up)', '#f8d7da': 'var(--system-red-light)', '#721c24': 'var(--up-ink)',
  }
  for (const [hex, want] of Object.entries(cases)) {
    assert.equal(retheme(`'${hex}'`).output, `'${want}'`, hex)
  }
})

import { classifyHex } from './retheme-colors.mjs'

test('classifyHex：灰蓝（低饱和）按明度当中性色', () => {
  assert.equal(classifyHex('#667489'), 'var(--text-secondary)')
  assert.equal(classifyHex('#798393'), 'var(--text-tertiary)')
  assert.equal(classifyHex('#b9c7d9'), 'var(--system-gray3)')
  assert.equal(classifyHex('#172236'), 'var(--text-primary)')
})

test('classifyHex：真蓝按明度归主色家族', () => {
  assert.equal(classifyHex('#1769d2'), 'var(--accent)')
  assert.equal(classifyHex('#498de7'), 'var(--accent)')
  assert.equal(classifyHex('#25466e'), 'var(--accent-ink)')
  assert.equal(classifyHex('#f2f8ff'), 'var(--accent-soft)')
})

test('classifyHex：红绿橙各归各位', () => {
  assert.equal(classifyHex('#d44343'), 'var(--up)')
  assert.equal(classifyHex('#fff0f0'), 'var(--system-red-light)')
  assert.equal(classifyHex('#b74646'), 'var(--up)')
  assert.equal(classifyHex('#16845b'), 'var(--down)')
  assert.equal(classifyHex('#e6f6ed'), 'var(--system-green-light)')
  assert.equal(classifyHex('#fff7e8'), 'var(--accent-warm-soft)')
  assert.equal(classifyHex('#856126'), 'var(--warm-ink)')
})

test('classifyHex：纯白和近白保持不变', () => {
  assert.equal(classifyHex('#ffffff'), null)
  assert.equal(classifyHex('#fefefe'), null)
})

test('generic 模式处理未映射的颜色，默认模式不动', () => {
  assert.equal(retheme(`color: #1769d2;`).output, `color: #1769d2;`)
  assert.equal(retheme(`color: #1769d2;`, { generic: true }).output, `color: var(--accent);`)
})

test('generic 模式幂等且不碰 canvas 行', () => {
  const once = retheme(`color: #1769d2;`, { generic: true }).output
  assert.equal(retheme(once, { generic: true }).output, once)
  assert.equal(retheme(`ctx.fillStyle = '#1769d2'`, { generic: true }).output, `ctx.fillStyle = '#1769d2'`)
})
