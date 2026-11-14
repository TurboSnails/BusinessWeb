// 入口页的发现入口：只允许白名单内的改动（首页书籍区、投资页页头各一个文字链接；EXTRA_PAGES、SEO、sitemap 各一条）。
import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import Home from '../../pages/Home'
import InvestHub from '../../pages/InvestHub'
import { INVEST_GROUPS, NAV_ITEMS, SEARCHABLE_PAGES, searchPages } from '../../data/siteMap'
import { resolveSeo } from '../../utils/seo'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe('/invest/start 的入口', () => {
  it('首页书籍区有「不懂投资？从这里开始」', () => {
    render(<MemoryRouter><Home /></MemoryRouter>)
    const band = screen.getByRole('region', { name: '《正念投资》' })
    expect(within(band).getByRole('link', { name: /不懂投资？从这里开始/ }).getAttribute('href')).toBe('/invest/start')
  })

  it('投资页页头有「第一次来？从这里开始 →」', () => {
    render(<MemoryRouter><InvestHub /></MemoryRouter>)
    const head = screen.getByRole('heading', { level: 1, name: '投资' }).closest('header')!
    expect(within(head).getByRole('link', { name: '第一次来？从这里开始 →' }).getAttribute('href')).toBe('/invest/start')
  })

  it('进 ⌘K 搜索（开始 / 新手 / 入门 / 定投都能找到），但不进 INVEST_GROUPS 与导航', () => {
    expect(SEARCHABLE_PAGES.filter(p => p.path === '/invest/start')).toHaveLength(1)
    for (const q of ['开始', '新手', '入门', '定投']) expect(searchPages(q).map(p => p.path)).toContain('/invest/start')
    expect(INVEST_GROUPS.flatMap(g => g.links).some(l => l.path === '/invest/start')).toBe(false)
    expect(NAV_ITEMS.some(i => i.path === '/invest/start')).toBe(false)
  })

  it('有专属 SEO 标题与描述，进 sitemap', () => {
    const seo = resolveSeo('/invest/start')
    expect(seo.title).toContain('从这里开始')
    expect(seo.description).toContain('不构成投资建议')
    const sitemap = readFileSync(resolve(__dirname, '../../../scripts/generate-sitemap.mjs'), 'utf8')
    expect(sitemap).toContain("'/invest/start'")
  })

  it('路由懒加载', () => {
    const app = readFileSync(resolve(__dirname, '../../App.tsx'), 'utf8')
    expect(app).toContain("const StartHere = lazy(() => import('./pages/StartHere'))")
    expect(app).toContain('<Route path="/invest/start" element={<StartHere />} />')
  })
})
