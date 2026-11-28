import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ipoFixture, moversFixture, putCallFixture, sectorFixture } from '../features/us-data-center/fixtures'
import UsDataCenter from './UsDataCenter'

let locationSearch = ''
function LocationProbe(): null {
  locationSearch = useLocation().search
  return null
}

const response = (payload: unknown, status = 200): Response => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload,
}) as Response

function payloadFor(url: string): unknown {
  const kind = new URL(url, 'http://localhost').searchParams.get('kind')
  if (kind === 'usdc-movers') return moversFixture
  if (kind === 'usdc-ipo') return ipoFixture
  if (kind === 'usdc-sectors') return sectorFixture
  if (kind === 'usdc-putcall') return putCallFixture
  throw new Error(`unexpected ${url}`)
}

beforeEach(() => {
  locationSearch = ''
  vi.stubGlobal('fetch', vi.fn(async (url: string) => response(payloadFor(url))))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderPage(entry = '/invest/us-data'): void {
  render(<MemoryRouter initialEntries={[entry]}><LocationProbe /><UsDataCenter /></MemoryRouter>)
}

describe('美股数据中心', () => {
  it('默认展示异动榜，写清过滤条件、时间和个股链接', async () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: '美股数据' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '异动榜' }).getAttribute('aria-selected')).toBe('true')
    expect(await screen.findByRole('link', { name: 'AAPL' })).toHaveProperty('href', 'http://localhost/research-notes?tab=lookup&s=AAPL')
    expect(screen.getByText(/市值至少 3 亿美元、股价至少 2 美元/)).toBeTruthy()
    expect(screen.getByText(/延迟约 15 分钟/)).toBeTruthy()
    expect(screen.getByText('数据仅供参考，不构成买卖建议。')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '成交量激增' }))
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.at(-1)?.[0]).toContain('list=surge'))
  })

  it('页签写入地址，新股与板块使用固定样本渲染', async () => {
    renderPage()
    await screen.findByRole('link', { name: 'AAPL' })
    fireEvent.click(screen.getByRole('tab', { name: '新股上市' }))
    expect(await screen.findByText('即将上市样本')).toBeTruthy()
    expect(locationSearch).toBe('?tab=ipo')
    expect(screen.getByRole('link', { name: 'SOON' }).getAttribute('href')).toBe('/research-notes?tab=lookup&s=SOON')
    expect(screen.getAllByRole('link', { name: /Nasdaq 原站/ }).length).toBeGreaterThan(0)
    expect(screen.getByText(/原站标注的更新日期：2026-11-27/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/LAST UPDATED|EDGAR/)

    fireEvent.click(screen.getByRole('tab', { name: '板块追踪' }))
    expect(await screen.findByText('信息技术')).toBeTruthy()
    expect(locationSearch).toBe('?tab=sectors')
    const table = screen.getByRole('table', { name: '行业与主题 ETF 区间涨跌，对照 SPY' })
    fireEvent.click(within(table).getByRole('button', { name: /1 日/ }))
    const rows = within(table).getAllByRole('row')
    expect(rows[1].textContent).toContain('SPY')
    expect(rows[2].textContent).toContain('SMH')
    expect(rows[3].textContent).toContain('XLK')
    expect(within(table).getByRole('columnheader', { name: /1 日/ }).getAttribute('aria-sort')).toBe('descending')
  })

  it('看跌看涨页叠加 SPY，并披露来源与旧下载表限制', async () => {
    renderPage('/invest/us-data?tab=putcall')
    expect(await screen.findByRole('img', { name: /每日看跌看涨比/ })).toBeTruthy()
    expect(screen.getByText('股票期权', { selector: 'li' })).toBeTruthy()
    expect(screen.getByText(/SPY 起点=100/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Cboe 每日期权市场统计/ }).getAttribute('href')).toContain('cboe.com')
    expect(screen.getByText(/旧下载表停在 2019 年/)).toBeTruthy()
    fireEvent.click(screen.getByText('查看逐日数值'))
    expect(screen.getByRole('table', { name: '逐日看跌看涨比与 SPY 收盘价' }).textContent).toContain('2026-11-27')
  })

  it('成交量激增部分来源失败时提示可能不完整', async () => {
    vi.mocked(fetch).mockImplementation(async () => response({ ...moversFixture, mode: 'surge', partial: true }))
    renderPage()
    expect(await screen.findByText(/本榜可能不完整/)).toBeTruthy()
  })

  it('四个页签的读者文案不出现禁用措辞', async () => {
    for (const tab of ['', '?tab=ipo', '?tab=sectors', '?tab=putcall']) {
      renderPage(`/invest/us-data${tab}`)
      await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
      expect(document.body.textContent).not.toMatch(/机构|主力|推荐|必涨/)
      cleanup()
    }
  })

  it('加载失败可重试，空日历显示空状态', async () => {
    vi.mocked(fetch).mockImplementationOnce(async () => response({ error: '公开数据源暂时不可用' }, 502))
    renderPage()
    expect(await screen.findByText('数据暂时取不到')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByRole('link', { name: 'AAPL' })).toBeTruthy()
    cleanup()

    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      if (String(input).includes('kind=usdc-ipo')) return response({ ...ipoFixture, groups: { upcoming: [], priced: [], filed: [], withdrawn: [] } })
      return response(payloadFor(String(input)))
    })
    renderPage('/invest/us-data?tab=ipo')
    expect(await screen.findByText('这个月暂无新股记录')).toBeTruthy()
  })
})
