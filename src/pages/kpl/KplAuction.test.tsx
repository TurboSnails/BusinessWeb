import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import KplAuction from './KplAuction'
import { auctionFixture } from '../../features/kpl-auction/fixtures'
import { asKplAuction } from '../../features/kpl-auction/model'

const renderPage = () => render(<MemoryRouter initialEntries={['/market-mood/auction']}><KplAuction /></MemoryRouter>)
const stub = (body: unknown, status = 200) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok: status === 200, status, json: async () => body })))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const seg = (group: string, name: RegExp) => within(screen.getByRole('group', { name: group })).getByRole('button', { name })
const names = (region: HTMLElement) => within(region).getAllByRole('row').slice(1).map(r => r.querySelector('th')?.textContent)

describe('开盘啦 · 竞价尾盘页', () => {
  it('总览：两市竞价金额与昨日对比、高开率、昨日涨停竞价', async () => {
    stub(auctionFixture())
    renderPage()
    const top = await screen.findByRole('region', { name: '竞价总览' })
    expect(top.textContent).toContain('111.4 亿')
    expect(top.textContent).toContain('昨 125.7 亿 −11.4%')
    expect(top.textContent).toContain('162.4 亿')
    expect(top.textContent).toContain('66.7%')
    expect(top.textContent).toContain('−0.30%')
    expect(screen.getByText(/与开盘啦官方无关/)).toBeTruthy()
  })

  it('竞价榜单：金额榜默认、切换涨幅榜 / 昨日涨停；缺失值显示「—」排最后', async () => {
    stub(auctionFixture())
    renderPage()
    const amount = await screen.findByRole('region', { name: '竞价金额榜' })
    expect(names(amount)[0]).toBe('金额王000001')
    fireEvent.click(seg('竞价榜单', /竞价涨幅榜/))
    const up = screen.getByRole('region', { name: '竞价涨幅榜' })
    expect(names(up)).toEqual(['高开甲000002', '砸盘乙000003', '金额王000001'])
    fireEvent.click(seg('竞价榜单', /昨日涨停/))
    const y = screen.getByRole('region', { name: '昨日涨停' })
    expect(within(y).getByText('昨2连板')).toBeTruthy()
    fireEvent.click(seg('竞价榜单', /今日涨停/))
    const z = screen.getByRole('region', { name: '今日涨停' })
    expect(within(z).getByText('无竞价丙').closest('tr')!.textContent).toContain('—')
  })

  it('分布切换范围；板块竞价按类型与门槛筛选', async () => {
    stub(auctionFixture())
    renderPage()
    const dist = await screen.findByRole('list', { name: '竞价涨幅分布' })
    expect(within(dist).getByText('平开')).toBeTruthy()
    fireEvent.click(seg('分布范围', /昨日涨停/))
    expect(screen.getByText(/共 2 只有竞价成交/)).toBeTruthy()
    const ind = screen.getByRole('region', { name: '行业竞价' })
    expect(names(ind)).toEqual(['半导体甲BK1036', '通信乙BK0448'])
    fireEvent.click(seg('竞价金额门槛', /≥ 1 亿/))
    expect(names(screen.getByRole('region', { name: '行业竞价' }))).toEqual(['半导体甲BK1036'])
    fireEvent.click(seg('板块类型', /概念/))
    expect(names(screen.getByRole('region', { name: '概念竞价' }))).toEqual(['概念丙BK0900'])
    fireEvent.click(seg('竞价金额门槛', /≥ 8 亿/))
    expect(screen.getByText('没有符合门槛的板块')).toBeTruthy()
  })

  it('尾盘榜：拉升 / 砸盘', async () => {
    stub(auctionFixture())
    renderPage()
    const up = await screen.findByRole('region', { name: '尾盘拉升' })
    expect(names(up)).toEqual(['高开甲000002', '金额王000001'])
    fireEvent.click(seg('尾盘榜单', /尾盘砸盘/))
    expect(names(screen.getByRole('region', { name: '尾盘砸盘' }))).toEqual(['砸盘乙000003'])
  })

  it('口径：写明跳过的 L2 字段与回补说明', async () => {
    stub(auctionFixture())
    renderPage()
    await screen.findByRole('region', { name: '竞价总览' })
    expect(screen.getByText(/竞价大单买 \/ 卖/)).toBeTruthy()
    expect(screen.getAllByText(/首次运行据此回补/).length).toBeGreaterThan(0)
  })

  it('文件缺失（404 或回退成 HTML）显示尚未生成；格式不对显示错误', async () => {
    stub({}, 404)
    renderPage()
    expect(await screen.findByText('竞价尾盘数据尚未生成')).toBeTruthy()
    cleanup(); vi.unstubAllGlobals()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('html') } })))
    renderPage()
    expect(await screen.findByText('竞价尾盘数据尚未生成')).toBeTruthy()
    cleanup(); vi.unstubAllGlobals()
    stub({ version: 1, asOf: '2026-11-17' })
    renderPage()
    expect(await screen.findByText('数据文件格式不对')).toBeTruthy()
  })

  it('校验器：市场日期须与 asOf 一致；次要字段缺失给默认值', () => {
    const f = auctionFixture()
    expect(asKplAuction({ ...f, market: { ...f.market, date: '2026-11-16' } })).toBeNull()
    const d = asKplAuction({ ...f, boards: undefined, history: 'x', groups: {} })!
    expect(d.boards).toEqual([])
    expect(d.history).toEqual([])
    expect(d.groups.top.n).toBe(0)
  })

  it('样式约束：无内联 style、无硬编码颜色', () => {
    const src = readFileSync(resolve(__dirname, 'KplAuction.tsx'), 'utf8')
    expect(src).not.toMatch(/style=\{\{/)
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/)
  })
})
