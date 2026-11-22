import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import CopperCard from './CopperCard'
import { COPPER_NOTE, COPPER_PENDING, refreshFailedCopy } from './copper'
import type { Point, Reading } from './model'

const reading = (history: Point[], unit: string, extra: Partial<Reading> = {}): Reading => ({
  name: 't', unit, source: 'https://example.com', scope: '测试', frequency: '日频', history, ...extra,
})

const series = () => {
  const copper: Point[] = [
    ['2025-11-18', 4.0],
    ['2026-06-02', 4.1],
    ['2026-11-17', 4.15],
    ['2026-11-18', 4.2],
  ]
  const gold: Point[] = [
    ['2025-11-18', 2600],
    ['2026-06-02', 2650],
    ['2026-11-17', 2680],
    ['2026-11-18', 2700],
  ]
  const ratio: Point[] = [
    ['2025-11-18', 0.0015],
    ['2026-06-02', 0.00155],
    ['2026-11-17', 0.00158],
    ['2026-11-18', 0.0016],
  ]
  const tenYear: Point[] = [
    ['2025-11-18', 4.4],
    ['2026-06-02', 4.3],
    ['2026-11-17', 4.1],
    ['2026-11-18', 4.05],
  ]
  return {
    copperDaily: reading(copper, '美元/磅'),
    goldDaily: reading(gold, '美元/盎司'),
    copperGold: reading(ratio, '倍'),
    tenYearDaily: reading(tenYear, '%'),
  }
}

describe('CopperCard', () => {
  it('shows pending copy when series are missing', () => {
    render(<CopperCard asOf="2026-11-20" />)
    const region = screen.getByRole('region', { name: '铜价与铜金比（背景）' })
    expect(within(region).getByText(COPPER_PENDING)).toBeTruthy()
    expect(within(region).queryByText(COPPER_NOTE)).toBeNull()
  })

  it('renders readings, note, dual chart, copper toggle, and recent table', () => {
    render(<CopperCard series={series()} asOf="2026-11-20" />)
    const region = screen.getByRole('region', { name: '铜价与铜金比（背景）' })
    expect(within(region).getByText(/4\.20 美元\/磅/)).toBeTruthy()
    expect(within(region).getByText(/2,?700 美元\/盎司/)).toBeTruthy()
    expect(within(region).getAllByText(/0\.0016/).length).toBeGreaterThan(0)
    expect(within(region).getByText(COPPER_NOTE)).toBeTruthy()
    expect(within(region).getByRole('img', { name: /铜金比与 10 年期国债收益率/ })).toBeTruthy()

    const summary = within(region).getByText(/查看最近 .* 个交易日数据/)
    const details = summary.closest('details')!
    expect(details.open).toBe(false)
    fireEvent.click(summary)
    expect(details.open).toBe(true)
    expect(within(details).getByText('铜金比')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '铜价' }))
    expect(within(region).getByRole('img', { name: /近 5 年铜价/ })).toBeTruthy()
  })

  it('shows independent dates and refresh-failed copy for stale ratio', () => {
    const copper: Point[] = [
      ['2026-11-18', 4.1],
      ['2026-11-19', 4.15],
      ['2026-11-20', 4.2],
    ]
    const ratio: Point[] = [
      ['2026-11-12', 0.00155],
      ['2026-11-13', 0.00158],
    ]
    render(<CopperCard
      asOf="2026-11-20"
      series={{
        copperDaily: reading(copper, '美元/磅'),
        copperGold: reading(ratio, '倍', { refreshError: 'HTTP 429' }),
      }}
    />)
    const region = screen.getByRole('region', { name: '铜价与铜金比（背景）' })
    expect(within(region).getByText(/4\.20 美元\/磅/)).toBeTruthy()
    expect(within(region).getByText(/0\.00158/)).toBeTruthy()
    expect(within(region).getByText((_, el) => el?.textContent === ` · ${refreshFailedCopy('2026-11-13')}`)).toBeTruthy()
    // Copper still shows its own as-of; no shared fake "截至 11-20" for the ratio alone.
    expect(within(region).getAllByText('2026-11-20').length).toBeGreaterThan(0)
    expect(within(region).getAllByText('2026-11-13').length).toBeGreaterThan(0)
  })
})
