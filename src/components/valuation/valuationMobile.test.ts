import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(__dirname, 'valuation.css'), 'utf8')

/** 取某个媒体查询块的内容 */
const mediaBlock = (query: string): string => {
  const start = css.indexOf(`@media (${query})`)
  if (start < 0) return ''
  let depth = 0
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++
    if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1)
  }
  return ''
}

describe('估值表单的手机适配', () => {
  it('≤850px 用均分两列，公司输入框独占一整行', () => {
    const b = mediaBlock('max-width: 850px')
    expect(b).toMatch(/\.valuation-form-grid\s*\{[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/)
    expect(b).toMatch(/\.valuation-company-input\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/)
  })

  it('≤600px 表单改为单列，子项占满宽度', () => {
    const b = mediaBlock('max-width: 600px')
    expect(b).toMatch(/\.valuation-form-grid\s*\{[^}]*grid-template-columns:\s*1fr/)
    expect(b).toMatch(/\.valuation-form-grid\s*>\s*\*\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/)
  })

  it('≤600px 按钮与输入框高度不小于 44px', () => {
    const b = mediaBlock('max-width: 600px')
    expect(b).toMatch(/min-height:\s*44px/)
  })
})
