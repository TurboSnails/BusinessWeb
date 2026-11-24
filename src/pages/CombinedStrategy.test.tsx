import React from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CombinedStrategyState } from '../features/combined-strategy/load'
import type { CompositeState } from '../features/macro-posture/composite/types'
import type { MarketState } from '../features/market-radar/market/market'
import { combinedStrategyFixture, combinedStrategyNoCellFixture } from '../features/combined-strategy/fixture'
import { compositeFixture } from '../features/macro-posture/composite/fixture'
import { marketReferenceFixture } from '../features/market-radar/market/market.fixture'
import CombinedStrategy, { COMBINED_STRATEGY_FOOTER, COMBINED_STRATEGY_LEAD } from './CombinedStrategy'

vi.mock('../features/combined-strategy/load', () => ({
  useCombinedStrategy: vi.fn(),
  resetCombinedStrategyCache: vi.fn(),
  COMBINED_STRATEGY_URL: '/data/combined-strategy.json',
}))

vi.mock('../features/macro-posture/composite/load', () => ({
  useCompositePosture: vi.fn(),
  tierDef: vi.fn(),
  resetCompositeCache: vi.fn(),
  COMPOSITE_URL: '/data/macro-posture.json',
}))

vi.mock('../features/market-radar/market/market', () => ({
  useMarket: vi.fn(),
}))

import { useCombinedStrategy } from '../features/combined-strategy/load'
import { useCompositePosture } from '../features/macro-posture/composite/load'
import { useMarket } from '../features/market-radar/market/market'

const mockedStrategy = vi.mocked(useCombinedStrategy)
const mockedComposite = vi.mocked(useCompositePosture)
const mockedMarket = vi.mocked(useMarket)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderPage(
  strategy: CombinedStrategyState = { status: 'ready', data: combinedStrategyFixture() },
  composite: CompositeState = { status: 'ready', data: compositeFixture() },
  market: MarketState = { status: 'ready', data: marketReferenceFixture() },
) {
  mockedStrategy.mockReturnValue(strategy)
  mockedComposite.mockReturnValue(composite)
  mockedMarket.mockReturnValue(market)
  return render(
    <MemoryRouter initialEntries={['/invest/strategy']}>
      <CombinedStrategy />
    </MemoryRouter>,
  )
}

describe('CombinedStrategy 页面', () => {
  it('页头与免责声明', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('综合策略')
    expect(screen.getByTestId('cs-head-lead').textContent).toBe(COMBINED_STRATEGY_LEAD)
    expect(document.body.textContent).toContain(COMBINED_STRATEGY_FOOTER)
  })

  it('加载中 / 失败状态', () => {
    renderPage({ status: 'loading' })
    expect(screen.getByRole('status').textContent).toContain('加载中')
    cleanup()
    renderPage({ status: 'error', message: 'HTTP 404' })
    expect(screen.getByTestId('cs-error').textContent).toContain('综合策略加载失败')
    expect(screen.getByTestId('cs-error').textContent).toContain('HTTP 404')
  })

  it('吸顶锚点与七个部分都渲染', () => {
    renderPage()
    const nav = screen.getByRole('navigation', { name: '页内导航' })
    expect(within(nav).getByRole('link', { name: '现在怎么做' }).getAttribute('href')).toBe('#cs-now')
    expect(within(nav).getByRole('link', { name: '仓位规则' }).getAttribute('href')).toBe('#cs-rules')
    expect(within(nav).getByRole('link', { name: '状态矩阵' }).getAttribute('href')).toBe('#cs-matrix')
    expect(within(nav).getByRole('link', { name: '融合检验' }).getAttribute('href')).toBe('#cs-fusion')
    expect(within(nav).getByRole('link', { name: '档位对照' }).getAttribute('href')).toBe('#cs-timeline')
    expect(within(nav).getByRole('link', { name: '市场综合' }).getAttribute('href')).toBe('#mp-market')

    expect(document.getElementById('cs-now')).toBeTruthy()
    expect(document.getElementById('cs-rules')).toBeTruthy()
    expect(document.getElementById('cs-matrix')).toBeTruthy()
    expect(document.getElementById('cs-fusion')).toBeTruthy()
    expect(document.getElementById('cs-timeline')).toBeTruthy()
    expect(document.getElementById('mp-market')).toBeTruthy()
    expect(screen.getByTestId('cs-market-note').textContent).toContain('没有达到采用门槛')
  })

  it('无 cell 时仍渲染其余部分', () => {
    renderPage({ status: 'ready', data: combinedStrategyNoCellFixture() })
    expect(screen.queryByTestId('cs-now-cell')).toBeNull()
    expect(document.getElementById('cs-rules')).toBeTruthy()
    expect(document.getElementById('cs-matrix')).toBeTruthy()
  })

  it('仓位规则取宏观档位与换档成本', () => {
    renderPage()
    expect(screen.getByTestId('cs-tiers-table').textContent).toContain('偏进攻')
    expect(screen.getByTestId('cs-tier-current').getAttribute('data-tier')).toBe('lean-offense')
    expect(screen.getByTestId('cs-cadence').textContent).toContain('每月最后一个交易日')
    expect(screen.getByTestId('cs-cost-note').textContent).toContain('换档约')
  })
})
