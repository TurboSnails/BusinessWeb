import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import CycleBacktest, { validBacktest, type BacktestData, type BacktestMarket } from './CycleBacktest'

const perf = (cagr: number, dd: number) => ({ totalReturn: cagr * 5, cagr, maxDrawdown: dd, volatility: 0.15 })
const market = (label: string, bh: [number, number], def: [number, number], cost: number): BacktestMarket => ({
  label, start: '2012-04-13', end: '2026-11-13', weeks: 760, years: 14.6,
  buyHold: perf(...bh), defense: { ...perf(...def), switches: 40 },
  variants: { lag1_cost10bp: { ...perf(cost, def[1]), lag: 1, cost: 0.001 }, lag0_cost10bp: { ...perf(cost + 0.01, def[1]), lag: 0, cost: 0.001 } },
  timeInDefense: 0.4, defenseNow: true, episodeCount: 20, whipsaws: 12, closedEpisodes: 19, shortEpisodes: 8, medianEpisodeWeeks: 5,
  forward: { 4: { afterEntry: { n: 20, median: -0.01, p25: -0.03, p75: 0.02, negativeShare: 0.55 }, allWeeks: { n: 700, mean: 0.004, median: 0.002, negativeShare: 0.48 } } },
  curve: [['2012-04-13', 1, 1, 1], ['2012-04-20', 1.02, 1.02, 1], ['2012-04-27', 0.95, 1.02, 0], ['2012-05-04', 1.1, 1.05, 1]],
})
const data: BacktestData = {
  schemaVersion: 1, version: 'cycle-trend-backtest-v1', ruleVersion: 'r', asOf: '2026-11-13', horizons: [4],
  method: { rule: '趋势防守规则说明' }, limitations: ['样本内回测：测试局限'],
  markets: { csi300: market('A股 · 沪深300', [0.03, -0.45], [0.029, -0.39], 0.025), spx: market('美股 · 标普500', [0.12, -0.3], [0.06, -0.33], 0.13) },
}

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
describe('规则回测', () => {
  it('展示净值曲线、统计表与远期收益，并如实汇总回撤与成本后结果', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => data })))
    render(<CycleBacktest market="csi300" />)
    expect(await screen.findByRole('img', { name: /A股 · 沪深300 2012-04-13 至 2026-11-13/ })).toBeTruthy()
    expect(screen.getByRole('note').textContent).toMatch(/只回测了一条规则，而且是样本内/)
    expect(screen.getByText(/最大回撤小于买入持有的有/).textContent).toMatch(/有 1 个.*高于买入持有的有 1 个/)
    const table = screen.getByRole('region', { name: '各指数回测统计' })
    expect(within(table).getByText('美股 · 标普500')).toBeTruthy()
    expect(table.textContent).toContain('12 / 19')
    expect(screen.getByRole('region', { name: /进入防守后的远期收益/ }).textContent).toMatch(/样本少/)
    expect(screen.getByText('样本内回测：测试局限')).toBeTruthy()
  })
  it('取数失败或结构不对时只提示无法加载', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] })))
    render(<CycleBacktest market="hsi" />)
    expect(await screen.findByText('回测结果暂时无法加载。')).toBeTruthy()
    expect(validBacktest(data)).toBe(true)
    expect(validBacktest({ schemaVersion: 1 })).toBe(false)
  })
})
