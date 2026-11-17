import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import KplRank from './KplRank'
import { rankFixture } from '../../features/kpl-rank/fixtures'
import { asKplRank } from '../../features/kpl-rank/model'

const renderPage = () => render(<MemoryRouter initialEntries={['/market-mood/rank']}><KplRank /></MemoryRouter>)
const stub = (body: unknown, ok = true) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok, status: ok ? 200 : 404, json: async () => body })))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('开盘啦 · 人气排行页', () => {
  it('页签选中人气排行；人气榜写明东财口径，显示排名变化、连续上榜与标签，缺失显示 —', async () => {
    stub(rankFixture())
    renderPage()
    const t = await screen.findByRole('region', { name: '人气前 100' })
    const tabs = screen.getByRole('tablist', { name: '开盘啦页签' })
    expect(within(tabs).getByRole('tab', { name: '人气排行' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText(/与开盘啦官方无关/)).toBeTruthy()
    expect(document.body.textContent).toContain('不是开盘啦人气值')
    const rows = within(t).getAllByRole('row')
    expect(rows[1].textContent).toContain('人气甲')
    expect(rows[1].textContent).toContain('连续上榜')
    expect(rows[1].textContent).toContain('8 天')
    expect(rows[2].textContent).toContain('+1518')
    expect(rows[2].textContent).toContain('人气激增')
    expect(rows[3].textContent).toContain('—')
    fireEvent.click(within(screen.getByRole('group', { name: '人气榜视图' })).getByText('飙升榜'))
    expect(screen.getByRole('region', { name: '人气飙升榜' }).textContent).toContain('+2000')
    expect(document.body.textContent).not.toMatch(/建议买入|建议卖出/)
  })

  it('个股区间：切换天数与榜单类型，主力净额榜显示净流入天数', async () => {
    stub(rankFixture())
    renderPage()
    expect((await screen.findByRole('region', { name: '5 日涨幅榜' })).textContent).toContain('+46.40%')
    fireEvent.click(within(screen.getByRole('group', { name: '区间天数' })).getByText('20 日'))
    expect(screen.getByRole('region', { name: '20 日涨幅榜' }).textContent).toContain('二十日涨')
    fireEvent.click(within(screen.getByRole('group', { name: '区间榜类型' })).getByText('跌幅榜'))
    expect(screen.getByText('暂无')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('group', { name: '区间榜类型' })).getByText('主力净流入'))
    // 净额榜没有 20 日，回到 5 日
    const net = screen.getByRole('region', { name: '5 日主力净流入' })
    expect(net.textContent).toContain('+22.00 亿')
    expect(net.textContent).toContain('4/5')
  })

  it('板块区间：行业按区间涨幅排序、领涨次数与每日领涨；切换地区与排序方向', async () => {
    stub(rankFixture())
    renderPage()
    const t = await screen.findByRole('region', { name: '行业板块区间排行' })
    const rows = within(t).getAllByRole('row')
    expect(rows[1].textContent).toContain('行业甲')
    expect(rows[1].textContent).toContain('2')
    expect(screen.getByRole('region', { name: '行业每日领涨板块' }).textContent).toContain('11/17')
    fireEvent.click(within(screen.getByRole('group', { name: '板块类型' })).getByText('地区'))
    const r = screen.getByRole('region', { name: '地区板块区间排行' })
    expect(within(r).getAllByRole('row')[1].textContent).toContain('内蒙古')
    fireEvent.click(screen.getByRole('button', { name: '从高到低' }))
    expect(within(screen.getByRole('region', { name: '地区板块区间排行' })).getAllByRole('row')[1].textContent).toContain('辽宁板块')
    expect(screen.queryByRole('region', { name: '地区每日领涨板块' })).toBeNull()
    fireEvent.click(within(screen.getByRole('group', { name: '板块类型' })).getByText('概念'))
    expect(screen.getByText(/这次不统计领涨次数与每日领涨/)).toBeTruthy()
    expect(screen.queryByRole('region', { name: '概念每日领涨板块' })).toBeNull()
  })

  it('机构多日榜：窗口与方向切换，缺失日期有提示', async () => {
    stub(rankFixture())
    renderPage()
    await screen.findByRole('region', { name: '人气前 100' })
    fireEvent.click(within(screen.getByRole('group', { name: '机构统计天数' })).getByText('3 日'))
    const t = screen.getByRole('region', { name: '近 3 日机构净买入排行' })
    expect(t.textContent).toContain('机构甲')
    expect(t.textContent).toContain('+1.71 亿')
    fireEvent.click(within(screen.getByRole('group', { name: '机构方向' })).getByText('净卖出'))
    expect(screen.getByRole('region', { name: '近 3 日机构净卖出排行' }).textContent).toContain('−3.00 亿')
    fireEvent.click(within(screen.getByRole('group', { name: '机构统计天数' })).getByText('20 日'))
    expect(screen.getByText(/缺少 10\/22 的龙虎榜明细/)).toBeTruthy()
    expect(screen.getByText(/明细不全，不统计/)).toBeTruthy()
    expect(screen.queryByRole('region', { name: '近 20 日机构净卖出排行' })).toBeNull()
    expect(screen.queryByText(/近 20 日没有机构/)).toBeNull()
  })

  it('某部分缺失时该卡片显示空状态，其余照常', async () => {
    stub({ ...rankFixture(), popularity: null, stockRange: null })
    renderPage()
    expect(await screen.findByText('人气榜暂无数据')).toBeTruthy()
    expect(screen.getByText('个股区间排行暂无数据')).toBeTruthy()
    expect(screen.getByRole('region', { name: '行业板块区间排行' })).toBeTruthy()
  })

  it('文件不存在或返回 HTML 时显示暂无数据；结构不对时提示格式错误', async () => {
    stub({}, false)
    renderPage()
    expect(await screen.findByText('人气排行暂无数据')).toBeTruthy()
    cleanup()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <') } })))
    renderPage()
    expect(await screen.findByText('人气排行暂无数据')).toBeTruthy()
    cleanup()
    stub({ version: 1, asOf: '2026-11-17' })
    renderPage()
    expect(await screen.findByText('数据文件格式不对')).toBeTruthy()
  })

  it('校验器：坏行被过滤，缺失部分为 null', () => {
    const f = rankFixture()
    const bad = { ...f, popularity: { ...f.popularity, top: [{ code: 1 }] }, boards: { date: 'x' } }
    const d = asKplRank(bad)!
    expect(d.popularity).toBeNull()
    expect(d.boards).toBeNull()
    expect(d.inst?.windows.length).toBe(2)
    expect(asKplRank(null)).toBeNull()
  })
})
