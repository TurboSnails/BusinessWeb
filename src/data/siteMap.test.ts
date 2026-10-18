import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { INVEST_GROUPS, NAV_ITEMS, SEARCHABLE_PAGES, WORKBENCH_TOOLS, findInvestEntry, findSearchablePage, isNavActive, searchPages } from './siteMap'

const appSource = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8')

describe('NAV_ITEMS', () => {
  it('包含博客与知识图谱，顺序固定', () => {
    expect(NAV_ITEMS.map(i => i.label)).toEqual([
      '首页', '投资', 'AI实验室', '博客', '知识图谱', '自由之路', '关于',
    ])
    expect(NAV_ITEMS.map(i => i.path)).toEqual(['/', '/invest', '/ai', '/blog', '/knowledge', '/life', '/about'])
  })
})

describe('AI实验室路由', () => {
  it('App.tsx 有 /ai/:slug 深链路由', () => {
    expect(appSource).toContain('path="/ai/:slug"')
  })

  it('合并后的 Skills 页面只高亮 AI实验室，且搜索入口不重复', () => {
    expect(isNavActive('/ai', '/ai/ai-skills')).toBe(true)
    expect(isNavActive('/invest', '/ai/ai-skills')).toBe(false)
    expect(SEARCHABLE_PAGES.filter(p => p.path === '/ai/ai-skills')).toHaveLength(1)
  })

  it('访问方向详情页时导航「AI实验室」高亮', () => {
    expect(isNavActive('/ai', '/ai/blog')).toBe(true)
    expect(isNavActive('/ai', '/aix')).toBe(false)
  })
})

describe('INVEST_GROUPS', () => {
  const allLinks = INVEST_GROUPS.flatMap(g => g.links)
  const paths = (id: string): string[] => INVEST_GROUPS.find(g => g.id === id)!.links.map(l => l.path)

  it('收纳全部旧入口、候选池和 AI 工具，且无重复', () => {
    const all = allLinks.map(l => l.path).sort()
    expect(all).toEqual([
      '/candidates', '/watch', '/dcf', '/first-book', '/future-trends', '/grid-trading', '/ai/ai-skills', '/invest/etf', '/industry-etf', '/notes', '/invest/bond-fund-report', '/invest/national-team', '/industry-landscape', '/investment-plan-2026',
      '/investment-strategy', '/investment-targets', '/limit-up-analysis', '/daily-analysis',
      '/mainland-investment-targets', '/monitor', '/pulse', '/research-notes',
      '/sector-rotation', '/trading-philosophy', '/valuation',
    ].sort())
    expect(new Set(all).size).toBe(all.length)
  })

  it('每个入口路径都在 App.tsx 路由表里', () => {
    for (const l of allLinks) {
      expect(appSource, l.path).toContain(l.path.startsWith('/ai/') ? 'path="/ai/:slug"' : `path="${l.path}"`)
    }
  })

  it('分组按投资流程：规则 → 观察盘 → 分析筛选 → 候选池 → 工具与参考 → 相关，已舍弃垫底', () => {
    expect(INVEST_GROUPS.map(g => g.id)).toEqual(['rules', 'watch', 'research', 'candidates', 'tools', 'related', 'archived'])
    expect(INVEST_GROUPS.slice(0, 5).map(g => g.title)).toEqual(['规则', '观察盘', '分析筛选', '候选池', '工具与参考'])
  })

  it('规则组：书和年度计划', () => {
    expect(paths('rules')).toEqual(['/first-book', '/investment-plan-2026'])
  })

  it('观察盘一页看完：/watch 是唯一主入口，宏观、全球、A股复盘、板块、涨停都是细节页', () => {
    expect(paths('watch')).toEqual(['/watch', '/monitor', '/pulse', '/daily-analysis', '/sector-rotation', '/limit-up-analysis'])
    const watch = INVEST_GROUPS.find(g => g.id === 'watch')!
    expect(watch.links.filter(l => !l.minor).map(l => l.path)).toEqual(['/watch'])
  })

  it('分析筛选从行业到公司，不放带具体买卖建议的观察池', () => {
    expect(paths('research')).toEqual(['/industry-landscape', '/future-trends', '/research-notes', '/invest/national-team'])
    expect(INVEST_GROUPS.find(g => g.id === 'research')!.links.find(l => l.path === '/future-trends')!.label).toBe('主题研究')
  })

  it('候选池独立一组；工具与参考放三件工具和 ETF 流派地图；AI Skills 在「相关」', () => {
    expect(paths('candidates')).toEqual(['/candidates'])
    expect(paths('tools')).toEqual(['/valuation', '/dcf', '/grid-trading', '/invest/etf', '/industry-etf', '/notes', '/invest/bond-fund-report'])
    const related = INVEST_GROUPS.find(g => g.id === 'related')!
    expect(related.links.map(l => [l.path, l.label])).toEqual([['/ai/ai-skills', 'AI 投研 Skills']])
  })

  it('栏目页上的每个入口都有 14 字以内的短说明', () => {
    for (const g of INVEST_GROUPS.filter(g => ['rules', 'watch', 'research', 'candidates', 'tools'].includes(g.id))) {
      for (const l of g.links) {
        expect(l.short, l.path).toBeTruthy()
        expect(l.short!.length, `${l.path}: ${l.short}`).toBeLessThanOrEqual(14)
      }
    }
  })

  it('道与术、综合投资策略框架标为舍弃：折叠在最后，每页都带舍弃说明', () => {
    const archived = INVEST_GROUPS[INVEST_GROUPS.length - 1]
    expect(archived.id).toBe('archived')
    expect(archived.collapsed).toBe(true)
    expect(archived.links.map(l => l.path)).toEqual(['/trading-philosophy', '/investment-strategy', '/mainland-investment-targets', '/investment-targets'])
    for (const l of archived.links) expect(l.archived, l.path).toMatch(/^已舍弃/)
    const elsewhere = INVEST_GROUPS.filter(g => g.id !== 'archived').flatMap(g => g.links)
    expect(elsewhere.some(l => l.archived)).toBe(false)
  })
})

describe('findInvestEntry', () => {
  it('精确匹配', () => {
    expect(findInvestEntry('/valuation')?.group.id).toBe('tools')
    expect(findInvestEntry('/candidates')?.group.id).toBe('candidates')
  })

  it('深层路径落在父入口所在分组，最长前缀优先', () => {
    expect(findInvestEntry('/grid-trading/records/xyz')?.link.path).toBe('/grid-trading')
    expect(findInvestEntry('/research-notes/us/AAPL')?.link.path).toBe('/research-notes')
  })

  it('含编码字符的章节路径落在「规则」', () => {
    const e = findInvestEntry('/first-book/%E7%AC%AC1%E7%AB%A0.md')
    expect(e?.group.id).toBe('rules')
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

  it('任何收纳页面都点亮「投资」', () => {
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

describe('SEARCHABLE_PAGES', () => {
  it('路径不重复，且都能在 App.tsx 的路由里找到', () => {
    const paths = SEARCHABLE_PAGES.map(p => p.path)
    expect(new Set(paths).size).toBe(paths.length)
    for (const p of SEARCHABLE_PAGES) {
      const routePath = p.path.startsWith('/ai/') && p.path !== '/ai/fullstack-roadmap' ? '/ai/:slug' : p.path
      expect(appSource, p.path).toContain(`path="${routePath}"`)
    }
  })
  it('包含一级栏目、投资分组全部链接、AI 方向页与补充页', () => {
    const paths = SEARCHABLE_PAGES.map(p => p.path)
    for (const p of ['/', '/invest', '/knowledge', '/dcf', '/candidates', '/grid-trading/records', '/ai/blog', '/ai/fullstack-roadmap', '/first-book/slow-is-fast']) expect(paths).toContain(p)
  })
  it('已舍弃页面带 archived 标记', () => {
    expect(SEARCHABLE_PAGES.find(p => p.path === '/trading-philosophy')?.archived).toBe(true)
  })
})

describe('WORKBENCH_TOOLS', () => {
  it('8 个常用工具，候选池打头，顺序固定，都在注册表里且有说明', () => {
    expect(WORKBENCH_TOOLS.map(t => t.path)).toEqual([
      '/candidates', '/research-notes', '/valuation', '/dcf', '/grid-trading', '/watch', '/knowledge', '/first-book',
    ])
    for (const t of WORKBENCH_TOOLS) {
      expect(findSearchablePage(t.path), t.path).toBeTruthy()
      expect(t.desc.length, t.path).toBeGreaterThan(0)
    }
  })
})

describe('searchPages', () => {
  const pages = [
    { path: '/a', label: '网格交易', group: '投资' },
    { path: '/b', label: '网格记录', group: '投资' },
    { path: '/c', label: '公司估值', group: '投资', desc: '含网格说明' },
    { path: '/d', label: '旧网格', group: '已舍弃', archived: true },
    { path: '/dcf', label: 'DCF', group: '投资' },
  ]
  it('空查询返回全部，已舍弃排最后', () => {
    expect(searchPages('', pages).map(p => p.path)).toEqual(['/a', '/b', '/c', '/dcf', '/d'])
  })
  it('label 开头 > label 包含 > 其他字段，已舍弃最后', () => {
    expect(searchPages('网格', pages).map(p => p.path)).toEqual(['/a', '/b', '/c', '/d'])
  })
  it('多词全部命中才算，不区分大小写', () => {
    expect(searchPages('dcf 投资', pages).map(p => p.path)).toEqual(['/dcf'])
    expect(searchPages('网格 记录', pages).map(p => p.path)).toEqual(['/b'])
  })
  it('无匹配返回空数组', () => {
    expect(searchPages('不存在的词', pages)).toEqual([])
  })
})
