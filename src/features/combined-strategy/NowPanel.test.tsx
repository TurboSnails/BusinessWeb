import React from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import NowPanel from './NowPanel'
import { combinedStrategyFixture, combinedStrategyNoCellFixture } from './fixture'

afterEach(cleanup)

function wrap(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('NowPanel', () => {
  it('指令最醒目，三件事与上限输入', () => {
    wrap(<NowPanel data={combinedStrategyFixture()} />)
    expect(screen.getByTestId('cs-instruction').textContent).toContain('股票仓位保持在你上限的 85%')
    expect(screen.getByTestId('cs-now-scope').textContent).toContain('这是美股总仓位')
    expect(within(screen.getByTestId('cs-now-scope')).getByRole('link', { name: '风险预算阶段' }).getAttribute('href')).toBe('/monitor?tab=method')
    expect(screen.getByTestId('cs-steps').textContent).toContain('10 月底定档为偏进攻')
    expect(screen.getByTestId('cs-step-仓位').querySelector('strong')?.textContent).toBe('仓位')
    expect(screen.getByTestId('cs-step-做法').textContent).toContain('不因为贵提前减仓')
    expect(screen.getByTestId('cs-step-下次定档').textContent).toContain('11 月 30 日')
    expect(screen.getByTestId('mp-equity-cap')).toBeTruthy()
    expect(screen.getByTestId('cs-dates').textContent).toContain('宏观攻守')
    expect(screen.queryByTestId('cs-macro-chip')).toBeNull()
    expect(screen.queryByTestId('cs-now-cell')).toBeNull()
  })

  it('读数缺失时仍显示 instruction 与 steps', () => {
    wrap(<NowPanel data={combinedStrategyNoCellFixture()} />)
    expect(screen.getByTestId('cs-instruction').textContent).toContain('暂不给出仓位')
    expect(screen.getByTestId('cs-step-做法').textContent).toContain('雷达读数暂缺')
  })
})
