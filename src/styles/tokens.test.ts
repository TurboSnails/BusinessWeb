import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8')
const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8')

const TOKENS: Record<string, string> = {
  '--bg-primary': '#FAF6EE',
  '--bg-card': '#FFFDF8',
  '--text-primary': '#3A3A34',
  '--text-secondary': '#6B675C',
  '--accent': '#5B7B65',
  '--accent-warm': '#C9794F',
  '--border-subtle': '#E6DFD0',
  '--up': '#C4503F',
  '--down': '#3F9A62',
}

describe('设计变量', () => {
  for (const [name, value] of Object.entries(TOKENS)) {
    it(`${name} = ${value}`, () => {
      const re = new RegExp(`${name}\\s*:\\s*${value}`, 'i')
      expect(css).toMatch(re)
    })
  }

  it('旧变量 --system-blue 映射到主色，老页面自动换肤', () => {
    expect(css).toMatch(/--system-blue\s*:\s*var\(--accent\)/)
  })

  it('不再使用玻璃拟态 backdrop-filter', () => {
    expect(css).not.toMatch(/backdrop-filter\s*:\s*blur/)
  })

  it('index.html 为Live并启用 viewport-fit=cover', () => {
    expect(html).toContain('<title>Live')
    expect(html).toContain('viewport-fit=cover')
  })
})
