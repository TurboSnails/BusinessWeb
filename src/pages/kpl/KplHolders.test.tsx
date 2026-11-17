import React from 'react'
import fs from 'node:fs'
import path from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import KplHolders from './KplHolders'
import { holdersFixture } from '../../features/kpl-holders/fixtures'
import { asKplHolders } from '../../features/kpl-holders/model'

const renderPage = () => render(<MemoryRouter initialEntries={['/market-mood/holders']}><KplHolders /></MemoryRouter>)
const stub = (body: unknown, ok = true) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok, status: ok ? 200 : 404, json: async () => body })))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('开盘啦 · 持仓两融页', () => {
  it('页签选中持仓两融，免责说明在；总览显示融资余额、净买入、基金、牛散', async () => {
    stub(holdersFixture())
    renderPage()
    const top = await screen.findByRole('region', { name: '持仓两融总览' })
    expect(top.textContent).toContain('21000.00 亿')
    expect(top.textContent).toContain('−240.00 亿')
    expect(top.textContent).toContain('净买入 1200 只 · 净偿还 2600 只')
    expect(top.textContent).toContain('2026 年三季报')
    const tabs = screen.getByRole('tablist', { name: '开盘啦页签' })
    expect(within(tabs).getByRole('tab', { name: '持仓两融' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText(/与开盘啦官方无关/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/建议买入|建议卖出|胜率/)
    expect(screen.getByRole('link', { name: '国家队持仓' }).getAttribute('href')).toBe('/invest/national-team')
  })

  it('两融：净买入榜、余额增幅阈值说明、行业汇总；缺失显示 —', async () => {
    stub(holdersFixture())
    renderPage()
    const table = await screen.findByRole('region', { name: '净买入前 30' })
    const rows = within(table).getAllByRole('row')
    expect(rows.length).toBe(3)
    expect(rows[1].textContent).toContain('两融1')
    expect(rows[1].textContent).toContain('+1.50 亿')
    expect(rows[2].textContent).toContain('—')
    const seg = screen.getByRole('group', { name: '两融视图' })
    fireEvent.click(within(seg).getByText('余额增幅'))
    expect(within(screen.getByRole('region', { name: '余额增幅' })).getByText('+25.50%')).toBeTruthy()
    expect(document.body.textContent).toContain('不低于 1 亿元')
    fireEvent.click(within(seg).getByText('行业'))
    expect(within(screen.getByRole('region', { name: '融资净买入行业' })).getByText('专业服务')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: '融资净偿还行业' })).getByText('−30.00 亿')).toBeTruthy()
  })

  it('基金持仓：口径不同的提示、增持 / 减持 / 新进 / 行业', async () => {
    stub(holdersFixture())
    renderPage()
    await screen.findByRole('region', { name: '持仓两融总览' })
    expect(document.body.textContent).toContain('减持会被高估')
    const seg = screen.getByRole('group', { name: '基金持仓视图' })
    fireEvent.click(within(seg).getByText('减持'))
    expect(within(screen.getByRole('region', { name: '基金减持' })).getByText('减持股')).toBeTruthy()
    fireEvent.click(within(seg).getByText('新进'))
    const fresh = within(screen.getByRole('region', { name: '基金新进' })).getAllByRole('row')[1]
    expect(fresh.textContent).toContain('新进')
    fireEvent.click(within(seg).getByText('行业'))
    expect(within(screen.getByRole('region', { name: '基金持仓行业汇总' })).getByText('1 / 1 / 1')).toBeTruthy()
  })

  it('牛散：名单、点姓名看持股、按股票检索', async () => {
    stub(holdersFixture())
    renderPage()
    const list = await screen.findByRole('region', { name: '高频自然人股东' })
    expect(within(list).getAllByRole('row').length).toBe(3)
    fireEvent.click(within(list).getByRole('button', { name: '甲散户' }))
    const picked = screen.getByRole('region', { name: '甲散户 的持股' })
    expect(within(picked).getByText('股票一').closest('tr')!.textContent).toContain('新进')
    expect(within(picked).getByText('股票三').closest('tr')!.textContent).toContain('—')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '000001' } })
    const hits = screen.getByRole('region', { name: '按股票检索结果' })
    expect(within(hits).getAllByRole('row').length).toBe(3)
    expect(within(hits).getByText('乙散户').closest('tr')!.textContent).toContain('减仓')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '乙' } })
    expect(within(screen.getByRole('region', { name: '高频自然人股东' })).getAllByRole('row').length).toBe(2)
    expect(document.body.textContent).toContain('同名的不同自然人')
  })

  it('数据缺失 / HTML 回退时显示空状态；校验器拒绝错误格式', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <') } })))
    renderPage()
    expect(await screen.findByText('持仓两融数据暂不可用')).toBeTruthy()
    expect(screen.getByText('数据文件还没有生成')).toBeTruthy()
    expect(asKplHolders({ version: 2 })).toBeNull()
    const partial = asKplHolders({ ...holdersFixture(), margin: { date: 'x' } })
    expect(partial?.margin).toBeNull()
    expect(partial?.funds?.period).toBe('2026-09-30')
  })

  it('页面与组件没有内联样式和写死的颜色', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'KplHolders.tsx'), 'utf8')
    expect(src).not.toMatch(/style=\{\{/)
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/)
  })
})
