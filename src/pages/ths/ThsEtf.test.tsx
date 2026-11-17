import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ThsEtf from './ThsEtf'
import { etfFixture } from '../../features/ths-etf/fixtures'
import { asThsEtf } from '../../features/ths-etf/model'
import real from '../../../public/data/ths-tab-etf.json'

const renderPage = () => render(<MemoryRouter initialEntries={['/ths-mood/etf']}><ThsEtf /></MemoryRouter>)
const stub = (body: unknown, ok = true) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => body })))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('同花顺 · ETF资金页', () => {
  it('宽基汇总、按指数、全市场排行、调仓名单与口径', async () => {
    stub(etfFixture()); renderPage()
    expect(await screen.findByText(/数据日期：2026-11-17/)).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'ETF资金' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText(/与同花顺官方无关/)).toBeTruthy()
    expect(screen.getByText(/不代表一定是国家队资金/)).toBeTruthy()
    expect(screen.getByText(/一次性回补/)).toBeTruthy()
    expect(screen.getByRole('img', { name: '宽基 ETF 每日申购净流入' })).toBeTruthy()
    expect(screen.getAllByText('+52.00 亿').length).toBeGreaterThan(0)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0) // 缺失不显示 0
    const inflow = screen.getAllByRole('region', { name: '宽基 · 当日净流入前 20' })[0]
    expect(within(inflow).getAllByRole('row')).toHaveLength(21)
    expect(within(inflow).getAllByText('+20.00 亿')[0].className).toContain('mm-up')
    const outflow = screen.getAllByRole('region', { name: '宽基 · 当日净流出前 20' })[0]
    expect(within(outflow).getAllByText('−20.00 亿')[0].className).toContain('mm-down')
    fireEvent.click(within(screen.getByRole('group', { name: '统计区间' })).getByText('近 20 日'))
    expect(screen.getByText(/在这个区间没有净流入/)).toBeTruthy()
    fireEvent.click(within(screen.getByRole('group', { name: 'ETF 类别' })).getByText('跨境'))
    expect(screen.getAllByRole('region', { name: '跨境 · 近 20 日净流出前 20' })[0]).toBeTruthy()
    expect(screen.getByText(/沪深300：调入 1 只 \/ 调出 1 只/)).toBeTruthy()
    expect(screen.getByText('中钨高新')).toBeTruthy()
    expect(screen.getByText(/名单待解析/)).toBeTruthy()
    expect(screen.getByText(/没有给出「预计被动资金净买入」/)).toBeTruthy()
    expect(screen.getByRole('link', { name: '国家队持仓' }).getAttribute('href')).toBe('/invest/national-team')
  })
  it.each([null, '<!doctype html><html></html>', { version: 1 }])('空文件或 200 HTML 回退显示 EmptyState (%j)', async body => {
    stub(body); renderPage()
    expect(await screen.findByText('暂无 ETF 资金数据')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })
  it('404、JSON 解析异常和网络错误显示 EmptyState', async () => {
    for (const fetcher of [async () => ({ ok: false }), async () => ({ ok: true, json: async () => { throw new SyntaxError('HTML') } }), async () => { throw new Error('offline') }]) {
      vi.stubGlobal('fetch', vi.fn(fetcher)); renderPage()
      expect(await screen.findByText('暂无 ETF 资金数据')).toBeTruthy()
      cleanup()
    }
  })
})

describe('ETF资金运行时模型', () => {
  it('提交的真实数据文件通过校验', () => {
    expect(asThsEtf(real)).not.toBeNull()
  })
  it('完整数据通过；日期、排序方向、字符串数字、链接协议校验', () => {
    expect(asThsEtf(etfFixture())).not.toBeNull()
    for (const mutate of [
      (x: any) => { x.asOf = '2026-02-30' },
      (x: any) => { x.broad.history.reverse() },
      (x: any) => { x.broad.list[0].flow1 = '1' },
      (x: any) => { x.broad.total.flow1 = Infinity },
      (x: any) => { x.market.categories[0].rank.d1.inflow[0].flow1 = -1 },
      (x: any) => { x.market.categories[0].rank.d1.inflow.reverse() },
      (x: any) => { x.market.categories.pop() },
      (x: any) => { x.rebalance[0].url = 'javascript:alert(1)' },
      (x: any) => { x.rebalance[0].indexes[0].in[0].code = 'abc' },
      (x: any) => { x.sources = [] },
    ]) { const x = etfFixture(); mutate(x); expect(asThsEtf(x)).toBeNull() }
  })
})
