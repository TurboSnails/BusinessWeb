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
  multipleTesting: {
    totalTrials: 107,
    totalExploreDistinct: 76,
    headline: 'A 股过 t 值 ≥ 2 的写法比纯运气多（8 个对 0–4），说明样本里确有规律；但挑选本身不可靠（A 股过拟合概率 0.64，高于 0.5），三个候选的紧缩夏普 0.66–0.71 都低于常用门槛 0.95；能不能用，只看 12 月锁箱确认和前推。',
    caveat: '有效试验数不是精确的独立次数。',
    markets: [
      { market: 'cn', label: 'A 股', trials: 34, effectiveTrials: 20, pbo: 0.64, tGe2Actual: 8, tGe2Expected: 2.0, tGe2Ci90: [0, 4] },
      { market: 'hk', label: '港股', trials: 22, effectiveTrials: 17, pbo: 0.37, tGe2Actual: 2, tGe2Expected: 1.0, tGe2Ci90: [0, 3] },
    ],
    candidates: [
      { id: 'K1', label: '盈余惊喜', factor: 'cn_sue', dsr: 0.66, nwT: 2.62, srPeriod: 0.16 },
      { id: 'K2', label: '营收惊喜', factor: 'cn_sur', dsr: 0.71, nwT: 2.41, srPeriod: 0.17 },
    ],
  },
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
    const luck = screen.getByTestId('fl-luck')
    expect(luck.textContent).toContain('会不会是运气')
    expect(luck.textContent).toContain('紧缩夏普')
    expect(within(screen.getByTestId('fl-luck-markets')).getAllByRole('row')).toHaveLength(3)
    expect(luck.textContent).toContain('过拟合概率 0.64')
    expect(luck.textContent).toContain('纯属偶然的概率不到 2.5%')
    const markets = screen.getByTestId('fl-luck-markets')
    expect(markets.textContent).toContain('t 值 ≥ 2 的写法')
    expect(markets.textContent).not.toContain('实际 t≥2')
    const cands = screen.getByTestId('fl-luck-candidates')
    expect(cands.textContent).toContain('盈余惊喜')
    expect(cands.textContent).toContain('t 值')
    expect(cands.textContent).not.toContain('NW t')
    expect(cands.textContent).not.toContain('cn_sue')
    expect(cands.textContent).not.toContain('K1')
  })

  it('缺多重检验数据时隐藏「会不会是运气」一节', async () => {
    const { multipleTesting: _drop, ...rest } = sample
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(rest) })))
    renderPage()
    await screen.findByTestId('fl-data')
    expect(screen.queryByTestId('fl-luck')).toBeNull()
  })

  it('读数加载失败有提示', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    renderPage()
    expect(await screen.findByText('读数暂时加载不了')).toBeTruthy()
  })
})
