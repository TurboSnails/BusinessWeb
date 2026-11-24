import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CompositeState } from '../features/macro-posture/composite/types'
import type { MarketState } from '../features/market-radar/market/market'
import type { RadarState } from '../features/market-radar/load'
import { compositeFixture } from '../features/macro-posture/composite/fixture'
import { marketFixture, marketReferenceFixture } from '../features/market-radar/market/market.fixture'
import { radarFixture } from '../features/market-radar/fixture'
import MarketRadar, { MARKET_RADAR_FOOTER, MARKET_RADAR_LEAD } from './MarketRadar'

vi.mock('../features/market-radar/load', () => ({
  useMarketRadar: vi.fn(),
  resetRadarCache: vi.fn(),
  RADAR_URL: '/data/market-radar.json',
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

import { useMarketRadar } from '../features/market-radar/load'
import { useCompositePosture } from '../features/macro-posture/composite/load'
import { useMarket } from '../features/market-radar/market/market'

const mockedRadar = vi.mocked(useMarketRadar)
const mockedComposite = vi.mocked(useCompositePosture)
const mockedMarket = vi.mocked(useMarket)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderPage(
  radar: RadarState = { status: 'ready', data: radarFixture() },
  composite: CompositeState = { status: 'ready', data: compositeFixture() },
  market: MarketState = { status: 'ready', data: marketFixture() },
) {
  mockedRadar.mockReturnValue(radar)
  mockedComposite.mockReturnValue(composite)
  mockedMarket.mockReturnValue(market)
  return render(
    <MemoryRouter initialEntries={['/invest/market-radar']}>
      <MarketRadar />
    </MemoryRouter>,
  )
}

describe('MarketRadar 页面', () => {
  it('页头声明独立于大师方案，并链到宏观攻守', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('我的市场雷达')
    expect(screen.getByTestId('mr-head-lead').textContent).toBe(MARKET_RADAR_LEAD)
    expect(screen.getByRole('link', { name: '宏观攻守（大师方案）' }).getAttribute('href')).toBe('/invest/macro-posture')
    expect(document.body.textContent).toContain(MARKET_RADAR_FOOTER)
  })

  it('加载中 / 失败状态', () => {
    renderPage({ status: 'loading' })
    expect(screen.getByRole('status').textContent).toContain('加载中')
    cleanup()
    renderPage({ status: 'error', message: 'HTTP 404' })
    expect(screen.getByTestId('mr-error').textContent).toContain('市场雷达加载失败')
  })

  it('结论：档位条、综合分、五维度、并排大师档位', () => {
    renderPage()
    expect(screen.getByTestId('mr-tier-name').textContent).toBe('偏防守')
    expect(screen.getByTestId('mr-score').textContent).toContain('−0.20')
    expect(screen.getByTestId('mr-score').textContent).not.toMatch(/(?<![\d.])-(?=\d)/)
    expect(screen.getByTestId('mr-headline').textContent).toContain('偏防守')
    expect(screen.getByTestId('mr-masters-tier').textContent).toBe('偏进攻')
    expect(screen.getByTestId('mr-comparison-text').textContent).toContain('雷达偏防守')
    expect(screen.getByTestId('mr-dim-valuation').textContent).toContain('估值')
    expect(screen.getByTestId('mr-dim-score-crowding').textContent).toContain('−0.67')
    const strip = screen.getByTestId('mr-tier-strip')
    expect(within(strip).getAllByRole('listitem').map(li => li.textContent)).toEqual([
      '防守', '偏防守（当前）', '中性', '偏进攻', '进攻',
    ])
  })

  it('吸顶锚点含结论 / 指标 / 回测 / 市场综合', () => {
    renderPage()
    const nav = screen.getByRole('navigation', { name: '页内导航' })
    expect(within(nav).getByRole('link', { name: '结论' }).getAttribute('href')).toBe('#mr-conclusion')
    expect(within(nav).getByRole('link', { name: '指标' }).getAttribute('href')).toBe('#mr-indicators')
    expect(within(nav).getByRole('link', { name: '回测' }).getAttribute('href')).toBe('#mr-backtest')
    expect(within(nav).getByRole('link', { name: '市场综合' }).getAttribute('href')).toBe('#mp-market')
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

  it('回测表验证期列突出，双色带与披露', () => {
    renderPage()
    const table = screen.getByTestId('mr-backtest-table')
    expect(table.querySelectorAll('.mr-bt__col--test').length).toBeGreaterThan(4)
    expect(table.closest('.mr-bt__scroll--sticky-test')).toBeTruthy()
    expect(table.textContent).toContain('我的市场雷达')
    expect(table.textContent).toContain('大师方案')
    expect(table.textContent).toContain('当时版本数据')
    expect(table.textContent).toContain('雷达与大师平均仓位')
    expect(table.querySelectorAll('tbody tr')).toHaveLength(7)
    expect(screen.getByTestId('mr-backtest-verdict').textContent).toContain('雷达全样本夏普')
    expect(screen.getByTestId('mr-dual-timeline')).toBeTruthy()
    expect(screen.getByTestId('mr-disclosures').textContent).toContain('验证期结果未参与挑选')
  })

  it('市场综合版块：adopt 说明、前瞻 PE、选中行、checks', () => {
    renderPage()
    const section = document.getElementById('mp-market')
    expect(section).toBeTruthy()
    expect(screen.getByTestId('mp-market-tier').textContent).toBe('偏进攻')
    expect(screen.getByTestId('mp-market-relation').textContent).toContain('已作为第五根支柱并入总结论（权重 15%）')
    expect(screen.getByTestId('mp-market-forward-pe-note').textContent).toContain('只展示，无历史可回测')
    expect(screen.getByTestId('mp-market-comp-narrow').textContent).toContain('−1')
    expect(screen.getByTestId('mp-market-comp-narrow').textContent).not.toMatch(/(?<![\d.])-(?=\d)/)
    fireEvent.click(screen.getByTestId('mp-market-all-summary'))
    expect(screen.getByTestId('mp-market-chosen-row').classList.contains('is-highlight')).toBe(true)
    expect(screen.getByTestId('mp-market-check-testSharpeDd').textContent).toContain('通过')
    expect(screen.getByTestId('mp-market-stage2-verdict').textContent).toBe('并入核心')
    expect(screen.getByTestId('mp-market-timeline')).toBeTruthy()
  })

  it('市场综合 reference 与加载失败局部提示', () => {
    renderPage(
      { status: 'ready', data: radarFixture() },
      { status: 'ready', data: compositeFixture() },
      { status: 'ready', data: marketReferenceFixture() },
    )
    expect(screen.getByTestId('mp-market-relation').textContent).toBe('独立参考，不改变总结论')
    expect(screen.getByTestId('mp-market-stage2-verdict').textContent).toBe('独立参考')
    cleanup()
    renderPage(
      { status: 'ready', data: radarFixture() },
      { status: 'ready', data: compositeFixture() },
      { status: 'error', message: 'HTTP 404' },
    )
    expect(screen.getByTestId('mp-market-error').textContent).toBe('市场综合暂时无法读取，不影响本页其他结论。')
    expect(screen.getByTestId('mr-tier-name').textContent).toBe('偏防守')
  })

  it('不出现序列代码式英文 id', () => {
    renderPage()
    const body = document.body.textContent ?? ''
    expect(body).not.toMatch(/\bnetLiq13w\b/)
    expect(body).not.toMatch(/\bhhEquityShare\b/)
    expect(body).not.toMatch(/\blean-defense\b/)
  })
})
