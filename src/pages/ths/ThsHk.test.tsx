import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ThsHk from './ThsHk'
import { hkFixture } from '../../features/ths-hk/fixtures'
import { asThsHk, hkdMillion, sumLast } from '../../features/ths-hk/model'

const renderPage = () => render(<MemoryRouter initialEntries={['/ths-mood/hk']}><ThsHk /></MemoryRouter>)
const table = (name: string) => within(screen.getByRole('region', { name })).getByRole('table')
const stub = (body: unknown, ok = true) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => body })))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('港股通与AH 页', () => {
  it('四块数据各带日期、口径说明、表格与页签', async () => {
    stub(hkFixture()); renderPage()
    expect(await screen.findByRole('region', { name: 'AH 股溢价列表' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '港股通与AH' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText(/与同花顺官方无关/)).toBeTruthy()
    expect(screen.getByText('+22.04 亿')).toBeTruthy()
    expect(screen.getByText('当日该通道休市')).toBeTruthy()
    expect(screen.getByRole('img', { name: '南向资金每日净买入' })).toBeTruthy()
    expect(screen.getByRole('img', { name: '恒生 AH 股溢价指数走势' })).toBeTruthy()
    expect(screen.getByRole('img', { name: '港股全市场卖空占比走势' })).toBeTruthy()
    expect(screen.getByText(/港元兑人民币中间价 0.8556/)).toBeTruthy()
    expect(screen.getByText(/港股 T\+2 交收/)).toBeTruthy()
    expect(screen.getByText(/分位 ≥ 80 记「较高」/)).toBeTruthy()
    expect(screen.getByText('港股通机会（新纳入 / 预期纳入）')).toBeTruthy()
    expect(screen.getByRole('link', { name: '全球行情' }).getAttribute('href')).toBe('/pulse')
    // AH 表：60 行 + 表头；停牌缺值显示「—」并排在最后
    const ah = table('AH 股溢价列表')
    const rows = within(ah).getAllByRole('row')
    expect(rows.length).toBe(61)
    expect(within(rows[1]).getByText('+60.00%').className).toContain('mm-up')
    expect(within(rows[60]).getAllByText('—').length).toBeGreaterThan(0)
    // 卖空标签与样本不足
    const short = table('港股卖空比例排行')
    expect(within(short).getByText('较高')).toBeTruthy()
    expect(within(short).getByText('样本不足')).toBeTruthy()
    // 持股比例变化
    const down = table('港股通持股比例减少排行')
    expect(within(down).getByText('−0.800 pp').className).toContain('mm-down')
    fireEvent.click(within(screen.getByRole('group', { name: 'AH 溢价指数范围' })).getByText('近 3 年'))
    fireEvent.click(within(screen.getByRole('group', { name: '南向历史范围' })).getByText('20 日'))
    expect(screen.getByRole('img', { name: '南向资金每日净买入' })).toBeTruthy()
  })
  it('某一块为空时其余照常显示', async () => {
    const x = hkFixture(); x.short = null; x.ah = null
    stub(x); renderPage()
    expect(await screen.findByText('港股卖空暂缺')).toBeTruthy()
    expect(screen.getByText('AH 溢价暂缺')).toBeTruthy()
    expect(table('港股通持股市值排行')).toBeTruthy()
  })
  it.each([null, '<!doctype html><html></html>', { version: 1 }])('空文件或 200 HTML 回退显示 EmptyState (%j)', async body => {
    stub(body); renderPage()
    expect(await screen.findByText('暂无港股通与AH数据')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })
  it('404、JSON 解析异常和网络错误显示 EmptyState', async () => {
    for (const fetcher of [async () => ({ ok: false }), async () => ({ ok: true, json: async () => { throw new SyntaxError('HTML') } }), async () => { throw new Error('offline') }]) {
      vi.stubGlobal('fetch', vi.fn(fetcher)); renderPage()
      expect(await screen.findByText('暂无港股通与AH数据')).toBeTruthy()
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

describe('港股通与AH 运行时模型', () => {
  it('完整数据通过；嵌套字段、日期、排序、重复、来源和非有限数校验', () => {
    expect(asThsHk(hkFixture())).not.toBeNull()
    for (const mutate of [
      (x: any) => { x.south.history[0].date = '2026-02-30' },
      (x: any) => { x.south.history.reverse() },
      (x: any) => { x.south.history.at(-1).net = null },
      (x: any) => { x.south.top10.sh.pop() },
      (x: any) => { x.south.top10.sh[0].net = '1' },
      (x: any) => { x.ah.fx.date = '2026-11-16' },
      (x: any) => { x.ah.rows[1].hCode = x.ah.rows[0].hCode },
      (x: any) => { x.ah.rows[0].premium = Infinity },
      (x: any) => { x.ah.index.history.at(-1).date = '2026-11-18' },
      (x: any) => { x.holdings.ratioUp[0].ratioChg = -1 },
      (x: any) => { x.short.top.reverse() },
      (x: any) => { x.short.top[0].label = '偏高' },
      (x: any) => { x.short.history.at(-1).date = '2026-11-16' },
      (x: any) => { x.sources[0].url = 'javascript:alert(1)' },
      (x: any) => { x.south = null; x.ah = null; x.holdings = null; x.short = null },
    ]) { const x = hkFixture(); mutate(x); expect(asThsHk(x)).toBeNull() }
  })
  it('累计净买入：天数不足或有缺值时不给结果', () => {
    const h = hkFixture().south!.history
    expect(sumLast(h, 3)).toBe(310.37)
    expect(sumLast(h, 4)).toBeNull()
    expect(sumLast([{ ...h[0], net: null }, h[1]], 2)).toBeNull()
    expect(hkdMillion(-4226.73)).toBe('−42.27 亿')
  })
})
