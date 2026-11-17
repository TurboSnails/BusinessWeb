import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ThsMarket from './ThsMarket'
import { marketFixture } from '../../features/ths-market/fixtures'
import { asThsMarket } from '../../features/ths-market/model'

const renderPage = () => render(<MemoryRouter initialEntries={['/ths-mood/market']}><ThsMarket /></MemoryRouter>)
const stub = (body: unknown, ok = true) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => body })))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('同花顺 · 市场页', () => {
  it('估值分区、资金供需、利率、风格与口径', async () => {
    stub(marketFixture()); renderPage()
    const [val] = await screen.findAllByRole('table')
    expect(within(val).getAllByRole('row')).toHaveLength(4)
    expect(screen.getByText(/数据日期：2026-11-17/)).toBeTruthy()
    expect(screen.getByText('危险').className).toContain('is-hot')
    expect(screen.getByText('机会（按 5 年）').className).toContain('is-cold')
    expect(screen.getByText(/≥ 80% 记为「危险区」/)).toBeTruthy()
    expect(screen.getByText(/与同花顺官方无关/)).toBeTruthy()
    expect(screen.getByRole('tab', { name: '市场' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('img', { name: '沪深300 PE(TTM) 近 10 年周线' })).toBeTruthy()
    fireEvent.click(within(screen.getByRole('group', { name: '估值曲线指数' })).getByText('创业板'))
    expect(screen.getByRole('img', { name: '创业板（整体） PE(TTM) 近 10 年周线' })).toBeTruthy()
    expect(screen.getByText(/合计 399.00 亿/)).toBeTruthy()
    expect(screen.getByText('−20.00 亿').className).toContain('mm-down')
    expect(screen.getByText('+20.00 亿').className).toContain('mm-up')
    expect(screen.getByRole('img', { name: '10 年期国债收益率' })).toBeTruthy()
    expect(screen.getByText('1.6055')).toBeTruthy()
    expect(screen.getByText('+6.37%').className).toContain('mm-up')
    expect(screen.getByText('−9.70%').className).toContain('mm-down')
    expect(screen.getByText(/新增投资者开户数/)).toBeTruthy()
    expect(screen.getAllByRole('link', { name: '宏观温度' }).length).toBeGreaterThan(0)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toMatch(/建议买入|建议卖出|胜率/)
  })
  it.each([null, '<!doctype html><html></html>', { version: 1 }])('空文件或 200 HTML 回退显示 EmptyState (%j)', async body => {
    stub(body); renderPage()
    expect(await screen.findByText('暂无市场数据')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })
  it('404、JSON 解析异常和网络错误显示 EmptyState', async () => {
    for (const fetcher of [async () => ({ ok: false }), async () => ({ ok: true, json: async () => { throw new SyntaxError('HTML') } }), async () => { throw new Error('offline') }]) {
      vi.stubGlobal('fetch', vi.fn(fetcher)); renderPage()
      expect(await screen.findByText('暂无市场数据')).toBeTruthy()
      cleanup()
    }
  })
  it('卸载时中止请求', () => {
    const fetcher = vi.fn((_url: string, _init: RequestInit) => new Promise(() => {}))
    vi.stubGlobal('fetch', fetcher)
    const page = renderPage(); page.unmount()
    expect(fetcher.mock.calls[0][1].signal?.aborted).toBe(true)
  })
})

describe('市场页运行时模型', () => {
  it('完整数据通过；日期、分位范围、序列顺序、来源校验', () => {
    expect(asThsMarket(marketFixture())).not.toBeNull()
    for (const mutate of [
      (x: any) => { x.asOf = '2026-02-30' },
      (x: any) => { x.valuation[0].peP10 = 120 },
      (x: any) => { x.valuation[0].pe = '13' },
      (x: any) => { x.valuation[0].zone = '低估' },
      (x: any) => { x.valuation[1].code = x.valuation[0].code },
      (x: any) => { x.valuation[0].history.reverse() },
      (x: any) => { x.valuation[0].history.push(['2026-11-18', 1]) },
      (x: any) => { x.supply.lift.weeks[0].start = '2026-11-17' },
      (x: any) => { x.supply.holder[0].net = Infinity },
      (x: any) => { x.supply.funds[0].month = '2026-13' },
      (x: any) => { x.rates.treasury = [] },
      (x: any) => { x.style = [] },
      (x: any) => { x.sources[0].url = 'javascript:alert(1)' },
    ]) { const x = marketFixture(); mutate(x); expect(asThsMarket(x)).toBeNull() }
  })
})
