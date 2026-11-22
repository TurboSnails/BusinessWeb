import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Candidate, DataState, MacroData, MacroView, Market, MarketData, Metric } from '../features/macro-posture/types'
import MacroPosture, { MACRO_POSTURE_FOOTER, MACRO_POSTURE_LEAD } from './MacroPosture'

vi.mock('../features/macro-posture/data', () => ({
  useMacroPostureData: vi.fn(),
}))

vi.mock('../features/macro-posture/model', () => ({
  buildMacroView: vi.fn(),
  POSTURE_RULE_VERSION: '宏观攻守观察版 v1',
}))

vi.mock('../features/macro-posture/candidates', () => ({
  CANDIDATES: {
    us: [
      {
        name: 'HY OAS',
        category: '信用',
        coverage: '站内已有',
        description: '验证信用恶化是否先于攻守切换',
        source: 'FRED',
      },
      {
        name: '初次申请失业金',
        category: '增长',
        coverage: '历史待补',
        description: '补齐周度就业脉冲序列后验证衰退拐点',
      },
    ],
    cn: [
      {
        name: '社融存量同比',
        category: '流动性',
        coverage: '待接入',
        description: '验证信用扩张是否领先 A 股风险偏好',
      },
    ],
    hk: [
      {
        name: '港元拆息',
        category: '利率',
        coverage: '待接入',
        description: '验证联系汇率压力对港股防守信号的领先性',
      },
    ],
  } satisfies Record<Market, readonly Candidate[]>,
}))

import { useMacroPostureData } from '../features/macro-posture/data'
import { buildMacroView } from '../features/macro-posture/model'

const mockedUse = vi.mocked(useMacroPostureData)
const mockedBuild = vi.mocked(buildMacroView)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function metric(value: number, extras: Partial<Metric> = {}): Metric {
  return {
    value,
    date: '2026-06-30',
    unit: '%',
    stale: false,
    changes: {
      fourWeeks: { before: { date: '2026-06-02', value: value - 0.2 }, difference: 0.2 },
      twelveWeeks: { before: { date: '2026-04-07', value: value - 0.5 }, difference: 0.5 },
    },
    ...extras,
  }
}

function marketData(overrides: Partial<MarketData> = {}): MarketData {
  return {
    asOf: '2026-06-30',
    failedSources: [],
    metrics: {
      gdp: metric(3.4, { unit: '%' }),
      hy: metric(330, { unit: 'bp' }),
    },
    ...overrides,
  }
}

const fixtureData: MacroData = {
  us: marketData(),
  cn: marketData({ asOf: '2026-06-28', failedSources: ['PBOC'] }),
  hk: marketData({ asOf: '2026-06-27' }),
}

function viewFor(market: Market, label = '进攻候选'): MacroView {
  return {
    market,
    asOf: fixtureData[market].asOf,
    failedSources: fixtureData[market].failedSources,
    economy: { label: '增长回升 · 通胀回落', tone: 'positive', detail: '增长与通胀方向同向改善。' },
    posture: { label, tone: label.includes('防守') ? 'caution' : 'positive', detail: '多路证据暂时同向。' },
    indices: [
      {
        id: 'growth',
        title: '增长',
        label: '回升',
        tone: 'positive',
        score: 1.2,
        detail: '增长读数偏强。',
        evidence: [{ key: 'gdp', label: '实际 GDP', metric: fixtureData[market].metrics.gdp }],
      },
      {
        id: 'inflation',
        title: '通胀利率',
        label: '缓和',
        tone: 'neutral',
        score: 0,
        detail: '通胀压力暂缓。',
        evidence: [],
      },
      {
        id: 'liquidity',
        title: '流动性',
        label: '改善',
        tone: 'positive',
        score: 0.8,
        detail: '流动性边际改善。',
        evidence: [],
      },
      {
        id: 'credit',
        title: '信用',
        label: market === 'cn' ? '观察' : '缓和',
        tone: market === 'cn' ? 'caution' : 'positive',
        score: market === 'cn' ? -0.4 : 0.5,
        detail: '信用条件仍需核对。',
        evidence: [
          {
            key: 'hy',
            label: 'HY 利差',
            metric: {
              ...metric(640, {
                unit: 'bp',
                stale: true,
                date: '2025-01-01',
                source: 'https://fred.stlouisfed.org/series/BAMLH0A0HYM2',
              }),
              changes: {},
            },
          },
        ],
      },
    ],
  }
}

function LocationProbe(): JSX.Element {
  const location = useLocation()
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>
}

function renderPage(path = '/invest/macro-posture', state: DataState = { status: 'ready', data: fixtureData }) {
  mockedUse.mockReturnValue(state)
  mockedBuild.mockImplementation((market: Market) => viewFor(market, market === 'cn' ? '偏防守' : '进攻候选'))
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MacroPosture />
      <LocationProbe />
    </MemoryRouter>,
  )
}

describe('MacroPosture', () => {
  it('renders lead, entry links and ready hero for default US market', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: '宏观攻守' })).toBeTruthy()
    expect(screen.getByText(MACRO_POSTURE_LEAD)).toBeTruthy()
    expect(screen.getByRole('link', { name: '宏观温度' }).getAttribute('href')).toBe('/monitor')
    expect(screen.getByRole('link', { name: '宏观大师' }).getAttribute('href')).toBe('/invest/macro-masters')
    expect(screen.getByText('经济周期').closest('article')?.textContent).toContain('增长回升 · 通胀回落')
    expect(screen.getByText('股票攻守').closest('article')?.textContent).toContain('进攻候选')
    expect(screen.getByText(MACRO_POSTURE_FOOTER)).toBeTruthy()
    expect(mockedBuild).toHaveBeenCalledWith('us', fixtureData.us)
  })

  it('keeps unrelated query params while switching market via segmented control', () => {
    renderPage('/invest/macro-posture?ref=nav&theme=cycle')
    fireEvent.click(screen.getByRole('button', { name: 'A股' }))
    expect(screen.getByTestId('location').textContent).toBe('/invest/macro-posture?ref=nav&theme=cycle&market=cn')
    expect(mockedBuild).toHaveBeenLastCalledWith('cn', fixtureData.cn)
    expect(screen.getByText('股票攻守').closest('article')?.textContent).toContain('偏防守')

    fireEvent.click(screen.getByRole('button', { name: '港股' }))
    expect(screen.getByTestId('location').textContent).toBe('/invest/macro-posture?ref=nav&theme=cycle&market=hk')
    expect(mockedBuild).toHaveBeenLastCalledWith('hk', fixtureData.hk)

    fireEvent.click(screen.getByRole('button', { name: '美国' }))
    expect(screen.getByTestId('location').textContent).toBe('/invest/macro-posture?ref=nav&theme=cycle&market=us')
  })

  it('honors market=cn on first load and shows failed sources', () => {
    renderPage('/invest/macro-posture?market=cn')
    expect(mockedBuild).toHaveBeenCalledWith('cn', fixtureData.cn)
    expect(screen.getByText(/失效源：PBOC/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'A股' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('shows a US review with separate evidence, then removes it for local-market views', () => {
    renderPage()
    mockedBuild.mockImplementation(market => ({ ...viewFor(market), review: market === 'us' ? {
      guidance: '暂缓新增战术风险。', risk: '信用观察', counterpoint: '盈利预期仍在上修。',
      counterEvidence: [{ key: 'forwardPe', label: '前瞻市盈率', metric: metric(17.1, { unit: '倍', changes: {} }) }],
      market: { label: '波动升高', tone: 'caution', detail: '市场观察。', evidence: [] },
      reassess: [{ label: '转向积极', detail: '等信用和广度确认。' }],
    } : undefined }))
    fireEvent.click(screen.getByRole('button', { name: '美国' }))
    const review = screen.getByRole('region', { name: '未来 4–12 周怎么观察' })
    expect(within(review).getByText('17.1 倍')).toBeTruthy()
    expect(within(review).getByRole('heading', { name: '市场压力' })).toBeTruthy()
    expect(within(review).getByText('转向积极')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'A股' }))
    expect(screen.queryByRole('region', { name: '未来 4–12 周怎么观察' })).toBeNull()
  })

  it('shows loading and error states without calling the view builder, but keeps candidates', () => {
    renderPage('/invest/macro-posture', { status: 'loading' })
    expect(screen.getByRole('status').textContent).toContain('加载中')
    expect(mockedBuild).not.toHaveBeenCalled()
    expect(screen.getByText(/备选指标 · 美国/)).toBeTruthy()

    cleanup()
    renderPage('/invest/macro-posture', { status: 'error' })
    expect(screen.getByRole('alert').textContent).toContain('加载失败')
    expect(mockedBuild).not.toHaveBeenCalled()
    const details = screen.getByText(/备选指标 · 美国/).closest('details')
    fireEvent.click(within(details!).getByText(/备选指标 · 美国/))
    expect(within(details!).getByText('HY OAS')).toBeTruthy()
  })

  it('exposes four sub-indices with scores, raw metrics, window units and stale source link', () => {
    renderPage()
    expect(screen.getByText('最新指标观测日 2026-06-30')).toBeTruthy()
    const section = screen.getByRole('heading', { name: '四个子指数' }).closest('section')
    expect(section).toBeTruthy()
    const cards = within(section!).getAllByRole('heading', { level: 3 })
    expect(cards.map(node => node.textContent)).toEqual(['增长', '通胀利率', '流动性', '信用'])
    expect(within(section!).getByLabelText('分数 +1.2')).toBeTruthy()
    expect(within(section!).getByText('3.4 %')).toBeTruthy()
    expect(within(section!).getByText(/4 周 \+0\.2 个百分点/)).toBeTruthy()
    expect(within(section!).getByText(/12 周 \+0\.5 个百分点/)).toBeTruthy()
    expect(within(section!).getByText(/已过期，仅供参考/)).toBeTruthy()
    const source = within(section!).getByRole('link', { name: 'FRED' })
    expect(source.getAttribute('href')).toBe('https://fred.stlouisfed.org/series/BAMLH0A0HYM2')
    expect(source.getAttribute('rel')).toBe('noopener noreferrer')
    expect(screen.getByText(/以下判定未经回测证实/)).toBeTruthy()
    expect(MACRO_POSTURE_LEAD).not.toMatch(/未回测/)
  })

  it('expands market-specific candidates with category and coverage', () => {
    renderPage('/invest/macro-posture?market=us')
    const details = screen.getByText(/备选指标 · 美国/).closest('details')
    expect(details).toBeTruthy()
    fireEvent.click(within(details!).getByText(/备选指标 · 美国/))
    expect(details!.hasAttribute('open')).toBe(true)
    expect(within(details!).getByText('HY OAS')).toBeTruthy()
    expect(within(details!).getByText('信用')).toBeTruthy()
    expect(within(details!).getByText('站内已有')).toBeTruthy()
    expect(within(details!).getByText('历史待补')).toBeTruthy()
    expect(within(details!).getByText(/验证信用恶化是否先于攻守切换/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'A股' }))
    const cnDetails = screen.getByText(/备选指标 · A股/).closest('details')
    fireEvent.click(within(cnDetails!).getByText(/备选指标 · A股/))
    expect(within(cnDetails!).getByText('社融存量同比')).toBeTruthy()
    expect(within(cnDetails!).getByText('待接入')).toBeTruthy()
    expect(within(cnDetails!).queryByText('HY OAS')).toBeNull()
  })
})
