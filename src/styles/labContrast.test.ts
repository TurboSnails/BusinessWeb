import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(__dirname, 'shell.css'), 'utf8')
const uiCss = readFileSync(resolve(__dirname, 'ui.css'), 'utf8')
const rule = (selector: string, source = css): string => {
  const i = source.indexOf(selector + ' {')
  expect(i, selector).toBeGreaterThan(-1)
  return source.slice(i, source.indexOf('}', i))
}

describe('AI 实验室徽章对比度', () => {
  it('可以试 / 实验 徽章文字不用陶土色（对 #FFFDF8 仅 3.3:1），只用它描边', () => {
    const r = rule('.lab-badge--try,\n.lab-badge--experiment')
    expect(r).toContain('color: var(--text-primary)')
    expect(r).toContain('border-color: var(--accent-warm)')
  })

  it('不推荐卡片不再降低不透明度', () => {
    expect(css).not.toMatch(/\.lab-card--avoid\s*\{[^}]*opacity/)
  })
})

describe('导航三层选中态', () => {
  it('页面级导航仍是唯一实心绿选中态', () => {
    const r = rule('.section-tabs__link.is-active')
    expect(r).toContain('background: var(--accent)')
    expect(r).toContain('color: #fff')
  })

  it('seg 选中态为浅底深字，不是实心绿', () => {
    const r = rule('.seg__btn.is-active')
    expect(r).toContain('background: var(--accent-soft)')
    expect(r).toContain('color: var(--accent-ink)')
    expect(r).toContain('font-weight: 600')
    expect(r).not.toContain('color: #fff')
  })

  it('chip 选中态为浅底深字', () => {
    const r = rule(".ui-chip.is-active,\n.ui-chip[aria-pressed='true']", uiCss)
    expect(r).toContain('background: var(--accent-soft)')
    expect(r).toContain('color: var(--accent-ink)')
    expect(r).toContain('font-weight: 600')
  })

  it('横向滚动容器用 mask 做溢出提示', () => {
    expect(css).toMatch(/\.section-tabs\[data-overflow-start\]\[data-overflow-end\]/)
    expect(css).toMatch(/\.page-tabs__inner\[data-overflow-start\]\[data-overflow-end\]/)
    expect(css).toMatch(/mask-image:\s*linear-gradient/)
  })
})

