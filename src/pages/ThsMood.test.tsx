import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ThsMood from './ThsMood'
import { thsFixture } from '../features/ths-mood/fixtures'
import { asThsMood, previousDay, zoneTone } from '../features/ths-mood/model'

const renderPage = () => render(<MemoryRouter><ThsMood /></MemoryRouter>)
const stub = (body: unknown, ok = true) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok, status: ok ? 200 : 404, json: async () => body })))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('同花顺（市场情绪）页', () => {
  it('市场概况：成交额放量、涨跌家数、涨跌停对比与昨日、涨停最多的行业', async () => {
    stub(thsFixture())
    renderPage()
    const box = await screen.findByRole('region', { name: '市场概况' })
    expect(box.textContent).toContain('1.50 万亿')
    expect(box.textContent).toContain('放量 500 亿')
    expect(box.textContent).toContain('昨日 50 : 20')
    expect(box.textContent).toContain('算力')
  })

  it('投资者情绪：数值、区间、情绪状态、分项与口径', async () => {
    stub(thsFixture())
    renderPage()
    expect(await screen.findByText(/最新的情绪指数为 72，处于贪婪风险区/)).toBeTruthy()
    expect(screen.getByText('较高')).toBeTruthy()
    expect(within(screen.getByRole('list', { name: '情绪指数分项' })).getByText('封板率')).toBeTruthy()
    expect(screen.getByText(/情绪指数（0–100）/)).toBeTruthy()
    expect(screen.getByText(/90 个交易日/)).toBeTruthy()
  })

  it('盘面评分、短线风向标、封成比分组、涨停聚焦、近10日涨停数、复盘', async () => {
    stub(thsFixture())
    renderPage()
    expect(await screen.findByText(/短期大盘趋势/)).toBeTruthy()
    expect(screen.getByText('偏强')).toBeTruthy()
    expect(screen.getByText('竞价高开')).toBeTruthy()
    expect(screen.getByRole('region', { name: '昨日最热涨停股' }).textContent).toContain('+5.20%')
    expect(screen.getByText('封成比高的三分之一')).toBeTruthy()
    expect(within(screen.getByRole('list', { name: '涨停行业分布' })).getByText('电网设备')).toBeTruthy()
    expect(within(screen.getByRole('list', { name: '近10日涨停数排行' })).getByText('回落戊')).toBeTruthy()
    expect(screen.getByText(/上证指数收 3584.58/)).toBeTruthy()
  })

  it('涨停分析表：连板、几天几板、封成比', async () => {
    stub(thsFixture())
    renderPage()
    const table = await screen.findByRole('region', { name: '今日涨停股' })
    expect(within(table).getByText('5连板')).toBeTruthy()
    expect(within(table).getByText('3天2板')).toBeTruthy()
    expect(within(table).getByText('1.80')).toBeTruthy()
  })

  it('强弱指数可切换成盘面评分', async () => {
    stub(thsFixture())
    renderPage()
    await screen.findByRole('region', { name: '市场概况' })
    fireEvent.click(within(screen.getByRole('group', { name: '趋势指标' })).getByText('盘面评分'))
    expect(screen.getByText(/柱色表示较前一日升降/)).toBeTruthy()
  })

  it('免责声明、跳过模块说明、无买卖建议用语；数据格式不对时提示', async () => {
    stub(thsFixture())
    renderPage()
    expect(await screen.findByText(/与同花顺官方无关/)).toBeTruthy()
    expect(screen.getByText(/竞价涨停潜力/)).toBeTruthy()
    expect(screen.getByText(/由每日复盘归档补算/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/建议买入|建议卖出|立即买|立即卖|买入的极佳/)
    cleanup()
    stub({ version: 2 })
    renderPage()
    expect(await screen.findByText('数据文件格式不对')).toBeTruthy()
  })

  it('不调用同花顺接口：页面与采集脚本里没有 10jqka / thsi / hexin 域名', () => {
    for (const f of ['src/pages/ThsMood.tsx', 'src/features/ths-mood/model.ts', 'scripts/ths-mood.mjs', 'scripts/ths-mood-lib.mjs']) {
      expect(readFileSync(resolve(__dirname, '../..', f), 'utf8'), f).not.toMatch(/10jqka|thsi\.cn|hexin\.cn/)
    }
  })
})

describe('数据模型', () => {
  it('校验关键字段，取上一交易日，区间样式', () => {
    const m = asThsMood(thsFixture())!
    expect(previousDay(m)?.date).toBe('2026-11-16')
    expect(asThsMood({ ...thsFixture(), latest: { date: '2026-11-17' } })).toBeNull()
    expect(asThsMood({ ...thsFixture(), history: [{ date: 'x' }] })).toBeNull()
    expect([zoneTone('贪婪风险区'), zoneTone('恐慌机会区'), zoneTone('情绪中立区')]).toEqual(['hot', 'cold', 'mid'])
  })
})

describe('同花顺页签', () => {
  it('六个页签，市场情绪为当前页', () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => thsFixture() })))
    renderPage()
    const tabs = screen.getByRole('tablist', { name: '同花顺页签' })
    expect(within(tabs).getAllByRole('tab').map(t => t.textContent)).toEqual(['市场情绪', '市场', '可转债', '数据中心', '港股通与AH', 'ETF资金'])
    expect(within(tabs).getByRole('tab', { name: '市场情绪' }).getAttribute('aria-selected')).toBe('true')
  })
})
