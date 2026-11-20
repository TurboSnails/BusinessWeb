import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import SectorForwardPe, { OwnForwardPe } from './SectorForwardPe'
import type { SectorForwardPe as Sector } from './snapshots'

const sector: Sector = {
  id: 'sector-xlp', ticker: 'S5CONS', etf: 'XLP', name: '必需消费', historyStarts: '1990-02-02',
  latest: { date: '2026-09-04', value: 21.33 },
  stats: { count: 1910, mean: 17.62, median: 17.3, percentile: 90.9, high: { date: '1998-11-27', value: 24.97 }, low: { date: '2009-03-06', value: 11.25 } },
  history: [['2026-08-14', 20.5], ['2026-08-21', 20.9], ['2026-08-28', 21.1], ['2026-09-04', 21.33]],
}

describe('SectorForwardPe', () => {
  it('shows the series reading, percentile and a separate FactSet reading', () => {
    render(<SectorForwardPe sector={sector} years={null} asOf="2026-09-08" current={{ date: '2026-11-13', value: 23.7 }} />)
    expect(screen.getByText('90.9%')).toBeTruthy()
    expect(screen.getByText(/FactSet 最新（2026-11-13）/)).toBeTruthy()
    expect(screen.queryByText(/已落后/)).toBeNull()
  })

  it('flags a series that lags the market', () => {
    render(<SectorForwardPe sector={sector} years={null} asOf="2026-11-20" />)
    expect(screen.getByText(/已落后 77 天/)).toBeTruthy()
    expect(screen.queryByText(/FactSet 最新/)).toBeNull()
  })

  it('says when part of the series came from a manual Bloomberg export', () => {
    render(<SectorForwardPe sector={{ ...sector, manual: { count: 3, from: '2026-11-17', to: '2026-11-19' } }} years={null} asOf="2026-11-20" />)
    expect(screen.getByText(/手动导出 3 个点（2026-11-17 至 2026-11-19）/)).toBeTruthy()
  })
})

describe('OwnForwardPe', () => {
  it('shows accumulation progress instead of a percentile while the history is short', () => {
    render(<OwnForwardPe name="医疗保健" history={[['2026-11-18', 21.44], ['2026-11-19', 21.5]]} years={null} />)
    expect(screen.getByText(/2 个交易日（自 2026-11-18）/)).toBeTruthy()
    expect(screen.getByText(/满 60 个交易日后显示/)).toBeTruthy()
  })

  it('ranks the latest reading once enough days have accumulated', () => {
    const history = Array.from({ length: 80 }, (_, i): [string, number] => [new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), 15 + i * 0.1])
    render(<OwnForwardPe name="医疗保健" history={history} years={null} />)
    expect(screen.getByText('98.8%')).toBeTruthy()
  })

  it('renders nothing without observations', () => {
    const { container } = render(<OwnForwardPe name="医疗保健" history={[]} years={null} />)
    expect(container.innerHTML).toBe('')
  })
})
