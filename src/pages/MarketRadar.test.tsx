import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RadarState } from '../features/market-radar/load'
import { radarFixture } from '../features/market-radar/fixture'
import MarketRadar, { MARKET_RADAR_FOOTER, MARKET_RADAR_LEAD } from './MarketRadar'

vi.mock('../features/market-radar/load', () => ({
  useMarketRadar: vi.fn(),
  resetRadarCache: vi.fn(),
  RADAR_URL: '/data/market-radar.json',
}))

vi.mock('../features/macro-posture/composite/load', () => ({
  useCompositePosture: vi.fn(() => ({ status: 'loading' })),
  tierDef: vi.fn(),
  resetCompositeCache: vi.fn(),
  COMPOSITE_URL: '/data/macro-posture.json',
}))

import { useMarketRadar } from '../features/market-radar/load'

const mockedRadar = vi.mocked(useMarketRadar)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderPage(radar: RadarState = { status: 'ready', data: radarFixture() }) {
  mockedRadar.mockReturnValue(radar)
  return render(
    <MemoryRouter initialEntries={['/invest/market-radar']}>
      <MarketRadar />
    </MemoryRouter>,
  )
}

describe('MarketRadar 页面', () => {
  it('页头声明独立于大师方案，并链到宏观攻守与综合策略', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('市场雷达')
    expect(screen.getByTestId('mr-head-lead').textContent).toBe(MARKET_RADAR_LEAD)
    expect(screen.getByRole('link', { name: '宏观攻守（大师方案）' }).getAttribute('href')).toBe('/invest/macro-posture')
    const head = document.querySelector<HTMLElement>('.mr-head__links')!
    expect(within(head).getByRole('link', { name: '综合策略' }).getAttribute('href')).toBe('/invest/strategy')
    expect(document.body.textContent).toContain(MARKET_RADAR_FOOTER)
  })

  it('加载中 / 失败状态', () => {
    renderPage({ status: 'loading' })
    expect(screen.getByRole('status').textContent).toContain('加载中')
    cleanup()
    renderPage({ status: 'error', message: 'HTTP 404' })
    expect(screen.getByTestId('mr-error').textContent).toContain('市场雷达加载失败')
  })

  it('结论：档位条、综合分、五维度、链到综合策略', () => {
    renderPage()
    expect(screen.getByTestId('mr-tier-name').textContent).toBe('偏防守')
    expect(screen.getByTestId('mr-score').textContent).toContain('−0.20')
    expect(screen.getByTestId('mr-score').textContent).not.toMatch(/(?<![\d.])-(?=\d)/)
    expect(screen.getByTestId('mr-headline').textContent).toContain('偏防守')
    expect(screen.queryByTestId('mr-masters-compare')).toBeNull()
    expect(screen.getByTestId('mr-strategy-link').textContent).toContain('仓位怎么定')
    expect(within(screen.getByTestId('mr-strategy-link')).getByRole('link', { name: '综合策略' }).getAttribute('href')).toBe('/invest/strategy')
    expect(screen.getByTestId('mr-dim-valuation').textContent).toContain('估值')
    expect(screen.getByTestId('mr-dim-score-crowding').textContent).toContain('−0.67')
    const strip = screen.getByTestId('mr-tier-strip')
    expect(within(strip).getAllByRole('listitem').map(li => li.textContent)).toEqual([
      '防守', '偏防守（当前）', '中性', '偏进攻', '进攻',
    ])
  })

  it('吸顶锚点含结论 / 指标 / 回测，无市场综合', () => {
    renderPage()
    const nav = screen.getByRole('navigation', { name: '页内导航' })
    expect(within(nav).getByRole('link', { name: '结论' }).getAttribute('href')).toBe('#mr-conclusion')
    expect(within(nav).getByRole('link', { name: '指标' }).getAttribute('href')).toBe('#mr-indicators')
    expect(within(nav).getByRole('link', { name: '回测' }).getAttribute('href')).toBe('#mr-backtest')
    expect(within(nav).queryByRole('link', { name: '市场综合' })).toBeNull()
    expect(document.getElementById('mp-market')).toBeNull()
  })

  it('指标表：百分位条、计分/只展示、展开规则与折线', () => {
    renderPage()
    expect(screen.getByTestId('mr-ind-group-liquidity')).toBeTruthy()
    expect(screen.getByTestId('mr-inscore-pe12m').textContent).toBe('计分')
    expect(screen.getByTestId('mr-inscore-forwardPe').textContent).toBe('只展示')
    expect(screen.getByTestId('mr-score-badge-pe12m').textContent).toBe('−1')
    expect(screen.getByTestId('mr-pct-pe12m').textContent).toContain('偏热')
    fireEvent.click(screen.getByTestId('mr-ind-forwardPe').querySelector('summary')!)
    expect(screen.getByTestId('mr-reason-forwardPe').textContent).toContain('只展示')
    fireEvent.click(screen.getByTestId('mr-ind-pe12m').querySelector('summary')!)
    expect(screen.getByTestId('mr-rule-pe12m').textContent).toContain('打分规则')
    expect(screen.getByTestId('mr-ind-pe12m').querySelector('[data-testid="mr-sparkline"]')).toBeTruthy()
  })

  it('回测表四行、单色带与披露', () => {
    renderPage()
    const table = screen.getByTestId('mr-backtest-table')
    expect(table.querySelectorAll('.mr-bt__col--test').length).toBeGreaterThan(4)
    expect(table.closest('.mr-bt__scroll--sticky-test')).toBeTruthy()
    expect(table.textContent).toContain('市场雷达')
    expect(table.textContent).toContain('恒定七成股票')
    expect(table.textContent).not.toContain('大师方案')
    expect(table.querySelectorAll('tbody tr')).toHaveLength(4)
    expect(screen.getByTestId('mr-backtest-verdict').textContent).toContain('仓位怎么定见综合策略页')
    expect(screen.getByTestId('mr-radar-timeline')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: '雷达月度档位' })).toBeTruthy()
    expect(screen.getByTestId('mr-disclosures').textContent).toContain('验证期结果未参与挑选')
  })

  it('不出现序列代码式英文 id', () => {
    renderPage()
    const body = document.body.textContent ?? ''
    expect(body).not.toMatch(/\bnetLiq13w\b/)
    expect(body).not.toMatch(/\bhhEquityShare\b/)
    expect(body).not.toMatch(/\blean-defense\b/)
  })
})
