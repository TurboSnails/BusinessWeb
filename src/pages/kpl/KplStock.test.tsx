import React from 'react'
import fs from 'node:fs'
import path from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import KplStock from './KplStock'
import { stockFixture } from '../../features/kpl-stock/fixtures'
import { asStockDetail, asStockIndex } from '../../features/kpl-stock/model'

const renderPage = (url = '/market-mood/stock?code=600000') => render(<MemoryRouter initialEntries={[url]}><KplStock /></MemoryRouter>)
const stub = (f = stockFixture()) => {
  const fetcher = vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => url.endsWith('kpl-stock.json') ? f.index : { [f.detail.code]: f.detail } }))
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('开盘啦 · 个股', () => {
  it('深链懒加载对应分片，显示统计、月收益、筹码与估值参考线，口径和免责齐全', async () => {
    const fetcher = stub()
    renderPage()
    expect(await screen.findByRole('region', { name: '区间统计' })).toBeTruthy()
    expect(fetcher.mock.calls.map(c => c[0])).toEqual(['/data/kpl-stock.json', '/data/kpl-stock-600.json'])
    expect(within(screen.getByRole('tablist', { name: '开盘啦页签' })).getByRole('tab', { name: '个股' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('img', { name: '月度收益率' })).toBeTruthy()
    expect(screen.getByRole('img', { name: '筹码分布模型估计' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'PE(TTM) 历史估值' })).toBeTruthy()
    expect(screen.queryByText('亏损，PE 不适用', { exact: true })).toBeNull()
    expect(document.body.textContent).toContain('56.00%')
    expect(document.body.textContent).toContain('截至 2026-11-17')
    expect(document.body.textContent).toContain('25% 档')
    expect(document.body.textContent).toContain('模型估计，不是交易所')
    expect(document.body.textContent).toContain('与开盘啦官方无关')
    expect(document.body.textContent).not.toMatch(/建议买入|建议卖出/)
  })

  it('检索名称/代码，今日快捷名单过滤，未入池与详情缺失都有空状态', async () => {
    const fetcher = stub()
    renderPage('/market-mood/stock')
    await screen.findByRole('searchbox')
    expect(fetcher.mock.calls.length).toBe(1)
    const lists = screen.getByRole('group', { name: '股票快捷名单' })
    fireEvent.click(within(lists).getByText('龙虎榜'))
    expect(screen.getByRole('button', { name: /平安银行 000001/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /浦发银行 600000/ })).toBeNull()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '浦发' } })
    fireEvent.click(screen.getByRole('button', { name: /浦发银行 600000/ }))
    await screen.findByRole('region', { name: '区间统计' })
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '999999' } })
    expect(await screen.findByText('股票不在本页候选池')).toBeTruthy()
  })

  it('未入池深链不会发起分片请求', async () => {
    const fetcher = stub()
    renderPage('/market-mood/stock?code=999999')
    expect(await screen.findByText('股票不在本页候选池')).toBeTruthy()
    expect(fetcher.mock.calls.length).toBe(1)
  })

  it('亏损 PE 提示且 PB 继续绘图；空筹码不伪造', async () => {
    const f = stockFixture()
    f.detail.valuation!.pe.status = 'loss'
    f.detail.valuation!.pe.current = null
    f.detail.valuation!.pe.percentile = null
    f.detail.chips = null
    stub(f)
    renderPage()
    expect(await screen.findByText('亏损，PE 不适用')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'PB 历史估值' })).toBeTruthy()
    expect(screen.queryByRole('img', { name: 'PE(TTM) 历史估值' })).toBeNull()
    expect(screen.getByText('筹码模型暂不可用')).toBeTruthy()
  })

  it.each(['404', 'html', 'bad'])('缺失索引 %s 使用 EmptyState', async kind => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: kind !== '404', status: kind === '404' ? 404 : 200, json: async () => { if (kind === 'html') throw new SyntaxError('HTML'); return {} } })))
    renderPage()
    expect(await screen.findByText('个股数据尚未生成或暂不可用')).toBeTruthy()
  })

  it('缺失分片和日期不匹配显示空状态，保留检索入口', async () => {
    const f = stockFixture()
    f.detail.asOf = '2026-11-17'
    stub(f)
    renderPage()
    expect(await screen.findByText('个股详情暂不可用')).toBeTruthy()
    expect(screen.getByRole('searchbox')).toBeTruthy()
  })

  it('运行时校验拒绝坏字段、重复证券、未来日期、错码和不守恒筹码', () => {
    const { index, detail } = stockFixture()
    expect(asStockIndex(index)).toBeTruthy()
    expect(asStockDetail(detail, index.stocks[0], index.asOf)).toBeTruthy()
    expect(asStockIndex({ ...index, stocks: [index.stocks[0], index.stocks[0]] })).toBeNull()
    expect(asStockIndex({ ...index, asOf: '2026-02-30' })).toBeNull()
    expect(asStockDetail({ ...detail, code: '000001' }, index.stocks[0], index.asOf)).toBeNull()
    expect(asStockDetail({ ...detail, close: '-' }, index.stocks[0], index.asOf)).toBeNull()
    detail.chips!.buckets[0].weight = 0.5
    expect(asStockDetail(detail, index.stocks[0], index.asOf)).toBeNull()
  })

  it('页面没有内联样式或硬编码颜色，移动端表格用 TableWrap', () => {
    const source = fs.readFileSync(path.resolve(__dirname, 'KplStock.tsx'), 'utf8')
    expect(source).not.toMatch(/style=\{\{|#[0-9a-fA-F]{3,8}\b|rgba?\(/)
    expect(source).toContain('TableWrap label=')
  })
})
