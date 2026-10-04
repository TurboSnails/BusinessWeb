import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { INVEST_GROUPS, NAV_ITEMS, findInvestEntry, isNavActive } from './siteMap'

const appSource = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8')

describe('NAV_ITEMS', () => {
  it('恰好 5 项，顺序固定', () => {
    expect(NAV_ITEMS.map(i => i.label)).toEqual([
      '首页', '正念投资', 'AI 与独立开发', '自由生活实验', '关于',
    ])
    expect(NAV_ITEMS.map(i => i.path)).toEqual(['/', '/invest', '/ai', '/life', '/about'])
  })
})

describe('INVEST_GROUPS', () => {
  const allLinks = INVEST_GROUPS.flatMap(g => g.links)

  it('收纳全部 14 个旧入口，且无重复', () => {
    const paths = allLinks.map(l => l.path).sort()
    expect(paths).toEqual([
      '/first-book', '/grid-trading', '/industry-landscape', '/investment-plan-2026',
      '/investment-strategy', '/investment-targets', '/limit-up-analysis',
      '/mainland-investment-targets', '/monitor', '/pulse', '/research-notes',
      '/sector-rotation', '/trading-philosophy', '/valuation',
    ].sort())
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('每个入口路径都在 App.tsx 路由表里', () => {
    for (const l of allLinks) {
      expect(appSource, l.path).toContain(`path="${l.path}"`)
    }
  })

  it('盯盘观察组在最后且默认折叠', () => {
    const last = INVEST_GROUPS[INVEST_GROUPS.length - 1]
    expect(last.id).toBe('watch')
    expect(last.collapsed).toBe(true)
    expect(last.links.map(l => l.path)).toEqual(['/monitor', '/limit-up-analysis', '/sector-rotation'])
  })
})

describe('findInvestEntry', () => {
  it('精确匹配', () => {
    expect(findInvestEntry('/valuation')?.group.id).toBe('tools')
  })

  it('深层路径落在父入口所在分组，最长前缀优先', () => {
    expect(findInvestEntry('/grid-trading/records/xyz')?.link.path).toBe('/grid-trading')
    expect(findInvestEntry('/research-notes/us/AAPL')?.link.path).toBe('/research-notes')
  })

  it('含编码字符的章节路径落在「读这本书」', () => {
    const e = findInvestEntry('/first-book/%E7%AC%AC1%E7%AB%A0.md')
    expect(e?.group.id).toBe('read')
    expect(e?.link.path).toBe('/first-book')
  })

  it('不按字符串前缀误判', () => {
    expect(findInvestEntry('/pulses')).toBeNull()
    expect(findInvestEntry('/nope')).toBeNull()
  })
})

describe('isNavActive', () => {
  it('首页只在根路径高亮', () => {
    expect(isNavActive('/', '/')).toBe(true)
    expect(isNavActive('/', '/invest')).toBe(false)
  })

  it('任何收纳页面都点亮「正念投资」', () => {
    expect(isNavActive('/invest', '/invest')).toBe(true)
    expect(isNavActive('/invest', '/sector-rotation')).toBe(true)
    expect(isNavActive('/invest', '/grid-trading/records/1')).toBe(true)
    expect(isNavActive('/invest', '/first-book/x.md')).toBe(true)
  })

  it('未知路径无任何高亮', () => {
    for (const item of NAV_ITEMS) {
      expect(isNavActive(item.path, '/nope')).toBe(false)
    }
  })

  it('/ai /life /about 精确或子路径高亮', () => {
    expect(isNavActive('/ai', '/ai')).toBe(true)
    expect(isNavActive('/about', '/about')).toBe(true)
    expect(isNavActive('/life', '/invest')).toBe(false)
  })
})
