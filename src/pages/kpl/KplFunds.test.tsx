import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import KplFunds from './KplFunds'
import { fundsFixture } from '../../features/kpl-funds/fixtures'
import { asKplFunds } from '../../features/kpl-funds/model'
const renderPage = () => render(<MemoryRouter initialEntries={['/market-mood/funds']}><KplFunds /></MemoryRouter>)
const stub = (body: unknown, ok = true) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => body })))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
describe('盘后资金页', () => {
  it('日期、范围口径、主力估算说明、四张完整排行和页签', async () => {
    stub(fundsFixture()); renderPage()
    const tables = await screen.findAllByRole('table')
    expect(tables.map(t => within(t).getAllByRole('row').length)).toEqual([31, 31, 16, 16])
    expect(screen.getByText(/数据日期：2026-11-17/)).toBeTruthy()
    expect(screen.getByText(/主力资金是数据供应商/)).toBeTruthy()
    expect(screen.getByText(/异动、对倒、压单、托单/)).toBeTruthy()
    expect(screen.getByText(/与开盘啦官方无关/)).toBeTruthy()
    expect(screen.getByRole('tab', { name: '资金' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('img', { name: '沪深主力资金净流入历史走势' })).toBeTruthy()
    expect(screen.getAllByText('−2.00 亿').length).toBeGreaterThan(0)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    const r = tables[1]
    expect(within(r).getByText('−30.00 亿').className).toContain('mm-down')
    const inflow = tables[0]
    expect(within(inflow).getByText('+30.00 亿').className).toContain('mm-up')
    fireEvent.click(within(screen.getByRole('group', { name: '历史范围' })).getByText('20 日'))
    expect(screen.getByRole('img', { name: '沪深主力资金净流入历史走势' })).toBeTruthy()
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
  it('卸载时中止请求', () => {
    const fetcher = vi.fn((_url: string, _init: RequestInit) => new Promise(() => {}))
    vi.stubGlobal('fetch', fetcher)
    const page = renderPage(); page.unmount()
    expect(fetcher.mock.calls[0][1].signal?.aborted).toBe(true)
  })
})
describe('资金运行时模型', () => {
  it('完整数据通过；嵌套字段、真实日期、排序、重复和非有限数校验', () => {
    expect(asKplFunds(fundsFixture())).not.toBeNull()
    for (const mutate of [
      (x: any) => { x.history[0].date = '2026-02-30' },
      (x: any) => { x.history.reverse() },
      (x: any) => { x.stocks.inflow.pop() },
      (x: any) => { x.stocks.inflow[0].main = null },
      (x: any) => { x.stocks.inflow[0].amount = '' },
      (x: any) => { x.stocks.inflow[0].mainRatio = Infinity },
      (x: any) => { x.industries.outflow[0].main = 1 },
      (x: any) => { x.stocks.inflow[1].code = x.stocks.inflow[0].code },
      (x: any) => { x.sources[0].url = 'javascript:alert(1)' },
      (x: any) => { x.history.at(-1).main = null },
    ]) { const x = fundsFixture(); mutate(x); expect(asKplFunds(x)).toBeNull() }
  })
})
