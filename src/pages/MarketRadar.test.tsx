import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RadarState } from '../features/market-radar/load'
import { STALE_DATA_MESSAGE } from '../features/market-radar/load'
import { radarFixture } from '../features/market-radar/fixture'
import MarketRadar, { MARKET_RADAR_FOOTER, MARKET_RADAR_LEAD } from './MarketRadar'

vi.mock('../features/market-radar/load', async importOriginal => {
  const actual = await importOriginal<typeof import('../features/market-radar/load')>()
  return {
    ...actual,
    useMarketRadar: vi.fn(),
    resetRadarCache: vi.fn(),
  }
})

vi.mock('../features/macro-posture/composite/load', () => ({
  useCompositePosture: vi.fn(() => ({ status: 'loading' })),
  tierDef: vi.fn(),
  resetCompositeCache: vi.fn(),
  COMPOSITE_URL: '/data/macro-posture.json',
}))

vi.mock('../features/combined-strategy/load', () => ({
  useCombinedStrategy: vi.fn(() => ({ status: 'ready', data: { current: { instruction: '股票仓位保持在你上限的 85%，本月不用调。' } } })),
  resetCombinedStrategyCache: vi.fn(),
  COMBINED_STRATEGY_URL: '/data/combined-strategy.json',
}))

import { useMarketRadar } from '../features/market-radar/load'

const mockedRadar = vi.mocked(useMarketRadar)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderPage(
  radar: RadarState = { status: 'ready', data: radarFixture() },
  entry = '/invest/market-radar',
) {
  mockedRadar.mockReturnValue({ ...radar, retry: vi.fn() })
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <MarketRadar />
    </MemoryRouter>,
  )
}

describe('MarketRadar 页面', () => {
  it('页头声明独立于大师方案，并用 TrioNav 链到通过检验与研究中', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('市场雷达')
    expect(screen.getByTestId('mr-head-lead').textContent).toBe(MARKET_RADAR_LEAD)
    const trio = screen.getByRole('navigation', { name: '策略相关页面' })
    expect(within(trio).getByRole('link', { name: '已通过 · 通过检验' }).getAttribute('href')).toBe('/invest/verified')
    expect(within(trio).getByRole('link', { name: '待验证 · 研究中' }).getAttribute('href')).toBe('/invest/strategy-lab')
    expect(within(trio).queryByRole('link', { name: '股市依据 · 市场雷达' })).toBeNull()
    expect(document.body.textContent).toContain(MARKET_RADAR_FOOTER)
  })

  it('加载中 / 失败状态', () => {
    renderPage({ status: 'loading' })
    expect(screen.getAllByRole('status').some(el => el.textContent?.includes('加载中'))).toBe(true)
    cleanup()
    renderPage({ status: 'error', message: 'HTTP 404' })
    const err = screen.getByTestId('mr-error')
    expect(err.textContent).toContain('数据暂时取不到')
    expect(err.textContent).toContain('HTTP 404')
    expect(screen.getByRole('button', { name: '重试' })).toBeTruthy()
  })

  it('旧版数据错误提示', () => {
    renderPage({ status: 'error', message: STALE_DATA_MESSAGE })
    expect(screen.getByTestId('mr-error').textContent).toContain(STALE_DATA_MESSAGE)
    expect(screen.getByRole('button', { name: '重试' })).toBeTruthy()
  })

  it('结论：首行冷热、策略链与五维度；不出现综合分与档位', () => {
    renderPage()
    expect(screen.getByTestId('mr-heat').textContent).toBe('股市偏热')
    expect(screen.getByTestId('mr-headline').textContent).toContain('股市偏热')
    expect(screen.getByTestId('mr-headline').textContent).not.toMatch(/综合分|档位|防守|进攻/)
    expect(screen.queryByTestId('mr-masters-compare')).toBeNull()
    expect(screen.getByTestId('mr-strategy-link').textContent).toContain('冷热不改变仓位。仓位多少、这个阶段怎么做，见')
    expect(within(screen.getByTestId('mr-strategy-link')).getByRole('link', { name: '综合策略' }).getAttribute('href')).toBe('/invest/strategy')
    expect(screen.queryByTestId('mr-tier-strip')).toBeNull()
    expect(screen.queryByTestId('mr-score')).toBeNull()
    expect(screen.getByTestId('mr-heat-trend')).toBeTruthy()
    expect(screen.getByTestId('mr-dim-valuation').textContent).toContain('估值')
    expect(screen.getByTestId('mr-dim-score-crowding').textContent).toContain('−0.67')
    expect(screen.getByTestId('mr-radar-shape')).toBeTruthy()
  })

  it('吸顶锚点含结论 / 总览 / 指标 / 历史检验，无市场综合', () => {
    renderPage()
    const nav = screen.getByRole('navigation', { name: '页内导航' })
    expect(within(nav).getByRole('link', { name: '结论' }).getAttribute('href')).toBe('#mr-conclusion')
    expect(within(nav).getByRole('link', { name: '总览' }).getAttribute('href')).toBe('#mr-overview')
    expect(within(nav).getByRole('link', { name: '指标' }).getAttribute('href')).toBe('#mr-indicators')
    expect(within(nav).getByRole('link', { name: '历史检验' }).getAttribute('href')).toBe('#mr-backtest')
    expect(within(nav).queryByRole('link', { name: '市场综合' })).toBeNull()
    expect(document.getElementById('mp-market')).toBeNull()
  })

  it('从总览跳到指标并展开', () => {
    renderPage()
    fireEvent.click(screen.getByTestId('mr-overview-cell-vix'))
    expect(screen.getByTestId('mr-ind-vix').querySelector('[aria-expanded="true"]')).toBeTruthy()
    expect(screen.getByTestId('mr-detail-vix')).toBeTruthy()
    expect(screen.getByTestId('mr-hist-vix')).toBeTruthy()
  })

  it('刷新后保持视图（网址参数）', () => {
    renderPage(
      { status: 'ready', data: radarFixture() },
      '/invest/market-radar?dim=valuation&view=all&sort=hot',
    )
    const toolbar = screen.getByTestId('mr-ind-toolbar')
    expect(toolbar.textContent).toContain('维度')
    expect(toolbar.textContent).toContain('范围')
    expect(toolbar.textContent).toContain('排序')
    expect(within(toolbar).getByRole('button', { name: '估值', pressed: true })).toBeTruthy()
    expect(within(toolbar).getByRole('button', { name: /全部 \d+/, pressed: true })).toBeTruthy()
    expect(within(toolbar).getByRole('button', { name: '最热在前', pressed: true })).toBeTruthy()
    expect(screen.getByTestId('mr-ind-pe')).toBeTruthy()
  })

  it('网址带非核心 ind 时自动切到全部视图并展开', () => {
    renderPage(
      { status: 'ready', data: radarFixture() },
      '/invest/market-radar?ind=reserves',
    )
    expect(screen.getByTestId('mr-ind-reserves').querySelector('[aria-expanded="true"]')).toBeTruthy()
    expect(within(screen.getByTestId('mr-ind-toolbar')).getByRole('button', { name: /全部 \d+/, pressed: true })).toBeTruthy()
  })

  it('空筛选显示清除按钮', () => {
    renderPage(
      { status: 'ready', data: radarFixture() },
      '/invest/market-radar?dim=earnings&scored=1&view=all',
    )
    // earnings + scored 仍有 epsYoy；构造真正空：dim=earnings + scored + 再点只看计分后用 irregular 维度
    cleanup()
    const data = radarFixture()
    data.indicators = data.indicators.filter(i => i.dimension === 'earnings' && !i.inScore)
    renderPage({ status: 'ready', data }, '/invest/market-radar?dim=earnings&scored=1&view=all')
    expect(screen.getByTestId('mr-ind-empty').textContent).toContain('没有符合条件的指标')
    fireEvent.click(within(screen.getByTestId('mr-ind-empty')).getByRole('button', { name: '清除筛选' }))
  })

  it('无效网址参数被忽略', () => {
    renderPage(
      { status: 'ready', data: radarFixture() },
      '/invest/market-radar?dim=foo&ind=%E4%B8%8D%E5%AD%98%E5%9C%A8',
    )
    expect(screen.queryByTestId('mr-detail-pe')).toBeNull()
    const toolbar = screen.getByTestId('mr-ind-toolbar')
    expect(within(toolbar).getByRole('button', { name: /核心 \d+/, pressed: true })).toBeTruthy()
  })

  it('反向指标的历史位置条：圆点在左、偏热、数值越高越冷', () => {
    renderPage({ status: 'ready', data: radarFixture() }, '/invest/market-radar?view=all&ind=cashShare')
    const pos = screen.getByTestId('mr-pct-cashShare')
    expect(pos.getAttribute('aria-label')).toContain('百分位 2')
    expect(pos.getAttribute('aria-label')).toContain('偏热')
    expect(pos.getAttribute('aria-label')).toContain('数值越高越冷')
    expect(pos.textContent).toContain('数值越高越冷')
    expect(screen.getByTestId('mr-heat-cashShare').textContent).toBe('偏热')
    const thumb = pos.querySelector('.mr-pos__thumb') as SVGCircleElement
    expect(Number(thumb.getAttribute('cx'))).toBeLessThan(10)
  })

  it('过期 / 停更 / 零星读数的显示', () => {
    renderPage({ status: 'ready', data: radarFixture() }, '/invest/market-radar?view=all')
    expect(screen.getByTestId('mr-update-realYield').textContent).toContain('滞后')
    expect(screen.getByTestId('mr-update-naaim').textContent).toContain('停更')
    expect(screen.getByTestId('mr-update-managerCash').textContent).toContain('零星读数')
    expect(screen.getByTestId('mr-heat-volume').textContent).toMatch(/—/)
    expect(screen.getByTestId('mr-heat-volume').textContent).toContain('无方向')
    expect(screen.getByTestId('mr-heat-naaim').textContent).toContain('停更')
  })

  it('指标表：历史位置、计分/只展示、展开规则与历史图；只展示不写暂无', () => {
    renderPage({ status: 'ready', data: radarFixture() }, '/invest/market-radar?view=all')
    expect(screen.getByTestId('mr-ind-group-liquidity')).toBeTruthy()
    expect(screen.getByTestId('mr-inscore-pe').textContent).toBe('计分')
    expect(screen.getByTestId('mr-inscore-forwardPe').textContent).toBe('只展示')
    expect(screen.getByTestId('mr-score-badge-pe').textContent).toBe('−1')
    expect(screen.getByTestId('mr-pct-pe').textContent).toMatch(/82/)
    expect(screen.getByTestId('mr-heat-pe').textContent).toBe('偏热')
    expect(screen.queryByText('暂无')).toBeNull()
    fireEvent.click(screen.getByTestId('mr-ind-forwardPe').querySelector('button')!)
    expect(screen.getByTestId('mr-reason-forwardPe').textContent).toContain('只展示')
    fireEvent.click(screen.getByTestId('mr-ind-pe').querySelector('button')!)
    expect(screen.getByTestId('mr-rule-pe').textContent).toContain('打分规则')
    expect(screen.getByTestId('mr-hist-pe')).toBeTruthy()
  })

  it('综合分回测表四行、单色带都在折叠区内；披露', () => {
    renderPage()
    const table = screen.getByTestId('mr-backtest-table')
    expect(table.closest('.mr-bt__scroll')).toBeTruthy()
    expect(table.textContent).toContain('按综合分持仓')
    expect(screen.getByTestId('mr-composite-fold').contains(table)).toBe(true)
    expect(table.textContent).toContain('恒定七成股票')
    expect(table.textContent).not.toContain('大师方案')
    expect(table.querySelectorAll('tbody tr')).toHaveLength(4)
    expect(screen.getByTestId('mr-backtest-verdict').textContent).toContain('仓位怎么定见综合策略页')
    expect(screen.getByTestId('mr-radar-timeline')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: '综合分月度档位' })).toBeTruthy()
    const disclosures = screen.getByTestId('mr-disclosures')
    expect(disclosures.textContent).toContain('方法与披露')
    // 披露默认收起，展开后可见正文
    fireEvent.click(within(disclosures).getByText(/方法与披露/))
    expect(disclosures.textContent).toContain('验证期结果未参与挑选')
  })

  it('不出现序列代码式英文 id', () => {
    renderPage()
    const body = document.body.textContent ?? ''
    expect(body).not.toMatch(/\bnetLiquidity\b/)
    expect(body).not.toMatch(/\bequityShare\b/)
    expect(body).not.toMatch(/\blean-defense\b/)
  })
})
