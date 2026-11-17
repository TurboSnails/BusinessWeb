import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ThsDatacenter from './ThsDatacenter'
import { datacenterFixture } from '../../features/ths-datacenter/fixtures'
import { asThsDatacenter } from '../../features/ths-datacenter/model'

const renderPage = () => render(<MemoryRouter initialEntries={['/ths-mood/datacenter']}><ThsDatacenter /></MemoryRouter>)
const stub = (body: unknown, ok = true) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => body })))
const card = (title: string): HTMLElement => screen.getByRole('heading', { name: title }).closest('section') as HTMLElement
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('同花顺 · 数据中心页', () => {
  it('总览、页签、免责、口径与相关链接', async () => {
    stub(datacenterFixture()); renderPage()
    expect(await screen.findByLabelText('数据中心总览')).toBeTruthy()
    expect(screen.getByRole('tab', { name: '数据中心' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText(/与同花顺官方无关/)).toBeTruthy()
    expect(screen.getByText('50.0%')).toBeTruthy()
    expect(screen.getByRole('link', { name: '开盘啦 · 财报避雷' }).getAttribute('href')).toBe('/market-mood/disclosure')
    expect(screen.getByRole('link', { name: '开盘啦 · 异动监管' }).getAttribute('href')).toBe('/market-mood/abnormal')
    expect(screen.getByText(/潜伏日历/)).toBeTruthy()
  })

  it('新股：申购日历缺失值显示「—」，次新股停牌、破发和筛选', async () => {
    stub(datacenterFixture()); renderPage()
    await screen.findByLabelText('数据中心总览')
    const ipo = card('新股与次新')
    const cal = within(ipo).getByRole('region', { name: '新股申购日历' })
    expect(within(cal).getAllByRole('row')).toHaveLength(3)
    expect(within(cal).getByText('待申购')).toBeTruthy()
    expect(within(cal).getByText('−63.9%')).toBeTruthy()
    expect(within(cal).getAllByText('—').length).toBeGreaterThan(0)
    fireEvent.click(within(ipo).getByText('次新股'))
    const sub = within(ipo).getByRole('region', { name: '次新股表现' })
    expect(within(sub).getByText('停牌')).toBeTruthy()
    expect(within(sub).getAllByText('−10.00%')[0].className).toContain('mm-down')
    expect(within(sub).getByText('+85.98%').className).toContain('mm-up')
    fireEvent.click(within(ipo).getByText('只看破发'))
    expect(within(within(ipo).getByRole('region', { name: '次新股表现' })).getAllByRole('row')).toHaveLength(2)
  })

  it('解禁：未来 30 日停牌市值不计、已解禁 T 日与 5 日', async () => {
    stub(datacenterFixture()); renderPage()
    await screen.findByLabelText('数据中心总览')
    const lift = card('限售解禁')
    expect(within(lift).getByText('422.49%')).toBeTruthy()
    expect(within(lift).getAllByText('停牌').length).toBe(1)
    fireEvent.click(within(lift).getByText('近 30 日已解禁'))
    const t = within(lift).getByRole('region', { name: '近 30 日已解禁明细' })
    expect(within(t).getAllByText('+0.26%')[0].className).toContain('mm-up')
    expect(within(lift).getByText(/不预示后续走势/)).toBeTruthy()
  })

  it('增减持：无均价金额为「—」、方向筛选、排行', async () => {
    stub(datacenterFixture()); renderPage()
    await screen.findByLabelText('数据中心总览')
    const h = card('重要股东增减持')
    const t = within(h).getByRole('region', { name: '增减持明细' })
    expect(within(t).getAllByRole('row')).toHaveLength(4)
    expect(within(t).getByText('−3000 万').className).toContain('mm-down')
    fireEvent.click(within(within(h).getByRole('group', { name: '增减持方向' })).getByText('减持'))
    expect(within(within(h).getByRole('region', { name: '增减持明细' })).getAllByRole('row')).toHaveLength(2)
    fireEvent.click(within(h).getByText('净增持排行'))
    expect(within(h).getByRole('region', { name: '近 30 日净增持排行' })).toBeTruthy()
    expect(within(h).getByText(/不用收盘价估算|只加有成交均价/)).toBeTruthy()
  })

  it('质押与商誉、回购进度筛选', async () => {
    stub(datacenterFixture()); renderPage()
    await screen.findByLabelText('数据中心总览')
    const r = card('股权质押与商誉')
    expect(within(r).getByText('78.74%')).toBeTruthy()
    fireEvent.click(within(r).getByText('商誉占净资产'))
    expect(within(r).getByText('1152.22%')).toBeTruthy()
    expect(within(r).getByText(/不做风险评级/)).toBeTruthy()
    const b = card('股票回购')
    expect(within(b).getByText('50.0%（25.0%）')).toBeTruthy()
    fireEvent.click(within(b).getByText('其他 1'))
    const t = within(b).getByRole('region', { name: '回购方案与进展' })
    expect(within(t).getAllByRole('row')).toHaveLength(2)
    expect(within(t).getByText('未标注')).toBeTruthy()
  })

  it.each([null, '<!doctype html><html></html>', { version: 1 }])('空文件或 200 HTML 回退显示 EmptyState (%j)', async body => {
    stub(body); renderPage()
    expect(await screen.findByText('暂无数据中心数据')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('404、JSON 解析异常和网络错误显示 EmptyState', async () => {
    for (const fetcher of [async () => ({ ok: false }), async () => ({ ok: true, json: async () => { throw new SyntaxError('HTML') } }), async () => { throw new Error('offline') }]) {
      vi.stubGlobal('fetch', vi.fn(fetcher)); renderPage()
      expect(await screen.findByText('暂无数据中心数据')).toBeTruthy()
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

describe('数据中心运行时模型', () => {
  it('完整数据通过；缺块、字段类型、日期与未来公告校验', () => {
    expect(asThsDatacenter(datacenterFixture())).not.toBeNull()
    for (const mutate of [
      (x: any) => { delete x.lift },
      (x: any) => { x.asOf = '2026-02-30' },
      (x: any) => { x.ipo.calendar[0].issuePrice = '' },
      (x: any) => { x.ipo.subNew.rows[0].cumPct = Infinity },
      (x: any) => { x.lift.upcoming.rows[0].cap = '1' },
      (x: any) => { x.holders.rows[0].dir = '其他' },
      (x: any) => { x.holders.rows[0].notice = '2026-11-18' },
      (x: any) => { x.buyback.rows[0].notice = '2026-11-18' },
      (x: any) => { x.pledge.date = '2026-11-20' },
      (x: any) => { x.goodwill.rows[0].ratio = null },
      (x: any) => { x.pledge.rows[0].code = 'abc' },
    ]) { const x = datacenterFixture(); mutate(x); expect(asThsDatacenter(x)).toBeNull() }
    const x = datacenterFixture(); x.sources[0].url = 'javascript:alert(1)'
    expect(asThsDatacenter(x)?.sources).toEqual([])
  })
})
