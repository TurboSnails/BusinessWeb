import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import KplReview from './KplReview'
import { reviewFixture } from '../../features/kpl-review/fixtures'
import { asKplReview } from '../../features/kpl-review/model'

const renderPage = () => render(<MemoryRouter initialEntries={['/market-mood/review']}><KplReview /></MemoryRouter>)
const stub = (body: unknown, status = 200, bad = false) => vi.stubGlobal('fetch', vi.fn(async () => ({
  ok: status === 200, status, json: async () => { if (bad) throw new SyntaxError('html'); return body },
})))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('开盘啦 · 复盘页', () => {
  it('图解复盘：关键数字与跳转其他页签', async () => {
    stub(reviewFixture())
    renderPage()
    const top = await screen.findByRole('list', { name: '复盘总览' })
    expect(top.textContent).toContain('64.9%')
    expect(top.textContent).toContain('4 / 25')
    expect(top.textContent).toContain('当日新增 17')
    expect(top.textContent).toContain('−1.52%')
    expect(within(top).getByRole('link', { name: '涨停' }).getAttribute('href')).toBe('/market-mood/daban')
    expect(screen.getByRole('link', { name: '龙虎榜' })).toBeTruthy()
    expect(screen.getByText(/与开盘啦官方无关/)).toBeTruthy()
  })

  it('赚钱效应：开盘分布七档与高开 / 平开 / 低开；走势可切换', async () => {
    stub(reviewFixture())
    renderPage()
    const dist = await screen.findByRole('list', { name: '开盘涨跌幅分布' })
    expect(within(dist).getAllByRole('listitem')).toHaveLength(7)
    expect(screen.getByText('剔除昨日一字 5')).toBeTruthy()
    const seg = screen.getByRole('group', { name: '赚钱效应走势' })
    fireEvent.click(within(seg).getByRole('button', { name: '首板→二板' }))
    expect(screen.getByRole('img', { name: '首板→二板走势' })).toBeTruthy()
  })

  it('盘面亮点：标签切换、定义、缺失字段显示「—」；次日表现为历史统计', async () => {
    stub(reviewFixture())
    renderPage()
    expect(await screen.findByText(/一字板/, { selector: 'b' })).toBeTruthy()
    const seg = screen.getByRole('group', { name: '盘面亮点标签' })
    fireEvent.click(within(seg).getByRole('button', { name: /^大面/ }))
    const table = screen.getByRole('region', { name: '大面个股' })
    expect(within(table).getByText('大面丙')).toBeTruthy()
    expect(within(table).getByText('缺丁').closest('tr')!.textContent).toContain('—')
    fireEvent.click(within(seg).getByRole('button', { name: /^地天板/ }))
    expect(screen.getByText('今日没有符合该标签的股票')).toBeTruthy()
    const stats = screen.getByRole('region', { name: '标签次日表现' })
    expect(within(stats).getByText('+3.21%')).toBeTruthy()
    expect(screen.getByText(/2026-11-13 至 2026-11-16 共 3 个交易日/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/建议买入|建议卖出|买点|卖点|胜率/)
  })

  it('百日新高：按行业分组、新增标记；快照仓未补齐时提示进度', async () => {
    stub(reviewFixture())
    renderPage()
    const groups = await screen.findByRole('list', { name: '百日新高按行业' })
    expect(within(groups).getByText('半导体')).toBeTruthy()
    expect(within(groups).getAllByText('新增')).toHaveLength(2)
    cleanup()
    const f = reviewFixture() as Record<string, unknown>
    stub({ ...f, newHigh: null, closes: { days: 122, from: null, to: null, complete: false, done: 1500, universe: 5930, failed: 3, end: '2026-11-17' } })
    renderPage()
    expect(await screen.findByText(/已补 1500 \/ 5930 只股票/)).toBeTruthy()
    expect(screen.getByText(/补齐后显示百日新高/)).toBeTruthy()
  })

  it('盘中曲线：可切换并写明是近似还原', async () => {
    stub(reviewFixture())
    renderPage()
    const seg = await screen.findByRole('group', { name: '盘中家数' })
    fireEvent.click(within(seg).getByRole('button', { name: '跌停' }))
    expect(screen.getByRole('img', { name: '盘中跌停累计家数' })).toBeTruthy()
    expect(screen.getByText(/按股池时间还原的近似/)).toBeTruthy()
  })

  it('数据文件不存在 / 回退成 HTML 时显示尚未生成；格式不对时提示', async () => {
    stub(null, 404)
    renderPage()
    expect(await screen.findByText('复盘数据尚未生成')).toBeTruthy()
    cleanup()
    stub(null, 200, true)
    renderPage()
    expect(await screen.findByText('复盘数据尚未生成')).toBeTruthy()
    cleanup()
    stub({ version: 2 })
    renderPage()
    expect(await screen.findByText('数据文件格式不对')).toBeTruthy()
  })
})

describe('数据模型', () => {
  it('次要部分缺失按空处理；关键字段缺失返回 null', () => {
    const f = reviewFixture() as Record<string, unknown>
    delete f.history
    delete f.openDist
    delete f.newHigh
    const m = asKplReview(f)!
    expect(m.history).toEqual([])
    expect(m.openDist).toBeNull()
    expect(m.newHigh).toBeNull()
    expect(asKplReview({ ...reviewFixture(), summary: null })).toBeNull()
    expect(asKplReview({ ...reviewFixture(), tags: [{ id: 'x', label: 'x', stocks: [{ code: 1 }] }] })).toBeNull()
  })

  it('样式约束：页面里没有内联样式和硬编码颜色', () => {
    const src = readFileSync(resolve(__dirname, 'KplReview.tsx'), 'utf8')
    expect(src).not.toMatch(/style=\{\{/)
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgba?\(/)
  })
})
