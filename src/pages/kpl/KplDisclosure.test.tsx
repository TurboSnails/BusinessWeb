import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import KplDisclosure from './KplDisclosure'
import { disclosureFixture } from '../../features/kpl-disclosure/fixtures'
import { asKplDisclosure } from '../../features/kpl-disclosure/model'

const renderPage = () => render(<MemoryRouter initialEntries={['/market-mood/disclosure']}><KplDisclosure /></MemoryRouter>)
const stub = (body: unknown, ok = true) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok, status: ok ? 200 : 404, json: async () => body })))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('开盘啦 · 财报避雷页', () => {
  it('页签选中财报避雷，免责说明在；总览显示公告数、ST、低于 1 元、大宗、调研', async () => {
    stub(disclosureFixture())
    renderPage()
    const top = await screen.findByRole('region', { name: '财报避雷总览' })
    expect(top.textContent).toContain('预告 2 · 快报 1 · 定期 1')
    expect(top.textContent).toContain('新增 1 / 移除 1')
    expect(top.textContent).toContain('连续 ≥ 20 日 1 只')
    expect(top.textContent).toContain('机构专用买入 1 笔')
    const tabs = screen.getByRole('tablist', { name: '开盘啦页签' })
    expect(within(tabs).getByRole('tab', { name: '财报避雷' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText(/与开盘啦官方无关/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/建议买入|建议卖出|胜率/)
  })

  it('最新披露：区间、预期对比、公告后表现，缺失显示 —；可按类型筛选；日历显示进度与预约', async () => {
    stub(disclosureFixture())
    renderPage()
    const table = await screen.findByRole('region', { name: '最新业绩披露' })
    const rows = within(table).getAllByRole('row')
    expect(rows.length).toBe(5)
    expect(rows[1].textContent).toContain('5.00 亿~7.00 亿')
    expect(rows[1].textContent).toContain('+100%~+200%')
    const miss = within(table).getByText('快报丙').closest('tr')!
    expect(miss.textContent).toContain('低于一致预期')
    expect(miss.textContent).toContain('−4.10%')
    const ding = within(table).getByText('预告丁').closest('tr')!
    expect(ding.textContent).toContain('首亏')
    expect(ding.textContent).toContain('—')
    fireEvent.click(within(screen.getByRole('group', { name: '公告类型' })).getByText('快报'))
    expect(within(screen.getByRole('region', { name: '最新业绩披露' })).getAllByRole('row').length).toBe(2)
    fireEvent.click(within(screen.getByRole('group', { name: '业绩披露视图' })).getByText('披露日历'))
    expect(document.body.textContent).toContain('已披露 4999 / 预约 5000 家')
    expect(screen.getByRole('list', { name: '预约披露日历' }).textContent).toContain('预约戊（延后）')
    expect(screen.getAllByRole('link', { name: '财报前瞻' }).every(a => a.getAttribute('href') === '/earnings')).toBe(true)
  })

  it('避雷：ST 新增 / 移除、面值连续天数（≥）、市值、年报财务并写明规则出处', async () => {
    stub(disclosureFixture())
    renderPage()
    await screen.findByRole('region', { name: '财报避雷总览' })
    expect(document.body.textContent).toContain('原 避三')
    expect(document.body.textContent).toContain('原 ST摘帽四')
    const seg = screen.getByRole('group', { name: '避雷视图' })
    fireEvent.click(within(seg).getByText('面值'))
    const face = screen.getByRole('region', { name: '收盘价低于 1 元的个股' })
    expect(within(face).getAllByRole('row')[1].textContent).toContain('≥30 日')
    expect(document.body.textContent).toContain('连续 20 个交易日每日收盘价均低于 1 元')
    expect(screen.getAllByRole('link', { name: /股票上市规则/ }).length).toBeGreaterThan(0)
    fireEvent.click(within(seg).getByText('市值'))
    expect(screen.getByRole('region', { name: '总市值低于阈值的个股' }).textContent).toContain('5.00 亿')
    fireEvent.click(within(seg).getByText('年报财务'))
    expect(screen.getByRole('region', { name: '2025年年报亏损且营收低于阈值' }).textContent).toContain('亏损五')
    fireEvent.click(within(screen.getByRole('group', { name: '年报名单范围' })).getByText('只看非 ST'))
    expect(screen.queryByRole('region', { name: '2025年年报净资产为负' })).toBeNull()
    fireEvent.click(within(seg).getByText('季报观察'))
    expect(document.body.textContent).toContain('不是规则判断')
  })

  it('股东户数、大宗交易（同股多笔）、机构调研切换', async () => {
    stub(disclosureFixture())
    renderPage()
    const falling = await screen.findByRole('region', { name: '股东户数变化' })
    expect(falling.textContent).toContain('4 期')
    expect(falling.textContent).toContain('−25.50%')
    fireEvent.click(within(screen.getByRole('group', { name: '股东户数视图' })).getByText('最新增幅'))
    expect(screen.getByRole('region', { name: '股东户数变化' }).textContent).toContain('散户七')
    const block = screen.getByRole('region', { name: '当日大宗交易明细' })
    expect(within(block).getAllByRole('row').length).toBe(3)
    expect(block.textContent).toContain('机构买')
    expect(block.textContent).toContain('−10.00%')
    fireEvent.click(within(screen.getByRole('group', { name: '大宗交易视图' })).getByText('机构专用买入'))
    expect(screen.getByRole('region', { name: '近 20 日机构专用买入' }).textContent).toContain('2.00 亿（1 笔）')
    expect(screen.getByRole('region', { name: '近 5 日机构调研榜' }).textContent).toContain('150')
    fireEvent.click(within(screen.getByRole('group', { name: '机构调研视图' })).getByText('近 20 日'))
    expect(screen.getByRole('region', { name: '近 20 日机构调研榜' }).textContent).toContain('调研十')
  })

  it('文件缺失或 HTML 回退时显示空状态；单节缺失只影响该节', async () => {
    stub({}, false)
    renderPage()
    expect((await screen.findByRole('alert')).textContent).toContain('数据暂时取不到')
    expect(screen.getByRole('button', { name: '重试' })).toBeTruthy()
    cleanup()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <') } })))
    renderPage()
    expect(await screen.findByText('数据文件还没有生成')).toBeTruthy()
    cleanup()
    stub({ ...disclosureFixture(), block: null, survey: { bad: 1 } })
    renderPage()
    expect(await screen.findByText('大宗交易数据暂缺')).toBeTruthy()
    expect(screen.getByText('机构调研数据暂缺')).toBeTruthy()
    expect(screen.getByRole('region', { name: '最新业绩披露' })).toBeTruthy()
  })

  it('校验器：版本或日期不对返回 null', () => {
    expect(asKplDisclosure({ ...disclosureFixture(), version: 2 })).toBeNull()
    expect(asKplDisclosure({ ...disclosureFixture(), asOf: '11-17' })).toBeNull()
    expect(asKplDisclosure(disclosureFixture())?.risk?.face.length).toBe(2)
  })
})
