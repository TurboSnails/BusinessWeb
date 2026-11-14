// 候选池「财报临近」：池里未来 14 天有财报的公司；没有时不渲染。
import React from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import EarningsSoonList from './EarningsSoonList'
import type { EarningsCalendar, EarningsItem } from '../features/earnings/model'

const entry = (over: Partial<EarningsItem>): EarningsItem => ({ market: 'us', code: 'NVDA', name: '英伟达', date: '2026-11-19', time: 'amc', confirmed: true, dateSource: 'yahoo', period: 'FY2027Q3', consensus: null, lastYear: null, history: [], result: null, marketCap: null, research: null, asOf: '2026-11-14', ...over })
const CAL = { schemaVersion: 1, generatedAt: '2026-11-14T12:22:01Z', today: '2026-11-14', window: { start: '2026-10-31', end: '2026-12-26' }, sources: {}, seasons: {}, cnNotices: [],
  items: [entry({}), entry({ code: 'WMT', name: '沃尔玛', date: '2026-12-20' })] } as EarningsCalendar

describe('EarningsSoonList', () => {
  it('列出池里 14 天内的财报，链接公司页与 /earnings', () => {
    render(<MemoryRouter><EarningsSoonList items={[{ market: 'ndx', code: 'NVDA', addedAt: '2026-10-01T00:00:00Z' }, { market: 'us', code: 'WMT', addedAt: '2026-10-01T00:00:00Z' }]} cal={CAL} today="2026-11-14" /></MemoryRouter>)
    expect(screen.getByRole('region', { name: '财报临近' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '英伟达 NVDA' }).getAttribute('href')).toBe('/research-notes/ndx/NVDA')
    expect(screen.getByText('11-19 盘后公布 FY2027Q3（5 天后，已确认）')).toBeTruthy()
    expect(screen.queryByText(/沃尔玛/)).toBeNull()
    expect(screen.getByRole('link', { name: '财报前瞻' }).getAttribute('href')).toBe('/earnings')
  })
  it('没有临近财报或日历读不到时不渲染', () => {
    const { container } = render(<MemoryRouter><EarningsSoonList items={[{ market: 'cn', code: '600519', addedAt: '2026-10-01T00:00:00Z' }]} cal={CAL} today="2026-11-14" /></MemoryRouter>)
    expect(container.innerHTML).toBe('')
    const none = render(<MemoryRouter><EarningsSoonList items={[{ market: 'us', code: 'NVDA', addedAt: '2026-10-01T00:00:00Z' }]} cal={null} today="2026-11-14" /></MemoryRouter>)
    expect(none.container.innerHTML).toBe('')
  })
})
