import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { compositeFixture } from '../macro-posture/composite/fixture'
import { marketReferenceFixture } from '../market-radar/market/market.fixture'
import ResearchPanel from './ResearchPanel'
import { combinedStrategyFixture } from './fixture'

vi.mock('../macro-posture/composite/load', () => ({
  useCompositePosture: vi.fn(),
  tierDef: vi.fn(),
}))
vi.mock('../market-radar/market/market', () => ({
  useMarket: vi.fn(),
}))

import { useCompositePosture } from '../macro-posture/composite/load'
import { useMarket } from '../market-radar/market/market'

const mockedComposite = vi.mocked(useCompositePosture)
const mockedMarket = vi.mocked(useMarket)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ResearchPanel', () => {
  it('默认折叠；展开后三块都在', () => {
    mockedComposite.mockReturnValue({ status: 'ready', data: compositeFixture() })
    mockedMarket.mockReturnValue({ status: 'ready', data: marketReferenceFixture() })
    render(
      <MemoryRouter>
        <ResearchPanel data={combinedStrategyFixture()} />
      </MemoryRouter>,
    )
    const details = screen.getByTestId('cs-research-details') as HTMLDetailsElement
    expect(details.open).toBe(false)
    expect(screen.getByTestId('cs-research-summary').textContent).toContain('不影响操作')
    expect(screen.queryByTestId('cs-fusion-table')).toBeNull()

    fireEvent.click(screen.getByTestId('cs-research-summary'))

    expect(screen.getByText('试过的六种融合办法')).toBeTruthy()
    expect(screen.getByTestId('cs-fusion-table')).toBeTruthy()
    expect(screen.getByText('宏观档位与股市冷热的月度对照')).toBeTruthy()
    expect(screen.getByText('更早的一次尝试：把股市指标并入宏观攻守')).toBeTruthy()
    expect(screen.getByTestId('cs-research-market-intro').textContent).toContain('不是操作信号')
    expect(screen.getByTestId('mp-market-research-tag').textContent).toContain('研究读数')
  })
})
