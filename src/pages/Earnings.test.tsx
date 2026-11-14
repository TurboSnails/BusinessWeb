import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Earnings from './Earnings'
import { calendar } from '../features/earnings/fixtures'
import { CANDIDATES_KEY } from '../features/candidates/store'

// 2026-11-16（周一）北京时间上午：本周 = 11/16–11/20
const NOW = new Date('2026-11-16T02:00:00Z')
const okFetch = (body: unknown) => vi.fn(async () => ({ ok: true, json: async () => body }))
const renderPage = (now = NOW) => render(<MemoryRouter><Earnings now={now} /></MemoryRouter>)

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('财报前瞻页', () => {
  it('加载中 → 本周日历：按日列出，盘前 / 盘后分组，公司链接到研究页', async () => {
    vi.stubGlobal('fetch', okFetch(calendar()))
    renderPage()
    expect(screen.getByRole('status').textContent).toContain('正在加载')
    const tue = await screen.findByRole('listitem', { name: /周二 2026-11-17/ })
    expect(within(tue).getByRole('heading', { name: '盘后' })).toBeTruthy()
    expect(within(tue).getByRole('link', { name: '英伟达' }).getAttribute('href')).toBe('/research-notes/us/NVDA')
    expect(within(screen.getByRole('listitem', { name: /周四 2026-11-19/ })).getByRole('heading', { name: '盘前' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '本周 11/16–11/20' }).getAttribute('aria-pressed')).toBe('true')
    // 一致预期与评级
    const nvda = screen.getByRole('article', { name: '英伟达 财报' })
    expect(nvda.textContent).toContain('EPS 预期 $2.47')
    expect(nvda.textContent).toContain('条件关注')
    expect(nvda.textContent).toContain('已确认')
    // 展开内容：历史超预期、情景带、这次要验证什么
    expect(nvda.textContent).toContain('近 2 季 EPS 实际 vs 预期')
    expect(nvda.textContent).toContain('距基准情景 +15.8%')
    expect(nvda.textContent).toContain('Q3 业绩：数据中心收入与毛利率')
  })

  it('筛选：市场、只看候选池、只看条件关注以上、搜索', async () => {
    localStorage.setItem(CANDIDATES_KEY, JSON.stringify([{ market: 'ndx', code: 'WMT', addedAt: '2026-11-01T00:00:00Z' }]))
    vi.stubGlobal('fetch', okFetch(calendar()))
    renderPage()
    await screen.findByRole('article', { name: '英伟达 财报' })
    fireEvent.click(screen.getByRole('button', { name: /港股/ }))
    expect(screen.queryByRole('article', { name: '英伟达 财报' })).toBeNull()
    expect(screen.getByRole('article', { name: '腾讯控股 财报' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /全部/ }))
    fireEvent.click(screen.getByRole('button', { name: '只看候选池' }))
    expect(screen.getAllByRole('article').map(a => a.getAttribute('aria-label'))).toEqual(['沃尔玛 财报'])
    fireEvent.click(screen.getByRole('button', { name: '只看候选池' }))
    fireEvent.click(screen.getByRole('button', { name: '只看条件关注以上' }))
    expect(screen.queryByRole('article', { name: '小公司 财报' })).toBeNull()
    expect(screen.queryByRole('article', { name: '沃尔玛 财报' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '只看条件关注以上' }))
    fireEvent.change(screen.getByRole('searchbox', { name: '搜索公司名称或代码' }), { target: { value: 'zzz' } })
    expect(screen.getAllByRole('article').map(a => a.getAttribute('aria-label'))).toEqual(['小公司 财报'])
  })

  it('本周最受关注：站内口径（候选池、评级、市值），写明规则', async () => {
    localStorage.setItem(CANDIDATES_KEY, JSON.stringify([{ market: 'us', code: 'WMT', addedAt: '2026-11-01T00:00:00Z' }]))
    vi.stubGlobal('fetch', okFetch(calendar()))
    renderPage()
    const box = await screen.findByRole('region', { name: '本周最受关注' })
    expect(within(box).getAllByRole('link').map(a => a.textContent)).toEqual(['沃尔玛', '腾讯控股', '英伟达'])
    expect(box.textContent).toContain('不是外部热度')
  })

  it('A 股淡季：本周没有 A 股条目时说明下一个披露窗口', async () => {
    vi.stubGlobal('fetch', okFetch(calendar()))
    renderPage()
    await screen.findByRole('article', { name: '英伟达 财报' })
    fireEvent.click(screen.getByRole('button', { name: /A股/ }))
    expect(screen.getByText(/下一个披露窗口/).textContent).toContain('2026 年年报')
    expect(screen.getByText(/下一个披露窗口/).textContent).toContain('2027-01-01 至 2027-04-30')
  })

  it('近两周已公布：实际 vs 预期与超预期标记（美股绿色类），A 股只列同比', async () => {
    vi.stubGlobal('fetch', okFetch(calendar()))
    renderPage()
    await screen.findByRole('article', { name: '英伟达 财报' })
    fireEvent.click(screen.getByRole('button', { name: '近两周已公布' }))
    const csco = screen.getByRole('article', { name: '思科 已公布' })
    expect(csco.textContent).toContain('EPS $1.40')
    expect(csco.querySelector('.ec-surprise')?.className).toBe('ec-surprise is-beat is-us')
    expect(csco.textContent).toContain('超预期 +5.6%')
    const moutai = screen.getByRole('article', { name: '贵州茅台 已公布' })
    expect(moutai.querySelector('.ec-surprise')).toBeNull()
    expect(moutai.textContent).toContain('净利同比 −0.3%')
  })

  it('A 股预告 / 快报视图', async () => {
    vi.stubGlobal('fetch', okFetch(calendar()))
    renderPage()
    await screen.findByRole('article', { name: '英伟达 财报' })
    fireEvent.click(screen.getByRole('button', { name: 'A 股预告 / 快报' }))
    const row = screen.getByRole('article', { name: '宁德时代 业绩预告' })
    expect(row.textContent).toContain('预增')
    expect(row.textContent).toContain('¥500 亿 至 ¥600 亿')
  })

  it('来源失败与过期：列出失败来源和沿用日期；生成超过 2 天提示', async () => {
    vi.stubGlobal('fetch', okFetch(calendar()))
    renderPage(new Date('2026-11-18T02:00:00Z'))
    await screen.findByRole('article', { name: '英伟达 财报' })
    expect(screen.getByText('部分来源本次没有取到')).toBeTruthy()
    expect(screen.getByText(/港交所披露易·董事会会议通告：HTTP 503；沿用 2026-11-12 的数据/)).toBeTruthy()
    expect(screen.getByText('数据已 3 天未更新')).toBeTruthy()
    expect(screen.getByRole('note', { name: '数据更新时间' }).textContent).toContain('核验日期 2026-11-14')
  })

  it('加载失败显示错误；周末时第一页签是下周', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })))
    renderPage(new Date('2026-11-14T02:00:00Z'))
    await waitFor(() => expect(screen.getByText('财报日历暂时无法加载')).toBeTruthy())
    cleanup()
    vi.stubGlobal('fetch', okFetch(calendar()))
    renderPage(new Date('2026-11-14T02:00:00Z'))
    expect(await screen.findByRole('button', { name: '下周 11/16–11/20' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '再下周 11/23–11/27' })).toBeTruthy()
  })
})
