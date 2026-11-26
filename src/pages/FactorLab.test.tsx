import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FactorLab, { FACTOR_LAB_LEAD, type FactorLabData } from './FactorLab'

const sample: FactorLabData = {
  generatedAt: '2026-11-27T00:00:00+00:00',
  data: [
    { market: 'cn', label: 'A 股', desc: '日线', rows: 16214954, securities: 5897, coverage: ['2005-01-04', '2026-11-26'], grade: 'A', gradeText: '无幸存者偏差', downloadedAt: '2026-11-26' },
    { market: 'us', label: '美股个股', desc: '日线', rows: 20137031, securities: 5262, coverage: ['1995-01-03', '2026-11-25'], grade: 'B', gradeText: '有幸存者偏差（只含当前上市）', downloadedAt: '2026-11-26' },
  ],
  validation: [{ market: 'cn', check: 'A 股规模 vs SMB', value: 0.93, unit: '同月相关', note: '一致' }],
  ledger: { cn: { records: 5, trials: 5, distinct: 5, byMode: { explore: 5 }, factors: ['size'], last: null } },
  guard: { budget: 24, exploreFrac: 0.7, embargoMonths: 1, markets: { cn: { start: '2023-11-01', end: '2026-11-30', used: 0, batches: 0 }, hk: { start: '2023-11-01', end: '2026-11-30', used: 0, batches: 0 } } },
  rounds: [{ id: 'R1', file: 'x', status: '进行中' }],
}

function renderPage(): void {
  render(<MemoryRouter><FactorLab /></MemoryRouter>)
}

afterEach(() => vi.unstubAllGlobals())

describe('因子实验室', () => {
  it('页头、过关步骤；数据加载后显示各表', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(sample) })))
    renderPage()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('因子实验室')
    expect(screen.getByTestId('fl-lead').textContent).toBe(FACTOR_LAB_LEAD)
    expect(within(screen.getByTestId('fl-steps')).getAllByRole('listitem')).toHaveLength(5)
    const data = await screen.findByTestId('fl-data')
    expect(within(data).getAllByRole('row')).toHaveLength(3)
    const guard = screen.getByTestId('fl-guard')
    expect(within(guard).getAllByRole('row')).toHaveLength(3)
    expect(guard.textContent).toContain('0 / 24')
    expect(guard.textContent).toContain('探索 5')
    expect(screen.getByTestId('fl-rounds').textContent).toContain('R1')
  })

  it('读数加载失败有提示', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    renderPage()
    expect(await screen.findByText('读数暂时加载不了')).toBeTruthy()
  })
})
