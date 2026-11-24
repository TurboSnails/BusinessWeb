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
  it('首行大字是冷热，其次 headline 与策略链，右侧有五维雷达图', () => {
    renderPanel()
    expect(screen.getByTestId('mr-heat').textContent).toBe('股市偏热')
    expect(screen.getByTestId('mr-headline').textContent).toContain('股市偏热')
    expect(screen.getByTestId('mr-headline').textContent).not.toContain('%')
    expect(screen.getByTestId('mr-headline').textContent).not.toContain('仓位上限')
    expect(screen.getByTestId('mr-strategy-link').textContent).toContain('冷热不改变仓位')
    expect(within(screen.getByTestId('mr-strategy-link')).getByRole('link', { name: '综合策略' }).getAttribute('href'))
      .toBe('/invest/strategy')
    expect(screen.getByTestId('mr-radar-shape')).toBeTruthy()
    expect(screen.getByTestId('mr-freshness').textContent).toMatch(/\d+ 项指标/)
    expect(screen.getByTestId('mr-generated').textContent).toContain('数据生成于')
    expect(screen.getByTestId('mr-caveats').textContent).toContain('家庭两项')
    expect(screen.getByTestId('mr-dim-valuation').textContent).toContain('估值')
    expect(screen.getByTestId('mr-dim-drivers-valuation').textContent).toContain('过去 12 个月市盈率')
  })

  it('热度为 null 时显示冷热待定', () => {
    const base = radarFixture()
    renderPanel({
      current: {
        ...base.current,
        heatScore: null,
        heat: null,
        headline: '估值与持股拥挤度读数暂缺，冷热待定。',
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

  it('主视图不出现综合分、五档色带与攻守字样', () => {
    renderPanel()
    const section = document.getElementById('mr-conclusion') as HTMLElement
    expect(screen.queryByTestId('mr-tier-strip')).toBeNull()
    expect(screen.queryByTestId('mr-score')).toBeNull()
    expect(section.textContent).not.toMatch(/综合分|进攻|防守|档位/)
  })

  it('冷热分走势在左卡栈内、雷达图之前；注明月末口径与上月末读数', () => {
    renderPanel()
    const main = screen.getByTestId('mr-conclusion-main')
    const trend = screen.getByTestId('mr-heat-trend')
    expect(main.parentElement).toBe(trend.parentElement)
    expect(main.parentElement?.className).toContain('mr-conclusion__stack')
    expect(trend.compareDocumentPosition(screen.getByTestId('mr-conclusion-shape'))
      & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByTestId('mr-heat-spark').getAttribute('aria-label')).toBe('冷热分近 10 年走势')
    expect(screen.getByTestId('mr-heat-spark-hot')).toBeTruthy()
    expect(screen.getByTestId('mr-heat-spark-cold')).toBeTruthy()
    const note = screen.getByTestId('mr-last-month').textContent ?? ''
    expect(note).toContain('月末口径')
    expect(note).toContain('≤ −0.50 为偏热')
    expect(note).toMatch(/\d{4}-\d{2} 月末 [+−]?\d\.\d{2}/)
  })

  it('timeline 没有 heatScore（旧数据）时由估值、拥挤度两维平均', () => {
    const base = radarFixture()
    const timeline = base.backtest.timeline.map(({ heatScore: _omit, ...row }) => ({ ...row, dims: [0, -0.5, -1, 0, 1] }))
    renderPanel({ backtest: { ...base.backtest, timeline } })
    expect(screen.getByTestId('mr-last-month').textContent).toContain('月末 −0.75')
  })
})
