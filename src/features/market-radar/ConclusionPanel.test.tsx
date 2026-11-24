import React from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import ConclusionPanel from './ConclusionPanel'
import { radarFixture } from './fixture'

afterEach(cleanup)

function renderPanel(overrides: Parameters<typeof radarFixture>[0] = {}) {
  return render(
    <MemoryRouter>
      <ConclusionPanel data={radarFixture(overrides)} />
    </MemoryRouter>,
  )
}

describe('ConclusionPanel', () => {
  it('首行大字是冷热，其次 headline 与策略链，档位条降为次要', () => {
    renderPanel()
    expect(screen.getByTestId('mr-heat').textContent).toBe('股市偏热')
    expect(screen.getByTestId('mr-headline').textContent).toContain('股市偏热')
    expect(screen.getByTestId('mr-headline').textContent).not.toContain('%')
    expect(screen.getByTestId('mr-headline').textContent).not.toContain('仓位上限')
    expect(screen.getByTestId('mr-strategy-link').textContent).toContain('冷热不改变仓位')
    expect(within(screen.getByTestId('mr-strategy-link')).getByRole('link', { name: '综合策略' }).getAttribute('href'))
      .toBe('/invest/strategy')
    expect(screen.getByTestId('mr-tier-note').textContent).toContain('不是操作仓位')
    expect(screen.getByTestId('mr-tier-name').textContent).toBe('偏防守')
    expect(screen.getByTestId('mr-score').textContent).toContain('−0.20')
    const strip = screen.getByTestId('mr-tier-strip')
    expect(within(strip).getAllByRole('listitem').map(li => li.textContent)).toEqual([
      '防守', '偏防守（当前）', '中性', '偏进攻', '进攻',
    ])
    expect(screen.getByTestId('mr-dim-valuation').textContent).toContain('估值')
  })

  it('热度为 null 时显示冷热待定', () => {
    renderPanel({
      current: {
        score: -0.2,
        tier: 'lean-defense',
        heatScore: null,
        heat: null,
        headline: '估值与拥挤度读数暂缺，冷热待定。五维综合分 −0.20，雷达自身的回测档位为偏防守。',
        dimensions: radarFixture().current.dimensions,
      },
    })
    expect(screen.getByTestId('mr-heat').textContent).toBe('冷热待定')
  })

  it('结论区不含把档位换算成用户仓位的文案', () => {
    renderPanel()
    const main = screen.getByTestId('mr-conclusion-main')
    expect(main.textContent).not.toMatch(/仓位上限/)
    expect(main.textContent).not.toMatch(/\d+%/)
  })
})
