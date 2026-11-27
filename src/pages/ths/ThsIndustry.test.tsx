import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ThsIndustry from './ThsIndustry'
import { industryFixture } from '../../features/ths-industry/fixtures'
import { asThsIndustry } from '../../features/ths-industry/model'

const renderPage = () => render(<MemoryRouter initialEntries={['/ths-mood/industry']}><ThsIndustry /></MemoryRouter>)
const stub = (body: unknown, ok = true) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => body })))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('同花顺 · 行业景气页', () => {
  it('景气表、得分公式、贡献度与口径', async () => {
    stub(industryFixture()); renderPage()
    const [table] = await screen.findAllByRole('table')
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(4)
    expect(within(rows[1]).getByText('半导体')).toBeTruthy() // 默认按得分降序
    expect(within(rows[3]).getAllByText('房地产').length).toBeGreaterThan(0) // 无得分排最后
    expect(screen.getByText('+35.2%').className).toContain('mm-up')
    expect(screen.getByText('−2.1%').className).toContain('mm-down')
    expect(screen.getByText(/景气得分为本站自定，不是同花顺「景气度」/)).toBeTruthy()
    expect(screen.getByText(/10 年分位暂不计算/)).toBeTruthy()
    expect(screen.getByText(/整体法汇总/)).toBeTruthy()
    fireEvent.click(within(screen.getByRole('group', { name: '一级行业筛选' })).getByText('金融'))
    expect(within(screen.getAllByRole('table')[0]).getAllByRole('row')).toHaveLength(2)
    expect(screen.getByRole('tab', { name: '行业景气' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText(/与同花顺官方无关/)).toBeTruthy()
    expect(screen.getByText('+2.51').className).toContain('mm-up')
    expect(screen.getByText('−3.13').className).toContain('mm-down')
    expect(screen.getByText(/最大偏差 0.05 点/)).toBeTruthy()
    fireEvent.click(within(screen.getByRole('group', { name: '贡献度指数' })).getByText('创业板指'))
    expect(screen.getByText('1.70%*')).toBeTruthy()
    expect(screen.getByText(/国证官网只公开创业板指前十大权重/)).toBeTruthy()
    expect(screen.getAllByRole('link', { name: '板块轮动' }).length).toBeGreaterThan(0)
    expect(screen.getByText(/同花顺「AI 景气度分」/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/建议买入|建议卖出|胜率/)
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

describe('行业景气页运行时模型', () => {
  it('完整数据通过；类型、范围、日期、来源校验', () => {
    expect(asThsIndustry(industryFixture())).not.toBeNull()
    for (const mutate of [
      (x: any) => { x.asOf = '2026-02-30' },
      (x: any) => { x.industry.rows[0].peP5 = 120 },
      (x: any) => { x.industry.rows[0].pe = '20' },
      (x: any) => { x.industry.rows[1].code = x.industry.rows[0].code },
      (x: any) => { x.industry.rows = [] },
      (x: any) => { x.industry.rows[0].ranks.roe = -1 },
      (x: any) => { x.contribution[0].date = '2026-11-16' },
      (x: any) => { x.contribution[0].weightDate = '2026-11-18' },
      (x: any) => { x.contribution[0].up[0].points = -1 },
      (x: any) => { x.contribution[0].change = Infinity },
      (x: any) => { x.contribution = [] },
      (x: any) => { x.sources[0].url = 'javascript:alert(1)' },
    ]) { const x = industryFixture(); mutate(x); expect(asThsIndustry(x)).toBeNull() }
  })
})
