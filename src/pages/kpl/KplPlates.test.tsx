import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import KplPlates from './KplPlates'
import { platesFixture } from '../../features/kpl-plates/fixtures'
import { asKplPlates, sortBoards } from '../../features/kpl-plates/model'

const renderPage = () => render(<MemoryRouter initialEntries={['/market-mood/plates']}><KplPlates /></MemoryRouter>)
const stub = (body: unknown, { status = 200, type = 'application/json' } = {}) => vi.stubGlobal('fetch', vi.fn(async () => ({
  ok: status < 400, status, headers: { get: () => type }, json: async () => body,
})))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('开盘啦 · 板块题材页', () => {
  it('今日概览：涨停家数、上涨板块、最强行业与概念', async () => {
    stub(platesFixture())
    renderPage()
    const top = await screen.findByRole('region', { name: '今日概览' })
    expect(top.textContent).toContain('37 家')
    expect(top.textContent).toContain('2 / 3')
    expect(top.textContent).toContain('电子化学品Ⅱ')
    expect(top.textContent).toContain('光刻机')
    expect(screen.getByText(/与开盘啦官方无关/)).toBeTruthy()
    expect(within(screen.getByRole('tablist', { name: '开盘啦页签' })).getByRole('tab', { name: '板块题材' }).getAttribute('aria-selected')).toBe('true')
  })

  it('板块排行：默认按强度，缺失值显示 — 并排最后；可切换概念与排序', async () => {
    stub(platesFixture())
    renderPage()
    const table = await screen.findByRole('table')
    const names = () => within(screen.getByRole('table')).getAllByRole('row').slice(1).map(r => r.querySelector('.kp-name')?.textContent)
    expect(names()).toEqual(['电子化学品Ⅱ', '贵金属', '综合Ⅱ'])
    const last = within(table).getAllByRole('row').at(-1)!
    expect(last.textContent).toContain('—')
    expect(last.textContent).not.toContain('0.00%')
    fireEvent.click(within(screen.getByRole('group', { name: '排序指标' })).getByText('涨幅'))
    expect(names()).toEqual(['贵金属', '电子化学品Ⅱ', '综合Ⅱ'])
    fireEvent.click(within(screen.getByRole('group', { name: '板块类型' })).getByText('概念'))
    fireEvent.click(within(screen.getByRole('group', { name: '排序指标' })).getByText('涨停数'))
    expect(names()).toEqual(['央国企改革', '光刻机'])
    expect(screen.getByText(/板块强度（0–100）/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/建议买入|建议卖出|推荐买/)
  })

  it('题材涨停分布：按连板梯队分行，可切换行业分组', async () => {
    stub(platesFixture())
    renderPage()
    const g = await screen.findByRole('article', { name: '央国企改革 涨停 11 家' })
    expect(within(g).getByText('3 板')).toBeTruthy()
    expect(within(g).getByText('亚泰集团')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('group', { name: '分组方式' })).getByText('行业'))
    const ind = screen.getByRole('article', { name: '电子化学品Ⅱ 涨停 3 家' })
    expect(within(ind).getByText('首板')).toBeTruthy()
    expect(within(ind).getByText('西陇科学').getAttribute('title')).toBe('首次封板 09:35')
  })

  it('板块走势与近几日强势板块；补算说明', async () => {
    stub(platesFixture())
    renderPage()
    expect(await screen.findByRole('img', { name: '电子化学品Ⅱ板块指数走势' })).toBeTruthy()
    expect(screen.getByText('−5.75%')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('group', { name: '走势指标' })).getByText('涨停家数'))
    expect(screen.getByRole('img', { name: '电子化学品Ⅱ涨停家数走势' })).toBeTruthy()
    fireEvent.click(within(screen.getByRole('group', { name: '走势板块类型' })).getByText('概念'))
    expect((screen.getByRole('combobox', { name: '选择板块' }) as HTMLSelectElement).value).toBe('BK1001')
    expect(screen.getByText(/所属行业 \/ 概念按现在的分类回填/)).toBeTruthy()
    expect(screen.getByText(/互动精灵/)).toBeTruthy()
  })

  it('数据文件还没生成时显示空状态；格式不对时提示', async () => {
    stub(null, { status: 404 })
    renderPage()
    expect(await screen.findByText('板块题材数据尚未生成')).toBeTruthy()
    cleanup()
    stub('<html>', { type: 'text/html' })
    renderPage()
    expect(await screen.findByText('板块题材数据尚未生成')).toBeTruthy()
    cleanup()
    stub({ version: 2 })
    renderPage()
    expect(await screen.findByText('数据文件格式不对')).toBeTruthy()
  })
})

describe('数据模型', () => {
  it('校验关键字段；缺失值排序在最后', () => {
    expect(asKplPlates(platesFixture())).not.toBeNull()
    expect(asKplPlates({ ...platesFixture(), industry: [] })).toBeNull()
    expect(asKplPlates({ ...platesFixture(), groups: { industry: [] } })).toBeNull()
    expect(asKplPlates({ ...platesFixture(), trend: undefined })!.trend).toEqual([])
    const m = asKplPlates(platesFixture())!
    expect(sortBoards(m.industry, 'mainNet').map(b => b.code)).toEqual(['BK0001', 'BK0002', 'BK0003'])
  })
})
