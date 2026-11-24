import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Candidate, DataState, MacroData, MacroView, Market, MarketData, Metric } from '../features/macro-posture/types'
import type { CompositeState } from '../features/macro-posture/composite/types'
import type { CandidatesState } from '../features/macro-posture/composite/candidates'
import { compositeFixture, insufficientFixture, legacyFieldsFixture } from '../features/macro-posture/composite/fixture'
import { candidatesFixture } from '../features/macro-posture/composite/candidates.fixture'
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

vi.mock('../features/combined-strategy/load', () => ({
  useCombinedStrategy: vi.fn(() => ({ status: 'ready', data: { current: { instruction: '股票仓位保持在你上限的 85%，本月不用调。' } } })),
  resetCombinedStrategyCache: vi.fn(),
  COMBINED_STRATEGY_URL: '/data/combined-strategy.json',
}))

vi.mock('../features/macro-posture/composite/candidates', () => ({
  useCandidates: vi.fn(),
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
import { useCandidates } from '../features/macro-posture/composite/candidates'

const mockedLegacy = vi.mocked(useMacroPostureData)
const mockedBuild = vi.mocked(buildMacroView)
const mockedComposite = vi.mocked(useCompositePosture)
const mockedCandidates = vi.mocked(useCandidates)

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
  candidates: CandidatesState = { status: 'ready', data: candidatesFixture() },
) {
  mockedComposite.mockReturnValue(composite)
  mockedLegacy.mockReturnValue(legacy)
  mockedCandidates.mockReturnValue(candidates)
  mockedBuild.mockImplementation((m: Market) => viewFor(m, m === 'cn' ? '偏防守' : '进攻候选'))
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
    expect(screen.getAllByRole('status').some(el => el.textContent?.includes('加载中'))).toBe(true)
    expect(screen.queryByTestId('mp-tier-name')).toBeNull()
  })

  it('页头 TrioNav 与次要数据链接', () => {
    renderPage()
    const trio = screen.getByRole('navigation', { name: '策略相关页面' })
    expect(within(trio).getByRole('link', { name: '宏观依据 · 宏观攻守' }).getAttribute('aria-current')).toBe('page')
    expect(within(trio).getByRole('link', { name: '结论 · 综合策略' }).getAttribute('href')).toBe('/invest/strategy')
    expect(screen.getByRole('link', { name: '宏观温度' }).getAttribute('href')).toBe('/monitor')
    expect(screen.getByRole('link', { name: '宏观大师' }).getAttribute('href')).toBe('/invest/macro-masters')
    expect(screen.getByTestId('verdict-bar')).toBeTruthy()
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
    expect(screen.getByTestId('mp-confidence').textContent).toContain('支柱 2 正 · 2 中性 · 0 负')
    expect(screen.getByTestId('mp-confidence').textContent).not.toContain('同向')
    expect(screen.getByTestId('mp-confidence-notes').textContent).toContain('四根支柱里三根')
    expect(screen.getByTestId('mp-snap-regime').textContent).toContain('+0.32')
    expect(screen.getByTestId('mp-distance-up').textContent).toContain('升一档')
    expect(screen.getByTestId('mp-distance-down').textContent).toContain('降一档')
    expect(within(screen.getByTestId('mp-distance-nearest')).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText(MACRO_POSTURE_FOOTER)).toBeTruthy()
    expect(MACRO_POSTURE_LEAD).toContain('参考九位宏观投资人的公开方法')
    expect(MACRO_POSTURE_FOOTER).toContain('九位中只有一位')
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
    expect(within(table).getByText('完整模型（实时数据）')).toBeTruthy()
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

  it('singles 表与 9 个变体按 JSON 顺序渲染，解读使用最保守口径', () => {
    renderPage()
    const singles = screen.getByTestId('mp-backtest-singles')
    expect(within(singles).getByText('萨姆规则')).toBeTruthy()
    expect(within(singles).getByText('有预警力')).toBeTruthy()
    expect(within(singles).getByText('反向')).toBeTruthy()
    expect(within(singles).getByText('无明显预警力')).toBeTruthy()
    const variants = screen.getByTestId('mp-backtest-variants')
    const rows = within(variants).getAllByRole('row')
    const ids = rows.slice(1).map(r => r.getAttribute('data-variant'))
    expect(ids).toEqual(['full', 'revised', 'noNfci', 'v21', 'v20', 'macro', 'trend', 'static70', 'buyhold'])
    expect(variants.querySelector('tr.is-highlight')?.getAttribute('data-variant')).toBe('noNfci')
    expect(variants.querySelector('[data-variant="revised"]')?.classList.contains('is-highlight')).toBe(false)
    expect(screen.getByTestId('mp-variant-notes').textContent).toContain('完整模型＝实时数据：就业、生产、通胀等会被修订的数据，取每个月末当时已发布的版本（缺当时版本的早年月份沿用修订值）。')
    expect(screen.getByTestId('mp-variant-notes').textContent).toContain('修订后数据＝用今天能查到的最终数值重算，只作对照。')
    expect(screen.getByTestId('mp-variant-notes').textContent).toContain('去掉金融条件指数＝再排除 2011 年前回推的金融条件指数（最保守口径）。')
    expect(screen.getByTestId('mp-variant-notes').textContent).not.toContain('偏乐观')
    expect(screen.getByTestId('mp-variants-readout').textContent).toBe('按最保守口径，年化 8.6%、最大回撤 −27.0%，仍约为持有标普回撤的 6.0 成。')
    expect(screen.getByTestId('mp-backtest-summary').textContent).toContain('最保守口径（实时数据且去掉金融条件指数）：年化 8.6%、最大回撤 −27.0%')
  })

  it('变体表没有 revised 行时仍正常渲染', () => {
    const base = compositeFixture()
    const withoutRevised = {
      ...base,
      backtest: {
        ...base.backtest,
        variants: base.backtest.variants.filter(v => v.id !== 'revised'),
      },
    }
    renderPage('/invest/macro-posture', { status: 'ready', data: withoutRevised })
    const variants = screen.getByTestId('mp-backtest-variants')
    const ids = within(variants).getAllByRole('row').slice(1).map(r => r.getAttribute('data-variant'))
    expect(ids).toEqual(['full', 'noNfci', 'v21', 'v20', 'macro', 'trend', 'static70', 'buyhold'])
    expect(variants.querySelector('[data-variant="revised"]')).toBeNull()
    expect(variants.querySelector('tr.is-highlight')?.getAttribute('data-variant')).toBe('noNfci')
    expect(screen.getByTestId('mp-variant-notes')).toBeTruthy()
  })

  it('mtd / repair / warnings / dates / counts / costs / live 缺失时不报错且跳过对应块', () => {
    expect(() => {
      renderPage('/invest/macro-posture', { status: 'ready', data: legacyFieldsFixture() })
    }).not.toThrow()
    expect(screen.getByTestId('mp-tier-name').textContent).toBe('偏进攻')
    expect(screen.queryByTestId('mp-snap-warnings')).toBeNull()
    expect(screen.queryByTestId('mp-snap-mtd')).toBeNull()
    expect(screen.queryByTestId('mp-distance-tactical')).toBeNull()
    expect(screen.queryByTestId('mp-method-repair')).toBeNull()
    expect(screen.queryByTestId('mp-backtest-costs')).toBeNull()
    expect(screen.queryByTestId('mp-backtest-live')).toBeNull()
    expect(screen.queryByTestId('mp-contribution-sum')).toBeNull()
    expect(screen.getByTestId('mp-confidence').textContent).toMatch(/^置信度高/)
    expect(screen.getByTestId('mp-data-dates').textContent).toContain('数据截至')
    expect(screen.getByTestId('mp-snapshot').textContent).toContain('宏观底子')
  })

  it('结论卡宏观底子与距离改判战术行、方法修复确认', () => {
    renderPage()
    expect(screen.getByTestId('mp-snap-regime').textContent).toMatch(/偏进攻/)
    expect(screen.getByTestId('mp-snap-pillar-scores').textContent).toMatch(/\+0\.50/)
    expect(screen.getByTestId('mp-snap-tactical-distance').textContent).toContain('十个月均线')
    expect(screen.queryByTestId('mp-snap-mtd')).toBeNull()
    expect(screen.getByTestId('mp-distance-tactical').textContent).toContain('十个月均线')
    expect(screen.getByTestId('mp-method-repair').textContent).toContain('修复确认')
    expect(screen.getByTestId('mp-method-repair').textContent).toContain(
      '可以把经济与信用同时转弱触发的防守上调为偏防守',
    )
  })

  it('贡献之和、dates、临界徽标、mtd 公式、costs 与 live 表', () => {
    renderPage()
    expect(screen.getByTestId('mp-contribution-sum').textContent).toContain(
      '综合分 = 各支柱贡献之和：+0.15 + 0.03 + 0.10 + 0.04 = +0.32',
    )
    expect(screen.getAllByTestId('mp-pillar-contribution')[0].textContent).toContain('对综合分贡献 +0.15')
    expect(screen.getByTestId('mp-data-dates').textContent).toContain('宏观月度')
    expect(screen.getByTestId('mp-data-dates').textContent).toContain('标普收盘')
    expect(screen.getByTestId('mp-near-threshold').textContent).toBe('临界')
    expect(screen.getByTestId('mp-near-threshold-note').textContent).toContain('读数离阈值很近')
    expect(screen.getByTestId('mp-mtd-formula').textContent).toContain('前 9 个月均价')
    expect(screen.getByTestId('mp-mtd-formula').textContent).toContain('日线来源')
    const costs = screen.getByTestId('mp-backtest-costs')
    expect(costs.textContent).toContain('交易成本敏感度')
    expect(costs.textContent).toContain('年换手')
    expect(screen.getByTestId('mp-defense-note').textContent).toContain('为什么防守档之后的平均回报不低')
    const live = screen.getByTestId('mp-backtest-live')
    expect(live.textContent).toContain('前推记录')
    expect(live.textContent).toContain('样本外记录')
    expect(live.textContent).toContain('待实现')
    expect(live.textContent).toContain('+1.2%')
  })

  it('live.rows 为空时仍渲染前推小节', () => {
    renderPage('/invest/macro-posture', {
      status: 'ready',
      data: compositeFixture({
        backtest: {
          ...compositeFixture().backtest,
          live: { since: '2026-11-23', ruleVersion: 'v2.1', rows: [] },
        },
      }),
    })
    expect(screen.getByTestId('mp-backtest-live').textContent).toContain('尚无前推行')
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


describe('MacroPosture r4 风险预算与候选检验', () => {
  it('当前档位显示风险预算动作，方法表列出每档组合结构', () => {
    renderPage()
    const actions = screen.getByTestId('mp-tier-actions')
    expect(actions.textContent).toContain('这一档怎么配')
    expect(actions.textContent).toContain('维持常规股票配置。')
    expect(actions.textContent).toContain('控制单一行业的仓位集中度。')
    const methodTable = screen.getByRole('region', { name: '档位阈值与仓位' })
    expect(within(methodTable).getByRole('columnheader', { name: '组合结构' })).toBeTruthy()
    expect(methodTable.textContent).toContain('组合以现金和短期债券为主。')
  })

  it('当前档位 actions 缺失时不显示动作块', () => {
    const data = compositeFixture()
    data.tiers = data.tiers.map(tier => ({ ...tier, actions: undefined }))
    renderPage('/invest/macro-posture', { status: 'ready', data })
    expect(screen.queryByTestId('mp-tier-actions')).toBeNull()
    expect(screen.getByRole('region', { name: '档位阈值与仓位' }).textContent).toContain('—')
  })

  it('候选版块展示预注册、三种徽标、展开对照和合测结果', () => {
    renderPage()
    expect(screen.getByRole('link', { name: '候选' }).getAttribute('href')).toBe('#mp-candidates')
    const section = screen.getByRole('region', { name: '候选指标检验' })
    expect(section.textContent).toContain('2026-11-23 预注册')
    expect(section.textContent).toContain('v2.1（实时数据口径）')
    expect(screen.getByTestId('mp-candidate-verdict-adopted').textContent).toBe('采用')
    expect(screen.getByTestId('mp-candidate-verdict-watched').textContent).toBe('观察')
    expect(screen.getByTestId('mp-candidate-verdict-rejected').textContent).toBe('不采用')
    expect(screen.getByTestId('mp-candidates-watch-note').textContent).toBe('观察不代表有效，只表示没被否决。')

    const adopted = screen.getByTestId('mp-candidate-adopted')
    expect(adopted.textContent).toContain('增长与就业')
    expect(adopted.textContent).toContain('德鲁肯米勒、达利欧')
    expect(adopted.textContent).toContain('约 53.8 年')
    expect(adopted.textContent).toContain('先验规则')
    fireEvent.click(within(adopted).getByText('展开对照表与逐项检验'))
    const table = screen.getByTestId('mp-candidate-table-adopted')
    expect(within(table).getAllByRole('row')).toHaveLength(16)
    expect(table.textContent).toContain('全样本')
    expect(table.textContent).toContain('前段')
    expect(table.textContent).toContain('后段')
    expect(table.textContent).toContain('+0.1 个百分点')
    expect(table.textContent).toContain('+0.03')
    expect(table.querySelector('td.is-positive')).toBeTruthy()
    expect(screen.getByTestId('mp-candidate-check-adopted-sharpeBoth').textContent).toContain('通过')

    const rejected = screen.getByTestId('mp-candidate-rejected')
    fireEvent.click(within(rejected).getByText('展开对照表与逐项检验'))
    expect(screen.getByTestId('mp-candidate-check-rejected-sharpeBoth').textContent).toContain('未通过')
    expect(screen.getByTestId('mp-candidates-combined').textContent).toContain('制造业周工时')
    expect(screen.getByTestId('mp-candidates-combined').textContent).toContain('全部采用项合测满足前四项标准。')
  })

  it('候选窄屏表只列指标、时段、差值，基准与加入后保留在 title', () => {
    renderPage()
    const adopted = screen.getByTestId('mp-candidate-adopted')
    fireEvent.click(within(adopted).getByText('展开对照表与逐项检验'))
    const desktop = screen.getByTestId('mp-candidate-table-adopted')
    expect(within(desktop).getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['时段', '指标', '基准', '加入后', '差值'])

    const mobile = screen.getByTestId('mp-candidate-table-mobile-adopted')
    expect(within(mobile).getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['指标', '时段', '差值'])
    expect(within(mobile).getAllByRole('row')).toHaveLength(16)
    const firstDelta = mobile.querySelector('tbody td:last-child')
    expect(firstDelta?.textContent).toBe('+0.1 个百分点')
    expect(firstDelta?.getAttribute('title')).toBe('基准 10.0%；加入后 10.1%')
  })

  it('候选按轮次分组，第二轮无采用时提示核心规则保持 v2.2', () => {
    const data = candidatesFixture()
    const round2 = { ...data.candidates[2], id: 'r2', name: '长端利率冲击', round: 2 as const, verdict: 'reject' as const }
    renderPage(undefined, undefined, undefined, { status: 'ready', data: { ...data, candidates: [...data.candidates, round2] } })
    expect(screen.getByTestId('mp-candidates-round-1').textContent).toContain('第一轮')
    expect(screen.getByTestId('mp-candidates-adopted').textContent).toContain('已并入核心规则 v2.2')
    expect(screen.getByTestId('mp-candidates-round-2').textContent).toContain('长端利率冲击')
    expect(screen.getByTestId('mp-candidates-none-adopted-2').textContent).toContain('核心规则保持 v2.2')
  })

  it('候选当前读数只展示；没有采用项时提示核心规则不变', () => {
    renderPage()
    expect(screen.getByTestId('mp-candidate-current-watched').textContent).toContain('若计入：−1 分')
    expect(screen.getByTestId('mp-candidate-watched').textContent).toContain('−0.024')
    expect(screen.getByTestId('mp-candidate-watched').textContent).not.toContain('-0.024')
    expect(screen.queryByTestId('mp-candidate-current-adopted')).toBeNull()
    expect(screen.queryByTestId('mp-candidates-none-adopted')).toBeNull()
    const data = candidatesFixture()
    cleanup()
    renderPage(undefined, undefined, undefined, { status: 'ready', data: { ...data, combined: undefined, candidates: data.candidates.map(c => ({ ...c, verdict: c.verdict === 'adopt' ? 'watch' : c.verdict })) } })
    expect(screen.getByTestId('mp-candidates-none-adopted').textContent).toContain('核心规则保持 v2.1')
    cleanup()
    renderPage(undefined, undefined, undefined, { status: 'ready', data: { ...data, candidates: data.candidates.map(c => ({ ...c, verdict: c.verdict === 'watch' ? 'reject' : c.verdict })) } })
    expect(screen.queryByTestId('mp-candidates-watch-note')).toBeNull()
  })

  it('候选数据加载失败只显示局部提示，不影响综合结论', () => {
    renderPage(
      '/invest/macro-posture',
      { status: 'ready', data: compositeFixture() },
      { status: 'ready', data: fixtureData },
      { status: 'error', message: 'HTTP 500' },
    )
    expect(screen.getByTestId('mp-candidates-error').textContent).toBe('候选指标检验暂时无法读取，不影响本页其他结论。')
    expect(screen.getByTestId('mp-tier-name').textContent).toBe('偏进攻')
    expect(screen.getByTestId('mp-backtest-variants')).toBeTruthy()
  })

  it('市场综合迁出后显示雷达链接卡，锚点不再含市场', () => {
    renderPage()
    expect(screen.queryByRole('link', { name: '市场' })).toBeNull()
    expect(screen.queryByTestId('mp-market-tier')).toBeNull()
    const card = screen.getByTestId('mp-market-radar-card')
    expect(card.textContent).toContain('股市内部与仓位指标见市场雷达')
    expect(within(card).getByRole('link', { name: '打开市场雷达' }).getAttribute('href')).toBe('/invest/market-radar')
    expect(card.compareDocumentPosition(screen.getByRole('region', { name: '四根支柱' })) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
    expect(card.compareDocumentPosition(screen.getByRole('region', { name: '战术修正与熔断' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
