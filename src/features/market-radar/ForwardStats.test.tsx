import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import HeatForwardStats, { TierForwardStats, heatSummaryFallback, isSparse } from './ForwardStats'
import { backtestHeatStats, backtestPredictive, backtestTierStats } from './backtest.fixture'
import type { RadarFile } from './types'

afterEach(cleanup)

const legacy = (rows: RadarFile['backtest']['heatStats']) =>
  rows.map(({ before2000: _omit, ...row }) => ({
    ...row,
    all: { months: row.all.months, fwd12: row.all.fwd12, neg12: row.all.neg12, maxDd12: row.all.maxDd12 },
    since2000: {
      months: row.since2000.months, fwd12: row.since2000.fwd12, neg12: row.since2000.neg12, maxDd12: row.since2000.maxDd12,
    },
  }))

describe('HeatForwardStats（主视图）', () => {
  it('偏热→居中→偏冷，分 1973–1999 与 2000 年以来两段，月数旁有独立样本数', () => {
    render(<HeatForwardStats heatStats={backtestHeatStats()} predictive={backtestPredictive()} />)
    const table = screen.getByTestId('mr-fwd-heat')
    expect([...table.querySelectorAll('tbody th')].map(el => el.textContent)).toEqual(['偏热', '居中', '偏冷'])
    expect([...table.querySelectorAll('thead tr:first-child th')].map(el => el.textContent))
      .toEqual(['冷热', '1973–1999', '2000 年以来'])
    const hot = table.querySelector('tr[data-heat="hot"]') as HTMLElement
    expect(hot.textContent).toContain('81≈4 个独立样本少')
    expect(hot.textContent).toContain('19.1%')
    expect(hot.textContent).toContain('123≈10 个独立')
    expect(hot.textContent).toContain('5.2%')
    const cold = table.querySelector('tr[data-heat="cold"]') as HTMLElement
    expect(cold.textContent?.match(/—/g)?.length).toBe(4)
    expect(screen.getByRole('heading', { name: '冷热之后 12 个月的标普表现' })).toBeTruthy()
  })

  it('结论句由数据生成：两段方向相反时明说，不能当择时信号', () => {
    render(<HeatForwardStats heatStats={backtestHeatStats()} predictive={backtestPredictive()} />)
    const summary = screen.getByTestId('mr-fwd-heat-summary').textContent ?? ''
    expect(summary).toContain('偏热只说明估值与持股拥挤度不便宜')
    expect(summary).toContain('2000 年以后偏热 5.2%、居中 12.9%；1973–1999 年偏热 19.1%、居中 12.2%')
    expect(summary).toContain('两段方向相反，不能当择时信号')
    expect(summary).toContain('2000 年以后没有出现过偏冷')
    const corr = screen.getByTestId('mr-fwd-heat-corr').textContent ?? ''
    expect(corr).toContain('冷热分（正数为偏冷）与之后')
    expect(corr).toContain('2000 年以后相关系数 0.33（t 3.26），越偏冷之后越好')
    expect(corr).toContain('1973–1999 年相关系数 −0.04（t −0.30），不显著')
  })

  it('口径说明写明含息、第 2 到第 13 个月与独立样本的含义', () => {
    render(<HeatForwardStats heatStats={backtestHeatStats()} />)
    const note = screen.getByTestId('mr-fwd-note').textContent ?? ''
    expect(note).toContain('第 2 到第 13 个月')
    expect(note).toContain('含股息')
    expect(note).toContain('独立样本数')
    expect(screen.queryByTestId('mr-fwd-heat-corr')).toBeNull()
  })

  it('旧数据（没有 1973–1999 段与独立样本）：退回全样本 + 2000 年以来，按月数标样本少', () => {
    const rows = legacy(backtestHeatStats())
    render(<HeatForwardStats heatStats={rows} />)
    const table = screen.getByTestId('mr-fwd-heat')
    expect([...table.querySelectorAll('thead tr:first-child th')].map(el => el.textContent))
      .toEqual(['冷热', '全样本', '2000 年以来'])
    expect(table.textContent).not.toContain('个独立')
    expect(screen.getByTestId('mr-fwd-heat-summary').textContent).toBe(heatSummaryFallback(rows))
    expect(screen.getByTestId('mr-fwd-note').textContent).not.toContain('独立样本数')
  })
})

describe('TierForwardStats（折叠区）', () => {
  it('防守→进攻；说明五档只是分数区间；没有样本显示 —', () => {
    render(<TierForwardStats tierStats={backtestTierStats()} />)
    const table = screen.getByTestId('mr-fwd-tier')
    expect([...table.querySelectorAll('tbody th')].map(el => el.textContent?.trim()))
      .toEqual(['防守', '偏防守', '中性', '偏进攻', '进攻'])
    expect(screen.getByTestId('mr-fwd-tier-note').textContent).toContain('不代表该进攻或防守')
    const offense = table.querySelector('tr[data-tier="offense"]') as HTMLElement
    expect(offense.textContent).toContain('—')
  })
})

describe('isSparse', () => {
  it('有独立样本数时按独立样本 < 5；旧数据按月数 < 30', () => {
    expect(isSparse({ months: 81, independent: 4, fwd12: 0.1, neg12: 0, maxDd12: 0 })).toBe(true)
    expect(isSparse({ months: 81, independent: 5, fwd12: 0.1, neg12: 0, maxDd12: 0 })).toBe(false)
    expect(isSparse({ months: 25, fwd12: 0.1, neg12: 0, maxDd12: 0 })).toBe(true)
    expect(isSparse({ months: 0, independent: 0, fwd12: null, neg12: null, maxDd12: null })).toBe(false)
  })
})
