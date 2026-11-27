import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CombinedStrategyState } from '../features/combined-strategy/load'
import type { CompositeState } from '../features/macro-posture/composite/types'
import type { MarketState } from '../features/market-radar/market/market'
import type { RadarState } from '../features/market-radar/load'
import { combinedStrategyFixture, combinedStrategyNoCellFixture } from '../features/combined-strategy/fixture'
import { compositeFixture } from '../features/macro-posture/composite/fixture'
import { marketReferenceFixture } from '../features/market-radar/market/market.fixture'
import { radarFixture } from '../features/market-radar/fixture'
import CombinedStrategy, { COMBINED_STRATEGY_FOOTER, COMBINED_STRATEGY_LEAD } from './CombinedStrategy'

vi.mock('../features/combined-strategy/load', () => ({
  useCombinedStrategy: vi.fn(),
  resetCombinedStrategyCache: vi.fn(),
  COMBINED_STRATEGY_URL: '/data/combined-strategy.json',
}))

vi.mock('../features/macro-posture/composite/load', () => ({
  useCompositePosture: vi.fn(),
  tierDef: vi.fn((file: { tiers: { id: string; equityShare: number }[] }, id: string) => (
    file.tiers.find(t => t.id === id)
  )),
  resetCompositeCache: vi.fn(),
  COMPOSITE_URL: '/data/macro-posture.json',
}))

vi.mock('../features/market-radar/market/market', () => ({
  useMarket: vi.fn(),
}))

vi.mock('../features/market-radar/load', () => ({
  useMarketRadar: vi.fn(),
  resetRadarCache: vi.fn(),
  RADAR_URL: '/data/market-radar.json',
}))

import { useCombinedStrategy } from '../features/combined-strategy/load'
import { useCompositePosture } from '../features/macro-posture/composite/load'
import { useMarket } from '../features/market-radar/market/market'
import { useMarketRadar } from '../features/market-radar/load'

const mockedStrategy = vi.mocked(useCombinedStrategy)
const mockedComposite = vi.mocked(useCompositePosture)
const mockedMarket = vi.mocked(useMarket)
const mockedRadar = vi.mocked(useMarketRadar)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderPage(
  strategy: CombinedStrategyState = { status: 'ready', data: combinedStrategyFixture() },
  composite: CompositeState = { status: 'ready', data: compositeFixture() },
  market: MarketState = { status: 'ready', data: marketReferenceFixture() },
  radar: RadarState = { status: 'ready', data: radarFixture() },
) {
  mockedStrategy.mockReturnValue({ ...strategy, retry: vi.fn() } as ReturnType<typeof useCombinedStrategy>)
  mockedComposite.mockReturnValue(composite)
  mockedMarket.mockReturnValue(market)
  mockedRadar.mockReturnValue(radar)
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

  it('页头有醒目的策略说明书入口，页脚的版本号也链过去', () => {
    renderPage()
    const entry = screen.getByTestId('cs-spec-entry')
    expect(entry.getAttribute('href')).toBe('/invest/strategy/spec')
    expect(entry.textContent).toMatch(/策略说明书 · v\d+\.\d+\.\d+/)
    expect(entry.textContent).toContain('查看完整说明')
    expect(screen.getByTestId('cs-footer-spec').getAttribute('href')).toBe('/invest/strategy/spec')
  })

  it('加载中 / 失败状态', () => {
    renderPage({ status: 'loading' })
    expect(screen.getByRole('status').textContent).toContain('加载中')
    cleanup()
    const retry = vi.fn()
    mockedStrategy.mockReturnValue({ status: 'error', message: 'HTTP 404', retry } as ReturnType<typeof useCombinedStrategy>)
    mockedComposite.mockReturnValue({ status: 'ready', data: compositeFixture() })
    mockedMarket.mockReturnValue({ status: 'ready', data: marketReferenceFixture() })
    mockedRadar.mockReturnValue({ status: 'ready', data: radarFixture() })
    render(
      <MemoryRouter initialEntries={['/invest/strategy']}>
        <CombinedStrategy />
      </MemoryRouter>,
    )
    const alert = screen.getByTestId('cs-error')
    expect(alert.textContent).toContain('数据暂时取不到')
    expect(alert.textContent).toContain('HTTP 404')
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('吸顶锚点与七个部分都渲染；研究记录默认折叠', () => {
    renderPage()
    const nav = screen.getByRole('navigation', { name: '页内导航' })
    expect(within(nav).getByRole('link', { name: '现在怎么做' }).getAttribute('href')).toBe('#cs-now')
    expect(within(nav).getByRole('link', { name: '现在的位置' }).getAttribute('href')).toBe('#cs-position')
    expect(within(nav).getByRole('link', { name: '为什么' }).getAttribute('href')).toBe('#cs-why')
    expect(within(nav).getByRole('link', { name: '什么时候动' }).getAttribute('href')).toBe('#cs-triggers')
    expect(within(nav).getByRole('link', { name: '仓位规则' }).getAttribute('href')).toBe('#cs-rules')
    expect(within(nav).getByRole('link', { name: '九种状态' }).getAttribute('href')).toBe('#cs-matrix')
    expect(within(nav).getByRole('link', { name: '研究记录' }).getAttribute('href')).toBe('#cs-research')

    expect(document.getElementById('cs-now')).toBeTruthy()
    expect(document.getElementById('cs-position')).toBeTruthy()
    expect(document.getElementById('cs-why')).toBeTruthy()
    expect(document.getElementById('cs-triggers')).toBeTruthy()
    expect(document.getElementById('cs-rules')).toBeTruthy()
    expect(document.getElementById('cs-matrix')).toBeTruthy()
    expect(document.getElementById('cs-research')).toBeTruthy()

    const details = screen.getByTestId('cs-research-details') as HTMLDetailsElement
    expect(details.open).toBe(false)
    expect(screen.getByTestId('cs-research-summary').textContent).toContain('不影响操作')
    expect(screen.queryByTestId('cs-fusion-table')).toBeNull()

    fireEvent.click(screen.getByTestId('cs-research-summary'))
    expect(screen.getByTestId('cs-fusion-table')).toBeTruthy()
    expect(document.getElementById('mp-market')).toBeTruthy()
  })

  it('无 cell 时仍渲染其余部分', () => {
    renderPage({ status: 'ready', data: combinedStrategyNoCellFixture() })
    expect(screen.queryByTestId('cs-position-cell')).toBeNull()
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
