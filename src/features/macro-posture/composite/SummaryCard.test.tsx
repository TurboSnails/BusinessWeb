import React from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SummaryCard from './SummaryCard'
import type { CompositeFile, TierStats } from './types'

const tierStats: TierStats = {
  months: 12,
  share: 0.2,
  fwd3: 0.01,
  fwd6: 0.02,
  fwd12: 0.04,
  fwd12Median: 0.035,
  neg12: 0.25,
  maxDd12: -0.08,
}

function fixture(): CompositeFile {
  return {
    ruleVersion: 'v2.0',
    generatedAt: '2026-11-23T06:00:00.000Z',
    tiers: [
      { id: 'offense', label: '进攻', equityShare: 1, range: 'R ≥ 0.50', meaning: '证据积极。' },
      { id: 'lean-offense', label: '偏进攻', equityShare: 0.85, range: '0.15 ≤ R < 0.50', meaning: '证据略积极。' },
      { id: 'neutral', label: '中性', equityShare: 0.7, range: '−0.25 < R < 0.15', meaning: '证据互抵。' },
      { id: 'lean-defense', label: '偏防守', equityShare: 0.5, range: '−0.75 < R ≤ −0.25', meaning: '证据谨慎。' },
      { id: 'defense', label: '防守', equityShare: 0.3, range: 'R ≤ −0.75', meaning: '证据偏弱。' },
    ],
    current: {
      asOf: '2026-10-31',
      regime: { score: -0.4, tier: 'lean-defense' },
      tactical: { below: false, price: 5700, sma10: 5400, display: '月均价高于十个月均线' },
      final: { tier: 'lean-defense', equityShare: 0.5 },
      driver: 'macro',
      headline: '增长放缓且信用偏弱，仓位宜低于中性。',
      reasons: ['增长与信用偏弱。'],
      confidence: { level: 'medium', agree: 3, total: 4, notes: [] },
      breakers: [],
      distance: { nearest: [] },
      repair: { active: false, rule: '趋势回到均线上方且信用不再恶化时上调一档。', display: '未触发' },
      warnings: { on: 0, total: 8, names: [] },
      pillars: [],
    },
    outer: [],
    backtest: {
      start: '1973-01',
      end: '2026-10',
      months: 646,
      disclosures: [],
      tiers: {
        offense: tierStats,
        'lean-offense': tierStats,
        neutral: tierStats,
        'lean-defense': tierStats,
        defense: tierStats,
      },
      variants: [],
      recessions: [],
      falseAlarms: [],
      singles: [],
      timeline: [],
    },
    failedSources: [],
  }
}

function renderCard(fetcher: typeof fetch) {
  return render(<MemoryRouter><SummaryCard fetcher={fetcher} /></MemoryRouter>)
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('SummaryCard', () => {
  it('加载中显示占位文字、五段骨架和依据链接', () => {
    const fetcher = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}))
    renderCard(fetcher)

    expect(screen.getByRole('heading', { name: '本站宏观攻守结论' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('正在读取综合攻守结论…')
    expect(document.querySelectorAll('.macro-summary__skeleton-tiers > span')).toHaveLength(5)
    expect(screen.getByRole('link', { name: '查看依据与回测' }).getAttribute('href')).toBe('/invest/macro-posture')
  })

  it('读取失败时给出提示和依据链接，不抛出错误', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('网络中断'))
    renderCard(fetcher)

    expect((await screen.findByRole('alert')).textContent).toBe('综合攻守结论暂时无法读取，请稍后重试。')
    expect(screen.getByRole('link', { name: '查看依据与回测' })).toBeTruthy()
  })

  it('就绪后按防守到进攻排序，并展示当前档位、仓位、置信度、结论与数据日期', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(fixture()))
    renderCard(fetcher)

    expect(await screen.findByText('股票仓位约为你自设上限的 50%')).toBeTruthy()
    const tiers = screen.getByRole('list', { name: '宏观攻守五档，当前为偏防守' })
    const segments = within(tiers).getAllByRole('listitem')
    expect(segments.map(segment => segment.querySelector('span')?.textContent)).toEqual(['防守', '偏防守', '中性', '偏进攻', '进攻'])
    expect(within(tiers).getByText('当前').closest('li')?.getAttribute('aria-current')).toBe('step')
    expect(within(tiers).getByText('当前').closest('li')?.textContent).toContain('偏防守')
    expect(screen.getByText('偏防守', { selector: '.macro-summary__tier-name' })).toBeTruthy()
    expect(screen.getByText(/置信度中/).textContent).toContain('3/4 根支柱同向')
    expect(screen.getByText('短线预警 0/8 项亮灯').classList.contains('is-active')).toBe(false)
    expect(screen.getByText('增长放缓且信用偏弱，仓位宜低于中性。')).toBeTruthy()
    expect(screen.getByText('2026-10-31').getAttribute('datetime')).toBe('2026-10-31')
    expect(screen.getByRole('link', { name: '查看依据与回测' }).getAttribute('href')).toBe('/invest/macro-posture')
  })

  it('显示短线预警和最多两行的战术距离说明', async () => {
    const data = fixture()
    data.current.warnings = { on: 4, total: 8, names: ['美元', '信用利差'] }
    data.current.distance.tactical = '若月内均价继续低于预估十个月均线，月末确认后将下调一档。'
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(data))
    renderCard(fetcher)

    const warnings = await screen.findByText('短线预警 4/8 项亮灯')
    expect(warnings.classList.contains('is-active')).toBe(true)
    const distance = screen.getByText(data.current.distance.tactical)
    expect(distance.getAttribute('title')).toBe(data.current.distance.tactical)
    expect(distance.classList.contains('macro-summary__tactical-distance')).toBe(true)
  })

  it('过渡期预警字段缺失时不显示预警行', async () => {
    const data = fixture()
    data.current.warnings = undefined as unknown as CompositeFile['current']['warnings']
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(data))
    renderCard(fetcher)

    expect(await screen.findByText('偏防守', { selector: '.macro-summary__tier-name' })).toBeTruthy()
    expect(screen.queryByText(/短线预警/)).toBeNull()
  })

  it('底部展示完整模型与同期持有标普的回测年化及最大回撤', async () => {
    const data = fixture()
    data.backtest.variants = [
      { id: 'full', label: '完整模型', cagr: 0.092, vol: 0.121, maxDd: -0.28, sharpe: 0.55, calmar: 0.33, avgEquity: 0.72, switchesPerYear: 1.4 },
      { id: 'buyhold', label: '始终满仓', cagr: 0.095, vol: 0.15, maxDd: -0.45, sharpe: 0.4, calmar: 0.21, avgEquity: 1, switchesPerYear: 0 },
    ]
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(data))
    renderCard(fetcher)

    expect(await screen.findByText('回测 1973 年以来：年化 9.2% / 最大回撤 −28.0%，同期持有标普 9.5% / −45.0%')).toBeTruthy()
  })

  it('最终档位为 null 时显示证据不足，不输出无效仓位', async () => {
    const data = fixture()
    data.current.regime = { score: null, tier: null }
    data.current.final = { tier: null, equityShare: null }
    data.current.driver = 'insufficient'
    data.current.headline = '核心支柱缺数过多，暂不形成综合结论。'
    data.current.confidence = { level: 'low', agree: 0, total: 2, notes: ['缺数过多'] }
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(data))
    renderCard(fetcher)

    expect(await screen.findByText('证据不足', { selector: '.macro-summary__tier-name' })).toBeTruthy()
    expect(screen.getByText('证据不足，暂不给出股票仓位参考。')).toBeTruthy()
    expect(screen.getByRole('list', { name: '宏观攻守五档，当前为证据不足' })).toBeTruthy()
    expect(screen.getByText('核心支柱缺数过多，暂不形成综合结论。')).toBeTruthy()
    expect(screen.queryByText(/undefined|null|NaN/)).toBeNull()
  })
})
