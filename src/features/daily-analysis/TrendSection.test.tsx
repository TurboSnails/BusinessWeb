import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TrendSection } from './TrendSection'
import { dailySnapshot } from './fixtures'

const candles = (rows: Array<[string, number]>) => rows.map(([d, c]) => [d, String(c), String(c), String(c), String(c), '1'])
function stubHistory() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const symbol = new URL(String(url), 'http://x').searchParams.get('symbol')!
    return new Response(JSON.stringify({ data: { [symbol]: { day: candles([['2026-10-08', 100], ['2026-10-09', 101]]) } } }))
  }))
}
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('多日对比', () => {
  it('归档不足两天时给出说明而不画趋势图', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })))
    render(<TrendSection snapshots={[dailySnapshot()]} selected="2026-10-12" onSelect={() => {}} />)
    expect(screen.getByText('已归档 1 天')).toBeTruthy()
    expect(screen.queryByRole('img', { name: '沪深成交额趋势' })).toBeNull()
  })

  it('每天一行并显示较前一日变化；点击日期切换到当天复盘', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })))
    const older = dailySnapshot('2026-10-09'); older.metrics.ztCount = 50
    const onSelect = vi.fn()
    render(<TrendSection snapshots={[dailySnapshot(), older]} selected="2026-10-12" onSelect={onSelect} />)
    expect(screen.getByRole('img', { name: '沪深成交额趋势' })).toBeTruthy()
    const row = screen.getByRole('button', { name: '查看 2026-10-12 复盘' }).closest('tr')!
    expect(within(row).getByText('▲19')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '查看 2026-10-09 复盘' }))
    expect(onSelect).toHaveBeenCalledWith('2026-10-09')
  })

  it('回补的日期只有指数涨跌，其余显示 —，且不可点进复盘', async () => {
    stubHistory()
    render(<TrendSection snapshots={[dailySnapshot()]} selected="2026-10-12" onSelect={() => {}} />)
    const cell = await screen.findByText('回补')
    const row = cell.closest('tr')!
    expect(within(row).getByText('2026-10-09')).toBeTruthy()
    expect(within(row).getAllByText('+1%').length).toBe(3)
    expect(within(row).queryByRole('button')).toBeNull()
  })

  it('回补日期显示财联社的连板数与最高板，并画出连板趋势', async () => {
    const plate = (date: string, height: number) => ({ code: 200, data: { plate_stock: [{ stock_list: [{ time: `${date} 09:30:00` }] }], continuous_limit_up: [{ height, stock_list: [{}, {}] }] } })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = new URL(String(url), 'http://x')
      if (u.pathname.endsWith('/api/cls-plate')) { const d = u.searchParams.get('date')!; return new Response(JSON.stringify(plate(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`, d === '20261009' ? 9 : 8))) }
      const symbol = u.searchParams.get('symbol')!
      return new Response(JSON.stringify({ data: { [symbol]: { day: candles([['2026-10-08', 100], ['2026-10-09', 101]]) } } }))
    }))
    render(<TrendSection snapshots={[dailySnapshot()]} selected="2026-10-12" onSelect={() => {}} />)
    const row = (await screen.findByText('2026-10-09')).closest('tr')!
    expect(await within(row).findByText('9')).toBeTruthy()
    expect(await screen.findByRole('img', { name: '最高连板趋势' })).toBeTruthy()
  })

  it('可切换对比天数', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })))
    render(<TrendSection snapshots={[dailySnapshot()]} selected="2026-10-12" onSelect={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '近 5 日' }))
    expect(screen.getByRole('button', { name: '近 5 日' }).getAttribute('aria-pressed')).toBe('true')
  })
})
