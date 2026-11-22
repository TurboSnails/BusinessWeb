import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import CopperCard from './CopperCard'
import { COPPER_NOTE, COPPER_PENDING } from './copper'
import type { Point, Reading } from './model'

const reading = (history: Point[], unit: string): Reading => ({
  name: 't', unit, source: 'https://example.com', scope: '测试', frequency: '日频', history,
})

const series = () => {
  const copper: Point[] = [
    ['2025-11-18', 4.0],
    ['2026-06-02', 4.1],
    ['2026-11-17', 4.15],
    ['2026-11-18', 4.2],
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

  it('renders readings, note, dual chart, and copper toggle', () => {
    render(<CopperCard series={series()} asOf="2026-11-20" />)
    const region = screen.getByRole('region', { name: '铜价与铜金比（背景）' })
    expect(within(region).getByText(/4\.20 美元\/磅/)).toBeTruthy()
    expect(within(region).getAllByText(/0\.0016/).length).toBeGreaterThan(0)
    expect(within(region).getByText(COPPER_NOTE)).toBeTruthy()
    expect(within(region).getByRole('img', { name: /铜金比与 10 年期国债收益率/ })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '铜价' }))
    expect(within(region).getByRole('img', { name: /近 5 年铜价/ })).toBeTruthy()
  })
})
