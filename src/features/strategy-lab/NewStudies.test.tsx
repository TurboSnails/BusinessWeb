import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import trend from './data/trend.json'
import warning from './data/late-warning.json'
import tilt from './data/defensive-tilt.json'
import radar from './data/radar-vix.json'
import druck from './data/druckenmiller.json'
import trendResults from '../../../docs/research/trend-1871-2026-11-26/results.json'
import trendG9 from '../../../docs/research/trend-1871-2026-11-26/g9.json'
import warningResults from '../../../docs/research/late-cycle-warning-2026-11-26/results.json'
import tiltResults from '../../../docs/research/defensive-tilt-2026-11-26/results.json'
import { fmtNum } from './LabTable'
import { pct } from './LateCycleStudy'
import TrendStudy from './TrendStudy'
import LateWarningStudy from './LateWarningStudy'
import DefensiveTiltStudy from './DefensiveTiltStudy'
import RadarVixStudy from './RadarVixStudy'
import DruckenmillerNote from './DruckenmillerNote'

function renderOne(node: React.ReactElement): void {
  render(<MemoryRouter initialEntries={['/invest/strategy-lab']}>{node}</MemoryRouter>)
}

afterEach(() => { vi.unstubAllGlobals() })

describe('研究中 · 新增五项研究', () => {
  it('趋势防下跌：两种写法都部分成立，主表、逐段表、叠加表数字对得上', () => {
    renderOne(<TrendStudy />)
    const article = screen.getByTestId('lab-trend')
    expect(article.id).toBe('lab-trend')
    expect(screen.getByTestId('lab-trend-answer').textContent).toContain('两种写法都「部分成立」')
    expect(screen.getByTestId('lab-trend-answer').textContent).toContain('规则不变，C2 进影子记录')

    const main = screen.getByTestId('lab-trend-main')
    expect(within(main).getAllByRole('row')).toHaveLength(10)
    for (const id of ['C1', 'C2'] as const) {
      const c = trend.candidates[id]
      expect(main.textContent).toContain(fmtNum(c.main.L))
      expect(main.textContent).toContain(`${fmtNum(c.placebo.pRaw)}（${fmtNum(c.placebo.pHolm)}）`)
    }
    expect(within(main).getAllByText('部分成立（G5 不显著）')).toHaveLength(2)
    expect(main.textContent).toContain('0.967')
    expect(main.textContent).toContain('0.883')

    const events = screen.getByTestId('lab-trend-events')
    expect(within(events).getAllByRole('row')).toHaveLength(trend.candidates.C1.main.events.length + 1)
    expect(events.textContent).toContain('1929-09 → 1932-06')
    expect(events.textContent).toContain(pct(trend.candidates.C2.main.events[7].downC))

    const overlay = screen.getByTestId('lab-trend-overlay')
    expect(within(overlay).getAllByRole('row')).toHaveLength(3)
    expect(overlay.textContent).toContain('0.593')
    expect(overlay.textContent).toContain('0.579')
    expect(overlay.textContent).toContain(pct(trend.g9.base.dailyMaxDd))
    expect(within(screen.getByTestId('lab-trend-explore')).getAllByRole('listitem')).toHaveLength(2)
  })

  it('多维预警：七种写法都不通过，高点前后裂缝数与描述统计来自结果文件', () => {
    renderOne(<LateWarningStudy />)
    expect(screen.getByTestId('lab-late-warning').id).toBe('lab-late-warning')
    expect(screen.getByTestId('lab-late-warning-answer').textContent).toContain('7 种写法都不通过')

    const table = screen.getByTestId('lab-late-warning-table')
    expect(within(table).getAllByRole('row')).toHaveLength(9)
    expect(within(table).getAllByText('不通过')).toHaveLength(7)
    expect(table.textContent).toContain(fmtNum(warning.strategies.W1.train.sharpe))
    expect(table.textContent).toContain(String(warning.strategies.W2.onMonths))

    const prePost = screen.getByTestId('lab-late-warning-prepost').textContent
    expect(prePost).toContain('高点前 6 个月 0.83 道')
    expect(prePost).toContain('高点后 6 个月 2.33 道')
    expect(prePost).toContain(`平均 ${warning.explore.fairReference.ghOtherMean.toFixed(2)} 道`)
    expect(prePost).toContain('1.14')

    expect(within(screen.getByTestId('lab-late-warning-cracks')).getAllByRole('term')).toHaveLength(5)
    const describeTable = screen.getByTestId('lab-late-warning-describe')
    expect(within(describeTable).getAllByRole('row')).toHaveLength(6)
    expect(describeTable.textContent).toContain('28 个月 · 53.6% · 5.9%')
  })

  it('防守倾斜：P1、P2 通过，主表与代价表数字对得上，影子读数加载失败有提示', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    renderOne(<DefensiveTiltStudy />)
    expect(screen.getByTestId('lab-defensive-tilt').id).toBe('lab-defensive-tilt')
    expect(screen.getByTestId('lab-defensive-answer').textContent).toContain('大跌时并没有少跌')

    const main = screen.getByTestId('lab-defensive-main')
    expect(within(main).getAllByRole('row')).toHaveLength(4)
    expect(within(main).getAllByText('通过')).toHaveLength(2)
    expect(main.textContent).toContain(fmtNum(tilt.P1.main.S.sharpe))
    expect(main.textContent).toContain(fmtNum(tilt.P2.main.S.sharpe))
    expect(main.textContent).toContain(fmtNum(tilt.market.sharpe))
    expect(main.textContent).toContain('14%')
    expect(main.textContent).toContain('53%')

    const cost = screen.getByTestId('lab-defensive-cost')
    expect(within(cost).getAllByRole('row')).toHaveLength(3)
    expect(cost.textContent).toContain('0.923 / 0.925')
    expect(cost.textContent).toContain('−15.1%')
    expect(cost.textContent).toContain('−12.7%')

    expect(await screen.findByText('影子读数暂时加载不了')).toBeTruthy()
  })

  it('防守倾斜：影子读数加载成功时显示当月读数', async () => {
    const body = {
      since: '2026-12', until: '2027-11', rows: [],
      current: { month: '2026-11', period: ['2026-10-30', '2026-11-25'], S1: -0.033151, S2: -0.040194, S2b: -0.030266, etf: { SPY: -0.051633 }, estimate: true },
    }
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(body) })))
    renderOne(<DefensiveTiltStudy />)
    const shadow = await screen.findByText(/S1 防守三 ETF 版/)
    expect(shadow.textContent).toContain('−3.3%')
    expect(shadow.textContent).toContain('SPY −5.2%')
    expect(shadow.textContent).toContain('已冻结 0 个月')
  })

  it('雷达加 VIX 趋势：K1、K2 不采用，方案表五行，事后观察注明不能当信号', () => {
    renderOne(<RadarVixStudy />)
    expect(screen.getByTestId('lab-radar-vix').id).toBe('lab-radar-vix')
    expect(screen.getByTestId('lab-radar-vix-answer').textContent).toContain('K1、K2 都不采用')
    expect(screen.getByTestId('lab-radar-vix-answer').textContent).toContain('只展示')
    const table = screen.getByTestId('lab-radar-vix-table')
    expect(within(table).getAllByRole('row')).toHaveLength(radar.schemes.length + 1)
    expect(radar.schemes).toHaveLength(5)
    expect(table.textContent).toContain('11.91% / −31.3% / 0.506')
    expect(table.textContent).toContain('7.21% / −29.4% / 0.619')
    expect(within(table).getAllByText('不采用')).toHaveLength(2)
    expect(screen.getByTestId('lab-radar-vix-episodes').textContent).toContain('17 段行情里，16 段之后 12 个月为正')
    expect(screen.getByText(/不能当信号/, { selector: 'h3' })).toBeTruthy()
    expect(radar.source).toContain('market-radar-v2-2026-11-24.md')
  })

  it('德鲁肯米勒核查：只对了一半，时间线与两列清单', () => {
    renderOne(<DruckenmillerNote />)
    expect(screen.getByTestId('lab-druckenmiller').id).toBe('lab-druckenmiller')
    expect(screen.getByTestId('lab-druckenmiller-answer').textContent).toContain('只对了一半')
    const timeline = screen.getByTestId('lab-druckenmiller-timeline')
    expect(druck.timeline.length).toBeGreaterThanOrEqual(6)
    expect(druck.timeline.length).toBeLessThanOrEqual(8)
    expect(within(timeline).getAllByRole('row')).toHaveLength(druck.timeline.length + 1)
    expect(timeline.textContent).toContain('7,818.93')
    const cols = screen.getByTestId('lab-druckenmiller-testable')
    expect(within(cols).getByRole('heading', { name: '能写成规则的' })).toBeTruthy()
    expect(within(cols).getByRole('heading', { name: '不能回测的' })).toBeTruthy()
    expect(within(cols).getAllByRole('listitem')).toHaveLength(druck.testable.length + druck.untestable.length)
    expect(screen.getByRole('link', { name: '趋势防下跌研究' }).getAttribute('href')).toBe('/invest/strategy-lab?tab=trend#lab-trend')
  })

  it('数据文件与研究结果一致', () => {
    // L-027 趋势防下跌
    for (const id of ['C1', 'C2'] as const) {
      const r = trendResults.candidates[id]
      expect(trend.candidates[id].main.L).toBe(r.main.L)
      expect(trend.candidates[id].main.wins).toBe(r.main.wins)
      expect(trend.candidates[id].placebo.pHolm).toBe(r.placebo.pHolm)
      expect(trend.candidates[id].verdict).toBe(r.verdict)
    }
    expect(trend.g9.C2.sharpe).toBe(trendG9.C2.sharpe)
    expect(trend.g9.base.sharpe).toBe(trendG9.base.sharpe)

    // L-023 至 L-025 多维预警
    for (const id of ['base', 'W1', 'W2', 'VA', 'VB', 'VD', 'VE', 'VF'] as const) {
      expect(warning.strategies[id].full.sharpe).toBe(warningResults.full[id].sharpe)
      expect(warning.strategies[id].train.sharpe).toBe(warningResults.train[id].sharpe)
      expect(warning.strategies[id].valid.sharpe).toBe(warningResults.valid[id].sharpe)
      expect(warning.strategies[id].onMonths).toBe(warningResults.full[id].onMonths)
    }
    expect(warning.explore.fairReference).toEqual(warningResults.explore.fairReference)
    expect(warningResults.passers).toHaveLength(0)

    // L-026 防守倾斜
    expect(tilt.P1.main.S.sharpe).toBe(tiltResults.results.P1.main.S.sharpe)
    expect(tilt.P2.main.S.sharpe).toBe(tiltResults.results.P2.main.S.sharpe)
    expect(tilt.market.sharpe).toBe(tiltResults.results.P1.main.M.sharpe)
    expect(tilt.P1.main.L).toBe(tiltResults.results.P1.main.L)
    expect(tilt.P2.main.L).toBe(tiltResults.results.P2.main.L)
    expect(tilt.pick).toBe(tiltResults.pick)
  })
})
