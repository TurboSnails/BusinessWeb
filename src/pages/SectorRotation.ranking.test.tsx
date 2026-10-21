import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SectorRotation from './SectorRotation'

afterEach(() => { cleanup(); sessionStorage.clear(); localStorage.clear(); vi.unstubAllGlobals(); vi.useRealTimers(); window.location.hash = '' })

const stock = (code: string, date: string) => ({ secu_code: code, secu_name: `股${code}`, time: `${date} 09:31:00`, last_px: 10, change: 0.1, cmc: 1e8, up_num: '2天2板' })
/** 所有日期都返回同一个板块「机器人」：前一天涨停 sz1、sz2，之后只剩 sz1 */
function stubPayload(): void {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const m = String(url).match(/date(?:%3D|=)(\d{8})/)!
    const d = m[1]; const date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
    const codes = date >= '2026-09-30' ? ['sz1'] : ['sz1', 'sz2']
    return new Response(JSON.stringify({ code: 200, data: { plate_stock: [
      { secu_name: '机器人', change: 0.02, plate_stock_up_num: codes.length, stock_list: codes.map(c => stock(c, date)) },
      { secu_name: 'ST板块', change: 0.05, plate_stock_up_num: 1, stock_list: [stock('sz9', date)] },
    ] } }), { status: 200 })
  }))
}

describe('板块排行标签', () => {
  it('切到板块排行显示矩阵说明，并可回到板块轮动', async () => {
    stubPayload()
    await act(async () => { render(<SectorRotation />) })
    await act(async () => fireEvent.click(screen.getByRole('tab', { name: '板块排行' })))
    expect(screen.getByText(/近 20 个交易日出现涨停的概念板块/)).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('tab', { name: '板块轮动' })))
    expect(screen.getByRole('tab', { name: '板块轮动' }).getAttribute('aria-selected')).toBe('true')
  })
  it('#plate-ranking 直达排行视图', async () => {
    stubPayload()
    window.location.hash = '#plate-ranking'
    await act(async () => { render(<SectorRotation />) })
    expect(screen.getByRole('tab', { name: '板块排行' }).getAttribute('aria-selected')).toBe('true')
  })
  it('每格显示涨幅、涨停板数与连板率；日期新到旧；不含 ST 板块', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-09-30T08:00:00Z'))
    stubPayload()
    window.location.hash = '#plate-ranking'
    await act(async () => { render(<SectorRotation />) })
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy(), { timeout: 4000 })
    const table = screen.getByRole('table')
    const heads = within(table).getAllByRole('columnheader').slice(1).map(h => h.textContent)
    expect([...heads].sort().reverse()).toEqual(heads)
    expect(within(table).queryByText('ST板块')).toBeNull()
    const row = within(table).getByText('机器人').closest('tr')!
    expect(row.textContent).toContain('+2.00%')
    expect(row.textContent).toMatch(/涨停板\s*1/)
    expect(row.textContent).toMatch(/连板率\s*50\.0%/)
  })
})
