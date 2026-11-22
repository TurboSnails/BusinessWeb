import { describe, expect, it } from 'vitest'
import { MACRO_MASTER_NAMES, resolveSeo } from './seo'
import type { BlogEntry } from '../features/blog/catalog'
import { MASTERS } from '../features/macro-masters/masters'

const post: BlogEntry = { slug: 'slow-investing', title: '慢投资笔记', summary: '关于长期投资的实践', category: '投资', tags: [], publishedAt: '2026-10-13', file: 'src/content/blog/posts/slow-investing.md', status: 'published' }

describe('宏观大师页 SEO', () => {
  it('总览与大师详情页有独立标题', () => {
    expect(resolveSeo('/invest/macro-masters')).toMatchObject({
      known: true,
      title: '宏观大师怎么看周期｜当前位置与九位的方法',
    })
    expect(resolveSeo('/invest/macro-masters/druckenmiller')).toMatchObject({
      known: true,
      title: '斯坦利·德鲁肯米勒怎么看周期｜宏观大师',
    })
  })

  it('SEO 中文名表与九位大师的 slug、名字逐一相同', () => {
    expect(Object.entries(MACRO_MASTER_NAMES).sort(([a], [b]) => a.localeCompare(b))).toEqual(
      MASTERS.map(master => [master.slug, master.name]).sort(([a], [b]) => a.localeCompare(b)),
    )
  })

  it('未知大师 slug 仍走页面不存在', () => {
    expect(resolveSeo('/invest/macro-masters/unknown')).toMatchObject({
      known: false,
      title: '页面不存在',
      noindex: true,
    })
  })
})

describe('blog route SEO', () => {
  it('个股页有独立 SEO 与有效路由', () => {
    expect(resolveSeo('/market-mood/stock')).toMatchObject({ known: true, title: '开盘啦 · 个股' })
  })
  it('recognizes the blog index', () => {
    expect(resolveSeo('/blog').known).toBe(true)
    expect(resolveSeo('/blog').noindex).toBeFalsy()
  })
  it('uses public article metadata', () => {
    expect(resolveSeo('/blog/slow-investing', [post])).toMatchObject({ known: true, title: '慢投资笔记｜博客', description: '关于长期投资的实践' })
  })
  it('does not index drafts or unknown article paths', () => {
    expect(resolveSeo('/blog/slow-investing', [{ ...post, status: 'draft' }])).toMatchObject({ known: false, noindex: true })
    expect(resolveSeo('/blog/unknown', [post])).toMatchObject({ known: false, noindex: true })
  })
  it('ETF 清单页有独立标题而不是「页面不存在」', () => {
    expect(resolveSeo('/industry-etf')).toMatchObject({ known: true, title: 'ETF 与债券基金清单' })
  })
  it('今天几星新增页签有 SEO', () => {
    expect(resolveSeo('/jixing/table')).toMatchObject({ known: true, title: '今天几星 · 估值表' })
    expect(resolveSeo('/jixing/threshold')).toMatchObject({ known: true, title: '今天几星 · 阀值表' })
    expect(resolveSeo('/jixing/map')).toMatchObject({ known: true, title: '今天几星 · 指数地图' })
    expect(resolveSeo('/jixing/daily')).toMatchObject({ known: true, title: '今天几星 · 指数日报' })
  })
})

