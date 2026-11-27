import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ThsScreener from './ThsScreener'
import { screenerFixture } from '../../features/ths-screener/fixtures'
import { asThsScreener, byIndustry, rowsOf } from '../../features/ths-screener/model'
import real from '../../../public/data/ths-tab-screener.json'

const renderPage = () => render(<MemoryRouter initialEntries={['/ths-mood/screener']}><ThsScreener /></MemoryRouter>)
const stub = (body: unknown, ok = true) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => body })))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('同花顺 · 技术选股页', () => {
  it('预设命中、公式、个股表排序、行业汇总、市场宽度与口径', async () => {
    stub(screenerFixture()); renderPage()
    expect(await screen.findByText(/数据日期：2026-11-17/)).toBeTruthy()
    expect(screen.getByRole('tab', { name: '技术选股' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText(/与同花顺官方无关/)).toBeTruthy()
    expect(screen.getByText('历史统计，不是买卖信号')).toBeTruthy()
    expect(screen.getByText(/MA5 > MA10 > MA20 > MA60，且收盘价 > MA5/)).toBeTruthy()
    expect(screen.getByRole('img', { name: '均线多头排列 近 3 日命中家数' })).toBeTruthy()
    const table = screen.getAllByRole('region', { name: '均线多头排列 命中个股' })[0]
    const names = () => within(table).getAllByRole('rowheader').map(h => h.textContent)
    expect(names()).toEqual(['样本甲600001', '样本乙000002', '300003300003']) // 名称缺失显示代码；null 排最后
    expect(within(table).getByText('+12.50%').className).toContain('mm-up')
    expect(within(table).getByText('−1.50%').className).toContain('mm-down')
    fireEvent.click(within(table).getByRole('button', { name: /MA5 较 MA60/ }))
    expect(names()[0]).toBe('样本乙000002')
    const ind = screen.getAllByRole('region', { name: '均线多头排列 按行业汇总' })[0]
    expect(within(ind).getByText('银行')).toBeTruthy()
    expect(within(ind).getByText('未分类')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('group', { name: '新高新低预设' })).getByRole('button', { name: /20 日新低/ }))
    expect(screen.getByText('20 日新低：1 家')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /跳空缺口未回补/ }))
    expect(screen.getByText('今日没有股票满足这个条件。')).toBeTruthy()
    expect(screen.getByRole('img', { name: '站上 20 日线家数占比' })).toBeTruthy()
    fireEvent.click(within(screen.getByRole('group', { name: '宽度指标' })).getByText('涨跌家数比'))
    expect(screen.getByRole('img', { name: '涨跌家数比（上涨 ÷ 下跌）' })).toBeTruthy()
    expect(screen.getByText(/需要历史成交量的条件/)).toBeTruthy()
    expect(screen.queryByText(/KDJ、BOLL 等其他指标/)).toBeNull()
    expect(screen.getByRole('link', { name: '复盘' }).getAttribute('href')).toBe('/market-mood/review')
    expect(document.body.textContent).not.toMatch(/建议买入|建议卖出|胜率/)
  })
  it('当日量能快照：条件切换、量比 / 换手 / 成交额列与口径', async () => {
    stub(screenerFixture()); renderPage()
    const card = (await screen.findByText('量能条件（当日快照）')).closest('section') as HTMLElement
    expect(within(card).getByText('放量上涨：2 家')).toBeTruthy()
    expect(within(card).getByText('量比 ≥ 2 且涨幅 ≥ 3%。')).toBeTruthy()
    const table = within(card).getAllByRole('region', { name: '放量上涨 命中个股' })[0]
    expect(within(table).getAllByRole('rowheader').map(h => h.textContent)).toEqual(['样本甲600001', '样本乙000002'])
    expect(within(table).getByText('8.50 亿')).toBeTruthy()
    expect(within(table).getAllByText('—')).toHaveLength(2) // 行业、换手缺失显示 —，不是 0
    expect(within(card).getByText(/快照本身不带日期/)).toBeTruthy()
    fireEvent.click(within(within(card).getByRole('group', { name: '量能预设' })).getByRole('button', { name: /高换手/ }))
    expect(within(card).getByText('高换手 ≥10%：1 家')).toBeTruthy()
    expect(within(card).getByRole('button', { name: /高换手/ }).textContent).toContain('首日采集')
  })
  it('量能快照缺失时只在该区块显示 EmptyState 与原因，其余部分照常', async () => {
    const x = screenerFixture(); x.snapshot = null; x.snapshotNote = '量能快照采集失败（超时），本区块暂缺。'
    stub(x); renderPage()
    expect(await screen.findByText('暂无当日量能数据')).toBeTruthy()
    expect(screen.getByText(/量能快照采集失败/)).toBeTruthy()
    expect(screen.getByText('均线多头排列：3 家')).toBeTruthy()
  })
  it('旧文件没有量能字段：按缺失处理', async () => {
    const x: any = screenerFixture(); delete x.snapshot; delete x.snapshotNote
    expect(asThsScreener(x)?.snapshot).toBeNull()
    stub(x); renderPage()
    expect(await screen.findByText('暂无当日量能数据')).toBeTruthy()
  })
  it.each([null, '<!doctype html><html></html>', { version: 1 }])('空文件或 200 HTML 回退显示 LoadError (%j)', async body => {
    stub(body); renderPage()
    expect((await screen.findByRole('alert')).textContent).toContain('数据暂时取不到')
    expect(screen.getByRole('button', { name: '重试' })).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })
  it('404、JSON 解析异常和网络错误显示 LoadError 与重试', async () => {
    for (const fetcher of [async () => ({ ok: false, status: 404 }), async () => ({ ok: true, json: async () => { throw new SyntaxError('HTML') } }), async () => { throw new Error('offline') }]) {
      vi.stubGlobal('fetch', vi.fn(fetcher)); renderPage()
      expect((await screen.findByRole('alert')).textContent).toContain('数据暂时取不到')
      expect(screen.getByRole('button', { name: '重试' })).toBeTruthy()
      cleanup()
    }
  })
})

describe('技术选股运行时模型', () => {
  it('提交的真实数据文件通过校验', () => {
    const d = asThsScreener(real)
    expect(d).not.toBeNull()
    expect(d?.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/) // 真实数据每天更新，不钉日期
    expect(d?.presets.every(p => p.history.length === 20)).toBe(true)
    expect(d?.presets.map(p => p.id)).toEqual(expect.arrayContaining(['bollUp', 'bollDown', 'squeeze', 'kdjGold', 'high120', 'low120', 'dstreak', 'tangle']))
  })
  it('完整数据通过；日期、计数、字符串数字、缺个股、链接协议校验', () => {
    expect(asThsScreener(screenerFixture())).not.toBeNull()
    for (const mutate of [
      (x: any) => { x.asOf = '2026-02-30' },
      (x: any) => { x.store.to = '2026-11-16' },
      (x: any) => { x.presets[0].count = 2 },
      (x: any) => { x.presets[0].hits[0][1] = '12.5' },
      (x: any) => { delete x.stocks['000002'] },
      (x: any) => { x.presets[0].history.reverse() },
      (x: any) => { x.presets[0].history[2].count = 9 },
      (x: any) => { x.presets[1].id = 'bull' },
      (x: any) => { x.breadth[0].above20 = Infinity },
      (x: any) => { x.breadth[0].up = 1.5 },
      (x: any) => { x.stocks['600001'][2] = '10.5' },
      (x: any) => { x.sources = [{ label: 'x', url: 'javascript:alert(1)' }] },
      (x: any) => { x.snapshot.date = '2026-11-16' },
      (x: any) => { x.snapshot.presets[0].count = 3 },
      (x: any) => { delete x.snapshot.stocks['000002'] },
      (x: any) => { x.snapshot.stocks['600001'][4] = '3.5' },
      (x: any) => { x.snapshot.stocks['600001'] = x.snapshot.stocks['600001'].slice(0, 6) },
      (x: any) => { x.snapshot.presets[0].eligible = 9999 },
      (x: any) => { x.snapshotNote = 1 },
    ]) { const x = screenerFixture(); mutate(x); expect(asThsScreener(x)).toBeNull() }
  })
  it('行业汇总按家数降序', () => {
    const d = screenerFixture()
    expect(byIndustry(rowsOf(d.presets[0], d.stocks)).map(g => [g.industry, g.count])).toEqual([['银行', 2], ['未分类', 1]])
  })
})
