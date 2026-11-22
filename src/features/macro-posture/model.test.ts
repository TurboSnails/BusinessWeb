import { describe, expect, it } from 'vitest'
import { buildMacroView } from './model'
import type { MarketData, Metric, Window } from './types'

function metric(value: number, changes: Partial<Record<Window, number>> = {}): Metric {
  return {
    value, date: '2026-06-30', unit: '', stale: false,
    changes: Object.fromEntries(Object.entries(changes).map(([key, difference]) => [key, {
      before: { date: '2026-03-31', value: value - difference }, difference,
    }])),
  }
}

const us: MarketData = {
  asOf: '2026-06-30', failedSources: [], metrics: {
    gdp: metric(3.4, { lastQuarter: 1.2 }), unrate: metric(4, { threeMonths: -0.2 }),
    sahm: metric(0), claims: metric(19.8, { twelveWeeks: -0.5 }),
    corePce: metric(2.6, { threeMonths: -0.3 }), tenYear: metric(4.2, { twelveWeeks: -0.3 }),
    hy: metric(330, { fourWeeks: -30, twelveWeeks: -50 }), cccSpread: metric(700, { twelveWeeks: -80 }),
    netLiquidity: metric(6000, { fourWeeks: 30, twelveWeeks: 60 }),
    bankReserves: metric(3000, { twelveWeeks: 35 }),
  },
}

describe('macro posture', () => {
  it('allows an attack candidate when growth, liquidity and independent risk checks agree', () => {
    const view = buildMacroView('us', us)
    expect(view.economy.label).toBe('增长回升 · 通胀回落')
    expect(view.posture.label).toBe('进攻候选')
    expect(view.indices).toHaveLength(4)
  })

  it('does not average away credit deterioration during a liquidity improvement', () => {
    const data = { ...us, metrics: { ...us.metrics, hy: metric(352, { fourWeeks: 12, twelveWeeks: 89 }), cccSpread: metric(1361, { twelveWeeks: 330 }) } }
    const view = buildMacroView('us', data)
    expect(view.indices.find(i => i.id === 'credit')?.label).toBe('信用观察')
    expect(view.posture.label).toBe('信用观察')
    expect(view.review?.risk).toContain('241 个基点')
  })

  it('shows market pressure separately and surfaces dated earnings evidence against reducing risk', () => {
    const base = buildMacroView('us', us)
    const view = buildMacroView('us', { ...us, metrics: {
      ...us.metrics, vix: metric(35.89), breadth200: metric(48.7), forwardPe: metric(17.1), epsRevision: metric(4.4),
    } })
    expect(view.posture).toEqual(base.posture)
    expect(view.review?.market.label).toBe('波动升高 · 广度偏弱')
    expect(view.review?.counterEvidence.map(row => row.metric?.value)).toEqual([4.4, 17.1])
    expect(view.review?.reassess.map(row => row.label)).toEqual(['转向积极', '加深防守', '反弹待确认'])
  })

  it('keeps stale market measurements visible without using them to infer pressure', () => {
    const view = buildMacroView('us', { ...us, metrics: { ...us.metrics, vix: { ...metric(35.89), stale: true } } })
    expect(view.review?.market.tone).toBe('unknown')
    expect(view.review?.market.evidence[0].metric?.stale).toBe(true)
  })

  it('applies a distinct inflation cap even when growth and credit are favorable', () => {
    const data = { ...us, metrics: { ...us.metrics, corePce: metric(3.4, { threeMonths: 0.4 }), tenYear: metric(5.2, { twelveWeeks: 0.7 }) } }
    const view = buildMacroView('us', data)
    expect(view.economy.label).toBe('增长回升 · 通胀上行')
    expect(view.posture.label).toBe('通胀利率观察')
  })

  it('preserves known severe risks with partial data and disallows offense on stale credit', () => {
    const creditOnly = { ...us, metrics: { hy: metric(640) } }
    expect(buildMacroView('us', creditOnly).posture.label).toBe('偏防守')
    const staleCredit = { ...us, metrics: { ...us.metrics, hy: { ...metric(330), stale: true } } }
    expect(buildMacroView('us', staleCredit).posture.label).toBe('证据不足')
  })

  it('does not promote US or equity-flow data to local Hong Kong macro evidence', () => {
    const view = buildMacroView('hk', { ...us, metrics: { fed: metric(4), south: metric(100), hkd: metric(7.84), cnPmi: metric(49.3) } })
    expect(view.economy.tone).toBe('unknown')
    expect(view.posture.label).toBe('仅作观察')
    expect(view.indices.find(i => i.id === 'growth')?.evidence[0].metric?.value).toBe(49.3)
  })
})
