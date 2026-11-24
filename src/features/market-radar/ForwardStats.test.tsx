import React from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import ForwardStats, { heatSummarySentence, tierSummarySentence } from './ForwardStats'
import { backtestHeatStats, backtestTierStats } from './backtest.fixture'
import type { RadarFile } from './types'

afterEach(cleanup)

describe('ForwardStats', () => {
  it('按档位防守→进攻、按冷热偏冷→偏热；居中不是中性', () => {
    render(<ForwardStats tierStats={backtestTierStats()} heatStats={backtestHeatStats()} />)
    const tierTable = screen.getByTestId('mr-fwd-tier')
    const tierLabels = [...tierTable.querySelectorAll('tbody th')].map(el => el.textContent?.trim())
    expect(tierLabels).toEqual(['防守', '偏防守', '中性', '偏进攻', '进攻'])

    const heatTable = screen.getByTestId('mr-fwd-heat')
    const heatLabels = [...heatTable.querySelectorAll('tbody th')].map(el => el.textContent)
    expect(heatLabels).toEqual(['偏冷', '居中', '偏热'])
    expect(heatTable.textContent).not.toMatch(/中性/)

    expect(screen.getByRole('heading', { name: '之后 12 个月的标普表现' })).toBeTruthy()
  })

  it('没有样本的分组显示 —', () => {
    const tierStats: RadarFile['backtest']['tierStats'] = [
      {
        tier: 'offense',
        all: { months: 80, fwd12: 0.1, neg12: 0.2, maxDd12: -0.1 },
        since2000: { months: 0, fwd12: null, neg12: null, maxDd12: null },
      },
    ]
    render(<ForwardStats tierStats={tierStats} heatStats={[]} />)
    const row = screen.getByTestId('mr-fwd-tier').querySelector('tbody tr')!
    expect(row.textContent).toContain('—')
  })

  it('样本少挂在对应时段的月数旁', () => {
    render(<ForwardStats tierStats={backtestTierStats()} heatStats={backtestHeatStats()} />)
    const leanOffense = [...screen.getByTestId('mr-fwd-tier').querySelectorAll('tbody tr')]
      .find(tr => tr.getAttribute('data-tier') === 'lean-offense') as HTMLElement
    // 全样本 120：不标；2000 以来 20：标在月数格
    const sparse = leanOffense.querySelector('.mr-fwd__sparse')
    expect(sparse?.textContent).toBe('样本少')
    expect(sparse?.parentElement?.textContent).toContain('20')
    expect(leanOffense.querySelector('th')?.textContent).not.toContain('样本少')
    expect(leanOffense.textContent).toMatch(/120/)

    const hot = [...screen.getByTestId('mr-fwd-heat').querySelectorAll('tbody tr')]
      .find(tr => tr.getAttribute('data-heat') === 'hot') as HTMLElement
    expect(within(hot).getByText('样本少')).toBeTruthy()
  })

  it('口径说明与数据结论句', () => {
    render(<ForwardStats tierStats={backtestTierStats()} heatStats={backtestHeatStats()} />)
    expect(screen.getByTestId('mr-fwd-note').textContent).toContain('第 2 到第 13 个月')
    expect(screen.getByTestId('mr-fwd-note').textContent).toContain('下一个月末才执行')
    expect(screen.getByTestId('mr-fwd-heat-summary').textContent).toContain('偏热的月份之后 12 个月平均')
    expect(screen.getByTestId('mr-fwd-heat-summary').textContent).toContain('居中')
    expect(screen.getByTestId('mr-fwd-tier-summary').textContent).toContain('防守的月份之后 12 个月平均')
    expect(screen.getByTestId('mr-fwd-tier-summary').textContent).toContain('进攻没有出现过')
  })

  it('heatSummarySentence / tierSummarySentence 纯函数', () => {
    const heat = heatSummarySentence(backtestHeatStats())
    expect(heat).toMatch(/偏热的月份之后 12 个月平均/)
    expect(heat).toContain('居中')
    expect(heat).toContain('偏冷')
    expect(heat).toContain('2000 年以来')
    expect(heat).toContain('（样本少）') // hot since2000 = 25

    const tier = tierSummarySentence(backtestTierStats())
    expect(tier).toContain('进攻没有出现过')
    expect(tier).toContain('偏进攻')
    expect(tier).toContain('（样本少）')
  })
})
