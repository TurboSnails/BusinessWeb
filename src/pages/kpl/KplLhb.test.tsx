import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import KplLhb from './KplLhb'
import { lhbFixture } from '../../features/kpl-lhb/fixtures'
import { asKplLhb } from '../../features/kpl-lhb/model'

const renderPage = (path = '/market-mood/lhb') => render(<MemoryRouter initialEntries={[path]}><KplLhb /></MemoryRouter>)
const stub = (body: unknown, ok = true) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok, status: ok ? 200 : 404, json: async () => body })))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('开盘啦 · 龙虎榜页', () => {
  it('页签选中龙虎榜，免责说明在；总览显示上榜数、净买额、机构与北向', async () => {
    stub(lhbFixture())
    renderPage()
    const top = await screen.findByRole('region', { name: '龙虎榜总览' })
    expect(top.textContent).toContain('上榜记录 4 条')
    expect(top.textContent).toContain('+5.00 亿')
    expect(top.textContent).toContain('+9000 万')
    expect(top.textContent).toContain('+3000 万')
    const tabs = screen.getByRole('tablist', { name: '开盘啦页签' })
    expect(within(tabs).getByRole('tab', { name: '龙虎榜' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText(/与开盘啦官方无关/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/建议买入|建议卖出|游资昵称：/)
  })

  it('个股表按净买额排序，缺失值显示 —；点名称展开买入/卖出前五席位，可切换上榜原因', async () => {
    stub(lhbFixture())
    renderPage()
    const table = await screen.findByRole('region', { name: '当日龙虎榜个股' })
    const names = within(table).getAllByRole('button').map(b => b.textContent?.slice(1))
    expect(names).toEqual(['龙虎乙', '龙虎甲', '龙虎丙'])
    const bj = within(table).getByRole('button', { name: /龙虎丙/ }).closest('tr')!
    expect(bj.textContent).toContain('—')
    fireEvent.click(within(table).getByRole('button', { name: /龙虎甲/ }))
    expect(screen.getByRole('region', { name: '买入前五席位' }).textContent).toContain('机构专用')
    expect(screen.getByRole('region', { name: '卖出前五席位' }).textContent).toContain('乙证券某街营业部')
    const reasons = screen.getByRole('group', { name: '龙虎甲上榜原因' })
    fireEvent.click(within(reasons).getByText('原因 2（3日）'))
    expect(screen.getByRole('region', { name: '买入前五席位' }).textContent).toContain('丙证券营业部')
  })

  it('筛选市场与按上榜原因分组', async () => {
    stub(lhbFixture())
    renderPage()
    await screen.findByRole('region', { name: '当日龙虎榜个股' })
    fireEvent.click(within(screen.getByRole('group', { name: '市场' })).getByText('北'))
    const t = screen.getByRole('region', { name: '当日龙虎榜个股' })
    expect(within(t).getAllByRole('button').length).toBe(1)
    fireEvent.click(within(screen.getByRole('group', { name: '龙虎榜视图' })).getByText('按上榜原因'))
    const g = screen.getByRole('region', { name: '连续三个交易日内，涨幅偏离值累计达到20%的证券个股' })
    expect(within(g).getAllByRole('button').length).toBe(2)
    // 卖出前五为空时显示「无披露」，不崩溃
    const turnover = screen.getByRole('region', { name: '当日换手率达到20%的前5只股票个股' })
    fireEvent.click(within(turnover).getByRole('button', { name: /龙虎丙/ }))
    expect(screen.getByText('无披露')).toBeTruthy()
  })

  it('机构净买/净卖切换；营业部当日与近 20 日，可展开营业部明细；上榜次数与走势', async () => {
    stub(lhbFixture())
    renderPage()
    const inst = await screen.findByRole('region', { name: '机构专用净买排行' })
    expect(inst.textContent).toContain('龙虎甲')
    fireEvent.click(within(screen.getByRole('group', { name: '机构方向' })).getByText('净卖出'))
    expect(screen.getByRole('region', { name: '机构专用净买排行' }).textContent).toContain('−1.20 亿')
    expect(screen.getByRole('region', { name: '当日活跃营业部' }).textContent).toContain('龙虎甲、龙虎乙')
    fireEvent.click(within(screen.getByRole('group', { name: '营业部统计区间' })).getByText('近 20 日'))
    const w = screen.getByRole('region', { name: '近期营业部排行' })
    fireEvent.click(within(w).getByRole('button', { name: /甲证券某路营业部/ }))
    const detail = screen.getByRole('table', { name: '甲证券某路营业部近期上榜明细' })
    expect(detail.textContent).toContain('历史丁')
    expect(screen.getByText('5 次')).toBeTruthy()
    expect(screen.getByRole('img', { name: '每日上榜个股数' })).toBeTruthy()
    fireEvent.click(within(screen.getByRole('group', { name: '走势指标' })).getByText('机构净买'))
    expect(screen.getByRole('img', { name: '每日机构专用席位净买额（亿元）' })).toBeTruthy()
  })

  it('投资者类别披露的个股：标「类别披露」、金额留空，并显示口径说明', async () => {
    const f = lhbFixture()
    const s = f.latest.stocks[2] as Record<string, unknown>
    Object.assign(s, { byType: true })
    Object.assign(f.latest, { byTypeCount: 1 })
    stub(f)
    renderPage()
    const table = await screen.findByRole('region', { name: '当日龙虎榜个股' })
    expect(within(table).getByRole('button', { name: /龙虎丙/ }).closest('tr')!.textContent).toContain('类别披露')
    expect(screen.getByText(/不披露前五席位/)).toBeTruthy()
  })

  it('数据格式不对或请求失败时提示', async () => {
    stub({ version: 2 })
    renderPage()
    expect((await screen.findByRole('alert')).textContent).toContain('数据暂时取不到')
    expect(screen.getByText('数据文件格式不对')).toBeTruthy()
    cleanup()
    stub(null, false)
    renderPage()
    expect((await screen.findByRole('alert')).textContent).toContain('数据暂时取不到')
    expect(screen.getByText('HTTP 404')).toBeTruthy()
    expect(screen.getByRole('button', { name: '重试' })).toBeTruthy()
  })

  it('失败 → 重试 → 成功', async () => {
    let calls = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1
      if (calls === 1) return { ok: false, status: 500, json: async () => ({}) }
      return { ok: true, status: 200, json: async () => lhbFixture() }
    }))
    renderPage()
    expect(await screen.findByRole('alert')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(await screen.findByRole('region', { name: '龙虎榜总览' })).toBeTruthy()
    expect(calls).toBe(2)
  })

  it('视图写入 URL：?view=reason 刷新后按上榜原因', async () => {
    stub(lhbFixture())
    renderPage('/market-mood/lhb?view=reason')
    expect(await screen.findByRole('region', { name: '连续三个交易日内，涨幅偏离值累计达到20%的证券个股' })).toBeTruthy()
    expect(within(screen.getByRole('group', { name: '龙虎榜视图' })).getByText('按上榜原因').closest('button')?.getAttribute('aria-pressed')).toBe('true')
  })
})

describe('数据模型', () => {
  it('校验关键字段与日期一致；可选列表缺失时补空', () => {
    expect(asKplLhb(lhbFixture())?.latest.stocks.length).toBe(3)
    expect(asKplLhb({ ...lhbFixture(), asOf: '2026-11-16' })).toBeNull()
    expect(asKplLhb({ ...lhbFixture(), latest: { date: '2026-11-17' } })).toBeNull()
    const f = lhbFixture() as Record<string, unknown>
    delete f.window
    delete f.history
    const m = asKplLhb(f)!
    expect(m.window.deptRank).toEqual([])
    expect(m.history).toEqual([])
  })
})
