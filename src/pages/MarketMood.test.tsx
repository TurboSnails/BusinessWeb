import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MarketMood, { asMarginHistory } from './MarketMood'
import { moodFixture } from '../features/market-mood/fixtures'
import { asMarketMood, forecastSeries, previousDay } from '../features/market-mood/model'

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

  it('市场量能可切换板块；分板块用每日采集，之前的日子用指数口径历史补', async () => {
    const f = moodFixture()
    ;(f as { amountHistory: unknown }).amountHistory = [{ date: '2026-11-13', total: 14000, cyb: 3300 }, { date: '2026-11-16', total: 14500, cyb: null }, { date: '2026-11-17', total: 14900, cyb: 3500 }]
    stub(f)
    renderPage()
    await screen.findByRole('region', { name: '今日总览' })
    const group = screen.getByRole('group', { name: '市场' })
    fireEvent.click(within(group).getByText('创业板'))
    expect(screen.getByText(/创业板 = 创业板综指/)).toBeTruthy()
    // 11-13 来自指数历史（浅色），11-17 本页采集优先
    expect(document.querySelectorAll('.mm-chart__bar.is-muted').length).toBeGreaterThan(0)
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

describe('市场量能 · 当日', () => {
  it('切到当日：实际量能、预测量能（较昨日全天 %、放量额）与预测量能曲线', async () => {
    stub(moodFixture())
    renderPage()
    await screen.findByRole('region', { name: '今日总览' })
    fireEvent.click(within(screen.getByRole('group', { name: '量能视图' })).getByText('当日'))
    expect(screen.getByText(/^2026-11-17 沪深 · 实际量能/, { selector: 'span' }).textContent).toContain('1.49 万亿')
    // 收盘时预测 = 实际：14900 ÷ 14500 − 1 = +2.76%
    expect(screen.getByText(/预测量能/, { selector: 'span' }).textContent).toMatch(/\+2\.76%.*放量 400 亿/)
    expect(screen.getByText(/2026-11-16 全天/).textContent).toContain('1.45 万亿')
    expect(screen.getByRole('img', { name: '2026-11-17 预测量能较昨日全天增减' })).toBeTruthy()
    expect(screen.queryByRole('img', { name: /累计成交额/ })).toBeNull()
  })

  it('预测量能：今日累计 ÷ 昨日同时刻累计 × 昨日全天', () => {
    const it0 = moodFixture().latest.intraday!
    const s = forecastSeries(it0)
    expect(s[0].forecast).toBeCloseTo(14500 * 120 / 130, 6)
    expect(s[0].pct).toBeCloseTo((120 / 130 - 1) * 100, 6)
    expect(s.at(-1)!.forecast).toBeCloseTo(14900, 6)
    expect(forecastSeries({ ...it0, points: [{ t: '09:30', cum: 5, prevCum: 0 }] })[0].pct).toBeNull()
  })

  it('没有当日分时数据时提示，不崩溃', async () => {
    const f = moodFixture()
    ;(f.latest as { intraday: unknown }).intraday = null
    stub(f)
    renderPage()
    await screen.findByRole('region', { name: '今日总览' })
    fireEvent.click(within(screen.getByRole('group', { name: '量能视图' })).getByText('当日'))
    expect(screen.getByText(/当日分时量能暂缺/)).toBeTruthy()
  })
})

describe('审查回归', () => {
  it('融资占比与指数缺失时不崩溃；指数成交额历史为空时仍显示本页采集的量能', async () => {
    const f = moodFixture()
    f.margin = [{ date: '2026-11-16', balance: 22357, ratio: null, hs300: null }] as never
    f.amountHistory = []
    stub(f)
    renderPage()
    expect(await screen.findByText(/占流通市值 —，沪深300 —/)).toBeTruthy()
    expect(screen.getByRole('img', { name: '沪深京成交额走势' })).toBeTruthy()
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

describe('开盘啦页签', () => {
  it('十四个页签，点击切换到子页面', async () => {
    stub(moodFixture())
    renderPage()
    const tabs = await screen.findByRole('tablist', { name: '开盘啦页签' })
    expect(within(tabs).getAllByRole('tab').map(t => t.textContent)).toEqual(['市场情绪', '打板', '龙虎榜', '板块题材', '资金', '异动监管', '复盘', '人气排行', '竞价尾盘', '财报避雷', '时间线', '持仓两融', '互动问答', '个股'])
    expect(within(tabs).getByRole('tab', { name: '市场情绪' }).getAttribute('aria-selected')).toBe('true')
  })
})

describe('融资余额长期范围', () => {
  it('范围含 20 日到全部；选 5 年时加载全历史文件，并用主文件补上更新的日子', async () => {
    const mood = moodFixture()
    const history = { version: 1, rows: [['2010-03-31', 0, 0, 3345.61], ['2016-01-04', 11000, 2.1, 3470], ['2026-11-13', 22000, 2.5, 3990]] }
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => (url.includes('market-mood-margin') ? history : mood) }))
    vi.stubGlobal('fetch', fetchMock)
    renderPage()
    await screen.findByRole('region', { name: '今日总览' })
    const group = screen.getByRole('group', { name: '融资余额时间范围' })
    expect(within(group).getAllByRole('button').map(b => b.textContent)).toEqual(['20 日', '60 日', '1 年', '5 年', '10 年', '全部'])
    expect(fetchMock.mock.calls.some(c => String(c[0]).includes('market-mood-margin'))).toBe(false)
    fireEvent.click(within(group).getByText('5 年'))
    await screen.findByText(/2010-03-31 两融开通起/)
    expect(fetchMock.mock.calls.some(c => String(c[0]).includes('market-mood-margin'))).toBe(true)
  })

  it('全历史校验：日期须升序、余额须是数字，缺值可为 null', () => {
    expect(asMarginHistory({ rows: [['2010-03-31', 0, null, 3345], ['2010-04-01', 1, 0.1, null]] })).toHaveLength(2)
    expect(asMarginHistory({ rows: [['2010-04-01', 1, 0.1, 1], ['2010-03-31', 0, 0, 1]] })).toBeNull()
    expect(asMarginHistory({ rows: [['2010-03-31', null, 0, 1]] })).toBeNull()
    expect(asMarginHistory('<html>')).toBeNull()
  })
})
