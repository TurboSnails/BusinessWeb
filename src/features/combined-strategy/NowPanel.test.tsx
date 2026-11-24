import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import NowPanel from './NowPanel'
import { combinedStrategyFixture, combinedStrategyNoCellFixture } from './fixture'

afterEach(cleanup)

function wrap(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('NowPanel', () => {
  it('有 current.cell：headline、档位、热度、action、evidence、上限输入', () => {
    wrap(<NowPanel data={combinedStrategyFixture()} />)
    expect(screen.getByTestId('cs-headline').textContent).toContain('宏观偏进攻')
    expect(screen.getByTestId('cs-macro-chip').textContent).toContain('偏进攻')
    expect(screen.getByTestId('cs-equity-share').textContent).toContain('85%')
    expect(screen.getByTestId('cs-radar-chip').textContent).toContain('偏防守')
    expect(screen.getByTestId('cs-heat-chip').textContent).toContain('偏热')
    expect(screen.getByTestId('cs-heat-score').textContent).toContain('−0.50')
    expect(screen.getByTestId('cs-now-cell')).toBeTruthy()
    expect(screen.getByTestId('cs-action').textContent).toContain('不因为贵提前减仓')
    expect(screen.getByTestId('cs-evidence').textContent).toContain('122')
    expect(screen.getByTestId('mp-equity-cap')).toBeTruthy()
    expect(screen.getByRole('link', { name: '看宏观依据' }).getAttribute('href')).toBe('/invest/macro-posture')
    expect(screen.getByRole('link', { name: '看股市冷热' }).getAttribute('href')).toBe('/invest/market-radar')
  })

  it('thin 格显示样本少标记', () => {
    const data = combinedStrategyFixture()
    const thin = data.matrix.find(c => c.thin)!
    wrap(<NowPanel data={{ ...data, current: { ...data.current, cell: thin, macroSide: thin.macroSide, heat: thin.heat } }} />)
    expect(screen.getByTestId('cs-thin-badge').textContent).toBe('样本少')
  })

  it('current.cell 为 null：只显示 headline，隐藏格子内容', () => {
    wrap(<NowPanel data={combinedStrategyNoCellFixture()} />)
    expect(screen.getByTestId('cs-headline').textContent).toContain('暂不定位格子')
    expect(screen.queryByTestId('cs-now-cell')).toBeNull()
    expect(screen.queryByTestId('cs-action')).toBeNull()
  })
})
