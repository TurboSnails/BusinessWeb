import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import GridChart from './GridChart'
import { calculateGrid } from './simulation'
it('shows daily values when a mobile user touches the chart', () => {
  const row = { name: 'ETF', code: '510300', date: '2026-01-05', initialPrice: 10, initialAmount: 1000, step: 1, rebound: 0.1, pullback: 0.1, gridAmount: 100 }
  const result = calculateGrid(row, [{ date: row.date, close: 10, high: 10, low: 10 }, { date: '2026-01-06', close: 9, high: 9.2, low: 9 }])
  render(<GridChart record={{ id: 'one', savedAt: row.date, row, result }} result={result} />)
  const svg = screen.getByRole('img')
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, width: 920, height: 350, right: 920, bottom: 350, toJSON: () => ({}) })
  fireEvent.touchMove(svg, { touches: [{ clientX: 855 }] })
  expect(screen.getByRole('status').textContent).toContain('2026-01-06')
})
