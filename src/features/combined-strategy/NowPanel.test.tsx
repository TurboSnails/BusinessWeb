import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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

  it('偏热时显示纪律与损失预期，不偏热时不显示', () => {
    wrap(<NowPanel data={combinedStrategyFixture()} />)
    const box = screen.getByTestId('cs-discipline')
    expect(box.textContent).toContain('美股资金大约跌 14%')
    expect(box.textContent).toContain('不融资')
    expect(within(box).getByRole('link', { name: '说明书第十章' }).getAttribute('href')).toBe('/invest/strategy/spec')
    cleanup()
    const mid = combinedStrategyFixture()
    wrap(<NowPanel data={{ ...mid, current: { ...mid.current, heat: 'mid' } }} />)
    expect(screen.queryByTestId('cs-discipline')).toBeNull()
  })

  it('换算卡：大号显示上限 × 档位，改上限即时更新；月底提醒可选', () => {
    localStorage.removeItem('mp-equity-cap')
    wrap(<NowPanel data={combinedStrategyFixture()} watch={{ text: '11 月剩下 3 个交易日，标普均价如果低于 6,861 点，月底降一档到中性（上限的 70%）。', gap: -0.047, close: false }} />)
    expect(screen.getByTestId('mp-equity-cap-implied').textContent).toContain('68')
    fireEvent.change(screen.getByLabelText('上限'), { target: { value: '100' } })
    expect(screen.getByTestId('mp-equity-cap-implied').textContent).toContain('85')
    expect(screen.getByRole('button', { name: '改回 80%' })).toBeTruthy()
    expect(screen.getByTestId('cs-now-watch').textContent).toContain('月底前留意')
    expect(screen.getByTestId('cs-now-tier').textContent).toBe('偏进攻 · 85%')
    localStorage.removeItem('mp-equity-cap')
    cleanup()
    wrap(<NowPanel data={combinedStrategyFixture()} />)
    expect(screen.queryByTestId('cs-now-watch')).toBeNull()
  })

  it('读数缺失时仍显示 instruction 与 steps', () => {
    wrap(<NowPanel data={combinedStrategyNoCellFixture()} />)
    expect(screen.getByTestId('cs-instruction').textContent).toContain('暂不给出仓位')
    expect(screen.getByTestId('cs-step-做法').textContent).toContain('雷达读数暂缺')
  })
})
