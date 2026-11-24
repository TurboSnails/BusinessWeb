import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { compositeFixture } from '../macro-posture/composite/fixture'
import { radarFixture } from '../market-radar/fixture'
import PositionPanel from './PositionPanel'
import { combinedStrategyFixture, combinedStrategyNoCellFixture } from './fixture'

vi.mock('../macro-posture/composite/load', () => ({
  useCompositePosture: vi.fn(),
}))
vi.mock('../market-radar/load', () => ({
  useMarketRadar: vi.fn(),
}))

import { useCompositePosture } from '../macro-posture/composite/load'
import { useMarketRadar } from '../market-radar/load'

const mockedComposite = vi.mocked(useCompositePosture)
const mockedRadar = vi.mocked(useMarketRadar)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function wrap(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('PositionPanel', () => {
  it('三行依据：宏观、趋势、冷热', () => {
    mockedComposite.mockReturnValue({ status: 'ready', data: compositeFixture() })
    mockedRadar.mockReturnValue({ status: 'ready', data: radarFixture() })
    wrap(<PositionPanel data={combinedStrategyFixture()} />)
    expect(screen.getByTestId('cs-position-name').textContent).toBe('扩张后段')
    expect(screen.getByTestId('cs-position-meaning').textContent).toContain('偏贵')
    expect(screen.getByRole('link', { name: '九种状态之一，见下方' }).getAttribute('href')).toBe('#cs-matrix')
    expect(screen.getByTestId('cs-position-macro-conclusion').textContent).toContain('偏进攻')
    expect(screen.getByTestId('cs-position-pillars').textContent).toContain('增长与就业')
    expect(screen.getByTestId('cs-position-tactical-conclusion').textContent).toContain('均线')
    expect(screen.getByTestId('cs-position-heat-conclusion').textContent).toContain('偏热')
    expect(screen.getByRole('link', { name: '看全部依据 →' }).getAttribute('href')).toBe('/invest/macro-posture')
    expect(screen.getByRole('link', { name: '看全部指标 →' }).getAttribute('href')).toBe('/invest/market-radar')
  })

  it('某一数据源暂缺时该行显示暂缺，其余照常', () => {
    mockedComposite.mockReturnValue({ status: 'error', message: 'fail' })
    mockedRadar.mockReturnValue({ status: 'ready', data: radarFixture() })
    wrap(<PositionPanel data={combinedStrategyFixture()} />)
    expect(screen.getByTestId('cs-position-macro-conclusion').textContent).toBe('暂缺')
    expect(screen.getByTestId('cs-position-heat-conclusion').textContent).toContain('偏热')
  })

  it('cell 为 null 时不显示名字，仍渲染三行', () => {
    mockedComposite.mockReturnValue({ status: 'ready', data: compositeFixture() })
    mockedRadar.mockReturnValue({ status: 'loading' })
    wrap(<PositionPanel data={combinedStrategyNoCellFixture()} />)
    expect(screen.queryByTestId('cs-position-cell')).toBeNull()
    expect(screen.getByTestId('cs-position-heat-conclusion').textContent).toBe('暂缺')
    expect(screen.getByTestId('cs-position-macro')).toBeTruthy()
  })
})
