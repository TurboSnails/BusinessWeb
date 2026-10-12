import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import DailyAnalysisLegacy from './DailyAnalysisLegacy'
import { review } from '../features/pulse/fixtures'

vi.mock('../services/api', () => ({ fetchMarketDataByType: async () => [], fetchSectorCategories: async () => [], fetchUSSectorCategories: async () => [] }))
vi.mock('../components/pulse/HeatmapSection', () => ({ default: () => null }))
afterEach(() => { cleanup(); localStorage.clear() })

it('历史旧版继续加载原来的手工记录并保留编辑、导出和云同步入口', async () => {
  const original = JSON.stringify([review('2026-09-30', { ztCount: 99 })])
  localStorage.setItem('pulse_daily_reviews', original)
  render(<MemoryRouter><DailyAnalysisLegacy /></MemoryRouter>)
  expect(await screen.findByText('99')).toBeTruthy()
  expect(screen.getAllByRole('button', { name: '编辑' }).length).toBeGreaterThan(0)
  expect(screen.getByRole('button', { name: /导出/ })).toBeTruthy()
  expect(screen.getByRole('button', { name: /云端设置/ })).toBeTruthy()
  expect(screen.getByRole('link', { name: '返回自动分析' }).getAttribute('href')).toBe('/daily-analysis')
  expect(localStorage.getItem('pulse_daily_reviews')).toBe(original)
})
