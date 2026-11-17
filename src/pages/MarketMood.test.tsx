import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MarketMood from './MarketMood'
import { moodFixture } from '../features/market-mood/fixtures'
import { asMarketMood, previousDay } from '../features/market-mood/model'

const renderPage = () => render(<MemoryRouter><MarketMood /></MemoryRouter>)
const stub = (body: unknown, ok = true) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok, status: ok ? 200 : 404, json: async () => body })))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('开盘啦（市场情绪）页', () => {
  it('顶部总览：沪深京量能、市场情绪状态、连板强度与大幅回撤', async () => {
    stub(moodFixture())
    renderPage()
    const top = await screen.findByRole('region', { name: '今日总览' })
    expect(top.textContent).toContain('1.50 万亿')
    expect(top.textContent).toContain('+2.40%')
    expect(top.textContent).toContain('活跃')
    expect(top.textContent).toContain('58')
    expect(top.textContent).toContain('大幅回撤 2 只')
    expect(top.textContent).toContain('放量') // 沪深 14900 vs 前一日 14500
  })

  it('综合强度、涨停表现、今昨对比、口径说明都在', async () => {
    stub(moodFixture())
    renderPage()
    expect(await screen.findByText(/盘面点评/)).toBeTruthy()
    expect(screen.getByText(/综合强度（0–100）/)).toBeTruthy()
    expect(screen.getByText('昨日破板今表现')).toBeTruthy()
    expect(screen.getByText('连板率 20.0%')).toBeTruthy()
    const vs = screen.getByRole('region', { name: '今日与昨日对比' })
    expect(vs.textContent).toContain('今 / 昨 50')
    expect(screen.getByText(/实际涨跌停/).textContent).toContain('58')
    expect(document.body.textContent).not.toMatch(/建议买入|建议卖出/)
    expect(screen.getByText(/与开盘啦官方无关/)).toBeTruthy()
  })

  it('大幅回撤表、风向标、连板天梯、权重、融资余额与北向说明', async () => {
    stub(moodFixture())
    renderPage()
    const table = await screen.findByRole('table')
    expect(within(table).getByText('回撤甲')).toBeTruthy()
    expect(within(table).getByText('−12.50%')).toBeTruthy()
    expect(screen.getByText('算力', { selector: 'b' })).toBeTruthy()
    expect(screen.getByText('高标戊')).toBeTruthy()
    expect(screen.getByText('贵州茅台')).toBeTruthy()
    expect(screen.getByText(/融资余额 2.24 万亿/)).toBeTruthy()
    expect(screen.getByText(/不再披露北向资金/)).toBeTruthy()
  })

  it('市场量能可切换板块；切到分板块时用每日采集的数据', async () => {
    stub(moodFixture())
    renderPage()
    await screen.findByRole('region', { name: '今日总览' })
    const group = screen.getByRole('group', { name: '市场' })
    fireEvent.click(within(group).getByText('创业板'))
    expect(screen.getByText(/分板块量能从本页开始采集之日起累计/)).toBeTruthy()
  })

  it('补算历史有说明；数据格式不对时提示', async () => {
    stub(moodFixture())
    renderPage()
    expect(await screen.findByText(/由每日复盘归档补算/)).toBeTruthy()
    cleanup()
    stub({ version: 2 })
    renderPage()
    expect(await screen.findByText('数据文件格式不对')).toBeTruthy()
  })
})

describe('数据模型', () => {
  it('校验关键字段，取上一交易日', () => {
    const m = asMarketMood(moodFixture())!
    expect(previousDay(m)?.date).toBe('2026-11-16')
    expect(asMarketMood({ ...moodFixture(), latest: { date: '2026-11-17' } })).toBeNull()
    expect(asMarketMood({ ...moodFixture(), history: [{ date: 'x' }] })).toBeNull()
  })
})
