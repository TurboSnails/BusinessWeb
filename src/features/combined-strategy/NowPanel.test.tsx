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
    localStorage.removeItem('mp-equity-cap')
    wrap(<NowPanel data={combinedStrategyFixture()} />)
    const title = screen.getByTestId('cs-instruction').textContent ?? ''
    expect(title).toContain('美股股票仓位约 68%')
    expect(title).toContain('你的上限 80%')
    expect(title).toContain('当前档位 85%')
    expect(title).toContain('本月不用调')
    expect(screen.getByTestId('mp-equity-cap-recommend').textContent).toBe('上限为什么建议 80%')
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

  it('换算卡：大号显示上限 × 档位，改上限即时更新；标题跟着变；月底提醒可选', () => {
    localStorage.removeItem('mp-equity-cap')
    wrap(<NowPanel data={combinedStrategyFixture()} watch={{ text: '11 月剩下 3 个交易日，标普均价如果低于 6,861 点，月底降一档到中性（上限的 70%）。', gap: -0.047, close: false }} />)
    expect(screen.getByTestId('mp-equity-cap-implied').textContent).toContain('68')
    expect(screen.getByTestId('cs-instruction').textContent).toContain('约 68%')
    fireEvent.change(screen.getByLabelText('上限'), { target: { value: '100' } })
    expect(screen.getByTestId('mp-equity-cap-implied').textContent).toContain('85')
    expect(screen.getByTestId('cs-instruction').textContent).toContain('约 85%')
    expect(screen.getByTestId('cs-instruction').textContent).toContain('你的上限 100%')
    expect(screen.getByTestId('mp-equity-cap-recommend').textContent).toBe('上限建议 80%，为什么')
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

  it('情况 3：大字按官方档，注明月底可能变为读数档', () => {
    localStorage.removeItem('mp-equity-cap')
    const mid = combinedStrategyFixture()
    const data = {
      ...mid,
      current: {
        ...mid.current,
        macroTier: 'lean-offense' as const,
        equityShare: 0.85,
        official: { month: '2026-10', tier: 'neutral' as const, previousTier: 'neutral' as const },
        instruction: '股票仓位先保持在你上限的 70%；按目前数据，月底可能变为 85%，等月底定档再调。',
      },
    }
    wrap(<NowPanel data={data} />)
    const title = screen.getByTestId('cs-instruction').textContent ?? ''
    expect(title).toContain('先保持约 56%')
    expect(title).toContain('官方档位 70%')
    expect(title).toContain('变为约 68%')
    expect(screen.getByTestId('mp-equity-cap-implied').textContent).toContain('56')
    expect(screen.getByTestId('mp-equity-cap-pending').textContent).toContain('月底可能变为约 68%')
    expect(screen.getByTestId('mp-equity-cap').textContent).toContain('官方档位 70%')
  })
})
