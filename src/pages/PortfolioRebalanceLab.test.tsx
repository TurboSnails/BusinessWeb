import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PortfolioRebalanceLab from './PortfolioRebalanceLab'
import { loadPriceBook, loadPriceIndex } from '../features/portfolio-rebalance/data'
import indexFixture from '../features/portfolio-rebalance/__fixtures__/index.json'
import type { PriceBook, PriceIndex } from '../features/portfolio-rebalance/types'

vi.mock('../features/portfolio-rebalance/data', () => ({
  loadPriceIndex: vi.fn(),
  loadPriceBook: vi.fn(),
}))

const mockedIndex = vi.mocked(loadPriceIndex)
const mockedBook = vi.mocked(loadPriceBook)
const dates = ['2021-08-25', '2021-08-26', '2021-12-31', '2022-01-03']

function fixtureBook(): PriceBook {
  return Object.fromEntries(['AVGO', 'AAPL', 'META', 'V', 'CB', 'SOFI', 'RKLB', 'PDD', 'QQQ', 'QQQE', 'QQEW'].map((symbol, index) => [symbol, {
    dates,
    adjClose: symbol === 'QQQ' ? [100, 100, 70, 100] : [100, 101 + index, 102 + index, 103 + index],
  }]))
}

function fixtureIndex(): PriceIndex {
  return JSON.parse(JSON.stringify(indexFixture)) as PriceIndex
}

async function expandForm(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: '修改组合与规则' }))
}

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  mockedIndex.mockResolvedValue(fixtureIndex())
  mockedBook.mockResolvedValue(fixtureBook())
})

afterEach(() => cleanup())

describe('组合再平衡回测页', () => {
  it('默认打开先显示自动结论，再显示含 QQQ 与 QQQE 的四格对比', async () => {
    render(<PortfolioRebalanceLab />)
    expect(await screen.findByRole('heading', { name: '四格对比' })).toBeTruthy()
    expect(screen.getAllByText('不动').length).toBe(2)
    expect(screen.getAllByText('动态平衡').length).toBe(2)
    expect(screen.getByText('等权')).toBeTruthy()
    expect(screen.getAllByText('QQQ').length).toBeGreaterThan(0)
    expect(screen.getAllByText('QQQE（纳指 100 等权）').length).toBeGreaterThan(0)
    const conclusions = screen.getByRole('heading', { name: '这次回测说明了什么' })
    const comparison = screen.getByRole('heading', { name: '四格对比' })
    expect(conclusions.compareDocumentPosition(comparison) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('heading', { name: '核心指标' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '当前离线距离' })).toBeTruthy()
  })

  it('摘要卡默认折叠，展开后计算会收起', async () => {
    render(<PortfolioRebalanceLab />)
    const summary = await screen.findByRole('region', { name: '当前组合与规则' })
    expect(summary.textContent).toContain('AVGO 25% · META 25% · CB 25% · SOFI 12.5% · RKLB 12.5%')
    expect(summary.textContent).toContain('相对偏离 40%')
    expect(summary.textContent).toContain('大跌切换：关')
    expect(screen.queryByRole('button', { name: '计算回测' })).toBeNull()
    await expandForm()
    expect(screen.getByRole('button', { name: '计算回测' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '计算回测' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: '计算回测' })).toBeNull())
    expect(screen.getByRole('region', { name: '当前组合与规则' })).toBeTruthy()
  })

  it('动态平衡格显示相对不动的收益差', async () => {
    render(<PortfolioRebalanceLab />)
    await screen.findByRole('heading', { name: '四格对比' })
    const relative = screen.getAllByText(/^相对不动 /)
    expect(relative).toHaveLength(2)
    expect(relative.every(element => /^相对不动 [+−\d]/.test(element.textContent ?? '') && element.textContent?.includes('%'))).toBe(true)
  })

  it('权重合计 90% 时计算按钮禁用并提示合计须为 100%', async () => {
    render(<PortfolioRebalanceLab />)
    await expandForm()
    const input = await screen.findByRole('spinbutton', { name: '博通目标权重百分比' })
    fireEvent.change(input, { target: { value: '15' } })
    expect(screen.getAllByText(/合计须为 100%/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '计算回测' })).toHaveProperty('disabled', true)
  })

  it('缺分红代码显示只算价格涨跌，结果偏低', async () => {
    const index = fixtureIndex()
    const cb = index.items.find(item => item.symbol === 'CB')!
    cb.dividendStatus = 'missing'
    mockedIndex.mockResolvedValue(index)
    render(<PortfolioRebalanceLab />)
    expect(await screen.findByText(/安达保险（CB）：该股只算价格涨跌，结果偏低/)).toBeTruthy()
  })

  it('超过两只缺分红时合并成一行并保留逐只说明', async () => {
    const index = fixtureIndex()
    for (const item of index.items.filter(item => ['AVGO', 'META', 'CB', 'SOFI', 'RKLB'].includes(item.symbol))) item.dividendStatus = 'missing'
    mockedIndex.mockResolvedValue(index)
    render(<PortfolioRebalanceLab />)
    expect(await screen.findByText('5 只代码缺分红数据（博通、Meta、Rocket Lab、SoFi、安达保险），只算价格涨跌，结果偏低')).toBeTruthy()
    expect(screen.getByText(/安达保险（CB）：该股只算价格涨跌，结果偏低/)).toBeTruthy()
  })

  it('显示暂未与第二来源核对的代码', async () => {
    const index = fixtureIndex()
    index.items.find(item => item.symbol === 'AVGO')!.crossCheck = 'unavailable'
    index.items.find(item => item.symbol === 'META')!.crossCheck = 'unavailable'
    mockedIndex.mockResolvedValue(index)
    render(<PortfolioRebalanceLab />)
    expect(await screen.findByText('以下代码暂未与第二来源核对，仅有 Yahoo 数据：博通、Meta')).toBeTruthy()
  })

  it('开启大跌切换后出现逐轮大跌表', async () => {
    render(<PortfolioRebalanceLab />)
    await expandForm()
    const toggle = await screen.findByRole('checkbox', { name: /QQQ 大跌时/ })
    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('button', { name: '计算回测' }))
    expect(await screen.findByRole('heading', { name: '逐轮大跌' })).toBeTruthy()
    expect(screen.getAllByRole('region', { name: '逐轮大跌' }).length).toBeGreaterThan(0)
  })

  it('页面不出现推荐式标签，只保留不是推荐的边界说明', async () => {
    render(<PortfolioRebalanceLab />)
    await screen.findByRole('heading', { name: '四格对比' })
    expect(document.body.textContent).not.toMatch(/最佳|首选|省心|回撤最小|没有明显短板/)
    expect(screen.getByText('事后挑选的历史测试组合，用来对照，不是推荐或买卖建议。')).toBeTruthy()
  })

  it('研究参考组合载入后网址含 calendar:year 与正确 s 参数', async () => {
    render(<PortfolioRebalanceLab />)
    expect(await screen.findByText('研究参考组合')).toBeTruthy()
    const preferred = screen.getByText('Meta 换苹果').closest('article')
    fireEvent.click(preferred!.querySelector('button')!)
    await waitFor(() => {
      const params = new URLSearchParams(window.location.search)
      expect(params.get('rule')).toBe('calendar:year')
      expect(params.get('s')).toBe('AVGO:25,AAPL:25,CB:25,SOFI:12.5,RKLB:12.5')
      expect(params.has('sw')).toBe(false)
    })
    expect(preferred!.querySelector('button')!.textContent).toBe('已载入')
    expect(preferred!.querySelector('button')).toHaveProperty('disabled', true)
  })

  it('数据加载失败显示错误与重试按钮', async () => {
    mockedIndex.mockRejectedValueOnce(new Error('网络错误'))
    render(<PortfolioRebalanceLab />)
    expect(await screen.findByText('价格数据暂时无法加载')).toBeTruthy()
    const retry = screen.getByRole('button', { name: '重试' })
    expect(retry).toBeTruthy()
    fireEvent.click(retry)
    expect(await screen.findByRole('heading', { name: '四格对比' })).toBeTruthy()
  })
})
