import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Candidate, DataState, MacroData, MacroView, Market, MarketData, Metric } from '../features/macro-posture/types'
import type { CompositeState } from '../features/macro-posture/composite/types'
import { compositeFixture, insufficientFixture, legacyFieldsFixture } from '../features/macro-posture/composite/fixture'
import MacroPosture, {
  MACRO_POSTURE_FOOTER,
  MACRO_POSTURE_LEAD,
  MACRO_POSTURE_LEAD_LEGACY,
} from './MacroPosture'

vi.mock('../features/macro-posture/data', () => ({
  useMacroPostureData: vi.fn(),
}))

vi.mock('../features/macro-posture/model', () => ({
  buildMacroView: vi.fn(),
  POSTURE_RULE_VERSION: '宏观攻守观察版 v1',
}))

vi.mock('../features/macro-posture/composite/load', () => ({
  useCompositePosture: vi.fn(),
  tierDef: vi.fn(),
  resetCompositeCache: vi.fn(),
  COMPOSITE_URL: '/data/macro-posture.json',
}))

vi.mock('../features/macro-masters/readings', () => ({
  useReadings: vi.fn(() => ({ state: 'error', message: 'mock' })),
}))

vi.mock('../features/macro-masters/cycleView', () => ({
  buildCycleView: vi.fn(() => ({ masters: [] })),
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
import { useCompositePosture } from '../features/macro-posture/composite/load'

const mockedLegacy = vi.mocked(useMacroPostureData)
const mockedBuild = vi.mocked(buildMacroView)
const mockedComposite = vi.mocked(useCompositePosture)

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
        evidence: [],
      },
    ],
  }
}

function LocationProbe(): JSX.Element {
  const location = useLocation()
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>
}

function renderPage(
  path = '/invest/macro-posture',
  composite: CompositeState = { status: 'ready', data: compositeFixture() },
  legacy: DataState = { status: 'ready', data: fixtureData },
) {
  mockedComposite.mockReturnValue(composite)
  mockedLegacy.mockReturnValue(legacy)
  mockedBuild.mockImplementation((market: Market) => viewFor(market, market === 'cn' ? '偏防守' : '进攻候选'))
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MacroPosture />
      <LocationProbe />
    </MemoryRouter>,
  )
}

describe('MacroPosture 综合指标视图', () => {
  it('加载中显示状态文案', () => {
    renderPage('/invest/macro-posture', { status: 'loading' })
    expect(screen.getByRole('status').textContent).toContain('加载中')
    expect(screen.queryByTestId('mp-tier-name')).toBeNull()
  })

  it('加载失败显示错误', () => {
    renderPage('/invest/macro-posture', { status: 'error', message: 'HTTP 404' })
    expect(screen.getByRole('alert').textContent).toContain('加载失败')
  })

  it('就绪时渲染结论卡：档位、仓位、置信度、距离改判', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: '宏观攻守' })).toBeTruthy()
    expect(screen.getByTestId('mp-head-lead').textContent).toBe(MACRO_POSTURE_LEAD)
    expect(screen.getByTestId('mp-tier-name').textContent).toBe('偏进攻')
    expect(screen.getByTestId('mp-share').textContent).toContain('85%')
    expect(screen.getByTestId('mp-confidence').textContent).toMatch(/置信度高/)
    expect(screen.getByTestId('mp-confidence').textContent).toContain('3/4 根支柱同向')
    expect(screen.getByTestId('mp-confidence-notes').textContent).toContain('四根支柱里三根')
    expect(screen.getByTestId('mp-snap-regime').textContent).toContain('+0.32')
    expect(screen.getByTestId('mp-distance-up').textContent).toContain('升一档')
    expect(screen.getByTestId('mp-distance-down').textContent).toContain('降一档')
    expect(within(screen.getByTestId('mp-distance-nearest')).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText(MACRO_POSTURE_FOOTER)).toBeTruthy()
  })

  it('final 为 null 时显示证据不足并列出缺项', () => {
    renderPage('/invest/macro-posture', { status: 'ready', data: insufficientFixture() })
    expect(screen.getByTestId('mp-tier-name').textContent).toBe('证据不足')
    const box = screen.getByTestId('mp-insufficient')
    expect(box.textContent).toContain('证据不足')
    expect(box.textContent).toMatch(/增长与就业|信用/)
  })

  it('外圈 B 预警亮灯可见', () => {
    renderPage()
    expect(screen.getByTestId('mp-outer-b-lit').textContent).toContain('高收益债利差')
    expect(screen.getByTestId('mp-outer-b').textContent).toContain('预警亮')
  })

  it('回测变体表与披露渲染', () => {
    renderPage()
    const table = screen.getByTestId('mp-backtest-variants')
    expect(within(table).getByText('完整模型')).toBeTruthy()
    expect(within(table).getByText('9.2%')).toBeTruthy()
    expect(table.querySelector('tr.is-highlight')).toBeTruthy()
    expect(screen.getByTestId('mp-disclosures').textContent).toContain('样本内回测')
  })

  it('切到 A股 仍是旧视图', () => {
    renderPage('/invest/macro-posture?ref=nav')
    fireEvent.click(screen.getByRole('button', { name: 'A股' }))
    expect(screen.getByTestId('location').textContent).toBe('/invest/macro-posture?ref=nav&market=cn')
    expect(mockedBuild).toHaveBeenCalledWith('cn', fixtureData.cn)
    expect(screen.getByTestId('mp-head-lead').textContent).toBe(MACRO_POSTURE_LEAD_LEGACY)
    expect(screen.getByText('股票攻守').closest('article')?.textContent).toContain('偏防守')
    expect(screen.getByText(/备选指标 · A股/)).toBeTruthy()
    expect(screen.queryByTestId('mp-tier-name')).toBeNull()
    expect(screen.getByText(/失效源：PBOC/)).toBeTruthy()
  })

  it('港股导语用观察版口径', () => {
    renderPage('/invest/macro-posture?market=hk')
    expect(screen.getByTestId('mp-head-lead').textContent).toBe(MACRO_POSTURE_LEAD_LEGACY)
    expect(screen.queryByTestId('mp-tier-name')).toBeNull()
  })

  it('档位条防守在左、进攻在右且当前段有文字', () => {
    renderPage()
    const strip = screen.getByLabelText(/风险档位/)
    const labels = within(strip).getAllByRole('listitem').map(li => li.textContent)
    expect(labels[0]).toContain('防守')
    expect(labels[labels.length - 1]).toContain('进攻')
    expect(within(strip).getByText('偏进攻').closest('li')?.getAttribute('aria-current')).toBe('true')
  })

  it('自设上限换算：默认 100 → 现在约 85%，改写后进 localStorage', () => {
    const store: Record<string, string> = {}
    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(key => store[key] ?? null)
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
      store[key] = String(value)
    })
    renderPage()
    expect(screen.getByTestId('mp-equity-cap-implied').textContent).toBe('现在约 85%')
    const input = screen.getByLabelText('你的股票仓位上限') as HTMLInputElement
    fireEvent.change(input, { target: { value: '80' } })
    expect(screen.getByTestId('mp-equity-cap-implied').textContent).toBe('现在约 68%')
    expect(store['mp-equity-cap']).toBe('80')
    getSpy.mockRestore()
    setSpy.mockRestore()
  })

  it('自设上限清空或非法时保留上次有效值，失焦恢复输入框', () => {
    const store: Record<string, string> = { 'mp-equity-cap': '80' }
    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(key => store[key] ?? null)
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
      store[key] = String(value)
    })
    renderPage()
    const input = screen.getByLabelText('你的股票仓位上限') as HTMLInputElement
    expect(screen.getByTestId('mp-equity-cap-implied').textContent).toBe('现在约 68%')
    fireEvent.change(input, { target: { value: '' } })
    expect(screen.getByTestId('mp-equity-cap-implied').textContent).toBe('现在约 68%')
    expect(store['mp-equity-cap']).toBe('80')
    fireEvent.change(input, { target: { value: 'abc' } })
    expect(screen.getByTestId('mp-equity-cap-implied').textContent).toBe('现在约 68%')
    expect(store['mp-equity-cap']).toBe('80')
    fireEvent.blur(input)
    expect(input.value).toBe('80')
    getSpy.mockRestore()
    setSpy.mockRestore()
  })

  it('localStorage 读失败时上限回退 100 且不抛错', () => {
    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(() => renderPage()).not.toThrow()
    expect(screen.getByTestId('mp-equity-cap-implied').textContent).toBe('现在约 85%')
    fireEvent.change(screen.getByLabelText('你的股票仓位上限'), { target: { value: '50' } })
    expect(screen.getByTestId('mp-equity-cap-implied').textContent).toBe('现在约 43%')
    getSpy.mockRestore()
    setSpy.mockRestore()
  })

  it('warnings 汇总 chips 与结论卡短线压力', () => {
    renderPage()
    expect(screen.getByTestId('mp-outer-b-chips').textContent).toMatch(/亮\s*1/)
    expect(screen.getByTestId('mp-outer-b-chips').textContent).toMatch(/共\s*3/)
    expect(screen.getByTestId('mp-snap-warnings').textContent).toContain('预警亮灯 1/3')
    expect(screen.getByTestId('mp-snap-warnings').textContent).toContain('高收益债利差')
  })

  it('singles 表与 v20 行渲染', () => {
    renderPage()
    const singles = screen.getByTestId('mp-backtest-singles')
    expect(within(singles).getByText('萨姆规则')).toBeTruthy()
    expect(within(singles).getByText('有预警力')).toBeTruthy()
    expect(within(singles).getByText('反向')).toBeTruthy()
    expect(within(singles).getByText('无明显预警力')).toBeTruthy()
    const variants = screen.getByTestId('mp-backtest-variants')
    const rows = within(variants).getAllByRole('row')
    const ids = rows.slice(1).map(r => r.getAttribute('data-variant'))
    expect(ids[0]).toBe('full')
    expect(ids[1]).toBe('v20')
    expect(within(variants).getByText('0.55')).toBeTruthy()
    expect(screen.getByTestId('mp-variants-readout').textContent).toMatch(/完整模型相对全程持有/)
  })

  it('mtd / repair / warnings 缺失时不报错且跳过对应块', () => {
    expect(() => {
      renderPage('/invest/macro-posture', { status: 'ready', data: legacyFieldsFixture() })
    }).not.toThrow()
    expect(screen.getByTestId('mp-tier-name').textContent).toBe('偏进攻')
    expect(screen.queryByTestId('mp-snap-warnings')).toBeNull()
    expect(screen.queryByTestId('mp-snap-mtd')).toBeNull()
    expect(screen.queryByTestId('mp-distance-tactical')).toBeNull()
    expect(screen.queryByTestId('mp-method-repair')).toBeNull()
    expect(screen.getByTestId('mp-snapshot').textContent).toContain('宏观底子')
  })

  it('结论卡宏观底子与距离改判战术行、方法修复确认', () => {
    renderPage()
    expect(screen.getByTestId('mp-snap-regime').textContent).toMatch(/偏进攻/)
    expect(screen.getByTestId('mp-snap-mtd').textContent).toContain('11 月至今')
    expect(screen.getByTestId('mp-distance-tactical').textContent).toContain('十个月均线')
    expect(screen.getByTestId('mp-method-repair').textContent).toContain('修复确认')
    expect(screen.getByTestId('mp-method-repair').textContent).toContain(
      '可以把经济与信用同时转弱触发的防守上调为偏防守',
    )
  })

  it('时间线 NBER 说明、衰退 note、迷你走势高低当前', () => {
    renderPage()
    expect(screen.getByText(/美国官方认定的衰退期（NBER）/)).toBeTruthy()
    const recessions = screen.getByTestId('mp-backtest-recessions')
    expect(recessions.textContent).toContain('最多计 12 个月')
    expect(recessions.textContent).toContain('窗口开始前已持续防守（自 1979-07 起）')
    const stats = screen.getAllByTestId('mp-spark-stats')
    expect(stats.length).toBeGreaterThan(0)
    expect(stats[0].textContent).toMatch(/近 5 年最高/)
    expect(stats[0].textContent).toMatch(/最低/)
    expect(stats[0].textContent).toMatch(/当前/)
  })

  it('failedSources 英文 id 映射 outer.name，映射不到则不显示', () => {
    renderPage('/invest/macro-posture', {
      status: 'ready',
      data: compositeFixture({
        failedSources: ['hy-oas', 'us-market-breadth', '高收益债快照'],
      }),
    })
    const line = screen.getByTestId('mp-failed-sources')
    expect(line.textContent).toContain('高收益债利差')
    expect(line.textContent).toContain('高收益债快照')
    expect(line.textContent).not.toContain('hy-oas')
    expect(line.textContent).not.toContain('us-market-breadth')
  })
})
